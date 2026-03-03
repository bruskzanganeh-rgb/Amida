-- Add Apple In-App Purchase support to subscriptions table.
-- Allows tracking whether a subscription was purchased via Stripe (web) or Apple IAP (iOS app).

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS payment_provider text NOT NULL DEFAULT 'stripe',
  ADD COLUMN IF NOT EXISTS apple_product_id text,
  ADD COLUMN IF NOT EXISTS apple_transaction_id text;

COMMENT ON COLUMN public.subscriptions.payment_provider IS 'stripe or apple — determines which payment system manages this subscription';
COMMENT ON COLUMN public.subscriptions.apple_product_id IS 'Apple IAP product ID (e.g. amida_pro_monthly)';
COMMENT ON COLUMN public.subscriptions.apple_transaction_id IS 'Apple transaction ID for receipt validation';
