import { createHash } from 'crypto'
import { supabaseAdmin } from '../supabase/client'
import { ZillowProperty } from '../zillow/types'
import { NashvilleRental } from '@/types/database'
import { TABLE_NAME, PRIMARY_KEY_SOURCE_COLUMNS } from '../config/constants'

/**
 * Database Migrator
 * TypeScript implementation of Python db/db_migrator.py
 *
 * Handles:
 * - Generating deterministic primary keys (SHA-256)
 * - Persisting properties to Supabase
 * - Upsert logic (insert new / update existing)
 * - Data transformations for database storage
 */

export class DatabaseMigrator {
  /**
   * Generate deterministic record ID from source columns
   * Matches Python assign_primary_keys() and _hash_with_fallback()
   *
   * @param property - Property to generate ID for
   * @returns Uppercase SHA-256 hash
   */
  static generateRecordId(property: ZillowProperty): string {
    // Build seed from source columns
    const seedParts = PRIMARY_KEY_SOURCE_COLUMNS.map((col) => {
      // Map camelCase to snake_case for consistency
      if (col === 'detail_url') {
        return property.detailUrl || ''
      }
      return ''
    })

    const seed = seedParts.join('__||__')

    // Generate SHA-256 hash
    const hash = createHash('sha256').update(seed, 'utf8').digest('hex')

    // Return uppercase (matches Python .upper())
    return hash.toUpperCase()
  }

  /**
   * Convert ZillowProperty to database record format
   * Handles data type conversions and transformations
   *
   * @param property - Zillow property object
   * @param ingestionDate - Date of data ingestion (YYYY-MM-DD)
   */
  static propertyToRecord(
    property: ZillowProperty,
    ingestionDate: string
  ): Omit<NashvilleRental, 'created_at' | 'updated_at'> {
    // Generate deterministic primary key
    const recordId = this.generateRecordId(property)

    // Convert price to cents (avoid floating point)
    // Python stores as TEXT, but we use INTEGER in Postgres
    const priceInCents = property.price
      ? Math.round(property.price * 100)
      : null

    return {
      record_id: recordId,
      detail_url: property.detailUrl,
      longitude: property.longitude ?? null,
      latitude: property.latitude ?? null,
      address: property.address ?? null,
      price: priceInCents,
      bedrooms: property.bedrooms ?? null,
      bathrooms: property.bathrooms ?? null,
      living_area: property.livingArea ?? null,
      property_type: property.propertyType ?? null,
      units: property.units ?? null,
      ingestion_date: ingestionDate,
    }
  }

  /**
   * Persist multiple properties to Supabase
   * Matches Python persist_to_sqlite()
   *
   * Uses upsert strategy:
   * - Insert new records
   * - Update ingestion_date for existing records
   *
   * @param properties - Array of Zillow properties
   * @param ingestionDate - Date of ingestion (YYYY-MM-DD)
   * @returns Number of records upserted
   */
  static async persistProperties(
    properties: ZillowProperty[],
    ingestionDate?: string
  ): Promise<number> {
    if (properties.length === 0) {
      return 0
    }

    // Default to today in YYYY-MM-DD format
    const date =
      ingestionDate ||
      new Date().toISOString().split('T')[0]

    // Convert properties to database records
    const records = properties.map((prop) =>
      this.propertyToRecord(prop, date)
    )

    // Deduplicate by detail_url (keep last occurrence)
    const uniqueRecords = this.deduplicateByDetailUrl(records)

    // Upsert to Supabase
    // onConflict: 'detail_url' means:
    // - If detail_url already exists, update the record
    // - Otherwise, insert new record
    const { data, error } = await supabaseAdmin
      .from(TABLE_NAME)
      .upsert(uniqueRecords as any, {
        onConflict: 'detail_url',
        ignoreDuplicates: false,
      })
      .select()

    if (error) {
      throw new Error(
        `Failed to persist properties: ${error.message}`
      )
    }

    return data?.length || uniqueRecords.length
  }

  /**
   * Deduplicate records by detail_url
   * Keeps the last occurrence of each unique URL
   * Matches Python pandas drop_duplicates behavior
   *
   * @param records - Array of database records
   * @returns Deduplicated array
   */
  private static deduplicateByDetailUrl(
    records: Omit<NashvilleRental, 'created_at' | 'updated_at'>[]
  ): Omit<NashvilleRental, 'created_at' | 'updated_at'>[] {
    const seen = new Map<
      string,
      Omit<NashvilleRental, 'created_at' | 'updated_at'>
    >()

    for (const record of records) {
      seen.set(record.detail_url, record)
    }

    return Array.from(seen.values())
  }

  /**
   * Uppercase all string values in a record
   * Matches Python uppercase_dataframe()
   *
   * Note: We might not need this for Postgres, but keeping for compatibility
   */
  static uppercaseRecord(
    record: Record<string, any>
  ): Record<string, any> {
    const uppercased: Record<string, any> = {}

    for (const [key, value] of Object.entries(record)) {
      if (typeof value === 'string') {
        uppercased[key] = value.toUpperCase()
      } else {
        uppercased[key] = value
      }
    }

    return uppercased
  }

  /**
   * Get count of all rentals in database
   */
  static async getRentalsCount(): Promise<number> {
    const { count, error } = await supabaseAdmin
      .from(TABLE_NAME)
      .select('*', { count: 'exact', head: true })

    if (error) {
      throw new Error(`Failed to get rentals count: ${error.message}`)
    }

    return count || 0
  }

  /**
   * Get latest ingestion date from database
   */
  static async getLatestIngestionDate(): Promise<string | null> {
    const { data, error } = await supabaseAdmin
      .from(TABLE_NAME)
      .select('ingestion_date')
      .order('ingestion_date', { ascending: false })
      .limit(1)

    if (error) {
      throw new Error(
        `Failed to get latest ingestion date: ${error.message}`
      )
    }

    return data && data.length > 0 ? (data as any)[0].ingestion_date : null
  }
}
