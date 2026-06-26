// Responsive WebP background sets for the marketing landing.
// Vite resolves each `?url` import to a hashed asset URL. We expose a srcSet +
// fallback `src` so <img> can pick the right resolution per device DPR/viewport
// (avoids blurring 1920px JPEGs upscaled on 4K/retina monitors).

import coastline1280 from './bg-coastline-1280.webp?url';
import coastline1920 from './bg-coastline-1920.webp?url';
import coastline2560 from './bg-coastline-2560.webp?url';
import coastline3840 from './bg-coastline-3840.webp?url';

import skyline1280 from './bg-skyline-1280.webp?url';
import skyline1920 from './bg-skyline-1920.webp?url';
import skyline2560 from './bg-skyline-2560.webp?url';
import skyline3840 from './bg-skyline-3840.webp?url';

import mountain1280 from './bg-mountain-1280.webp?url';
import mountain1920 from './bg-mountain-1920.webp?url';
import mountain2560 from './bg-mountain-2560.webp?url';
import mountain3840 from './bg-mountain-3840.webp?url';

import stadium1280 from './bg-stadium-1280.webp?url';
import stadium1920 from './bg-stadium-1920.webp?url';
import stadium2560 from './bg-stadium-2560.webp?url';
import stadium3840 from './bg-stadium-3840.webp?url';

export interface ResponsiveBackground {
  src: string; // fallback for browsers without srcset
  srcSet: string;
  sizes: string;
}

const buildSet = (variants: Record<number, string>): ResponsiveBackground => ({
  src: variants[1920],
  srcSet: Object.entries(variants)
    .map(([w, url]) => `${url} ${w}w`)
    .join(', '),
  // Section backgrounds fill the viewport width.
  sizes: '100vw',
});

export const bgCoastline = buildSet({
  1280: coastline1280,
  1920: coastline1920,
  2560: coastline2560,
  3840: coastline3840,
});

export const bgSkyline = buildSet({
  1280: skyline1280,
  1920: skyline1920,
  2560: skyline2560,
  3840: skyline3840,
});

export const bgMountain = buildSet({
  1280: mountain1280,
  1920: mountain1920,
  2560: mountain2560,
  3840: mountain3840,
});

export const bgStadium = buildSet({
  1280: stadium1280,
  1920: stadium1920,
  2560: stadium2560,
  3840: stadium3840,
});
