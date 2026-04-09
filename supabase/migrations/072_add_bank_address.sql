-- Add bank_address column to companies for international wire transfers
-- Some international banks require the bank's physical address on invoices

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS bank_address TEXT;

COMMENT ON COLUMN companies.bank_address IS 'Physical address of the bank, required for some international wire transfers';
