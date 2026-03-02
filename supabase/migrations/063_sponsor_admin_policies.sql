-- Add admin RLS policies for sponsors (INSERT, UPDATE, DELETE)
-- Previously only SELECT existed, so admin could not create/edit/delete sponsors
CREATE POLICY "Admins can insert sponsors" ON sponsors FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
);

CREATE POLICY "Admins can update sponsors" ON sponsors FOR UPDATE USING (
  EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
);

CREATE POLICY "Admins can delete sponsors" ON sponsors FOR DELETE USING (
  EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
);
