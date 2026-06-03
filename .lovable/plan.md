## Add beta download links to footer

Edit `src/components/landing/FooterSection.tsx` — append two `<li>` items at the end of the **Product** column list (after "Demo"):

- **iOS Beta (TestFlight)** → `https://testflight.apple.com/join/S3DNbjNf`
- **Android (Play Store)** → `https://play.google.com/store/apps/details?id=com.chravel.app`

Both render as external links: `<a href target="_blank" rel="noopener noreferrer">` using the same `text-foreground hover:text-primary transition-colors` styling as existing items so they blend in visually.

### Why under Product
Matches your ask, keeps the footer 4-column layout intact, and means anyone scrolling to the bottom of chravel.app sees the beta install links right under the existing product nav — no extra section, no layout change, no new dependencies.

### Optional (let me know)
- Add small Apple/Play glyph icons next to each label (slightly more discoverable, ~6 extra lines of SVG).
- Also surface them in a more prominent CTA strip above the footer (e.g., "Get the beta" with two badge buttons). Skip unless you want it.

Ready to implement on approval.