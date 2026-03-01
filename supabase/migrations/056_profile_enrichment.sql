-- Profile enrichment for user segmentation & sponsor targeting
-- Adds postal_code + city for geographic targeting
-- Adds display_prefix on sponsors for configurable in-app text
-- Makes sponsor_impressions.invoice_id nullable for app-level impressions

-- Geographic fields on companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS city TEXT;

-- Sponsor display prefix (e.g., "Sponsored by", "Powered by")
ALTER TABLE sponsors ADD COLUMN IF NOT EXISTS display_prefix TEXT DEFAULT 'Sponsored by';

-- Allow app-level sponsor impressions (no invoice)
ALTER TABLE sponsor_impressions ALTER COLUMN invoice_id DROP NOT NULL;
-- Add impression type to distinguish PDF vs app views
ALTER TABLE sponsor_impressions ADD COLUMN IF NOT EXISTS impression_type TEXT DEFAULT 'pdf';
