-- Storage tenant isolation.
--
-- Previously every storage.objects policy only checked `bucket_id = '...'` for
-- role `authenticated`, so ANY logged-in user could list/download/delete ANY
-- company's receipts, gig attachments and company documents directly via the
-- storage API (bypassing the app's API-level ownership checks).
--
-- We scope reads/writes/deletes to the caller's company by matching the object
-- path against the owning row (expenses.attachment_url / gig_attachments.file_path
-- / company_documents.file_path) — no file paths need to move. INSERT stays open
-- to any authenticated user (uploads happen before the owning row exists; a stray
-- upload without a backing row is harmless and quota-limited). Server-side flows
-- use the service role and bypass RLS, so they're unaffected.

-- ---------- expenses (receipts) ----------
DROP POLICY IF EXISTS exp_select ON storage.objects;
DROP POLICY IF EXISTS exp_insert ON storage.objects;
DROP POLICY IF EXISTS exp_update ON storage.objects;
DROP POLICY IF EXISTS exp_delete ON storage.objects;

CREATE POLICY exp_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'expenses');
CREATE POLICY exp_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'expenses' AND EXISTS (
    SELECT 1 FROM public.expenses e
    WHERE e.company_id = public.get_user_company_id() AND e.attachment_url LIKE '%' || name
  ));
CREATE POLICY exp_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'expenses' AND EXISTS (
    SELECT 1 FROM public.expenses e
    WHERE e.company_id = public.get_user_company_id() AND e.attachment_url LIKE '%' || name
  ));
CREATE POLICY exp_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'expenses' AND EXISTS (
    SELECT 1 FROM public.expenses e
    WHERE e.company_id = public.get_user_company_id() AND e.attachment_url LIKE '%' || name
  ));

-- ---------- gig-attachments ----------
DROP POLICY IF EXISTS gig_att_select ON storage.objects;
DROP POLICY IF EXISTS gig_att_insert ON storage.objects;
DROP POLICY IF EXISTS gig_att_delete ON storage.objects;

CREATE POLICY gig_att_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'gig-attachments');
CREATE POLICY gig_att_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'gig-attachments' AND EXISTS (
    SELECT 1 FROM public.gig_attachments ga
    JOIN public.gigs g ON g.id = ga.gig_id
    WHERE g.company_id = public.get_user_company_id() AND ga.file_path = name
  ));
CREATE POLICY gig_att_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'gig-attachments' AND EXISTS (
    SELECT 1 FROM public.gig_attachments ga
    JOIN public.gigs g ON g.id = ga.gig_id
    WHERE g.company_id = public.get_user_company_id() AND ga.file_path = name
  ));

-- ---------- company-documents ----------
DROP POLICY IF EXISTS company_docs_auth_select ON storage.objects;
DROP POLICY IF EXISTS company_docs_auth_insert ON storage.objects;
DROP POLICY IF EXISTS company_docs_auth_update ON storage.objects;
DROP POLICY IF EXISTS company_docs_auth_delete ON storage.objects;

CREATE POLICY company_docs_auth_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'company-documents');
CREATE POLICY company_docs_auth_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'company-documents' AND EXISTS (
    SELECT 1 FROM public.company_documents d
    WHERE d.company_id = public.get_user_company_id() AND d.file_path = name
  ));
CREATE POLICY company_docs_auth_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'company-documents' AND EXISTS (
    SELECT 1 FROM public.company_documents d
    WHERE d.company_id = public.get_user_company_id() AND d.file_path = name
  ));
CREATE POLICY company_docs_auth_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'company-documents' AND EXISTS (
    SELECT 1 FROM public.company_documents d
    WHERE d.company_id = public.get_user_company_id() AND d.file_path = name
  ));
