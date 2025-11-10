/**
 * Application constants
 * Migrated from Python main.py
 */

/**
 * Base search parameters for Zillow API
 * Matches the Python BASE_PARAMS configuration
 */
export const BASE_PARAMS = {
  status_type: 'ForRent',
  rentMinPrice: 1600,
  rentMaxPrice: 3300,
  bedsMin: 1,
  bedsMax: 4,
  sqftMin: 700,
  sqftMax: 3500,
} as const

/**
 * Nashville zip codes to search
 * Matches the Python RAW_LOCATIONS configuration
 */
export const LOCATIONS = [
  '37206, Nashville, TN',
  '37216, Nashville, TN',
  '37209, Nashville, TN',
  '37203, Nashville, TN',
  '37210, Nashville, TN',
  '37214, Nashville, TN',
  '37217, Nashville, TN',
  '37204, Nashville, TN',
  '37215, Nashville, TN',
  '37211, Nashville, TN',
  '37207, Nashville, TN',
  '37013, Nashville, TN',
] as const

/**
 * Maximum pages to fetch per location
 * Matches the Python MAX_PAGES configuration
 */
export const MAX_PAGES = 10

/**
 * Number of locations to process in each batch
 * Matches the Python BATCH_SIZE configuration
 */
export const BATCH_SIZE = 5

/**
 * Rate limit wait time between API requests (milliseconds)
 * Python uses 5 seconds
 */
export const RATE_LIMIT_WAIT_MS = 5000

/**
 * Default number of retry attempts for API requests
 * Matches the Python default_retries=4
 */
export const DEFAULT_RETRIES = 4

/**
 * Database table name
 */
export const TABLE_NAME = 'nashville_rentals'

/**
 * Columns used to generate the unique record ID
 * Matches Python PRIMARY_KEY_SOURCE_COLUMNS
 */
export const PRIMARY_KEY_SOURCE_COLUMNS = ['detail_url'] as const

/**
 * Zillow API configuration
 */
export const ZILLOW_API = {
  baseURL: 'https://zillow-com1.p.rapidapi.com',
  host: 'zillow-com1.p.rapidapi.com',
  endpoint: '/propertyExtendedSearch',
} as const
