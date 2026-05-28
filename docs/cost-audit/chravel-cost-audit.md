# Chravel Infrastructure Cost + Compliance Modeling Audit

> **Prepared:** 2026-05-27 · **For:** Christian (to share with Phil)
> **Method:** Live Supabase/Vercel/PostHog data (MCP) + repo inventory + current official vendor pricing pages.
> **Status of numbers:** Fixed plan prices are list-price-confirmed with source URLs. Usage/scale numbers are **models with bracketed assumptions** — they need real billing exports to harden. Current *actual* usage is pre-launch, so today's usage-based spend is ≈ $0.

---

## 1. Executive Summary (the answer to Phil)

**Phil is right on every count.** The current model is a *fixed recurring baseline*, not an operating model.

- **Is it too static?** Yes. The $466.36 / $666.36 figures are fixed SaaS subscriptions only. They contain **none** of the usage-based costs that actually scale: Google Gemini + Maps + Vision, OpenAI Realtime voice, GetStream per-MAU overages, LiveKit voice minutes, Supabase egress/storage/MAU overages, Vercel bandwidth, email, and push.
- **Which numbers are reliable?** The fixed plan list-prices (Supabase Pro $25 — *confirmed live*, Vercel Pro $20/seat, Sentry $26, etc.). What is **not** reliable yet: anything usage-based, because (a) we're pre-launch so there's no representative volume, and (b) we have no Google Cloud / Stripe / Stream billing export in hand.
- **What scales first?** In order: **Google AI/Maps**, **GetStream MAU tiers** ($399 → $599 → enterprise step-functions), **voice (OpenAI Realtime + LiveKit)** which is the single most expensive per-minute line, then **Supabase egress/storage** (media has *no client-side compression* today), then **Vercel bandwidth**.
- **Are we underestimating infra/compliance risk?** Yes, materially. The live security scan returned **361 advisories** (4 publicly-listable storage buckets, 2 RLS policies that are effectively "allow all", leaked-password protection disabled). We are **not** privacy-compliant by default and we are **not** HIPAA-ready despite the "HIPAA Ready" label shown in the product tier copy.
- **HIPAA: defer the spend.** This report treats HIPAA-readiness as a *separate enterprise scenario* (§9 scenario 8), **not** a base-model line — matching your draft Slack stance. Do the free controls now (MFA, RLS/bucket fixes); trigger the HIPAA spend (one-time **$20–40k**, recurring **~$1.5–3k/mo**) only when a healthcare/PHI deal is in hand. Sell sports/teams in the meantime by contractually prohibiting PHI.
- **Vercel:** Not locked in. Fine for MVP. The balloon triggers are real and priced below (SAML SSO **$300/mo**, HIPAA BAA **$350/mo**, log drains **$0.50/GB**, bandwidth overage **$0.15/GB**). §6 models alternatives.
- **Egress / log drains / SSO** all need their own line items — they are invisible in the current model.

**Bottom line for Phil:** keep the $466/$666 as the "fixed floor." Add three new cost categories on top — (1) usage-based API/AI/voice, (2) egress + storage + log drains, (3) security/compliance (SSO, MFA, HIPAA). The model should be scenario-driven by MAU, not a single static monthly number.

---

## 2. Current Known Fixed Costs

Only evidence-backed lines. "Confidence" reflects how sure we are of the *number we'd actually be billed*.

| Vendor | Current Plan | Monthly (list) | Fixed/Var/Step | Source | Confidence | Notes |
|---|---|---|---|---|---|---|
| Supabase | **Pro** (live-confirmed) | $25 base | Step → Variable | [supabase.com/pricing](https://supabase.com/pricing) | 🟢 High | Org `Chravel` confirmed on Pro via MCP. Overages extra (see §3/§5). |
| Vercel | Pro | $20 / seat | Step → Variable | [vercel.com/pricing](https://vercel.com/pricing) | 🟡 Med | Team has 2+ members → ~$40+. Plan tier (Pro vs Ent) unconfirmed; no SAML configured. |
| GetStream Chat | Startup (assumed) | $399 (billed annual) | Step | [getstream.io/chat/pricing](https://getstream.io/chat/pricing/) | 🟡 Med | Free ≤1k MAU; $399 = 10k MAU. **Likely the largest single line in the $466 baseline.** |
| Sentry | Team | $26 | Fixed→Step | [sentry.io/pricing](https://sentry.io/pricing/) | 🟡 Med | 50k errors / 5M spans included. |
| PostHog | Free / PAYG | $0 + usage | Variable | [posthog.com/pricing](https://posthog.com/pricing) | 🟢 High | 1M events free/mo; pre-launch volume well under. |
| Resend | Free / Pro | $0–$20 | Step | [resend.com/pricing](https://resend.com/pricing) | 🟡 Med | Free 3k emails/mo; Pro $20 = 50k. |
| RevenueCat | Free tier | $0 → 1% MTR | Variable | [revenuecat.com/pricing](https://www.revenuecat.com/pricing) | 🟡 Med | Free under ~$2.5k monthly tracked revenue, then ~1%. *[Confirm current tier]* |
| Domain / misc SaaS | — | ~$10–50 | Fixed | — | 🔴 Low | Workspace, GitHub, domain, etc. — *needs the real seat list*. |

**Reconciliation with the $466.36 baseline:** the baseline is plausibly **GetStream $399 + Supabase $25 + Vercel ~$40 + Sentry $26 ≈ $490** of fixed SaaS, i.e. it is *dominated by GetStream*. The $666 "planned" stack adds ~$200 (more seats / a paid tier bump). **Crucially, no Google/OpenAI/LiveKit/Maps usage is in either number.** That is the core reason the model feels "far off."

---

## 3. Current API + Usage-Based Costs

Pre-launch usage is ≈ 0 (live row counts: 76 trips, 588 chat messages, 107 AI queries, 47 media items). These are the **rate cards** that switch on at scale.

| Provider | Product | Pricing Unit | Included / Free | Overage / Rate | Current usage | Confidence | Source |
|---|---|---|---|---|---|---|---|
| Google Gemini | **Gemini 3 Flash** (in-use; env `gemini-3.1-flash`) | per 1M tokens | Free tier (rate-limited) | **$0.50 in / $3.00 out** | ~107 queries total | 🟢 | [ai.google.dev/…/pricing](https://ai.google.dev/gemini-api/docs/pricing) |
| Google Gemini | Gemini 3.5 Flash (newer, May 2026) | per 1M tokens | — | $1.50 in / $9.00 out | n/a | 🟢 | same |
| Google Gemini | 2.5 Flash-Lite (cheapest) | per 1M tokens | — | $0.10 in / $0.40 out | n/a | 🟢 | same |
| Google Gemini Live | native audio voice | per audio token (~32 tok/sec audio) | — | billed per audio in/out token | flag-gated off | 🟡 | same |
| **OpenAI** | **gpt-realtime-2** voice | per 1M audio tokens | — | **$32 in / $0.40 cached / $64 out** ≈ **$0.18–0.46/min** uncached | edge fn live | 🟢 | [openai.com/api/pricing](https://openai.com/api/pricing/) |
| Google Maps | Geocoding | per 1k req | 10k free/mo | **$5.00 / 1k** after | quota-capped 10k/day | 🟢 | [Maps pricing](https://developers.google.com/maps/billing-and-pricing/pricing) |
| Google Maps | Places / Text / Nearby | per 1k req | Essentials 10k free/mo per SKU | **$2–$7 / 1k** | client cap 10k/day, 1k/hr | 🟡 | same |
| Google Maps | Autocomplete | per session | free if session completes w/ Place Details | charged as per-request if abandoned | — | 🟡 | same |
| Google Vision | Receipt OCR | per 1k images | 1k free/mo | ~$1.50 / 1k | feature-gated | 🔴 | [Confirm in GCP billing] |
| GetStream | Chat MAU | per MAU tier | 1k free | $399 (10k) → $599 → enterprise | pre-launch | 🟡 | [getstream pricing](https://getstream.io/chat/pricing/) |
| GetStream | file/image transfer & storage | per GB | — | ~$0.12/GB transfer, ~$0.05/GB storage | — | 🟡 | same |
| LiveKit | WebRTC voice | per participant-min | Build: 5k min + 50GB egress | **$0.0004/min** + **$0.01/min per agent** | flag-gated | 🟢 | [livekit.com/pricing](https://livekit.com/pricing) |
| Supabase | egress / storage / MAU | per GB / per user | 250GB egress / 100GB storage / 100k MAU | $0.09/GB egress · $0.021/GB storage · $0.00325/MAU | pre-launch | 🟢 | [supabase pricing](https://supabase.com/pricing) |
| Vercel | bandwidth / functions | per GB / per use | 1TB transfer + $20 credit | **$0.15/GB** over | low | 🟢 | [vercel pricing](https://vercel.com/pricing) |
| Resend | email | per email | 3k free/mo | Pro $20 = 50k | low | 🟡 | [resend pricing](https://resend.com/pricing) |
| Stripe | payment processing | per txn | — | **2.9% + $0.30** (pass-through COGS) | live | 🟢 | [stripe.com/pricing](https://stripe.com/pricing) |

> ⚠️ **Voice is the cost bomb.** At OpenAI Realtime rates, **one hour of voice concierge ≈ $11–28**. A few hundred power users on voice dwarfs every other line. Gemini Live native-audio is the cheaper substitute and should be the default voice path.

---

## 4. Egress Model

**Formula:** `Monthly Egress Cost = MAX(0, GB Transferred − Included GB) × Overage $/GB`

Egress is driven by **media downloads** (no client-side compression today → ~2× the necessary bytes), realtime fan-out, PDF export, and OCR. Supabase Storage egress is the primary meter; Vercel bandwidth is secondary (SPA shell + API).

**Per-user monthly assumptions** `[Assumption — replace with telemetry]`:
- Media stored: **0.2 GB/user**; media egress (downloads by other members): **~0.5 GB/user**
- Chat: 150 msgs/user (tiny bytes, but realtime fan-out)
- PDF exports: 0.2/user (Puppeteer, server-side)

| Provider | Included | Overage $/GB | Main drivers | 1k MAU | 10k MAU | 100k MAU | 50k-attendee festival |
|---|---|---|---|---|---|---|---|
| Supabase egress | 250 GB | $0.09 | media downloads, API reads, realtime | ~500 GB → **$22** | ~5 TB → **$428** | ~50 TB → **$4,477** | spike ~25 TB/event → **$2,228** |
| Supabase storage | 100 GB | $0.021 | media uploads (uncompressed) | 200 GB → **$2** | 2 TB → **$40** | 20 TB → **$418** | grows w/ retention |
| Vercel bandwidth | 1 TB | $0.15 | SPA shell, image opt, fn responses | <60 GB → **$0** | ~600 GB → **$0** | ~6 TB → **$750** | ~3 TB/event → **$300** |
| GetStream media | — | ~$0.12 transfer | chat image/video | small | ~$50 | ~$500 | spikes |
| LiveKit egress | 50 GB (Build) | tier-based | voice audio | n/a unless voice on | — | — | — |

**Single highest-leverage fix:** add **client-side image compression before upload** (`src/services/mediaService.ts` currently uploads raw). A 30–50% byte reduction directly cuts both the storage *and* egress lines above — the two fastest-growing Supabase costs.

---

## 5. Supabase Scale Analysis

**What Pro's $25 actually includes** (confirmed): 100k MAU · 8 GB DB disk · 100 GB file storage · **250 GB egress** (+250 GB cached) · 500 realtime peak connections · 7-day backups · 7-day log retention.

**Phil's "$25 won't scale / mostly read-write / no storage" — adjudicated:**
- He's directionally right but the *mechanism* matters: Supabase does **not** bill you per read/write. Cost pressure comes from **egress → storage → compute (DB instance size) → MAU → realtime connections → log drains → PITR**, roughly in that order for a media+chat app.
- **What breaks first:** egress (250 GB is small once media flows), then the **8 GB DB disk** and the default compute instance under chat/notification write volume (`message_read_receipts` is O(N×M); `notifications`, `webhook_events`, `trip_events` are the heavy tables).
- **Privacy-compliant by default? No.** Live scan = **361 security advisories**: 4 public buckets allow listing, 2 RLS policies are always-true (effective RLS bypass — a zero-tolerance class per our own manifesto), `webhook_events` has RLS on but no policy, leaked-password protection off, plus broad anon/authenticated SECURITY DEFINER exposure. These must be remediated before any compliance claim.
- **What we must own (not Supabase):** RLS correctness, bucket access policies, MFA, audit logging coverage, retention/deletion, **keeping PHI out of public buckets**, secrets hygiene (note: `client.ts` reportedly carries hardcoded fallback creds — remove).
- **Upgrade path:** Pro is fine to ~10k MAU. Move to **Team ($599/mo)** when you need SOC2 collateral, longer log retention, priority support, or the **HIPAA add-on + BAA** (HIPAA requires Team/Enterprise + signed BAA + customer-side controls: MFA, SSL enforcement, network restrictions, PITR, no PHI in public buckets). Enterprise (custom) for >100k MAU or dedicated infra.
- **PITR:** $100/mo per 7 days. **Log drains:** ~$60 per drain per project. Both are HIPAA/SOC2-relevant and currently absent.

**Verdict:** Viable MVP → 10k. Workable to 100k on Team/Enterprise *if* egress is controlled (compression + CDN). Re-evaluate dedicated infra at enterprise/HIPAA.

---

## 6. Vercel Scale Analysis

**Are we committed?** No — it's a Vite SPA; portable. Keep for MVP velocity; model alternatives now so the decision is informed.

**Included (Pro):** $20/seat + $20 usage credit, **1 TB data transfer**, function invocations/compute within credit.
**Balloon triggers (all list-confirmed):** SAML SSO **$300/mo**, HIPAA BAA **$350/mo**, **log drains $0.50/GB**, bandwidth overage **$0.15/GB** (no hard cap — use Spend Management), function duration overages, image optimization.

| Platform | Cost predictability | Dev speed | Compliance (SSO/HIPAA) | Egress exposure | Logs/observability | Migration cost |
|---|---|---|---|---|---|---|
| **Vercel Pro** | 🟡 (overages uncapped) | 🟢 best | 🟡 paid add-ons ($300+$350) | 🔴 $0.15/GB | 🟡 log drains $0.50/GB | — (current) |
| Vercel Enterprise | 🟢 committed | 🟢 | 🟢 included | 🟡 negotiated | 🟢 | low |
| Render | 🟢 flat-ish | 🟡 | 🟡 BAA on higher tiers | 🟢 cheaper egress | 🟡 | low (already used for OG proxy) |
| Fly.io | 🟡 usage | 🟡 | 🔴 limited | 🟢 | 🟡 | medium |
| Cloudflare Pages/Workers | 🟢 cheapest egress | 🟡 | 🟡 | 🟢 free/cheap egress | 🟡 | medium (edge runtime quirks) |
| AWS/GCP direct | 🟢 at scale | 🔴 slow | 🟢 full BAA | 🟢 | 🟢 | 🔴 high |

**Recommendation:** stay on Vercel Pro through MVP; if HIPAA + SSO land near-term, the **$650/mo of Pro add-ons** makes **Vercel Enterprise or Cloudflare-fronted hosting** worth pricing. Put a **CDN in front of media** regardless to cap egress.

---

## 7. SSO / MFA / Enterprise Access

| Layer | Current status | Needed for enterprise | Vendor support | Cost | Complexity | Risk if absent |
|---|---|---|---|---|---|---|
| App-user SSO (SAML/OIDC) | ❌ none (only Google OAuth login) | ✅ | Supabase Auth SSO (Pro+) / Vercel SAML $300 | Supabase SSO add-on; Vercel $300/mo | Medium | Blocks B2B/enterprise deals |
| Admin/dashboard SSO | ❌ none | ✅ | Vercel SAML / Supabase | $300/mo (Vercel) | Medium | Audit finding |
| MFA (internal accounts) | ❌ none | ✅ | Supabase MFA (TOTP) built-in | $0 (config) | Low | **HIPAA/SOC2 blocker** |
| MFA (customer admins) | ❌ none | ✅ | Supabase MFA | $0 (config) | Low | Account takeover risk |
| RBAC | ✅ exists (`permissionMatrix.generated.ts`, `roleChannels.ts`, RLS) | ✅ | in-house + RLS | $0 | — | OK |
| Audit logs | 🟡 partial (`payment_audit_log`, `security_audit_log` only) | ✅ comprehensive | in-house + log drains | log drain $ | Medium | Compliance gap |
| SCIM provisioning | ❌ none | ✅ (large orgs) | Vendor/enterprise | $$ | High | Deferable |
| Data retention/deletion | 🟡 GDPR export UI exists; retention policy unclear | ✅ | in-house | $0 | Medium | GDPR/CCPA gap |

**Quick wins:** enable **Supabase MFA (TOTP)** and **leaked-password protection** now — near-zero cost, removes two compliance blockers immediately.

---

## 8. HIPAA / Healthcare / Sports-Team Readiness

**Blunt status:** **Not HIPAA compliant. Cannot claim "HIPAA Ready" today** — that string in `src/types/privacy.ts` is marketing copy, not an implemented control. No BAAs, no MFA, no app-level encryption, public buckets, RLS gaps.

**Can we sell sports/teams without HIPAA?** Yes — **if** the product contractually and technically **prohibits PHI** (no health/medical/injury data fields, no medical document uploads). Roster/schedule/logistics data for a sports team is generally not PHI. The risk is *uncontrolled user-generated content* (someone uploads a medical record into chat/files). Mitigate with: ToS prohibition, content policy, and not building health-data features.

**HIPAA is deferred** — modeled as a *separate* enterprise scenario (§9 scenario 8), not carried in the base monthly model. The cost envelope if/when triggered:

- **One-time setup: $20–40k** — legal (BAA review, policies), security tooling onboarding, RLS/bucket remediation, MFA/SSO, audit-log buildout, pen test, risk assessment, staff training.
- **Recurring: ~$1.5–3k/mo** — vendor HIPAA add-ons + compliance tooling + audit/log retention.

**Vendor-by-vendor BAA availability:**

| Vendor | BAA available? | Cost / requirement |
|---|---|---|
| Supabase | ✅ | HIPAA add-on, requires **Team ($599) / Enterprise** + signed BAA + customer controls |
| Vercel | ✅ | **$350/mo** BAA add-on (Pro) or included on Enterprise |
| GetStream | ✅ | on **Elevate $599/mo** tier (includes HIPAA) |
| Google Cloud (Gemini/Maps/Vision/Vertex) | ✅ | BAA via Google Cloud; ensure only BAA-covered services used |
| OpenAI | ✅ | BAA available (enterprise/API) — *confirm for Realtime* |
| LiveKit | 🟡 | enterprise tier — *confirm* |
| Resend | 🟡 | *confirm BAA availability* |
| Sentry | ✅ | Business/Enterprise + BAA (scrub PII/PHI) |
| PostHog | ✅ | BAA available; mask/scrub PHI |
| AWS | ✅ | standard BAA |

**Controls required:** MFA (all), SSL enforcement, network restrictions, PITR, encryption posture, no-PHI-in-public-buckets, comprehensive audit logging, incident response runbook, data retention/deletion, annual training, signed BAAs with every PHI-touching vendor.

**Timeline estimate:** 2–4 months to "HIPAA-ready" given the current gaps.

**Recommendation — defer:** Ship PHI-prohibited, pursue sports/teams now, and trigger the HIPAA spend (~$1.5–3k/mo + $20–40k once) only when a healthcare/PHI deal is in hand — don't carry it in the base model before a customer pays for it. **Do the free controls now** (MFA, leaked-password, bucket/RLS fixes) so the runway to compliant is short (2–4 months). If Phil decides to be HIPAA-ready *before* a deal, that's §9 scenario 8 — priced and ready to switch on.

---

## 9. 12-Month Model-Ready Cost Scenarios

`Total = Fixed SaaS + Vendor Base + Seats + Usage + Compliance + Support` · `Cost/MAU = Total / MAU`

HIPAA is **deferred** — it is **not** in the base totals for scenarios 1–7. It appears **only** as the separate enterprise case (scenario 8): amortized $30k setup over 12 mo = $2.5k/mo + ~$2k/mo recurring ≈ **$4.5k/mo**, switched on only when a PHI/healthcare deal is signed.

| # | Scenario | MAU | Fixed SaaS | Variable infra (usage+egress) | Compliance (HIPAA+SSO) | **Total/mo** | Cost/MAU | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | Pre-launch / dev | ~100 | ~$490 | ~$0 | $0 | **~$490** | n/a | today; usage ≈ 0 |
| 2 | Consumer MVP | 1,000 | ~$490 | ~$80 (egress $24 + AI + maps) | $0 | **~$570** | $0.57 | Stream covers 10k MAU |
| 3 | Early traction | 10,000 | ~$490 | ~$900 (egress $470 + AI + voice) | optional | **~$1,400** | $0.14 | Stream at tier cap |
| 4 | Growth | 100,000 | ~$1,100 (Stream enterprise + Supabase Team) | ~$7,500 (egress $4.9k + AI + Vercel $750) | optional | **~$8,600** | $0.086 | egress dominates → CDN + compression |
| 5 | Pro/team customer | 250 seats | +seat licenses | low | SSO $300 likely | **+~$1,000** | per-deal | B2B; SSO expected |
| 6 | Event (5k attendees) | 5,000 burst | ~$490 | ~$2,300 spike (egress + realtime + maps) | $0 | **~$2,800 (event mo)** | burst | concurrency + media spike |
| 7 | Festival (50k attendees) | 50,000 burst | Stream tier bump | ~$3,000+ spike egress + LiveKit if voice | $0 | **~$5,000+ (event mo)** | burst | model as one-time event line |
| 8 | HIPAA-ready enterprise | 10,000 + PHI | ~$1,300 (Stream Elevate $599 + Supabase Team $599) | ~$900 | **+~$4,500** (HIPAA amortized + add-ons + SSO) | **~$6,700** | $0.67 | BAAs across stack |

`[All variable/egress cells are modeled from §3–§4 assumptions; replace with billing exports to finalize.]`

**Gross margin sanity check:** at Plus/Pro consumer pricing of even $5–10/user/mo, scenarios 2–4 are comfortably **>90% gross margin on infra** — *until voice usage or HIPAA is switched on*, which is exactly why those two need their own toggles in the model.

---

## 10. Ranked Cost Risks

| Risk | Prob | Severity | Horizon | Why it matters | Mitigation |
|---|---|---|---|---|---|
| Voice (OpenAI Realtime) runaway | High | 🔴 High | Now–6mo | $0.18–0.46/min; a few power users = $$$ | Default to Gemini Live; cap minutes; per-tier quotas |
| Google AI token runaway | High | 🔴 High | Now | unbounded concierge calls | query classifier (exists), caching, output caps, model tiering to Flash-Lite |
| Google Maps usage | Med-High | 🟠 Med | Now | $5/1k geocode, $2–7/1k places | client quota cap exists (10k/day) + 30-day cache; keep OSM fallback |
| Supabase egress/storage | High | 🟠 Med | 10k+ MAU | 250GB fills fast; no compression | **client-side compression** + CDN |
| GetStream MAU step-functions | High | 🟠 Med | 10k/100k MAU | $399→$599→enterprise jumps | negotiate; evaluate self-host chat at scale |
| Vercel bandwidth/functions/logs | Med | 🟠 Med | 100k MAU | $0.15/GB uncapped + $0.50/GB logs | Spend Management; CDN; alt host |
| HIPAA scope creep | Med | 🔴 High | On healthcare deal | $20–40k + $1.5–3k/mo | PHI-prohibition policy until funded |
| SSO/security add-ons | Med | 🟡 Low-Med | On B2B deal | $300+$350/mo Vercel | price into enterprise deal |
| Event traffic spikes | Med | 🟠 Med | Per event | concurrency + egress burst | event-scoped surcharge in pricing |
| Security advisories unremediated | High | 🔴 High | Now | RLS bypass + public buckets = breach/legal | fix the 361 advisors (start w/ always-true RLS + public buckets) |

---

## 11. Recommended Answer to Phil (Slack-ready)

> You're right — the model is too static for scale. The $466/mo current and $666/mo planned numbers are only the fixed recurring SaaS floor (and that floor is mostly GetStream + Supabase + Vercel + Sentry). They contain **zero** usage-based cost.
>
> I had the repo + our live Supabase/Vercel dashboards + current vendor pricing audited into a model-ready vendor table. Headlines:
>
> • **Biggest missing live variables:** Google Gemini/Maps/Vision, OpenAI Realtime voice, GetStream MAU tiers, LiveKit. Voice is the scariest — OpenAI Realtime runs ~$0.18–0.46/**minute**, so a few power users dwarf everything. We'll default voice to the cheaper Gemini Live path and cap minutes.
> • **Supabase $25 reality:** it's not billed on read/write — it's egress (250GB included), storage, DB disk, MAU, then realtime. Fine to ~10k MAU; we move to Team ($599) for SOC2/HIPAA/longer logs. And no, it's **not** privacy-compliant out of the box: our live scan flagged 361 issues (public buckets, 2 RLS policies that allow-all, MFA/leaked-password off). I'm fixing the free ones now.
> • **Vercel:** not locked in. SSO is $300/mo, HIPAA BAA $350/mo, log drains $0.50/GB, bandwidth $0.15/GB over 1TB — these balloon, so I priced Render/Cloudflare/Enterprise alternatives.
> • **HIPAA:** my rec is to **defer the big spend**. We do the free controls now (MFA, RLS/bucket fixes), prohibit PHI in our ToS, and sell sports/teams in the meantime — then trigger HIPAA-readiness (~$20–40k setup, ~$1.5–3k/mo) only when a healthcare/PHI deal is actually in hand. I've modeled HIPAA-ready enterprise as a **separate** scenario so we can price it into that deal without inflating the base model. We just can't go after healthcare/PHI customers until it's funded.
> • New line items we were missing entirely: **egress, log drains, SSO, MFA, compliance.**
>
> Full report + CSVs (vendor costs, scenario assumptions, egress, compliance) are in the repo under `docs/cost-audit/`. I still need our actual billing exports (Google Cloud, Stripe, Stream) to convert list-price to billed-cost.

---

## 12. Final Deliverables

**CSV tables** (this folder): `vendor-costs.csv` · `scenario-assumptions.csv` · `egress-model.csv` · `compliance.csv`

**Data inputs still needed from Christian / Phil:**
1. Billing exports: Google Cloud, Stripe, GetStream, LiveKit, OpenAI, Resend, Sentry, RevenueCat, Vercel invoice (→ converts 🟡 list-price to 🟢 billed).
2. Full per-seat tool list + seat counts (Workspace, Slack, GitHub, Notion/Linear/Asana, design tools).
3. Vercel plan tier confirmation (Pro vs Enterprise); confirm AWS S3/Textract & Firecrawl are actually live (env-referenced, usage unconfirmed).
4. Target customer segments + whether **any** PHI/health workflow is intended (decides HIPAA timing).
5. Confirmed in-use Gemini model + whether voice ships on OpenAI Realtime, Gemini Live, or LiveKit.

**Confidence scorecard (red/yellow/green):**

| Cost category | Confidence | Why |
|---|---|---|
| Fixed SaaS base prices | 🟢 | List prices + Supabase Pro live-confirmed |
| Supabase plan & security posture | 🟢 | Live MCP: Pro plan, 361 advisors, row counts |
| Vendor rate cards (AI/voice/maps/egress) | 🟢 | Current official pricing pages w/ URLs |
| Actual *billed* usage cost | 🔴 | No billing exports; pre-launch volume |
| Per-user scenario assumptions | 🔴 | Modeled `[Assumption]` — need telemetry |
| Seat costs | 🔴 | Tool/seat list not provided |
| HIPAA cost range | 🟡 | Industry range; not a quote |
| Egress projections | 🟡 | Formula solid; inputs assumed |

---
*Methodology: live data via Supabase/Vercel MCP on 2026-05-27; pricing via official vendor pages (see inline links); all forward-looking numbers are bracketed assumptions pending billing exports. List price ≠ actual billed; MVP cost ≠ scale cost; one-time ≠ recurring.*
