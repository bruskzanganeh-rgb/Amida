-- Supplier aliases: persistent name -> canonical mapping per company.
-- Lets AI receipt scanning snap known aliases (e.g. "Tre", "3 (Tre)") to a
-- canonical supplier ("Hi3G Access AB") even when the names aren't similar as
-- text. Populated automatically whenever suppliers are merged.

CREATE TABLE IF NOT EXISTS supplier_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL DEFAULT get_user_company_id() REFERENCES companies(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  canonical TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- One canonical target per (company, alias). Plain columns so upserts can use
-- ON CONFLICT (company_id, alias). Alias matching is done case-insensitively in
-- application code.
ALTER TABLE supplier_aliases
  ADD CONSTRAINT supplier_aliases_company_alias_key UNIQUE (company_id, alias);

ALTER TABLE supplier_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company supplier_aliases access" ON supplier_aliases;
CREATE POLICY "Company supplier_aliases access" ON supplier_aliases
  FOR ALL USING (company_id = get_user_company_id())
  WITH CHECK (company_id = get_user_company_id());
