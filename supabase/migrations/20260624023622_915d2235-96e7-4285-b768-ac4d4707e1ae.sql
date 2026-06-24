ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS concierge_reply_language TEXT
  CHECK (concierge_reply_language IS NULL OR concierge_reply_language IN ('en','es','fr','de','pt','it','ja','zh','ko','ar'));