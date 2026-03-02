-- Add country and multi-city targeting for sponsors
ALTER TABLE sponsors ADD COLUMN IF NOT EXISTS target_country TEXT;
ALTER TABLE sponsors ADD COLUMN IF NOT EXISTS target_cities TEXT[];

-- Migrate existing target_city data to target_cities array
UPDATE sponsors SET target_cities = ARRAY[target_city]
WHERE target_city IS NOT NULL AND target_city != '' AND target_cities IS NULL;
