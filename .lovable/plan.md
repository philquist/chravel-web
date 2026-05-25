## Scope

Surgical content-only edit to two files in `src/components/conversion/`. No new components, no styling changes, no architecture changes.

## Files changed

1. **`src/components/conversion/ReplacesGrid.tsx`** — copy only
   - Line 26: `"Tap below to see how ChravelApp consolidates your app stack"` → `"Tap below to see how ChravelApp brings together the trip chaos usually scattered across your app stack"`
   - Lines 104 & 122: `"Consolidates:"` → `"Brings together the trip chaos usually scattered across:"`
   - No layout/animation/chip-rendering changes.

2. **`src/components/conversion/ReplacesGridData.ts`** — rewrite `CATEGORIES` array contents only (keep `AppItem` / `Category` interfaces intact)
   - Same `hero` (visible first) vs `full` (expanded) split already supported by the component → use it as the "consumer-first cap at 6–8" mechanism. No variant prop added (architecture has no Pro/Events variant here; enterprise apps just get demoted into `full` or removed per spec).
   - Update `benefit` strings to the new descriptions.

### New category contents

**chat** — benefit: "A private group chat built specifically for your trip."
- hero: WhatsApp, iMessage/SMS, Facebook Messenger, Instagram DMs, GroupMe, Snapchat, Telegram, Discord
- full: Slack, Microsoft Teams
- (Signal removed)

**calendar** — benefit: "One shared schedule — updated live for everyone."
- hero: Google Calendar, Apple Calendar, Outlook Calendar, Gmail, Outlook Email, Calendly, iCal
- full: []
- (Doodle moved to Polls)

**concierge** — benefit: "Your AI concierge — aware of your trip, preferences, and context."
- hero: ChatGPT, Google Search, Gemini, Claude, Perplexity, Reddit, TikTok, Instagram
- full: YouTube, Tripadvisor, Yelp

**media** — benefit: "Photos, videos, files, and confirmations — one hub for the whole group."
- hero: Google Photos, Apple Photos, iCloud, Google Drive, Dropbox, Instagram, Snapchat Memories, WhatsApp Photos
- full: WeTransfer, OneDrive, Box
- (Apple Files removed)

**payments** — benefit: "See who paid, who owes, and how everyone prefers to settle."
- hero: Venmo, Zelle, PayPal, Cash App, Splitwise, Apple Cash, Google Sheets, Excel
- full: []
- (Tab, Settle Up, Google Pay removed — avoids implying Chravel is a payment rail)

**places** — benefit: "Links, reservations, and locations saved once — found instantly."
- hero: Google Maps, Apple Maps, Waze, Yelp, Tripadvisor, OpenTable, Resy, Airbnb
- full: Booking.com, Vrbo, Apple Notes, Safari / Chrome Bookmarks
- (MapQuest, Glympse, Citymapper, Find My, Roadtrippers removed)

**polls** — benefit: "Make group decisions without endless debates or buried votes."
- hero: Doodle, Google Forms, SurveyMonkey, When2Meet, Typeform, StrawPoll, WhatsApp Polls
- full: []
- (Slido, Poll Everywhere, PollForAll removed)

**tasks** — benefit: "The group to-do list — reminders and accountability for everyone."
- hero: Apple Reminders, Google Tasks, Todoist, Google Keep, Apple Notes, Trello
- full: Notion, Asana, Monday.com, Microsoft To Do

## Validation

- `npm run typecheck && npm run build`
- Manual: load `/`, expand each category card, verify chips wrap cleanly on 689px viewport (current preview), tablet, and desktop. Verify chevron collapse still works.

## Risk

LOW — string/data edits only. No runtime, schema, or import changes. Rollback = git revert.
