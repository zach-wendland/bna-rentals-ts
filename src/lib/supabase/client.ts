import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'

// Validate environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable')
}

if (!supabaseAnonKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable')
}

/**
 * Public Supabase client for client-side usage
 * Uses anon key with Row Level Security (RLS) policies
 */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

/**
 * Admin Supabase client for server-side usage
 * Uses service role key to bypass RLS
 * Should ONLY be used in API routes and server components
 */
export const supabaseAdmin = (() => {
  if (!supabaseServiceRoleKey) {
    console.warn(
      'SUPABASE_SERVICE_ROLE_KEY not found - admin client will use anon key'
    )
    return createClient<Database>(supabaseUrl, supabaseAnonKey)
  }
  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey)
})()
