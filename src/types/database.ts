/**
 * Database type definitions
 * These will be generated from Supabase once the schema is created
 * For now, we define them manually based on our migration from Python
 */

export interface NashvilleRental {
  record_id: string // Primary key (SHA-256 hash)
  detail_url: string // Unique Zillow listing URL
  longitude: number | null
  latitude: number | null
  address: string | null
  price: number | null // Monthly rent in cents
  bedrooms: number | null
  bathrooms: number | null
  living_area: number | null // Square feet
  property_type: string | null
  units: Unit[] | null // For multi-unit properties
  ingestion_date: string // ISO date string (YYYY-MM-DD)
  created_at: string // ISO timestamp
  updated_at: string // ISO timestamp
  search_vector?: string // Full-text search (managed by Postgres)
}

export interface Unit {
  price?: number
  beds?: number
  bathrooms?: number
}

export interface Database {
  public: {
    Tables: {
      nashville_rentals: {
        Row: NashvilleRental
        Insert: Omit<NashvilleRental, 'created_at' | 'updated_at'>
        Update: Partial<
          Omit<NashvilleRental, 'record_id' | 'created_at' | 'updated_at'>
        >
      }
    }
  }
}
