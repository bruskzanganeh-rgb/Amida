-- Drop unused views flagged as SECURITY DEFINER by Supabase linter.
-- These views bypassed RLS (ran as view creator, not querying user).
-- Neither view is used by any app code.

DROP VIEW IF EXISTS public.client_statistics;
DROP VIEW IF EXISTS public.invoice_statistics;
