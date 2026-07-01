import React from 'react';

interface GoldAccentOverlayProps {
  variant?: 'hero' | 'waves' | 'terraces' | 'diamonds' | 'circles' | 'mesh' | 'aurora' | 'none';
}

/**
 * Unified luxury backdrop system.
 *
 * One shared visual grammar — pure black canvas, one soft metallic-gold
 * radial "spotlight," and a single crisp gold hairline that traces a slow
 * arc. Sections differ only in the position of the spotlight and the
 * curvature of the hairline, so the marketing site reads as ONE object
 * (Rolls-Royce brochure, Bang & Olufsen product page) rather than a
 * collage of unrelated geometric wallpapers.
 *
 * All accent alpha stays under 0.14 so white overlay copy remains WCAG-AA.
 */

type Focus = { x: number; y: number; rx: number; ry: number; opacity: number };
type Curve = { d: string; opacity: number };

const CONFIGS: Record<Exclude<GoldAccentOverlayProps['variant'], 'none' | undefined>, {
  focus: Focus;
  curve: Curve;
  secondaryCurve?: Curve;
}> = {
  hero: {
    focus: { x: 1200, y: 140, rx: 620, ry: 480, opacity: 0.14 },
    curve: {
      d: 'M -40 720 C 380 640, 720 560, 1080 480 S 1480 300, 1520 220',
      opacity: 0.28,
    },
    secondaryCurve: {
      d: 'M -40 820 C 420 760, 780 700, 1120 620 S 1520 460, 1540 380',
      opacity: 0.1,
    },
  },
  waves: {
    focus: { x: 240, y: 640, rx: 560, ry: 420, opacity: 0.12 },
    curve: {
      d: 'M -40 440 C 320 380, 620 500, 900 440 S 1300 340, 1520 300',
      opacity: 0.22,
    },
    secondaryCurve: {
      d: 'M -40 560 C 340 500, 640 620, 920 560 S 1320 460, 1520 420',
      opacity: 0.09,
    },
  },
  terraces: {
    focus: { x: 720, y: 120, rx: 720, ry: 360, opacity: 0.11 },
    curve: {
      d: 'M -40 340 L 1520 260',
      opacity: 0.24,
    },
    secondaryCurve: {
      d: 'M -40 460 L 1520 380',
      opacity: 0.1,
    },
  },
  diamonds: {
    focus: { x: 320, y: 220, rx: 540, ry: 420, opacity: 0.13 },
    curve: {
      d: 'M 1520 -40 C 1180 260, 900 420, 640 560 S 220 780, -40 860',
      opacity: 0.24,
    },
    secondaryCurve: {
      d: 'M 1520 60 C 1200 340, 940 500, 680 640 S 260 860, -40 940',
      opacity: 0.09,
    },
  },
  circles: {
    focus: { x: 1180, y: 620, rx: 620, ry: 480, opacity: 0.13 },
    curve: {
      d: 'M -40 220 C 340 340, 700 300, 1020 400 S 1400 620, 1520 700',
      opacity: 0.24,
    },
    secondaryCurve: {
      d: 'M -40 320 C 360 440, 740 400, 1060 500 S 1420 720, 1520 800',
      opacity: 0.09,
    },
  },
  mesh: {
    focus: { x: 1300, y: 200, rx: 560, ry: 440, opacity: 0.12 },
    curve: {
      d: 'M -40 620 C 340 540, 660 660, 960 580 S 1360 380, 1520 320',
      opacity: 0.24,
    },
    secondaryCurve: {
      d: 'M -40 740 C 360 660, 700 780, 1000 700 S 1380 500, 1520 440',
      opacity: 0.09,
    },
  },
  aurora: {
    focus: { x: 720, y: 460, rx: 780, ry: 520, opacity: 0.12 },
    curve: {
      d: 'M -40 300 C 380 260, 720 380, 1080 320 S 1440 200, 1520 180',
      opacity: 0.22,
    },
    secondaryCurve: {
      d: 'M -40 620 C 380 580, 720 700, 1080 640 S 1440 520, 1520 500',
      opacity: 0.09,
    },
  },
};

export const GoldAccentOverlay: React.FC<GoldAccentOverlayProps> = ({ variant = 'waves' }) => {
  const uid = React.useId().replace(/:/g, '');
  const key = (variant === 'none' ? 'waves' : variant) as keyof typeof CONFIGS;
  const cfg = CONFIGS[key];

  if (variant === 'none') return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      {/* Spotlight — soft metallic gold radial. CSS radial-gradient stays
          crisp at any DPR (no SVG blur artifacts). */}
      <div
        className="absolute"
        style={{
          left: `${(cfg.focus.x / 1520) * 100}%`,
          top: `${(cfg.focus.y / 900) * 100}%`,
          width: `${(cfg.focus.rx * 2) / 15.2}%`,
          height: `${(cfg.focus.ry * 2) / 9}%`,
          transform: 'translate(-50%, -50%)',
          background: `radial-gradient(ellipse at center, rgba(196,151,70,${cfg.focus.opacity}) 0%, rgba(196,151,70,${cfg.focus.opacity * 0.4}) 35%, rgba(196,151,70,0) 70%)`,
          filter: 'blur(40px)',
        }}
      />

      {/* Hairlines — single crisp 0.75px stroke with a soft gradient along
          the length. SVG only for path geometry; no blur filters (they are
          what caused the grainy/fuzzy look). */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 1480 900"
        preserveAspectRatio="none"
        fill="none"
      >
        <defs>
          <linearGradient id={`${uid}-line`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#c49746" stopOpacity="0" />
            <stop offset="18%" stopColor="#c49746" stopOpacity="1" />
            <stop offset="82%" stopColor="#feeaa5" stopOpacity="1" />
            <stop offset="100%" stopColor="#c49746" stopOpacity="0" />
          </linearGradient>
        </defs>
        {cfg.secondaryCurve && (
          <path
            d={cfg.secondaryCurve.d}
            stroke={`url(#${uid}-line)`}
            strokeWidth="0.75"
            opacity={cfg.secondaryCurve.opacity}
            vectorEffect="non-scaling-stroke"
          />
        )}
        <path
          d={cfg.curve.d}
          stroke={`url(#${uid}-line)`}
          strokeWidth="1"
          opacity={cfg.curve.opacity}
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* Edge vignette — anchors the frame, keeps center airy */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.35) 100%)',
        }}
      />
    </div>
  );
};
