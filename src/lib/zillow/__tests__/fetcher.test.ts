import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { ZillowFetcher } from '../fetcher'
import {
  ZillowAPIError,
  RateLimitError,
  AuthenticationError,
  NotFoundError,
} from '../errors'
import axios from 'axios'

// Mock axios
vi.mock('axios')
const mockedAxios = vi.mocked(axios, true)

describe('ZillowFetcher', () => {
  let fetcher: ZillowFetcher

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()

    // Mock axios.create to return a mocked instance
    const mockAxiosInstance = {
      get: vi.fn(),
      defaults: { headers: {} },
    }
    mockedAxios.create = vi.fn(() => mockAxiosInstance as any)

    // Create fetcher with test API key
    fetcher = new ZillowFetcher('test-api-key')
  })

  describe('constructor and API key', () => {
    it('should use provided API key', () => {
      const customFetcher = new ZillowFetcher('custom-key')
      expect(customFetcher).toBeDefined()
    })

    it('should fall back to ZILLOW_RAPIDAPI_KEY environment variable', () => {
      process.env.ZILLOW_RAPIDAPI_KEY = 'env-key'
      const envFetcher = new ZillowFetcher()
      expect(envFetcher).toBeDefined()
    })

    it('should fall back to RAPIDAPI_KEY environment variable', () => {
      delete process.env.ZILLOW_RAPIDAPI_KEY
      process.env.RAPIDAPI_KEY = 'fallback-key'
      const envFetcher = new ZillowFetcher()
      expect(envFetcher).toBeDefined()
    })

    it('should throw error if no API key is available', () => {
      delete process.env.ZILLOW_RAPIDAPI_KEY
      delete process.env.RAPIDAPI_KEY
      expect(() => new ZillowFetcher()).toThrow(
        'Missing Zillow API key'
      )
    })
  })

  describe('flattenMapping', () => {
    it('should flatten nested objects', () => {
      const nested = {
        address: {
          street: '123 Main St',
          city: 'Nashville',
        },
        price: 2000,
      }

      const flattened = (fetcher as any).flattenMapping(nested)

      expect(flattened).toEqual({
        'address__street': '123 Main St',
        'address__city': 'Nashville',
        price: 2000,
      })
    })

    it('should handle deeply nested objects', () => {
      const nested = {
        location: {
          address: {
            street: {
              number: 123,
              name: 'Main St',
            },
          },
        },
      }

      const flattened = (fetcher as any).flattenMapping(nested)

      expect(flattened).toEqual({
        'location__address__street__number': 123,
        'location__address__street__name': 'Main St',
      })
    })

    it('should preserve arrays without flattening', () => {
      const nested = {
        tags: ['apartment', 'luxury'],
        metadata: {
          photos: ['photo1.jpg', 'photo2.jpg'],
        },
      }

      const flattened = (fetcher as any).flattenMapping(nested)

      expect(flattened).toEqual({
        tags: ['apartment', 'luxury'],
        'metadata__photos': ['photo1.jpg', 'photo2.jpg'],
      })
    })

    it('should handle empty objects', () => {
      const flattened = (fetcher as any).flattenMapping({})
      expect(flattened).toEqual({})
    })
  })

  describe('augmentWithUnits', () => {
    it('should add indexed unit data', () => {
      const baseRecord = {
        detailUrl: 'https://example.com',
        address: '123 Main St',
      }

      const units = [
        { price: 2000, beds: 2, bathrooms: 2.0 },
        { price: 2100, beds: 2, bathrooms: 2.0 },
      ]

      const augmented = (fetcher as any).augmentWithUnits(baseRecord, units)

      expect(augmented).toEqual({
        detailUrl: 'https://example.com',
        address: '123 Main St',
        price_1: 2000,
        beds_1: 2,
        bathrooms_1: 2.0,
        price_2: 2100,
        beds_2: 2,
        bathrooms_2: 2.0,
      })
    })

    it('should handle partial unit data', () => {
      const baseRecord = { detailUrl: 'https://example.com' }
      const units = [{ price: 2000 }, { beds: 3 }]

      const augmented = (fetcher as any).augmentWithUnits(baseRecord, units)

      expect(augmented).toEqual({
        detailUrl: 'https://example.com',
        price_1: 2000,
        beds_2: 3,
      })
    })

    it('should handle empty units array', () => {
      const baseRecord = { detailUrl: 'https://example.com' }
      const augmented = (fetcher as any).augmentWithUnits(baseRecord, [])

      expect(augmented).toEqual({
        detailUrl: 'https://example.com',
      })
    })
  })

  describe('safePageNumber', () => {
    it('should return positive integers unchanged', () => {
      expect((fetcher as any).safePageNumber(1)).toBe(1)
      expect((fetcher as any).safePageNumber(5)).toBe(5)
      expect((fetcher as any).safePageNumber(100)).toBe(100)
    })

    it('should convert negative numbers to 1', () => {
      expect((fetcher as any).safePageNumber(-1)).toBe(1)
      expect((fetcher as any).safePageNumber(-10)).toBe(1)
      expect((fetcher as any).safePageNumber(0)).toBe(1)
    })

    it('should floor decimal numbers', () => {
      expect((fetcher as any).safePageNumber(1.5)).toBe(1)
      expect((fetcher as any).safePageNumber(2.9)).toBe(2)
    })
  })

  describe('extractResults', () => {
    it('should extract from results field', () => {
      const payload = {
        results: [{ id: 1 }, { id: 2 }],
      }

      const results = (fetcher as any).extractResults(payload)
      expect(results).toEqual([{ id: 1 }, { id: 2 }])
    })

    it('should extract from props field', () => {
      const payload = {
        props: [{ id: 1 }, { id: 2 }],
      }

      const results = (fetcher as any).extractResults(payload)
      expect(results).toEqual([{ id: 1 }, { id: 2 }])
    })

    it('should handle array payload directly', () => {
      const payload = [{ id: 1 }, { id: 2 }]

      const results = (fetcher as any).extractResults(payload)
      expect(results).toEqual([{ id: 1 }, { id: 2 }])
    })

    it('should prefer results over props', () => {
      const payload = {
        results: [{ id: 1 }],
        props: [{ id: 2 }],
      }

      const results = (fetcher as any).extractResults(payload)
      expect(results).toEqual([{ id: 1 }])
    })

    it('should return empty array for null/undefined', () => {
      expect((fetcher as any).extractResults(null)).toEqual([])
      expect((fetcher as any).extractResults(undefined)).toEqual([])
    })

    it('should return empty array when no results found', () => {
      const payload = { other: 'data' }
      expect((fetcher as any).extractResults(payload)).toEqual([])
    })
  })

  describe('recordsToProperties', () => {
    it('should convert valid records to properties', () => {
      const records = [
        {
          longitude: -86.7816,
          latitude: 36.1627,
          detailUrl: 'https://zillow.com/property/1',
          price: 2000,
          bedrooms: 2,
          bathrooms: 2.0,
          livingArea: 1200,
          propertyType: 'APARTMENT',
          address: '123 Main St',
        },
      ]

      const properties = fetcher.recordsToProperties(records)

      expect(properties).toHaveLength(1)
      expect(properties[0]).toMatchObject({
        longitude: -86.7816,
        latitude: 36.1627,
        detailUrl: 'https://zillow.com/property/1',
        price: 2000,
        bedrooms: 2,
      })
    })

    it('should handle nested records by flattening', () => {
      const records = [
        {
          address: {
            street: '123 Main St',
          },
          detailUrl: 'https://zillow.com/property/1',
        },
      ]

      const properties = fetcher.recordsToProperties(records)

      expect(properties).toHaveLength(1)
      // Flattened to address__street, but schema expects just address
      // The property might not fully validate, but detailUrl should be there
      expect(properties[0].detailUrl).toBe('https://zillow.com/property/1')
    })

    it('should handle multi-unit properties', () => {
      const records = [
        {
          detailUrl: 'https://zillow.com/property/1',
          units: [
            { price: 2000, beds: 2, bathrooms: 2.0 },
            { price: 2100, beds: 2, bathrooms: 2.0 },
          ],
        },
      ]

      const properties = fetcher.recordsToProperties(records)

      expect(properties).toHaveLength(1)
      expect(properties[0].detailUrl).toBe('https://zillow.com/property/1')
      expect(properties[0].units).toEqual([
        { price: 2000, beds: 2, bathrooms: 2.0 },
        { price: 2100, beds: 2, bathrooms: 2.0 },
      ])
    })

    it('should skip invalid records', () => {
      const records = [
        {
          // Missing detailUrl - should fail validation
          price: 2000,
        },
        {
          detailUrl: 'https://zillow.com/property/2',
          price: 2100,
        },
      ]

      // Mock console.warn to suppress test output
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const properties = fetcher.recordsToProperties(records)

      // Should only have the valid property
      expect(properties).toHaveLength(1)
      expect(properties[0].detailUrl).toBe('https://zillow.com/property/2')
      expect(warnSpy).toHaveBeenCalled()

      warnSpy.mockRestore()
    })

    it('should handle empty records array', () => {
      const properties = fetcher.recordsToProperties([])
      expect(properties).toEqual([])
    })
  })
})
