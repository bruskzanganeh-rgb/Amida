-- Change default gig_visibility from 'personal' to 'shared'
ALTER TABLE companies ALTER COLUMN gig_visibility SET DEFAULT 'shared';

-- Update all existing companies that still have 'personal' to 'shared'
UPDATE companies SET gig_visibility = 'shared' WHERE gig_visibility = 'personal';
