-- Remove SMTP columns from companies table (now using Resend-only for all email)
ALTER TABLE companies
  DROP COLUMN IF EXISTS smtp_host,
  DROP COLUMN IF EXISTS smtp_port,
  DROP COLUMN IF EXISTS smtp_user,
  DROP COLUMN IF EXISTS smtp_password,
  DROP COLUMN IF EXISTS smtp_from_email,
  DROP COLUMN IF EXISTS smtp_from_name,
  DROP COLUMN IF EXISTS email_provider;

-- Also remove from legacy company_settings table
ALTER TABLE company_settings
  DROP COLUMN IF EXISTS smtp_host,
  DROP COLUMN IF EXISTS smtp_port,
  DROP COLUMN IF EXISTS smtp_user,
  DROP COLUMN IF EXISTS smtp_password,
  DROP COLUMN IF EXISTS smtp_from_email,
  DROP COLUMN IF EXISTS smtp_from_name,
  DROP COLUMN IF EXISTS email_provider;
