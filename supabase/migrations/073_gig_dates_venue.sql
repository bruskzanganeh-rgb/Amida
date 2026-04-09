-- Add per-date venue to gig_dates for touring schedules
-- When a tour has different venues per date (e.g. rehearsals at one place, concerts at different venues),
-- we need to store the venue per date instead of just on the gig.

ALTER TABLE gig_dates
  ADD COLUMN IF NOT EXISTS venue TEXT;

COMMENT ON COLUMN gig_dates.venue IS 'Per-date venue override. If NULL, falls back to gigs.venue';
