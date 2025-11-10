import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DatabaseMigrator } from '../migrator'
import { ZillowProperty } from '@/lib/zillow/types'
import * as supabaseClient from '@/lib/supabase/client'

// Mock Supabase client
vi.mock('@/lib/supabase/client', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}))

describe('DatabaseMigrator', () => {
  const mockSupabase = vi.mocked(supabaseClient.supabaseAdmin)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('generateRecordId', () => {
    it('should generate consistent SHA-256 hash for same input', () => {
      const property: ZillowProperty = {
        detailUrl: 'https://zillow.com/property/123',
        longitude: -86.7816,
        latitude: 36.1627,
        price: 2000,
      }

      const id1 = DatabaseMigrator.generateRecordId(property)
      const id2 = DatabaseMigrator.generateRecordId(property)

      expect(id1).toBe(id2)
      expect(id1).toHaveLength(64) // SHA-256 produces 64 hex characters
      expect(id1).toMatch(/^[A-F0-9]+$/) // Uppercase hex
    })

    it('should generate different hashes for different URLs', () => {
      const property1: ZillowProperty = {
        detailUrl: 'https://zillow.com/property/123',
      }

      const property2: ZillowProperty = {
        detailUrl: 'https://zillow.com/property/456',
      }

      const id1 = DatabaseMigrator.generateRecordId(property1)
      const id2 = DatabaseMigrator.generateRecordId(property2)

      expect(id1).not.toBe(id2)
    })

    it('should handle empty detail URL', () => {
      const property: ZillowProperty = {
        detailUrl: '',
      }

      const id = DatabaseMigrator.generateRecordId(property)

      expect(id).toBeDefined()
      expect(id).toHaveLength(64)
    })

    it('should generate deterministic hash for known input', () => {
      // This hash is deterministic - same input always produces same output
      const property: ZillowProperty = {
        detailUrl: 'https://zillow.com/property/test',
      }

      const id = DatabaseMigrator.generateRecordId(property)

      // The hash should be deterministic
      // (actual value is 93C20CF7F9B9FFD0CF33CA1CE42741F05C2F13BBD60D613AAD869EAEFF79E587)
      expect(id).toBe(
        '93C20CF7F9B9FFD0CF33CA1CE42741F05C2F13BBD60D613AAD869EAEFF79E587'
      )
      expect(id).toHaveLength(64)
      expect(id).toMatch(/^[A-F0-9]+$/)
    })
  })

  describe('propertyToRecord', () => {
    it('should convert property to database record format', () => {
      const property: ZillowProperty = {
        detailUrl: 'https://zillow.com/property/123',
        longitude: -86.7816,
        latitude: 36.1627,
        address: '123 Main St, Nashville, TN',
        price: 2000,
        bedrooms: 2,
        bathrooms: 2.0,
        livingArea: 1200,
        propertyType: 'APARTMENT',
      }

      const record = DatabaseMigrator.propertyToRecord(property, '2025-11-10')

      expect(record).toMatchObject({
        detail_url: 'https://zillow.com/property/123',
        longitude: -86.7816,
        latitude: 36.1627,
        address: '123 Main St, Nashville, TN',
        price: 200000, // $2000 * 100 cents
        bedrooms: 2,
        bathrooms: 2.0,
        living_area: 1200,
        property_type: 'APARTMENT',
        ingestion_date: '2025-11-10',
      })

      expect(record.record_id).toBeDefined()
      expect(record.record_id).toHaveLength(64)
    })

    it('should handle null/undefined values', () => {
      const property: ZillowProperty = {
        detailUrl: 'https://zillow.com/property/123',
        longitude: null,
        latitude: undefined,
        price: null,
      }

      const record = DatabaseMigrator.propertyToRecord(property, '2025-11-10')

      expect(record.longitude).toBeNull()
      expect(record.latitude).toBeNull()
      expect(record.price).toBeNull()
      expect(record.address).toBeNull()
    })

    it('should convert price to cents correctly', () => {
      const property1: ZillowProperty = {
        detailUrl: 'https://zillow.com/property/1',
        price: 2000.5,
      }

      const property2: ZillowProperty = {
        detailUrl: 'https://zillow.com/property/2',
        price: 1599.99,
      }

      const record1 = DatabaseMigrator.propertyToRecord(property1, '2025-11-10')
      const record2 = DatabaseMigrator.propertyToRecord(property2, '2025-11-10')

      expect(record1.price).toBe(200050) // Rounded
      expect(record2.price).toBe(159999) // Rounded
    })

    it('should include units data', () => {
      const property: ZillowProperty = {
        detailUrl: 'https://zillow.com/property/123',
        units: [
          { price: 2000, beds: 2, bathrooms: 2.0 },
          { price: 2100, beds: 2, bathrooms: 2.0 },
        ],
      }

      const record = DatabaseMigrator.propertyToRecord(property, '2025-11-10')

      expect(record.units).toEqual([
        { price: 2000, beds: 2, bathrooms: 2.0 },
        { price: 2100, beds: 2, bathrooms: 2.0 },
      ])
    })
  })

  describe('deduplicateByDetailUrl', () => {
    it('should keep last occurrence of duplicate URLs', () => {
      const records = [
        {
          record_id: 'id1',
          detail_url: 'https://zillow.com/property/123',
          price: 2000,
          ingestion_date: '2025-11-10',
        },
        {
          record_id: 'id2',
          detail_url: 'https://zillow.com/property/123', // Duplicate
          price: 2100, // Updated price
          ingestion_date: '2025-11-10',
        },
        {
          record_id: 'id3',
          detail_url: 'https://zillow.com/property/456',
          price: 1800,
          ingestion_date: '2025-11-10',
        },
      ] as any[]

      const deduplicated = (DatabaseMigrator as any).deduplicateByDetailUrl(
        records
      )

      expect(deduplicated).toHaveLength(2)
      expect(deduplicated[0].detail_url).toBe(
        'https://zillow.com/property/123'
      )
      expect(deduplicated[0].price).toBe(2100) // Last occurrence
      expect(deduplicated[1].detail_url).toBe(
        'https://zillow.com/property/456'
      )
    })

    it('should handle no duplicates', () => {
      const records = [
        {
          record_id: 'id1',
          detail_url: 'https://zillow.com/property/123',
          ingestion_date: '2025-11-10',
        },
        {
          record_id: 'id2',
          detail_url: 'https://zillow.com/property/456',
          ingestion_date: '2025-11-10',
        },
      ] as any[]

      const deduplicated = (DatabaseMigrator as any).deduplicateByDetailUrl(
        records
      )

      expect(deduplicated).toHaveLength(2)
    })

    it('should handle empty array', () => {
      const deduplicated = (DatabaseMigrator as any).deduplicateByDetailUrl([])
      expect(deduplicated).toEqual([])
    })
  })

  describe('uppercaseRecord', () => {
    it('should uppercase all string values', () => {
      const record = {
        address: '123 Main St',
        propertyType: 'apartment',
        price: 2000,
        longitude: -86.7816,
      }

      const uppercased = DatabaseMigrator.uppercaseRecord(record)

      expect(uppercased).toEqual({
        address: '123 MAIN ST',
        propertyType: 'APARTMENT',
        price: 2000, // Numbers unchanged
        longitude: -86.7816, // Numbers unchanged
      })
    })

    it('should handle null and undefined values', () => {
      const record = {
        address: 'test',
        price: null,
        bedrooms: undefined,
      }

      const uppercased = DatabaseMigrator.uppercaseRecord(record)

      expect(uppercased).toEqual({
        address: 'TEST',
        price: null,
        bedrooms: undefined,
      })
    })

    it('should handle empty object', () => {
      const uppercased = DatabaseMigrator.uppercaseRecord({})
      expect(uppercased).toEqual({})
    })
  })

  describe('persistProperties', () => {
    it('should persist properties to Supabase', async () => {
      const properties: ZillowProperty[] = [
        {
          detailUrl: 'https://zillow.com/property/123',
          price: 2000,
          bedrooms: 2,
        },
        {
          detailUrl: 'https://zillow.com/property/456',
          price: 2100,
          bedrooms: 3,
        },
      ]

      // Mock Supabase response
      const mockSelect = vi.fn().mockResolvedValue({
        data: [{}, {}],
        error: null,
      })
      const mockUpsert = vi.fn().mockReturnValue({
        select: mockSelect,
      })
      const mockFrom = vi.fn().mockReturnValue({
        upsert: mockUpsert,
      })

      mockSupabase.from = mockFrom

      const count = await DatabaseMigrator.persistProperties(
        properties,
        '2025-11-10'
      )

      expect(count).toBe(2)
      expect(mockFrom).toHaveBeenCalledWith('nashville_rentals')
      expect(mockUpsert).toHaveBeenCalled()

      // Check that the upsert was called with the correct config
      const upsertCall = mockUpsert.mock.calls[0]
      expect(upsertCall[1]).toEqual({
        onConflict: 'detail_url',
        ignoreDuplicates: false,
      })
    })

    it('should handle empty properties array', async () => {
      const count = await DatabaseMigrator.persistProperties([])
      expect(count).toBe(0)
    })

    it('should throw error on Supabase failure', async () => {
      const properties: ZillowProperty[] = [
        {
          detailUrl: 'https://zillow.com/property/123',
        },
      ]

      // Mock Supabase error
      const mockSelect = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      })
      const mockUpsert = vi.fn().mockReturnValue({
        select: mockSelect,
      })
      const mockFrom = vi.fn().mockReturnValue({
        upsert: mockUpsert,
      })

      mockSupabase.from = mockFrom

      await expect(
        DatabaseMigrator.persistProperties(properties)
      ).rejects.toThrow('Failed to persist properties: Database error')
    })

    it('should use default ingestion date if not provided', async () => {
      const properties: ZillowProperty[] = [
        {
          detailUrl: 'https://zillow.com/property/123',
        },
      ]

      const mockSelect = vi.fn().mockResolvedValue({
        data: [{}],
        error: null,
      })
      const mockUpsert = vi.fn().mockReturnValue({
        select: mockSelect,
      })
      const mockFrom = vi.fn().mockReturnValue({
        upsert: mockUpsert,
      })

      mockSupabase.from = mockFrom

      await DatabaseMigrator.persistProperties(properties)

      // Check that a date was generated
      const upsertCall = mockUpsert.mock.calls[0]
      const records = upsertCall[0]
      expect(records[0].ingestion_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('should deduplicate properties before persisting', async () => {
      const properties: ZillowProperty[] = [
        {
          detailUrl: 'https://zillow.com/property/123',
          price: 2000,
        },
        {
          detailUrl: 'https://zillow.com/property/123', // Duplicate
          price: 2100, // Updated
        },
      ]

      const mockSelect = vi.fn().mockResolvedValue({
        data: [{}],
        error: null,
      })
      const mockUpsert = vi.fn().mockReturnValue({
        select: mockSelect,
      })
      const mockFrom = vi.fn().mockReturnValue({
        upsert: mockUpsert,
      })

      mockSupabase.from = mockFrom

      await DatabaseMigrator.persistProperties(properties)

      // Should only upsert 1 record (deduplicated)
      const upsertCall = mockUpsert.mock.calls[0]
      const records = upsertCall[0]
      expect(records).toHaveLength(1)
      expect(records[0].price).toBe(210000) // Last occurrence (in cents)
    })
  })

  describe('getRentalsCount', () => {
    it('should return count from Supabase', async () => {
      const mockSelect = vi.fn().mockResolvedValue({
        count: 42,
        error: null,
      })
      const mockFrom = vi.fn().mockReturnValue({
        select: mockSelect,
      })

      mockSupabase.from = mockFrom

      const count = await DatabaseMigrator.getRentalsCount()

      expect(count).toBe(42)
      expect(mockFrom).toHaveBeenCalledWith('nashville_rentals')
      expect(mockSelect).toHaveBeenCalledWith('*', {
        count: 'exact',
        head: true,
      })
    })

    it('should handle null count', async () => {
      const mockSelect = vi.fn().mockResolvedValue({
        count: null,
        error: null,
      })
      const mockFrom = vi.fn().mockReturnValue({
        select: mockSelect,
      })

      mockSupabase.from = mockFrom

      const count = await DatabaseMigrator.getRentalsCount()
      expect(count).toBe(0)
    })

    it('should throw error on Supabase failure', async () => {
      const mockSelect = vi.fn().mockResolvedValue({
        count: null,
        error: { message: 'Database error' },
      })
      const mockFrom = vi.fn().mockReturnValue({
        select: mockSelect,
      })

      mockSupabase.from = mockFrom

      await expect(DatabaseMigrator.getRentalsCount()).rejects.toThrow(
        'Failed to get rentals count: Database error'
      )
    })
  })

  describe('getLatestIngestionDate', () => {
    it('should return latest ingestion date', async () => {
      const mockLimit = vi.fn().mockResolvedValue({
        data: [{ ingestion_date: '2025-11-10' }],
        error: null,
      })
      const mockOrder = vi.fn().mockReturnValue({
        limit: mockLimit,
      })
      const mockSelect = vi.fn().mockReturnValue({
        order: mockOrder,
      })
      const mockFrom = vi.fn().mockReturnValue({
        select: mockSelect,
      })

      mockSupabase.from = mockFrom

      const date = await DatabaseMigrator.getLatestIngestionDate()

      expect(date).toBe('2025-11-10')
      expect(mockOrder).toHaveBeenCalledWith('ingestion_date', {
        ascending: false,
      })
      expect(mockLimit).toHaveBeenCalledWith(1)
    })

    it('should return null if no data', async () => {
      const mockLimit = vi.fn().mockResolvedValue({
        data: [],
        error: null,
      })
      const mockOrder = vi.fn().mockReturnValue({
        limit: mockLimit,
      })
      const mockSelect = vi.fn().mockReturnValue({
        order: mockOrder,
      })
      const mockFrom = vi.fn().mockReturnValue({
        select: mockSelect,
      })

      mockSupabase.from = mockFrom

      const date = await DatabaseMigrator.getLatestIngestionDate()
      expect(date).toBeNull()
    })

    it('should throw error on Supabase failure', async () => {
      const mockLimit = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      })
      const mockOrder = vi.fn().mockReturnValue({
        limit: mockLimit,
      })
      const mockSelect = vi.fn().mockReturnValue({
        order: mockOrder,
      })
      const mockFrom = vi.fn().mockReturnValue({
        select: mockSelect,
      })

      mockSupabase.from = mockFrom

      await expect(DatabaseMigrator.getLatestIngestionDate()).rejects.toThrow(
        'Failed to get latest ingestion date: Database error'
      )
    })
  })
})
