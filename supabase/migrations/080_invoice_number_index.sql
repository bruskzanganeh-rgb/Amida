-- The invoices list orders by invoice_number DESC and the command palette looks
-- up by invoice_number; there was no index, so both did a seq scan/sort on the
-- full table. Index by (company_id, invoice_number DESC) to serve both the
-- company-scoped ordering and equality lookups.
CREATE INDEX IF NOT EXISTS idx_invoices_company_invoice_number
  ON invoices (company_id, invoice_number DESC);
