/**
 * Marketing-surface fonts — side-effect-only module.
 *
 * Fraunces Variable (opsz axis = the high-optical-size display cut) for serif
 * headlines, Hanken Grotesk for marketing body/UI. Import this from every
 * component that renders a `data-marketing` surface (FullPageLanding, the
 * blog/use-case pages, ForTeams) — several of them are dual-routed through
 * BOTH MarketingApp and the authenticated App shell, so the fonts must travel
 * with the component, not the router. Vite dedupes repeated imports; the
 * authenticated shell never pays for these unless one of these pages loads.
 *
 * Latin-only subsets: marketing copy is English; the all-subset entry CSS
 * would emit cyrillic/vietnamese woff2s into the build for nothing.
 */
import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/fraunces/opsz-italic.css';
import '@fontsource/hanken-grotesk/latin-400.css';
import '@fontsource/hanken-grotesk/latin-500.css';
import '@fontsource/hanken-grotesk/latin-600.css';
// 700 is required: [data-marketing] swaps the body family to Hanken Grotesk,
// and surfaces still using font-bold would otherwise get synthesized bold.
import '@fontsource/hanken-grotesk/latin-700.css';
