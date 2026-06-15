-- 053: Private expenses + "sent to accountant" marker
-- - expenses.is_private: mark an expense as a private (non-business) cost. Visual label only.
-- - expenses.sent_to_accountant_at / invoices.sent_to_accountant_at: timestamp when the
--   record was handed off to the accountant (revisor). NULL = not yet sent.

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS sent_to_accountant_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sent_to_accountant_at TIMESTAMPTZ;

-- Partial indexes so "what's left to send to the accountant" stays fast.
CREATE INDEX IF NOT EXISTS idx_expenses_not_sent_to_accountant
  ON expenses (user_id) WHERE sent_to_accountant_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_not_sent_to_accountant
  ON invoices (user_id) WHERE sent_to_accountant_at IS NULL;
