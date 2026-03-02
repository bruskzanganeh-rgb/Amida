-- Ensure all tier keys exist in platform_config (single source of truth)
-- Missing keys are added with sensible defaults; existing keys are untouched.

INSERT INTO platform_config (key, value) VALUES
  ('free_price_monthly', '0'),
  ('free_price_yearly', '0'),
  ('pro_email_send_limit', '0'),
  ('team_email_send_limit', '0')
ON CONFLICT (key) DO NOTHING;
