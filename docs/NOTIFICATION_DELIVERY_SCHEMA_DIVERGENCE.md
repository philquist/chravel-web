# Notification Delivery: repo ↔ production schema divergence (BLOCKER for push)

**Date:** 2026-06-04 · **Status:** Option A implemented in-branch — needs review + deploy + device verification · **Severity:** high

> **Update:** Option A (production schema is canonical) has been implemented on this
> branch and is ready for a **reviewed deploy** (no blind prod DDL):
> - `supabase/migrations/20260604170000_notification_fanout_prod_schema.sql` — adds the
>   `UNIQUE(notification_id, channel)` index + the `queue_notification_deliveries()`
>   function + `AFTER INSERT` trigger, inserting only columns that exist in prod.
> - `supabase/functions/dispatch-notification-deliveries/index.ts` — realigned to the
>   prod schema: `recipient_user_id`→derived from `notifications.user_id`,
>   `attempts`→`attempt_count`/`max_attempts`, `error`→`error_message`,
>   `'skipped'`→`'cancelled'`, dropped `dead_lettered_at`; badges/quiet-hours/per-type
>   copy preserved. `notification_logs` writes were already prod-compatible.
> - **Deploy the migration and the function together**, then verify per the runbook.
>   Still required: `VAPID_*`/`VITE_VAPID_PUBLIC_KEY`/FCM `VERTEX_PROJECT_ID` secrets,
>   and users registering for push (the web-push subscription fix is in this branch).
> - **Open question to confirm before deploy:** how prod's `notification_deliveries`
>   table was originally created (the source of `attempt_count`/`recipient`), to be
>   certain prod's schema is intentional and there isn't a competing canonical design.

## TL;DR

Push/email notifications have **never delivered in production**: 155 notifications
have produced **0** `notification_deliveries` rows, there is **no fan-out trigger**
on `public.notifications`, and there are **0** registered web-push subscriptions /
device tokens. The deeper cause is that **production's `notification_deliveries`
table does not match this repo's migrations** — the repo's notification-delivery
pipeline has never been the one deployed.

> An attempt to add the fan-out trigger directly in prod during this investigation
> failed (it referenced a repo-only column) and was **fully reverted** — prod is
> back to its prior state, no data harmed. Two history rows remain in
> `supabase_migrations.schema_migrations` (`ensure_notification_delivery_fanout`,
> `revert_broken_fanout_trigger`); they are inert records of the apply+revert.

## Column-by-column divergence (`public.notification_deliveries`)

| Concern | Repo migrations (`20260214103000` + `20260215000000`) | **Production (live)** |
|---|---|---|
| recipient | `recipient_user_id uuid` (FK auth.users) | `recipient text` (nullable) |
| attempts | `attempts int` | `attempt_count int`, `max_attempts int` |
| channel | `notification_channel` **enum** | `channel` **text** |
| status | `notification_delivery_status` enum | `notification_delivery_status` enum ✅ (only shared piece) |
| uniqueness | `UNIQUE(notification_id, channel)` | **missing** (only PK) |
| extras | — | `last_attempted_at`, `provider_message_id`, `metadata` |

`attempt_count` / `max_attempts` / `recipient` exist in **no** repo migration, so
prod's table was created/altered **outside** this repo's migration history.

## Why push has never worked (three independent failures)

1. **No fan-out trigger.** `create-notification` inserts a `notifications` row and
   relies on an `AFTER INSERT` trigger (`queue_notification_deliveries`) to enqueue
   per-channel `notification_deliveries`. That function + trigger are **absent in prod**.
2. **Schema mismatch.** Even with a trigger, the repo's
   `dispatch-notification-deliveries` function and `queue_notification_deliveries`
   read/write `recipient_user_id` / `attempts`, which don't exist in prod. The
   deployed dispatcher (v538) has therefore never produced or sent deliveries.
3. **No push targets.** `0` active `web_push_subscriptions` and `0`
   `push_device_tokens` — nobody was ever subscribed. (The settings "Push" toggle
   never created a web-push subscription; **fixed in this branch**.)

## Confirmed against the live deployment (2026-06-04)

The **deployed** `dispatch-notification-deliveries` function (v539, built by CI from
`main`) still references `recipient_user_id` / `attempts` (and still contains the
old Twilio/SMS code). So the deployed **code** expects the **repo** schema, while
the deployed **table** is the divergent prod schema (`recipient` / `attempt_count`).
The code and the table it runs against have **never matched** — the delivery system
is non-functional by construction, independent of this branch. (How prod's table
came to differ — which migration/source created `attempt_count`/`recipient` — is the
key unknown to resolve first.)

## What this branch already fixed (independent of the divergence)

- Twilio/SMS fully removed (UI, settings, code, `notification_preferences` schema).
- Quiet hours de-stubbed; category toggles verified real.
- Web-push subscription created on enable (consumer/enterprise/event) via
  `usePushPreferenceToggle`.
- App-icon badge (PWA foreground + SW background + iOS APNS), per-type push copy,
  self-test button + push diagnostics.

These are valid regardless of the schema decision. The **server delivery path** is
what's blocked.

## Decision required (do not let me guess this)

Pick the canonical `notification_deliveries` design, then reconcile the other side:

- **Option A — production is canonical.** Rewrite the repo to match prod:
  `20260214103000`/`20260215000000`, `queue_notification_deliveries`, and the
  `dispatch-notification-deliveries` function must use `recipient` (resolve from
  `notifications.user_id`), `attempt_count`/`max_attempts`, and `channel text`.
  Lowest risk to live data; most repo churn. **Recommended** (prod is live and has
  the more complete schema), pending confirmation of how prod's table was created.
- **Option B — the repo is canonical.** Migrate prod's table to the repo design
  (add `recipient_user_id`, rename `attempt_count`→`attempts`, enum `channel`,
  add the unique index). Destructive/`ALTER`-heavy on a live table; needs a
  two-phase migration and careful testing.

Either way, the missing fan-out trigger + unique index must be added **in the same
design**, and `VAPID_*` / `VITE_VAPID_PUBLIC_KEY` / FCM `VERTEX_PROJECT_ID` secrets
must be confirmed before push can be verified on devices.

## Recommended next steps

1. Confirm how prod's `notification_deliveries` was created (check the migration
   that introduced `attempt_count`/`recipient`; it isn't in this repo).
2. Choose Option A or B.
3. Implement the reconciliation as a reviewed migration + matching dispatcher edits
   (no direct prod DDL).
4. Add the fan-out trigger + unique index in the chosen design.
5. Verify end-to-end via the runbook in `PUSH_NOTIFICATIONS_AND_BADGES.md`.
