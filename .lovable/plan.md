## Remove "Share Phone Number with Trip Members" from Privacy & Security

### Change
In `src/components/consumer/ConsumerPrivacySection.tsx`, delete the entire "Contact Information" card (lines 348–374) containing the Share Phone Number toggle.

### Rationale
Per user: this control is unnecessary in settings — members can share their number directly in chat if they want to.

### Notes
- Leaving the underlying `show_phone` field and `sharePhoneNumber` state plumbing in place (lines 232, 271, 277) is harmless and avoids touching the DB/profile flow. They simply default to off with no UI to flip them. Can remove in a follow-up if desired.
- `EnterprisePrivacySection.tsx` has a similar toggle but is out of scope (Pro/Enterprise surface, not the consumer screen shown).

### Files changed
- `src/components/consumer/ConsumerPrivacySection.tsx` (remove ~27 lines)