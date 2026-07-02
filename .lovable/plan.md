## Goal
Finish the realtime voice launch: deploy the two mint/session functions, ensure the gateway secret is set in Supabase, and remove the orphan `create-openai-realtime-session` function + its config entry.

## Steps

1. **Deploy edge functions** (no code changes)
   - `supabase--deploy_edge_functions` for `mint-realtime-token` and `realtime-voice-session`.
   - Confirm both return ACTIVE.

2. **Ensure `AI_GATEWAY_API_KEY` secret exists in Supabase**
   - Call `secrets--fetch_secrets` to check current state.
   - If missing, use `secrets--add_secret` (`["AI_GATEWAY_API_KEY"]`) so the user pastes the Vercel AI Gateway key in the secure form. Never print the value.
   - If already present, report configured and skip.

3. **Remove orphan `create-openai-realtime-session`**
   - Verify no source under `supabase/functions/create-openai-realtime-session/` and no repo references (`rg`).
   - `supabase--delete_edge_functions` with `["create-openai-realtime-session"]`.
   - Edit `supabase/config.toml` to remove the `[functions.create-openai-realtime-session]` block (verify_jwt = false).

4. **Verify**
   - Re-list references to confirm clean.
   - Report ACTIVE status of the two deployed functions, secret set/pending status, and orphan removal.

## Out of scope
- No changes to `mint-realtime-token` / `realtime-voice-session` source.
- No frontend or voice UX changes.

## Risk
Low. Config-only + deploys. Rollback = redeploy from git for config.toml; re-add function block if needed.
