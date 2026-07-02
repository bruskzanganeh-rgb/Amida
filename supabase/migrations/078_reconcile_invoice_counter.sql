-- Reconcile companies.next_invoice_number with the actual highest invoice number.
--
-- The web "Ny faktura" flow historically numbered invoices with max(invoice_number)+1
-- and never bumped companies.next_invoice_number, so the atomic counter used by
-- get_next_invoice_number() drifted BELOW the real max. Switching all flows to the
-- RPC requires the counter to be at least max+1 first, otherwise the RPC hands out
-- already-used numbers (duplicate key on invoices_company_invoice_number_unique).
UPDATE companies c
SET next_invoice_number = GREATEST(
  c.next_invoice_number,
  COALESCE((SELECT MAX(i.invoice_number) FROM invoices i WHERE i.company_id = c.id), 0) + 1
);
