-- Company Documents: storage for administrative documents
-- (annual reports, bank statements, tax authority docs, etc.)

-- 1. Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-documents', 'company-documents', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage RLS policies
CREATE POLICY "company_docs_auth_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'company-documents');

CREATE POLICY "company_docs_auth_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'company-documents');

CREATE POLICY "company_docs_auth_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'company-documents');

CREATE POLICY "company_docs_auth_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'company-documents');

-- 3. Metadata table
CREATE TABLE company_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL DEFAULT get_user_company_id() REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID DEFAULT auth.uid() REFERENCES auth.users(id),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  file_type TEXT,
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('annual_report', 'bank_statement', 'tax_authority', 'registration', 'contract', 'other')),
  description TEXT,
  document_date DATE,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_company_documents_company ON company_documents(company_id);
CREATE INDEX idx_company_documents_category ON company_documents(company_id, category);

ALTER TABLE company_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company documents access" ON company_documents
  FOR ALL USING (company_id = get_user_company_id())
  WITH CHECK (company_id = get_user_company_id());

-- 4. Audit trigger
CREATE TRIGGER audit_company_documents
  AFTER INSERT OR UPDATE OR DELETE ON company_documents
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
