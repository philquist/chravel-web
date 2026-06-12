import { loadFont } from '@remotion/fonts';
import { staticFile } from 'remotion';

/**
 * Local Inter loader (woff2 files vendored from /public/fonts in the app).
 * Network-free so renders are deterministic in sandboxed/CI environments
 * where fonts.gstatic.com is unreachable.
 */
const WEIGHTS = ['400', '600', '700', '800'] as const;

for (const weight of WEIGHTS) {
  loadFont({
    family: 'Inter',
    url: staticFile(`fonts/inter-latin-${weight}.woff2`),
    weight,
  });
}

export const fontFamily = 'Inter';
