-- Add geographic targeting to sponsors
-- NULL = matches all cities (global sponsor)
-- Set a city name to restrict sponsor to users in that city
ALTER TABLE sponsors ADD COLUMN IF NOT EXISTS target_city TEXT DEFAULT NULL;
COMMENT ON COLUMN sponsors.target_city IS 'If set, sponsor only matches users in this city. NULL = matches all cities.';
