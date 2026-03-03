-- Remove all Dropbox integration columns. Feature was never completed and is not needed.

ALTER TABLE companies DROP COLUMN IF EXISTS dropbox_access_token;
ALTER TABLE companies DROP COLUMN IF EXISTS dropbox_refresh_token;
ALTER TABLE companies DROP COLUMN IF EXISTS dropbox_token_expires_at;
ALTER TABLE companies DROP COLUMN IF EXISTS dropbox_account_id;
ALTER TABLE companies DROP COLUMN IF EXISTS dropbox_connected_at;

ALTER TABLE company_settings DROP COLUMN IF EXISTS dropbox_access_token;
ALTER TABLE company_settings DROP COLUMN IF EXISTS dropbox_refresh_token;
ALTER TABLE company_settings DROP COLUMN IF EXISTS dropbox_token_expires_at;
ALTER TABLE company_settings DROP COLUMN IF EXISTS dropbox_account_id;
ALTER TABLE company_settings DROP COLUMN IF EXISTS dropbox_connected_at;

DROP INDEX IF EXISTS idx_expenses_dropbox_unsynced;
ALTER TABLE expenses DROP COLUMN IF EXISTS dropbox_synced;
ALTER TABLE expenses DROP COLUMN IF EXISTS dropbox_path;
