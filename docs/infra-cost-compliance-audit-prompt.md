# Chravel Infrastructure Cost + Compliance Modeling Audit

Use this prompt when running a repo-grounded infrastructure + compliance cost audit in Claude Code/Codex.

## Objective
Audit Chravel’s current technical stack, vendor plans, API usage, compliance gaps, egress exposure, and scaling cost structure to produce a model-ready answer for financial planning.

## Core Cost Formulas

```text
Monthly Vendor Cost =
Base Plan
+ Seat Cost
+ Add-ons
+ Usage Overages
+ Compliance Add-ons
+ Amortized One-Time Setup Costs

Usage Overages =
MAX(0, Actual Usage - Included Quota) × Overage Unit Price

AI Cost =
(Input Tokens / 1,000,000 × Input Rate)
+ (Output Tokens / 1,000,000 × Output Rate)
+ Tool/Search/Audio/Realtime Charges

Egress Cost =
MAX(0, GB Transferred - Included GB) × Overage $/GB

Gross Margin Per User =
Revenue Per User - Variable Infrastructure Cost Per User
```

## Copy/Paste Prompt

```md
# Chravel Infrastructure Cost + Compliance Modeling Audit
You are a senior startup infrastructure CFO, principal engineer, security/compliance lead, and technical due diligence analyst.

## Objective
Audit Chravel’s current technical stack, vendor plans, API usage, compliance gaps, egress exposure, and scaling cost structure so we can give Phil a model-ready answer for financial planning.

The current Perplexity-generated expense model is only a recurring-spend starter. It shows:
- Current audited fixed monthly stack: $466.36/mo.
- Planned stack: $666.36/mo.
- Google APIs are active but unpriced.
- Vercel and shared-cost logic need normalization.
- Annual licenses, one-time software purchases, compliance setup, usage-based infra, reimbursement timing, and scale-driven vendor upgrades are not fully modeled.

Your job is to turn this into a real operating-cost model that answers Phil’s questions.

## Required output
1. Executive summary
2. Current known fixed costs table
3. Current API + usage-based costs table
4. Egress model
5. Supabase scale analysis
6. Vercel scale analysis
7. SSO / MFA / enterprise access table
8. HIPAA / healthcare / sports-team readiness analysis
9. 12-month model-ready cost scenarios
10. Ranked cost risks
11. Recommended answer to Phil
12. CSV tables for vendor costs, assumptions, egress, and compliance

## Rules
- Use current official pricing pages wherever possible.
- Include source URLs for every vendor price.
- Do not make unsupported claims.
- Label assumptions clearly in brackets.
- Separate actual billed cost from public list price.
- Separate MVP cost from scale cost.
- Separate cash cost from theoretical savings.
- Separate one-time setup from recurring monthly cost.
- Do not bury Google APIs inside fixed spend.
- Do not treat compliance as binary; show maturity levels.
```

## Suggested short response to Phil

> You’re right — the current model is too static for scale. The $466/mo current and $666/mo planned numbers are only the fixed recurring baseline, not the full operating model. The biggest missing live variable is still Google APIs / AI / Maps usage. Supabase and Vercel are fine for MVP speed, but we need separate scale scenarios for egress, storage, realtime, log drains, SSO, compliance, and usage-based API calls. We should not represent ourselves as HIPAA-ready yet, and should model a separate HIPAA-ready enterprise case if we intentionally pursue PHI-handling customers.
