import { z } from 'zod'

/**
 * Zillow API types and Zod schemas
 * Based on Python api/zillow_fetcher.py
 */

// Unit schema for multi-unit properties
export const UnitSchema = z.object({
  price: z.number().optional(),
  beds: z.number().optional(),
  bathrooms: z.number().optional(),
})

export type ZillowUnit = z.infer<typeof UnitSchema>

// Property schema - flexible to handle various API responses
export const ZillowPropertySchema = z.object({
  longitude: z.number().nullable().optional(),
  latitude: z.number().nullable().optional(),
  detailUrl: z.string(),
  price: z.number().nullable().optional(),
  bedrooms: z.number().nullable().optional(),
  bathrooms: z.number().nullable().optional(),
  livingArea: z.number().nullable().optional(),
  propertyType: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  units: z.array(UnitSchema).nullable().optional(),
})

export type ZillowProperty = z.infer<typeof ZillowPropertySchema>

// API response schema
export const ZillowAPIResponseSchema = z.object({
  results: z.array(z.any()).optional(),
  props: z.array(z.any()).optional(),
  totalPages: z.number().optional(),
  totalResultCount: z.number().optional(),
})

export type ZillowAPIResponse = z.infer<typeof ZillowAPIResponseSchema>

// Fetch configuration
export interface FetchConfig {
  baseParams: Record<string, any>
  locations: readonly string[]
  maxPages?: number
  rateLimitWaitMs?: number
  retries?: number
}

// Fetch parameters for a single request
export interface FetchParams extends Record<string, any> {
  status_type: string
  rentMinPrice: number
  rentMaxPrice: number
  bedsMin: number
  bedsMax: number
  sqftMin: number
  sqftMax: number
  location?: string
  page?: number
}
