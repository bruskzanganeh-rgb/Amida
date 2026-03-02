-- Add English name column for i18n support
ALTER TABLE instrument_categories ADD COLUMN IF NOT EXISTS name_en TEXT;

-- Seed English translations for existing categories
UPDATE instrument_categories SET name_en = CASE slug
  WHEN 'strak' THEN 'Strings'
  WHEN 'blas' THEN 'Woodwinds'
  WHEN 'massing' THEN 'Brass'
  WHEN 'slagverk' THEN 'Percussion'
  WHEN 'ovrigt' THEN 'Other'
END WHERE name_en IS NULL;
