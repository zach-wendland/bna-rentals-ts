import axios, { AxiosInstance, AxiosError } from 'axios'
import {
  ZillowAPIError,
  RateLimitError,
  AuthenticationError,
  NotFoundError,
} from './errors'
import {
  ZillowProperty,
  ZillowPropertySchema,
  ZillowAPIResponse,
  FetchConfig,
  FetchParams,
} from './types'
import {
  ZILLOW_API,
  DEFAULT_RETRIES,
  RATE_LIMIT_WAIT_MS,
  MAX_PAGES,
} from '../config/constants'

/**
 * Zillow API Fetcher
 * TypeScript implementation of Python api/zillow_fetcher.py
 *
 * Handles fetching rental property data from Zillow RapidAPI with:
 * - Pagination
 * - Rate limiting
 * - Retry logic with exponential backoff
 * - Error handling
 * - Multi-unit property support
 */
export class ZillowFetcher {
  private client: AxiosInstance
  private apiKey: string

  constructor(apiKey?: string) {
    this.apiKey = apiKey || this.getAPIKey()
    this.client = this.createClient()
  }

  /**
   * Get API key from environment variables
   * Matches Python get_api_key()
   */
  private getAPIKey(): string {
    const key =
      process.env.ZILLOW_RAPIDAPI_KEY || process.env.RAPIDAPI_KEY

    if (!key) {
      throw new Error(
        'Missing Zillow API key. Set ZILLOW_RAPIDAPI_KEY or RAPIDAPI_KEY environment variable.'
      )
    }

    return key
  }

  /**
   * Create axios client with proper headers
   * Matches Python build_headers()
   */
  private createClient(): AxiosInstance {
    return axios.create({
      baseURL: ZILLOW_API.baseURL,
      headers: {
        'x-rapidapi-key': this.apiKey,
        'x-rapidapi-host': ZILLOW_API.host,
      },
      timeout: 30000, // 30 second timeout
    })
  }

  /**
   * Fetch a single page with retry logic
   * Matches Python fetch_page()
   *
   * @param params - Search parameters
   * @param page - Page number (1-indexed)
   * @param retries - Number of retry attempts
   * @param cooldown - Initial cooldown in seconds
   */
  private async fetchPage(
    params: FetchParams,
    page: number = 1,
    retries: number = DEFAULT_RETRIES,
    cooldown: number = 5
  ): Promise<ZillowAPIResponse | null> {
    const requestParams = {
      ...params,
      page: this.safePageNumber(page),
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await this.client.get(ZILLOW_API.endpoint, {
          params: requestParams,
        })

        return response.data
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const axiosError = error as AxiosError

          // Handle 404 - treat as empty results
          if (axiosError.response?.status === 404) {
            return { results: [] }
          }

          // Handle 401/403 - authentication errors (no retry)
          if (
            axiosError.response?.status === 401 ||
            axiosError.response?.status === 403
          ) {
            const message = ZillowAPIError.extractErrorMessage(
              axiosError.response?.data
            )
            throw new AuthenticationError(
              `Authentication failed: ${message}. Please check your ZILLOW_RAPIDAPI_KEY.`,
              axiosError.response?.data
            )
          }

          // Handle 429 - rate limiting (retry with backoff)
          if (axiosError.response?.status === 429) {
            if (attempt < retries) {
              const waitTime = cooldown * attempt * 1000
              console.warn(
                `Rate limit hit. Retrying in ${waitTime / 1000}s... (attempt ${attempt}/${retries})`
              )
              await this.sleep(waitTime)
              continue
            }
            throw new RateLimitError(
              `Rate limit exceeded after ${retries} attempts`,
              axiosError.response?.data
            )
          }

          // Handle other errors with retry
          if (attempt < retries) {
            const waitTime = cooldown * attempt * 1000
            console.warn(
              `Request failed: ${axiosError.message}. Retrying in ${waitTime / 1000}s... (attempt ${attempt}/${retries})`
            )
            await this.sleep(waitTime)
            continue
          }

          // Final attempt failed
          const message = ZillowAPIError.extractErrorMessage(
            axiosError.response?.data
          )
          throw new ZillowAPIError(
            `Failed after ${retries} attempts: ${message}`,
            axiosError.response?.status,
            axiosError.response?.data
          )
        }

        // Non-axios error
        throw error
      }
    }

    return null
  }

  /**
   * Extract results from API response
   * Handles multiple possible response structures
   * Matches Python _extract_results()
   */
  private extractResults(payload: any): any[] {
    if (!payload) {
      return []
    }

    // Try 'results' field first
    if (Array.isArray(payload.results)) {
      return payload.results
    }

    // Try 'props' field
    if (Array.isArray(payload.props)) {
      return payload.props
    }

    // If payload itself is an array
    if (Array.isArray(payload)) {
      return payload
    }

    // No results found
    return []
  }

  /**
   * Iterate through pages for a single location
   * Matches Python iterate_pages()
   *
   * @param params - Search parameters
   * @param maxPages - Maximum pages to fetch
   * @param rateLimitWait - Wait time between pages (ms)
   */
  private async *iteratePages(
    params: FetchParams,
    maxPages: number = MAX_PAGES,
    rateLimitWait: number = RATE_LIMIT_WAIT_MS
  ): AsyncGenerator<any[], void, unknown> {
    for (let page = 1; page <= maxPages; page++) {
      const payload = await this.fetchPage(params, page)

      if (!payload) {
        break
      }

      const results = this.extractResults(payload)

      if (results.length === 0) {
        break
      }

      yield results

      // Rate limiting - wait between pages
      if (page < maxPages) {
        await this.sleep(rateLimitWait)
      }

      // Check if we've reached the last page
      if (payload.totalPages && page >= payload.totalPages) {
        break
      }
    }
  }

  /**
   * Flatten nested objects into dot notation
   * Matches Python _flatten_mapping()
   *
   * Example: { address: { street: '123 Main' } } => { 'address__street': '123 Main' }
   */
  private flattenMapping(
    obj: Record<string, any>,
    prefix: string = ''
  ): Record<string, any> {
    const flattened: Record<string, any> = {}

    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}__${key}` : key

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(flattened, this.flattenMapping(value, newKey))
      } else {
        flattened[newKey] = value
      }
    }

    return flattened
  }

  /**
   * Augment records with multi-unit data
   * Matches Python _augment_with_units()
   *
   * For properties with multiple units, creates indexed fields:
   * price_1, price_2, beds_1, beds_2, etc.
   */
  private augmentWithUnits(
    baseRecord: Record<string, any>,
    units: any[]
  ): Record<string, any> {
    const augmented = { ...baseRecord }

    units.forEach((unit, index) => {
      const unitIndex = index + 1
      if (unit.price !== undefined) {
        augmented[`price_${unitIndex}`] = unit.price
      }
      if (unit.beds !== undefined) {
        augmented[`beds_${unitIndex}`] = unit.beds
      }
      if (unit.bathrooms !== undefined) {
        augmented[`bathrooms_${unitIndex}`] = unit.bathrooms
      }
    })

    return augmented
  }

  /**
   * Convert raw API records to typed properties
   * Matches Python records_to_dataframe()
   *
   * Returns array of properties with flattened structure and unit data
   */
  public recordsToProperties(records: any[]): ZillowProperty[] {
    const properties: ZillowProperty[] = []

    for (const record of records) {
      // Flatten nested structure
      const flattened = this.flattenMapping(record)

      // Handle multi-unit properties
      if (Array.isArray(record.units) && record.units.length > 0) {
        Object.assign(flattened, this.augmentWithUnits(flattened, record.units))
        flattened.units = record.units
      }

      // Parse and validate with Zod
      try {
        const property = ZillowPropertySchema.parse(flattened)
        properties.push(property)
      } catch (error) {
        console.warn('Failed to parse property:', error)
        // Continue processing other properties
      }
    }

    return properties
  }

  /**
   * Collect properties from multiple locations
   * Matches Python collect_properties()
   *
   * @param config - Fetch configuration
   */
  public async collectProperties(
    config: FetchConfig
  ): Promise<ZillowProperty[]> {
    const {
      baseParams,
      locations,
      maxPages = MAX_PAGES,
      rateLimitWaitMs = RATE_LIMIT_WAIT_MS,
    } = config

    const allRecords: any[] = []

    for (const location of locations) {
      const params: FetchParams = {
        ...baseParams,
        location,
      } as FetchParams

      console.log(`Fetching properties for ${location}...`)

      try {
        for await (const pageResults of this.iteratePages(
          params,
          maxPages,
          rateLimitWaitMs
        )) {
          allRecords.push(...pageResults)
          console.log(
            `  Found ${pageResults.length} properties (total: ${allRecords.length})`
          )
        }
      } catch (error) {
        if (error instanceof NotFoundError) {
          console.warn(`No properties found for ${location}`)
          continue
        }
        throw error
      }
    }

    // Convert records to typed properties
    const properties = this.recordsToProperties(allRecords)

    console.log(`Total properties collected: ${properties.length}`)

    return properties
  }

  /**
   * Ensure page number is valid (positive integer)
   * Matches Python safe_page_number logic
   */
  private safePageNumber(page: number): number {
    return Math.max(1, Math.floor(page))
  }

  /**
   * Sleep utility for rate limiting and retries
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

/**
 * Factory function to create a ZillowFetcher instance
 */
export function createZillowFetcher(apiKey?: string): ZillowFetcher {
  return new ZillowFetcher(apiKey)
}
