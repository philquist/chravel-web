-- Apple Sign-in refresh-token store for App Store 5.1.1(v) revocation-on-deletion.
-- Service-role only: RLS enabled with NO policies; privileges revoked from anon/authenticated.
-- Token stored encrypted (AES-GCM, "enc:v1:" prefix) via functions/_shared/gmailTokenCrypto.ts.

create table if not exists public.apple_auth_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references auth.users (id) on delete cascade,
  apple_sub     text,
  refresh_token text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.apple_auth_tokens is
  'Encrypted Apple Sign-in refresh tokens, keyed by Supabase user_id. Service-role only. Used to revoke the Apple grant (appleid.apple.com/auth/revoke) on account deletion per App Store 5.1.1(v).';

create extension if not exists moddatetime schema extensions;

drop trigger if exists set_apple_auth_tokens_updated_at on public.apple_auth_tokens;
create trigger set_apple_auth_tokens_updated_at
  before update on public.apple_auth_tokens
  for each row execute function extensions.moddatetime(updated_at);

alter table public.apple_auth_tokens enable row level security;

revoke all on public.apple_auth_tokens from anon, authenticated;
