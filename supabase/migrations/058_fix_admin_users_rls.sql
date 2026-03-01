-- Fix infinite recursion: admin_users SELECT policy was self-referencing
-- Replace with is_admin() which is SECURITY DEFINER (bypasses RLS)
DROP POLICY IF EXISTS "Admins can read admin_users" ON admin_users;
CREATE POLICY "Admins can read admin_users" ON admin_users
  FOR SELECT USING (is_admin(auth.uid()));
