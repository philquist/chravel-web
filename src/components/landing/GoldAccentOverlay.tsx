import React from 'react';

interface GoldAccentOverlayProps {
  variant?: 'hero' | 'waves' | 'terraces' | 'diamonds' | 'circles' | 'mesh' | 'aurora' | 'none';
}

/**
 * Unified luxury backdrop system — crisp black canvas, metallic gold line-work.
 *
 * One shared visual grammar across every section: a soft multi-stop gold
 * tint (pure CSS radial-gradients — NO blur filters, which caused the old
 * blurry/grainy smudge), plus three families of crisp gradient hairlines:
 *
 *   1. primary   — 1.25px feature lines at 0.24–0.38 opacity. The visible
 *                  "real line" that gives each section its structure.
 *   2. echo      — 0.75px siblings offset from the primaries, opacity
 *                  stepping down 0.20 → 0.10. Reads as engraved depth.
 *   3. structure — 0.5px straight rules / lattice at 0.06–0.10. The faint
 *                  drafting grid that makes the composition feel intentional.
 *
 * Sections differ only in composition (meridian arcs, strata, terraces,
 * facets, orbits, fan rays, aurora bands) and tint hue, so the marketing
 * site reads as ONE object — a Rolls-Royce brochure, not a collage of
 * unrelated geometric wallpapers.
 *
 * Peak stroke alpha stays ≤ 0.38 on hairline weights and every text block
 * sits on near-black fields, so white overlay copy remains WCAG-AA.
 */

type Stroke = { d: string; opacity: number };

type VariantConfig = {
  /** Two stacked radial tints: main gold pool + per-section hue accent. */
  tint: {
    x: number; // % of width for the main gold pool
    y: number; // % of height
    x2: number; // secondary accent position
    y2: number;
    rgb: string; // secondary accent hue — the per-section differentiator
  };
  primary: Stroke[];
  echo: Stroke[];
  structure: Stroke[];
};

const CONFIGS: Record<
  Exclude<GoldAccentOverlayProps['variant'], 'none' | undefined>,
  VariantConfig
> = {
  // Golden-ratio meridian arcs sweeping toward the top-right light source.
  hero: {
    tint: { x: 82, y: 12, x2: 20, y2: 85, rgb: '232,175,72' },
    primary: [
      { d: 'M -40 700 C 380 620, 720 540, 1080 460 S 1480 280, 1520 200', opacity: 0.36 },
      { d: 'M -40 770 C 400 690, 740 610, 1100 530 S 1490 350, 1530 270', opacity: 0.3 },
    ],
    echo: [
      { d: 'M -40 630 C 360 550, 700 470, 1060 390 S 1470 210, 1510 130', opacity: 0.2 },
      { d: 'M -40 840 C 420 765, 760 685, 1120 605 S 1500 425, 1540 345', opacity: 0.16 },
      { d: 'M -40 905 C 430 835, 770 760, 1130 680 S 1505 500, 1545 420', opacity: 0.12 },
    ],
    structure: [
      { d: 'M -40 560 L 1480 560', opacity: 0.06 },
      { d: 'M -40 118 L 1480 118', opacity: 0.07 },
    ],
  },

  // Layered sine strata — slow tidal contours.
  waves: {
    tint: { x: 18, y: 70, x2: 75, y2: 25, rgb: '196,151,70' },
    primary: [
      { d: 'M -40 430 C 320 370, 620 490, 900 430 S 1300 330, 1520 290', opacity: 0.34 },
      { d: 'M -40 520 C 330 460, 630 580, 910 520 S 1310 420, 1520 380', opacity: 0.28 },
    ],
    echo: [
      { d: 'M -40 340 C 320 280, 620 400, 900 340 S 1300 240, 1520 200', opacity: 0.2 },
      { d: 'M -40 610 C 335 550, 635 670, 915 610 S 1315 510, 1520 470', opacity: 0.17 },
      { d: 'M -40 700 C 340 640, 640 760, 920 700 S 1320 600, 1520 560', opacity: 0.13 },
      { d: 'M -40 250 C 315 195, 615 310, 895 250 S 1295 155, 1520 115', opacity: 0.1 },
    ],
    structure: [{ d: 'M -40 800 L 1480 780', opacity: 0.08 }],
  },

  // Terraced horizon — converging drafting rules with frame posts.
  terraces: {
    tint: { x: 50, y: 10, x2: 12, y2: 80, rgb: '226,205,150' },
    primary: [
      { d: 'M -40 330 L 1480 250', opacity: 0.34 },
      { d: 'M -40 450 L 1480 395', opacity: 0.28 },
    ],
    echo: [
      { d: 'M -40 570 L 1480 540', opacity: 0.2 },
      { d: 'M -40 690 L 1480 678', opacity: 0.15 },
      { d: 'M -40 810 L 1480 812', opacity: 0.11 },
      { d: 'M -40 215 L 1480 112', opacity: 0.12 },
    ],
    structure: [
      { d: 'M 180 -40 L 180 940', opacity: 0.07 },
      { d: 'M 1262 -40 L 1262 940', opacity: 0.07 },
    ],
  },

  // Faceted lattice — two crossing diagonal families.
  diamonds: {
    tint: { x: 24, y: 22, x2: 80, y2: 75, rgb: '196,151,70' },
    primary: [
      { d: 'M 1520 -40 C 1180 260, 900 420, 640 560 S 220 780, -40 860', opacity: 0.34 },
      { d: 'M -40 -20 C 300 220, 620 380, 900 520 S 1330 760, 1520 830', opacity: 0.28 },
    ],
    echo: [
      { d: 'M 1520 60 C 1200 340, 940 500, 680 640 S 260 860, -40 940', opacity: 0.18 },
      { d: 'M 1520 -140 C 1160 180, 880 340, 620 480 S 200 700, -40 780', opacity: 0.14 },
      { d: 'M -40 -120 C 320 120, 640 280, 920 420 S 1350 660, 1540 730', opacity: 0.16 },
    ],
    structure: [
      { d: 'M 200 -40 L 1480 640', opacity: 0.07 },
      { d: 'M -40 180 L 1240 940', opacity: 0.06 },
      { d: 'M 520 -40 L 1520 500', opacity: 0.06 },
    ],
  },

  // Orbital rings around an off-canvas focus on the right.
  circles: {
    tint: { x: 80, y: 66, x2: 25, y2: 20, rgb: '232,175,72' },
    primary: [
      { d: 'M 1560 940 A 380 380 0 0 1 1180 560 A 380 380 0 0 1 1560 180', opacity: 0.34 },
      { d: 'M 1560 1080 A 520 520 0 0 1 1040 560 A 520 520 0 0 1 1560 40', opacity: 0.26 },
    ],
    echo: [
      { d: 'M 1560 860 A 300 300 0 0 1 1260 560 A 300 300 0 0 1 1560 260', opacity: 0.18 },
      { d: 'M 1560 1010 A 450 450 0 0 1 1110 560 A 450 450 0 0 1 1560 110', opacity: 0.14 },
      { d: 'M 1560 1240 A 680 680 0 0 1 880 560 A 680 680 0 0 1 1560 -120', opacity: 0.11 },
    ],
    structure: [
      { d: 'M 1090 560 A 90 90 0 0 1 1270 560 A 90 90 0 0 1 1090 560', opacity: 0.1 },
      { d: 'M -40 820 L 1480 820', opacity: 0.06 },
    ],
  },

  // Radial ledger — fan rays from a vanishing point past the top-right corner.
  mesh: {
    tint: { x: 86, y: 16, x2: 30, y2: 80, rgb: '205,170,110' },
    primary: [
      { d: 'M 1600 -100 L -40 520', opacity: 0.32 },
      { d: 'M 1600 -100 L -40 760', opacity: 0.26 },
    ],
    echo: [
      { d: 'M 1600 -100 L -40 300', opacity: 0.18 },
      { d: 'M 1600 -100 L -40 640', opacity: 0.15 },
      { d: 'M 1600 -100 L 200 940', opacity: 0.13 },
      { d: 'M 1600 -100 L 640 940', opacity: 0.1 },
    ],
    structure: [
      { d: 'M -40 640 C 380 560, 800 620, 1180 520 S 1440 420, 1520 380', opacity: 0.09 },
      { d: 'M -40 760 C 400 685, 820 745, 1200 645 S 1450 545, 1530 505', opacity: 0.06 },
    ],
  },

  // Aurora bands — the quietest variant; long shallow arcs only.
  aurora: {
    tint: { x: 50, y: 50, x2: 85, y2: 15, rgb: '180,150,95' },
    primary: [
      { d: 'M -40 290 C 380 250, 720 370, 1080 310 S 1440 190, 1520 170', opacity: 0.24 },
      { d: 'M -40 380 C 390 340, 730 460, 1090 400 S 1450 280, 1530 260', opacity: 0.19 },
    ],
    echo: [
      { d: 'M -40 610 C 380 570, 720 690, 1080 630 S 1440 510, 1520 490', opacity: 0.14 },
      { d: 'M -40 700 C 385 660, 725 780, 1085 720 S 1445 600, 1525 580', opacity: 0.1 },
      { d: 'M -40 200 C 375 160, 715 280, 1075 220 S 1435 100, 1515 80', opacity: 0.09 },
    ],
    structure: [{ d: 'M -40 830 L 1480 812', opacity: 0.06 }],
  },
};

const LINE_FAMILIES: Array<{
  key: 'primary' | 'echo' | 'structure';
  strokeWidth: number;
  gradient: 'line' | 'line-soft';
}> = [
  { key: 'structure', strokeWidth: 0.5, gradient: 'line-soft' },
  { key: 'echo', strokeWidth: 0.75, gradient: 'line-soft' },
  { key: 'primary', strokeWidth: 1.25, gradient: 'line' },
];

export const GoldAccentOverlay: React.FC<GoldAccentOverlayProps> = ({ variant = 'waves' }) => {
  const uid = React.useId().replace(/:/g, '');
  const key = (variant === 'none' ? 'waves' : variant) as keyof typeof CONFIGS;
  const cfg = CONFIGS[key];

  if (variant === 'none') return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      {/* Tint — multi-stop CSS radial-gradients give the soft falloff that
          blur(40px) used to fake, but stay perfectly crisp at any DPR. */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(120% 90% at ${cfg.tint.x}% ${cfg.tint.y}%, rgba(196,151,70,0.10) 0%, rgba(196,151,70,0.05) 30%, rgba(196,151,70,0.018) 55%, transparent 78%), radial-gradient(90% 70% at ${cfg.tint.x2}% ${cfg.tint.y2}%, rgba(${cfg.tint.rgb},0.05) 0%, transparent 65%)`,
        }}
      />

      {/* Line-work — three crisp hairline families. SVG carries geometry
          only; no filters (they caused the old grainy/fuzzy look). */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 1440 900"
        preserveAspectRatio="none"
        fill="none"
      >
        <defs>
          <linearGradient id={`${uid}-line`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#c49746" stopOpacity="0" />
            <stop offset="30%" stopColor="#e8af48" stopOpacity="1" />
            <stop offset="58%" stopColor="#feeaa5" stopOpacity="1" />
            <stop offset="100%" stopColor="#c49746" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${uid}-line-soft`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#c49746" stopOpacity="0" />
            <stop offset="30%" stopColor="#e8af48" stopOpacity="0.6" />
            <stop offset="58%" stopColor="#feeaa5" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#c49746" stopOpacity="0" />
          </linearGradient>
        </defs>
        {LINE_FAMILIES.map(family =>
          cfg[family.key].map((stroke, i) => (
            <path
              key={`${family.key}-${i}`}
              d={stroke.d}
              stroke={`url(#${uid}-${family.gradient})`}
              strokeWidth={family.strokeWidth}
              opacity={stroke.opacity}
              vectorEffect="non-scaling-stroke"
            />
          )),
        )}
      </svg>

      {/* Edge vignette — anchors the frame, keeps center airy */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(0,0,0,0) 62%, rgba(0,0,0,0.28) 100%)',
        }}
      />
    </div>
  );
};
