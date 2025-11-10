import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/cron/daily-fetch
 * Cron job endpoint for daily data fetch
 *
 * Triggered by Vercel Cron (configured in vercel.json)
 * Requires CRON_SECRET authentication
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization')
    const expectedAuth = `Bearer ${process.env.CRON_SECRET}`

    if (authHeader !== expectedAuth) {
      console.warn('Unauthorized cron attempt')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Trigger sync endpoint
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const syncUrl = `${appUrl}/api/sync`

    console.log(`Triggering daily sync: ${syncUrl}`)

    const response = await fetch(syncUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const result = await response.json()

    if (!response.ok) {
      console.error('Sync failed:', result)
      return NextResponse.json(
        {
          success: false,
          error: 'Sync endpoint failed',
          details: result,
        },
        { status: 500 }
      )
    }

    console.log('Daily sync completed:', result)

    return NextResponse.json({
      success: true,
      message: 'Daily fetch completed',
      syncResult: result,
    })
  } catch (error) {
    console.error('Cron job failed:', error)
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
