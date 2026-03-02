-- Allow owners to delete (revoke) invitations
CREATE POLICY "Owners can delete invitations" ON company_invitations
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = company_invitations.company_id
        AND company_members.user_id = auth.uid()
        AND company_members.role = 'owner'
    )
  );
