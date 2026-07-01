import React from 'react';

interface GoldAccentOverlayProps {
  variant?: 'hero' | 'waves' | 'terraces' | 'diamonds' | 'circles' | 'mesh' | 'aurora';
}

// Originally-authored decorative gold/black backdrops for the marketing landing.
// Every variant shares one layering convention so the set reads as one system
// rather than 7 unrelated shapes: a soft blurred "background" plane (ambient
// light source), a midground plane carrying the main geometry (multi-stop
// gradients for smooth falloff), and a crisp unblurred "foreground" hairline
// plane that reads sharp against the soft glow behind it — that contrast is
// what creates the depth cue without motion. No single stop exceeds 0.35
// opacity and stacked planes stay under ~0.4 effective alpha against the
// black section background, so marketing copy (white text) stays legible.
export const GoldAccentOverlay: React.FC<GoldAccentOverlayProps> = ({ variant = 'waves' }) => {
  // Namespaces every gradient/filter id to this instance so two overlays
  // rendered on the same page (even with the same variant) never collide —
  // colons stripped since some SVG url(#...) consumers mishandle them.
  const uid = React.useId().replace(/:/g, '');

  // Hero — golden-ratio arcs. Concentric circle strokes centered off-canvas
  // upper-right at radii in golden-ratio proportion (r, 1.618r, 2.618r); the
  // SVG viewport naturally clips them to arcs. Mostly negative space.
  if (variant === 'hero') {
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 1440 900"
          preserveAspectRatio="none"
          fill="none"
        >
          <defs>
            <filter id={`${uid}-heroBgBlur`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="30" />
            </filter>
            <filter id={`${uid}-heroArcBlur`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" />
            </filter>
            <radialGradient id={`${uid}-heroGlow`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#c49746" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#c49746" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* Background plane — ambient light source */}
          <ellipse
            cx="1250"
            cy="140"
            rx="260"
            ry="200"
            fill={`url(#${uid}-heroGlow)`}
            opacity="0.08"
            filter={`url(#${uid}-heroBgBlur)`}
          />
          {/* Midground plane — golden-ratio concentric arcs (r, 1.618r, 2.618r) */}
          <g filter={`url(#${uid}-heroArcBlur)`}>
            <circle cx="1520" cy="-60" r="360" stroke="#c49746" strokeWidth="2" opacity="0.22" />
            <circle cx="1520" cy="-60" r="582" stroke="#c49746" strokeWidth="1.5" opacity="0.16" />
            <circle cx="1520" cy="-60" r="942" stroke="#c49746" strokeWidth="1" opacity="0.1" />
          </g>
          {/* Foreground plane — crisp hairline tangents at golden-ratio-spaced points */}
          <line
            x1="1180"
            y1="40"
            x2="1300"
            y2="110"
            stroke="#c49746"
            strokeWidth="1"
            opacity="0.3"
          />
          <line
            x1="1050"
            y1="180"
            x2="1160"
            y2="230"
            stroke="#c49746"
            strokeWidth="1"
            opacity="0.26"
          />
        </svg>
      </div>
    );
  }

  // Waves — layered sine strata. Three open stroke-only sine paths at
  // different amplitude/period, stacked at different vertical offsets, plus
  // one thin filled ribbon between two strata for depth. Deliberately avoids
  // filled wave-belly "blob" shapes.
  if (variant === 'waves') {
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 1440 900"
          preserveAspectRatio="none"
          fill="none"
        >
          <defs>
            <filter id={`${uid}-wavesBgBlur`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="40" />
            </filter>
            <filter id={`${uid}-wavesMidBlur`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" />
            </filter>
            <linearGradient id={`${uid}-wavesRibbon`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#c49746" stopOpacity="0" />
              <stop offset="25%" stopColor="#c49746" stopOpacity="0.1" />
              <stop offset="50%" stopColor="#c49746" stopOpacity="0.14" />
              <stop offset="75%" stopColor="#c49746" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#c49746" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Background plane */}
          <ellipse
            cx="200"
            cy="650"
            rx="340"
            ry="200"
            fill="#c49746"
            opacity="0.07"
            filter={`url(#${uid}-wavesBgBlur)`}
          />
          {/* Midground plane — 3 sine strata at different amplitude/period */}
          <g filter={`url(#${uid}-wavesMidBlur)`}>
            <path
              d="M0,260 C120,220 240,300 360,260 C480,220 600,300 720,260 C840,220 960,300 1080,260 C1200,220 1320,300 1440,260"
              stroke="#c49746"
              strokeWidth="2"
              opacity="0.18"
            />
            <path
              d="M0,420 C180,455 360,385 540,420 C720,455 900,385 1080,420 C1260,455 1440,385 1440,420"
              stroke="#c49746"
              strokeWidth="1.5"
              opacity="0.14"
            />
            <path
              d="M0,560 C160,575 320,545 480,560 C640,575 800,545 960,560 C1120,575 1280,545 1440,560"
              stroke="#c49746"
              strokeWidth="1"
              opacity="0.1"
            />
          </g>
          {/* Ribbon fill between strata 1 and 2 */}
          <path
            d="M0,260 C120,220 240,300 360,260 C480,220 600,300 720,260 C840,220 960,300 1080,260 C1200,220 1320,300 1440,260 L1440,420 C1260,385 1080,455 900,420 C720,385 540,455 360,420 C180,385 0,455 0,420 Z"
            fill={`url(#${uid}-wavesRibbon)`}
          />
          {/* Foreground plane — crisp hairline tracing the topmost crest */}
          <path
            d="M0,260 C120,220 240,300 360,260 C480,220 600,300 720,260 C840,220 960,300 1080,260 C1200,220 1320,300 1440,260"
            stroke="#c49746"
            strokeWidth="1"
            opacity="0.28"
          />
        </svg>
      </div>
    );
  }

  // Diamonds — faceted lattice. A sparse, irregular (non-grid) triangulated
  // lattice from asymmetrically placed vertices; only a couple of facets are
  // filled as "lit," the rest stays pure linework.
  if (variant === 'diamonds') {
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 1440 900"
          preserveAspectRatio="none"
          fill="none"
        >
          <defs>
            <filter id={`${uid}-diamondsBgBlur`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="35" />
            </filter>
            <filter id={`${uid}-diamondsLineBlur`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" />
            </filter>
            <linearGradient id={`${uid}-diamondsFacet1`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#c49746" stopOpacity="0.2" />
              <stop offset="45%" stopColor="#c49746" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#c49746" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id={`${uid}-diamondsFacet2`} x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#c49746" stopOpacity="0.18" />
              <stop offset="45%" stopColor="#c49746" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#c49746" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {/* Background plane — glows at the two lit-facet vertices */}
          <circle
            cx="420"
            cy="120"
            r="150"
            fill="#c49746"
            opacity="0.08"
            filter={`url(#${uid}-diamondsBgBlur)`}
          />
          <circle
            cx="1150"
            cy="220"
            r="140"
            fill="#c49746"
            opacity="0.07"
            filter={`url(#${uid}-diamondsBgBlur)`}
          />
          {/* Midground plane — sparse irregular lattice linework */}
          <g
            stroke="#c49746"
            strokeWidth="1"
            opacity="0.16"
            filter={`url(#${uid}-diamondsLineBlur)`}
          >
            <line x1="150" y1="200" x2="420" y2="120" />
            <line x1="420" y1="120" x2="680" y2="340" />
            <line x1="680" y1="340" x2="150" y2="200" />
            <line x1="680" y1="340" x2="300" y2="560" />
            <line x1="300" y1="560" x2="150" y2="200" />
            <line x1="680" y1="340" x2="900" y2="480" />
            <line x1="900" y1="480" x2="1150" y2="220" />
            <line x1="1150" y1="220" x2="1300" y2="620" />
            <line x1="900" y1="480" x2="1300" y2="620" />
          </g>
          {/* Lit facets */}
          <polygon points="420,120 680,340 150,200" fill={`url(#${uid}-diamondsFacet1)`} />
          <polygon points="900,480 1150,220 1300,620" fill={`url(#${uid}-diamondsFacet2)`} />
          {/* Foreground plane — crisp accent points at the lit vertices */}
          <circle cx="420" cy="120" r="3" fill="#c49746" opacity="0.32" />
          <circle cx="1150" cy="220" r="3" fill="#c49746" opacity="0.3" />
        </svg>
      </div>
    );
  }

  // Circles — orbital rings. Concentric ring strokes (annuli, not filled
  // disks) around two shared focal centers; each ring's gradient fades around
  // its own circumference for a "light traveling an orbit" read.
  if (variant === 'circles') {
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 1440 900"
          preserveAspectRatio="none"
          fill="none"
        >
          <defs>
            <filter id={`${uid}-circlesBgBlur`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="40" />
            </filter>
            <filter id={`${uid}-circlesRingBlur`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" />
            </filter>
            <linearGradient
              id={`${uid}-circlesOrbit1`}
              gradientUnits="userSpaceOnUse"
              x1="80"
              y1="80"
              x2="440"
              y2="440"
            >
              <stop offset="0%" stopColor="#c49746" stopOpacity="0.05" />
              <stop offset="35%" stopColor="#c49746" stopOpacity="0.28" />
              <stop offset="65%" stopColor="#c49746" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#c49746" stopOpacity="0.05" />
            </linearGradient>
            <linearGradient
              id={`${uid}-circlesOrbit2`}
              gradientUnits="userSpaceOnUse"
              x1="990"
              y1="390"
              x2="1410"
              y2="810"
            >
              <stop offset="0%" stopColor="#c49746" stopOpacity="0.05" />
              <stop offset="35%" stopColor="#c49746" stopOpacity="0.24" />
              <stop offset="65%" stopColor="#c49746" stopOpacity="0.26" />
              <stop offset="100%" stopColor="#c49746" stopOpacity="0.05" />
            </linearGradient>
          </defs>
          {/* Background plane — glow behind each focal center */}
          <circle
            cx="260"
            cy="260"
            r="180"
            fill="#c49746"
            opacity="0.08"
            filter={`url(#${uid}-circlesBgBlur)`}
          />
          <circle
            cx="1200"
            cy="600"
            r="200"
            fill="#c49746"
            opacity="0.07"
            filter={`url(#${uid}-circlesBgBlur)`}
          />
          {/* Midground plane — orbital ring strokes */}
          <g filter={`url(#${uid}-circlesRingBlur)`}>
            <circle
              cx="260"
              cy="260"
              r="60"
              stroke={`url(#${uid}-circlesOrbit1)`}
              strokeWidth="2"
            />
            <circle
              cx="260"
              cy="260"
              r="100"
              stroke={`url(#${uid}-circlesOrbit1)`}
              strokeWidth="1.5"
            />
            <circle
              cx="1200"
              cy="600"
              r="80"
              stroke={`url(#${uid}-circlesOrbit2)`}
              strokeWidth="2"
            />
            <circle
              cx="1200"
              cy="600"
              r="130"
              stroke={`url(#${uid}-circlesOrbit2)`}
              strokeWidth="1.5"
            />
          </g>
          {/* Foreground plane — crisp nucleus at each focal center */}
          <circle cx="260" cy="260" r="4" fill="#c49746" opacity="0.32" />
          <circle cx="1200" cy="600" r="4" fill="#c49746" opacity="0.3" />
        </svg>
      </div>
    );
  }

  // Mesh — radial ledger lines. Lines radiating from a couple of offset
  // origin points at irregular angles/lengths (a compass/sextant-construction
  // feel), with tick marks on the longer lines. Avoids the generic uniform
  // grid / particle-network look.
  if (variant === 'mesh') {
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 1440 900"
          preserveAspectRatio="none"
          fill="none"
        >
          <defs>
            <filter id={`${uid}-meshBgBlur`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="35" />
            </filter>
            <linearGradient id={`${uid}-meshLine1`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#c49746" stopOpacity="0.22" />
              <stop offset="55%" stopColor="#c49746" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#c49746" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id={`${uid}-meshLine2`} x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#c49746" stopOpacity="0.2" />
              <stop offset="55%" stopColor="#c49746" stopOpacity="0.09" />
              <stop offset="100%" stopColor="#c49746" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {/* Background plane — glow at each origin point only */}
          <circle
            cx="150"
            cy="700"
            r="120"
            fill="#c49746"
            opacity="0.08"
            filter={`url(#${uid}-meshBgBlur)`}
          />
          <circle
            cx="1300"
            cy="150"
            r="110"
            fill="#c49746"
            opacity="0.07"
            filter={`url(#${uid}-meshBgBlur)`}
          />
          {/* Midground plane — lines radiating from each origin at irregular angles/lengths */}
          <g strokeWidth="1.25" opacity="0.9">
            <line x1="150" y1="700" x2="500" y2="500" stroke={`url(#${uid}-meshLine1)`} />
            <line
              x1="150"
              y1="700"
              x2="650"
              y2="760"
              stroke={`url(#${uid}-meshLine1)`}
              strokeWidth="1"
            />
            <line
              x1="150"
              y1="700"
              x2="400"
              y2="300"
              stroke={`url(#${uid}-meshLine1)`}
              strokeWidth="0.75"
            />
            <line x1="1300" y1="150" x2="950" y2="380" stroke={`url(#${uid}-meshLine2)`} />
            <line
              x1="1300"
              y1="150"
              x2="1100"
              y2="600"
              stroke={`url(#${uid}-meshLine2)`}
              strokeWidth="1"
            />
            <line
              x1="1300"
              y1="150"
              x2="1250"
              y2="450"
              stroke={`url(#${uid}-meshLine2)`}
              strokeWidth="0.75"
            />
          </g>
          {/* Foreground plane — crisp tick marks along the longer lines */}
          <g stroke="#c49746" strokeWidth="1" opacity="0.24">
            <line x1="310" y1="610" x2="330" y2="590" />
            <line x1="410" y1="530" x2="430" y2="510" />
            <line x1="1110" y1="290" x2="1130" y2="310" />
            <line x1="1010" y1="360" x2="1030" y2="380" />
          </g>
        </svg>
      </div>
    );
  }

  // Aurora — deep parallax bands. Background: one wide soft band. Midground:
  // two bands at unequal, non-parallel phase/amplitude. Foreground: crisp
  // hairlines tracing only the crest of the midground bands.
  if (variant === 'aurora') {
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 1440 900"
          preserveAspectRatio="none"
          fill="none"
        >
          <defs>
            <filter id={`${uid}-auroraBgBlur`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="50" />
            </filter>
            <filter id={`${uid}-auroraMidBlur`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="8" />
            </filter>
            <linearGradient id={`${uid}-auroraBand1`} x1="0%" y1="50%" x2="100%" y2="50%">
              <stop offset="0%" stopColor="#c49746" stopOpacity="0.03" />
              <stop offset="25%" stopColor="#c49746" stopOpacity="0.16" />
              <stop offset="50%" stopColor="#c49746" stopOpacity="0.2" />
              <stop offset="75%" stopColor="#c49746" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#c49746" stopOpacity="0.03" />
            </linearGradient>
            <linearGradient id={`${uid}-auroraBand2`} x1="0%" y1="50%" x2="100%" y2="50%">
              <stop offset="0%" stopColor="#c49746" stopOpacity="0.02" />
              <stop offset="30%" stopColor="#c49746" stopOpacity="0.12" />
              <stop offset="60%" stopColor="#c49746" stopOpacity="0.14" />
              <stop offset="85%" stopColor="#c49746" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#c49746" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {/* Background plane */}
          <path
            d="M0,300 Q360,220 720,320 Q1080,420 1440,280"
            stroke="#c49746"
            strokeWidth="90"
            opacity="0.07"
            strokeLinecap="round"
            filter={`url(#${uid}-auroraBgBlur)`}
          />
          {/* Midground plane — unequal, non-parallel phase/amplitude bands */}
          <g filter={`url(#${uid}-auroraMidBlur)`}>
            <path
              d="M0,280 Q300,190 600,300 Q900,410 1200,270 Q1340,210 1440,250"
              stroke={`url(#${uid}-auroraBand1)`}
              strokeWidth="55"
              strokeLinecap="round"
            />
            <path
              d="M0,520 Q260,610 520,490 Q780,370 1040,510 Q1240,620 1440,540"
              stroke={`url(#${uid}-auroraBand2)`}
              strokeWidth="42"
              strokeLinecap="round"
            />
          </g>
          {/* Foreground plane — crisp crest hairlines */}
          <path
            d="M0,255 Q300,165 600,275 Q900,385 1200,245 Q1340,185 1440,225"
            stroke="#c49746"
            strokeWidth="1"
            opacity="0.26"
          />
          <path
            d="M0,495 Q260,585 520,465 Q780,345 1040,485"
            stroke="#c49746"
            strokeWidth="1"
            opacity="0.2"
          />
        </svg>
      </div>
    );
  }

  // Terraces — terraced horizon. Replaces the old "triangles" variant, which
  // read too busy/geometric. Gently sloped, non-parallel bands weighted
  // toward one side of the viewport — deliberately no sharp angles/polygons,
  // which is what disambiguates it from the isometric-triangle trope.
  if (variant === 'terraces') {
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 1440 900"
          preserveAspectRatio="none"
          fill="none"
        >
          <defs>
            <filter id={`${uid}-terracesBgBlur`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="35" />
            </filter>
            <linearGradient id={`${uid}-terracesBand`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#c49746" stopOpacity="0.02" />
              <stop offset="50%" stopColor="#c49746" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#c49746" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {/* Background plane — glow tucked at one terrace's edge */}
          <ellipse
            cx="200"
            cy="700"
            rx="220"
            ry="140"
            fill="#c49746"
            opacity="0.08"
            filter={`url(#${uid}-terracesBgBlur)`}
          />
          {/* Terrace band fill between the top two lines */}
          <path
            d="M0,600 L1440,560 L1440,680 L0,760 Z"
            fill={`url(#${uid}-terracesBand)`}
            opacity="0.5"
          />
          {/* Midground plane — gently sloped, non-parallel lines */}
          <line
            x1="0"
            y1="760"
            x2="1440"
            y2="680"
            stroke="#c49746"
            strokeWidth="1.5"
            opacity="0.16"
          />
          <line
            x1="0"
            y1="820"
            x2="1440"
            y2="760"
            stroke="#c49746"
            strokeWidth="1"
            opacity="0.12"
          />
          {/* Foreground plane — crisp hairline on the topmost, uppermost terrace */}
          <line
            x1="0"
            y1="600"
            x2="1440"
            y2="560"
            stroke="#c49746"
            strokeWidth="1"
            opacity="0.26"
          />
        </svg>
      </div>
    );
  }

  return null;
};
