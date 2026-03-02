-- Add per-user timezone preference to company_settings
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Europe/Stockholm';
