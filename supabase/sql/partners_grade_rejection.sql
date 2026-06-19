-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- Adds the fields the partner review detail page needs: the tier an admin
-- assigns on approval, and the reason given on rejection (also sent back to
-- the applicant by email).

alter table partners add column if not exists grade text check (grade in ('general', 'premium'));
alter table partners add column if not exists rejection_reason text;
