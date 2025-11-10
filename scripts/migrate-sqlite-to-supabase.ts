/**
 * Migration script: SQLite to Supabase
 *
 * Migrates data from Python SQLite database (TESTRENT01.db)
 * to Supabase Postgres database
 *
 * Usage:
 *   npx tsx scripts/migrate-sqlite-to-supabase.ts
 */

import { createClient } from '@supabase/supabase-js'
import sqlite3 from 'sqlite3'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'
import { createHash } from 'crypto'

// Configuration
const SQLITE_DB_PATH = path.join(__dirname, '../../TESTRENT01.db')
const BATCH_SIZE = 100

interface SQLiteRow {
  RECORD_ID?: string
  DETAILURL: string
  LONGITUDE?: string
  LATITUDE?: string
  ADDRESS?: string
  PRICE?: string
  BEDROOMS?: string
  BATHROOMS?: string
  LIVINGAREA?: string
  PROPERTYTYPE?: string
  INGESTION_DATE?: string
  [key: string]: any
}

interface SupabaseRecord {
  record_id: string
  detail_url: string
  longitude: number | null
  latitude: number | null
  address: string | null
  price: number | null
  bedrooms: number | null
  bathrooms: number | null
  living_area: number | null
  property_type: string | null
  units: any[] | null
  ingestion_date: string
}

/**
 * Generate SHA-256 hash for record ID
 */
function generateRecordId(detailUrl: string): string {
  return createHash('sha256')
    .update(detailUrl, 'utf8')
    .digest('hex')
    .toUpperCase()
}

/**
 * Parse SQLite TEXT to number
 */
function parseNumber(value: string | undefined): number | null {
  if (!value || value === '') return null
  const num = parseFloat(value)
  return isNaN(num) ? null : num
}

/**
 * Convert SQLite row to Supabase record
 */
function convertRow(row: SQLiteRow): SupabaseRecord {
  // Generate record ID if missing
  const recordId = row.RECORD_ID || generateRecordId(row.DETAILURL)

  // Parse price (SQLite stores as TEXT, need to convert to cents)
  let priceInCents: number | null = null
  if (row.PRICE) {
    const price = parseNumber(row.PRICE)
    if (price !== null) {
      // Python stored as TEXT of dollar amount, we store as cents
      priceInCents = Math.round(price * 100)
    }
  }

  return {
    record_id: recordId,
    detail_url: row.DETAILURL,
    longitude: parseNumber(row.LONGITUDE),
    latitude: parseNumber(row.LATITUDE),
    address: row.ADDRESS || null,
    price: priceInCents,
    bedrooms: parseNumber(row.BEDROOMS),
    bathrooms: parseNumber(row.BATHROOMS),
    living_area: parseNumber(row.LIVINGAREA),
    property_type: row.PROPERTYTYPE || null,
    units: null, // Will be populated if multi-unit data exists
    ingestion_date: row.INGESTION_DATE || new Date().toISOString().split('T')[0],
  }
}

/**
 * Main migration function
 */
async function migrate() {
  console.log('🚀 Starting migration from SQLite to Supabase...\n')

  // Check if SQLite database exists
  if (!fs.existsSync(SQLITE_DB_PATH)) {
    console.error(`❌ SQLite database not found: ${SQLITE_DB_PATH}`)
    console.log('Please ensure TESTRENT01.db is in the project root directory.')
    process.exit(1)
  }

  // Initialize Supabase client
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase credentials')
    console.log('Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Initialize SQLite connection
  const db = new sqlite3.Database(SQLITE_DB_PATH)
  const dbAll = promisify(db.all.bind(db))
  const dbClose = promisify(db.close.bind(db))

  try {
    // Get table name (should be NashvilleRents01)
    const tables = await dbAll(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ) as any[]

    console.log(`📊 Found tables: ${tables.map(t => t.name).join(', ')}`)

    const tableName = tables.find(t => t.name.includes('Nashville'))?.name
    if (!tableName) {
      console.error('❌ Nashville rentals table not found')
      process.exit(1)
    }

    console.log(`📋 Using table: ${tableName}\n`)

    // Count total rows
    const countResult = await dbAll(
      `SELECT COUNT(*) as count FROM ${tableName}`
    ) as any[]
    const totalRows = countResult[0].count

    console.log(`📦 Total rows to migrate: ${totalRows}`)

    // Fetch all rows
    console.log('📖 Reading from SQLite...')
    const rows = await dbAll(`SELECT * FROM ${tableName}`) as SQLiteRow[]

    // Convert rows
    console.log('🔄 Converting data format...')
    const records = rows.map(convertRow)

    // Migrate in batches
    console.log(`\n🚚 Migrating to Supabase in batches of ${BATCH_SIZE}...\n`)
    let totalMigrated = 0

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE)
      const batchNum = Math.floor(i / BATCH_SIZE) + 1
      const totalBatches = Math.ceil(records.length / BATCH_SIZE)

      console.log(`  Batch ${batchNum}/${totalBatches}: Migrating ${batch.length} records...`)

      const { data, error } = await supabase
        .from('nashville_rentals')
        .upsert(batch, {
          onConflict: 'detail_url',
          ignoreDuplicates: false,
        })

      if (error) {
        console.error(`  ❌ Error in batch ${batchNum}:`, error.message)
        console.error('  Details:', error)
      } else {
        totalMigrated += batch.length
        console.log(`  ✅ Batch ${batchNum} completed`)
      }
    }

    // Close SQLite connection
    await dbClose()

    // Verify migration
    console.log('\n🔍 Verifying migration...')
    const { count, error: countError } = await supabase
      .from('nashville_rentals')
      .select('*', { count: 'exact', head: true })

    if (countError) {
      console.error('❌ Verification failed:', countError.message)
    } else {
      console.log(`✅ Supabase now has ${count} records`)
    }

    // Summary
    console.log('\n' + '='.repeat(50))
    console.log('✨ Migration Summary')
    console.log('='.repeat(50))
    console.log(`SQLite rows:       ${totalRows}`)
    console.log(`Records migrated:  ${totalMigrated}`)
    console.log(`Supabase count:    ${count}`)
    console.log('='.repeat(50))

    if (count === totalRows) {
      console.log('\n🎉 Migration completed successfully!')
    } else {
      console.log('\n⚠️  Row count mismatch - please verify the data')
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error)
    process.exit(1)
  }
}

// Run migration
migrate().catch(console.error)
