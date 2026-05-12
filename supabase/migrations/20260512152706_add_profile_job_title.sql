-- Add profiles.job_title and profiles.show_job_title to back the
-- "Name (Job Title)" display formatter in src/lib/resolveDisplayName.ts
-- and the privacy toggle in src/components/enterprise/EnterprisePrivacySection.tsx.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS job_title TEXT,
  ADD COLUMN IF NOT EXISTS show_job_title BOOLEAN NOT NULL DEFAULT false;
