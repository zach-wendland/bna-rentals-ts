import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/client'
import { TABLE_NAME } from '@/lib/config/constants'
import { NashvilleRental } from '@/types/database'

/**
 * GET /api/rentals
 * Fetch rental listings with optional filters
 *
 * Query parameters:
 * - minPrice: Minimum price (in dollars)
 * - maxPrice: Maximum price (in dollars)
 * - search: Search term for address or detail_url
 * - limit: Maximum number of results (default: 100)
 * - offset: Number of results to skip (default: 0)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const minPrice = searchParams.get('minPrice')
    const maxPrice = searchParams.get('maxPrice')
    const search = searchParams.get('search')
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build query
    let query = supabase
      .from(TABLE_NAME)
      .select('*')
      .order('ingestion_date', { ascending: false })
      .order('record_id', { ascending: false })
      .range(offset, offset + limit - 1)

    // Apply filters
    if (minPrice) {
      const minPriceCents = parseFloat(minPrice) * 100
      query = query.gte('price', minPriceCents)
    }

    if (maxPrice) {
      const maxPriceCents = parseFloat(maxPrice) * 100
      query = query.lte('price', maxPriceCents)
    }

    if (search) {
      // Search in address and detail_url
      query = query.or(
        `address.ilike.%${search}%,detail_url.ilike.%${search}%`
      )
    }

    const { data, error } = await query

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch rentals', details: error.message },
        { status: 500 }
      )
    }

    // Convert price from cents to dollars for response
    const rentals = (data as NashvilleRental[] | null)?.map((rental) => ({
      ...rental,
      price: rental.price ? rental.price / 100 : null,
    }))

    return NextResponse.json({
      data: rentals || [],
      count: rentals?.length || 0,
    })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
