-- Add 'cancelled' status to gig_status enum.
-- Distinct from 'declined' (you turned down an offer): 'cancelled' means the
-- event itself was called off by the organizer. Excluded from income like
-- declined, shown in its own tab.
ALTER TYPE gig_status ADD VALUE IF NOT EXISTS 'cancelled';
