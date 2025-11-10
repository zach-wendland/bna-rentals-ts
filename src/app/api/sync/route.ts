import { NextResponse } from 'next/server'
import { createZillowFetcher } from '@/lib/zillow/fetcher'
import { DatabaseMigrator } from '@/lib/db/migrator'
import {
  BASE_PARAMS,
  LOCATIONS,
  MAX_PAGES,
  BATCH_SIZE,
  RATE_LIMIT_WAIT_MS,
} from '@/lib/config/constants'

/**
 * POST /api/sync
 * Manually trigger data sync from Zillow API
 *
 * Processes locations in batches and persists to database
 * Matches Python main.py pipeline
 */
export async function POST() {
  try {
    const fetcher = createZillowFetcher()
    const allProperties = []

    // Process locations in batches
    for (let i = 0; i < LOCATIONS.length; i += BATCH_SIZE) {
      const batchLocations = LOCATIONS.slice(i, i + BATCH_SIZE)

      console.log(
        `Processing batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batchLocations.join(', ')}`
      )

      try {
        const properties = await fetcher.collectProperties({
          baseParams: BASE_PARAMS,
          locations: batchLocations,
          maxPages: MAX_PAGES,
          rateLimitWaitMs: RATE_LIMIT_WAIT_MS,
        })

        allProperties.push(...properties)
        console.log(`Batch collected ${properties.length} properties`)

        // Rate limiting between batches
        if (i + BATCH_SIZE < LOCATIONS.length) {
          console.log(
            `Waiting ${RATE_LIMIT_WAIT_MS / 1000}s before next batch...`
          )
          await sleep(RATE_LIMIT_WAIT_MS)
        }
      } catch (error) {
        console.error(`Error processing batch ${i / BATCH_SIZE + 1}:`, error)
        // Continue with next batch on error
      }
    }

    // Persist all properties to database
    const ingestionDate = new Date().toISOString().split('T')[0]
    const persistedCount = await DatabaseMigrator.persistProperties(
      allProperties,
      ingestionDate
    )

    console.log(
      `Sync complete: ${allProperties.length} properties collected, ${persistedCount} persisted`
    )

    return NextResponse.json({
      success: true,
      message: 'Sync completed successfully',
      collected: allProperties.length,
      persisted: persistedCount,
      ingestionDate,
    })
  } catch (error) {
    console.error('Sync failed:', error)
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    )
  }
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
