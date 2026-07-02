## Hero Title Restructure

**File:** `src/components/landing/sections/HeroSection.tsx`

### 1. Swap sizes — ChravelApp becomes the star

**"ChravelApp" wordmark (lines 117–127):** upsize ~50%. Change from `text-xl sm:text-2xl md:text-3xl` to `text-3xl sm:text-4xl md:text-5xl lg:text-6xl`. Keeps the existing `text-gradient-gold` treatment.

**"The Group Chat Travel App" headline (lines 131–141):** downsize ~25%. Change from `text-4xl sm:text-5xl md:text-6xl lg:text-7xl` to `text-3xl sm:text-4xl md:text-[2.75rem] lg:text-5xl`. Now the descriptor, not the hero.

### 2. Reveal the wordmark inside the tagline

Restructure the h1 so users can *see* Chat + Travel + App → ChravelApp. Gold-gradient letters use the same `text-gradient-gold` class already on the wordmark above. Italicize Chat, Travel, and App (all three, so no single word stands out).

```
The <em><span>C</span><span>h</span>at</em> <em><span>T</span><span>r</span><span>a</span><span>v</span><span>e</span><span>l</span></em> <em><span>App</span></em>
```

- `C` and `H` of Chat → `text-gradient-gold`, rest of "at" stays white
- `R A V E L` of Travel → `text-gradient-gold`, leading `T` stays white
- Entire `App` → `text-gradient-gold`
- All three words wrapped in `<em>` for consistent italics via Fraunces

### 3. Preserve

- `text-shadow`, animation delays, gold divider below, subtitle copy, CTAs, video block — untouched.
- Accessibility: h1 text content still reads "The Chat Travel App" naturally; add `aria-label="The Chat Travel App"` on the h1 to keep screen readers clean since the visual is span-fragmented.

### Verification

- Visual check at 1440px + mobile: ChravelApp visibly dominant; tagline reads as descriptor; gold letters spell CH · RAVEL · APP.
- `npm run typecheck && npm run build`.