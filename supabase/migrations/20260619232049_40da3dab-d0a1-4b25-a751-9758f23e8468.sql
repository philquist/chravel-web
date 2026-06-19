ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS concierge_voice TEXT
  CHECK (concierge_voice IS NULL OR concierge_voice IN ('alloy','ash','ballad','coral','echo','sage','shimmer','verse','marin','cedar'));