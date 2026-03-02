-- Add email send tracking to usage_tracking
ALTER TABLE usage_tracking ADD COLUMN IF NOT EXISTS email_send_count integer DEFAULT 0;

-- Add free email send limit to platform_config
INSERT INTO platform_config (key, value)
VALUES ('free_email_send_limit', '2')
ON CONFLICT (key) DO NOTHING;

-- Update free storage from 10 MB to 50 MB
UPDATE platform_config SET value = '50' WHERE key = 'free_storage_mb';
