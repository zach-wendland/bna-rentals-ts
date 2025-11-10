-- Nashville Rentals Database Schema for Supabase
-- Migrated from Python SQLite (TESTRENT01.db)

-- Drop table if exists (for clean migrations)
DROP TABLE IF EXISTS nashville_rentals CASCADE;

-- Create main rentals table
CREATE TABLE nashville_rentals (
  -- Primary key (deterministic SHA-256 hash)
  record_id TEXT PRIMARY KEY,

  -- Unique listing URL (Zillow detail page)
  detail_url TEXT UNIQUE NOT NULL,

  -- Location data
  longitude NUMERIC(10, 6),
  latitude NUMERIC(10, 6),
  address TEXT,

  -- Property details
  price INTEGER, -- Monthly rent in cents (to avoid floating point issues)
  bedrooms SMALLINT,
  bathrooms NUMERIC(3, 1),
  living_area INTEGER, -- Square feet
  property_type TEXT,

  -- Multi-unit properties (JSON array)
  units JSONB,

  -- Metadata
  ingestion_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Full-text search vector (auto-generated)
  search_vector TSVECTOR
);

-- Create indexes for performance
CREATE INDEX idx_rentals_detail_url ON nashville_rentals(detail_url);
CREATE INDEX idx_rentals_ingestion_date ON nashville_rentals(ingestion_date DESC);
CREATE INDEX idx_rentals_price ON nashville_rentals(price) WHERE price IS NOT NULL;
CREATE INDEX idx_rentals_bedrooms ON nashville_rentals(bedrooms) WHERE bedrooms IS NOT NULL;
CREATE INDEX idx_rentals_property_type ON nashville_rentals(property_type) WHERE property_type IS NOT NULL;

-- Geospatial index for location queries
CREATE INDEX idx_rentals_location ON nashville_rentals USING GIST(
  ll_to_earth(latitude::FLOAT, longitude::FLOAT)
) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Full-text search index
CREATE INDEX idx_rentals_search ON nashville_rentals USING GIN(search_vector);

-- Create function for updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-updating updated_at
CREATE TRIGGER update_rentals_updated_at
  BEFORE UPDATE ON nashville_rentals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create function for updating search vector
CREATE OR REPLACE FUNCTION rentals_search_vector_trigger()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.address, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.property_type, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-updating search vector
CREATE TRIGGER rentals_search_vector_update
  BEFORE INSERT OR UPDATE ON nashville_rentals
  FOR EACH ROW
  EXECUTE FUNCTION rentals_search_vector_trigger();

-- Enable Row Level Security (RLS)
ALTER TABLE nashville_rentals ENABLE ROW LEVEL SECURITY;

-- Create RLS policies

-- Allow public read access (anyone can view rentals)
CREATE POLICY "Allow public read access"
  ON nashville_rentals
  FOR SELECT
  TO anon
  USING (true);

-- Allow authenticated users to read
CREATE POLICY "Allow authenticated read access"
  ON nashville_rentals
  FOR SELECT
  TO authenticated
  USING (true);

-- Only service role can insert/update (server-side only)
CREATE POLICY "Service role only write"
  ON nashville_rentals
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create view for dashboard queries
CREATE OR REPLACE VIEW rentals_summary AS
SELECT
  COUNT(*) AS total_rentals,
  AVG(price) AS avg_price_cents,
  MIN(price) AS min_price_cents,
  MAX(price) AS max_price_cents,
  COUNT(DISTINCT property_type) AS property_types_count,
  MAX(ingestion_date) AS latest_ingestion_date
FROM nashville_rentals
WHERE price IS NOT NULL;

-- Grant access to view
GRANT SELECT ON rentals_summary TO anon, authenticated;

-- Add comments for documentation
COMMENT ON TABLE nashville_rentals IS 'Nashville rental property listings from Zillow API';
COMMENT ON COLUMN nashville_rentals.record_id IS 'Deterministic SHA-256 hash of detail_url';
COMMENT ON COLUMN nashville_rentals.detail_url IS 'Zillow listing URL (unique identifier)';
COMMENT ON COLUMN nashville_rentals.price IS 'Monthly rent in cents';
COMMENT ON COLUMN nashville_rentals.living_area IS 'Living area in square feet';
COMMENT ON COLUMN nashville_rentals.units IS 'Multi-unit property details (JSON array)';
COMMENT ON COLUMN nashville_rentals.ingestion_date IS 'Date when data was fetched from API';

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Nashville Rentals schema created successfully!';
  RAISE NOTICE 'Run migration script to import data from SQLite.';
END $$;
