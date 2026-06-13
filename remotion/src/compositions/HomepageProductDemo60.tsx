import React from 'react';
import { AbsoluteFill, Img, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { fontFamily } from '../fonts';

/**
 * 60-second homepage product demo composed entirely from REAL screenshots of
 * the running ChravelApp (captured via remotion/scripts/capture-demo-frames.mjs
 * against the built app in demo mode). No AI-generated UI, no mock DOM.
 *
 * Every feature scene shows the desktop web app and the iPhone PWA side by
 * side — same feature, both platforms.
 *
 * Storyboard:
 *   0–4s    full-bleed dashboard (frame 0 == homepage poster), subtle push
 *   4–10s   create trip — Paul's Birthday Weekend, Miami (real modal) + phone
 *   10–16s  trip group chat + phone
 *   16–22s  broadcasts (priority announcements) + phone
 *   22–28s  AI Concierge itinerary + phone
 *   28–34s  shared group calendar + phone
 *   34–40s  places / Basecamp + phone
 *   40–50s  quick cuts: tasks → polls → media vault → payment split (+ phones)
 *   50–56s  Pro: tour crew roster ↔ broadcasts + phone roster
 *   56–60s  finale split screen + "One app for every group trip."
 */

const FPS = 30;
export const HOMEPAGE_PRODUCT_DEMO_60_DURATION = FPS * 60; // 1800

// ── Palette (matches the marketing hero container) ─────────────────────────
const BG = '#070B1A';
const GOLD = '#c49746';
const GOLD_PALE = '#feeaa5';

const FADE = 14;

// ── Scene timing (absolute frames; sums to exactly 1800) ────────────────────
const T = {
  opening: { from: 0, dur: 120 },
  create: { from: 120, dur: 180 },
  chat: { from: 300, dur: 180 },
  broadcasts: { from: 480, dur: 180 },
  concierge: { from: 660, dur: 180 },
  calendar: { from: 840, dur: 180 },
  places: { from: 1020, dur: 180 },
  tasks: { from: 1200, dur: 75 },
  polls: { from: 1275, dur: 75 },
  media: { from: 1350, dur: 75 },
  payments: { from: 1425, dur: 75 },
  pro: { from: 1500, dur: 180 },
  finale: { from: 1680, dur: 120 },
} as const;

// ── Shared building blocks ──────────────────────────────────────────────────

const Backdrop: React.FC = () => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(circle at 28% 18%, rgba(196,151,70,0.16), transparent 55%), radial-gradient(circle at 78% 88%, rgba(83,53,23,0.28), transparent 60%), ${BG}`,
    }}
  />
);

const useSceneOpacity = (
  localFrame: number,
  dur: number,
  { fadeIn = true, fadeOut = true }: { fadeIn?: boolean; fadeOut?: boolean } = {},
): number => {
  const inO = fadeIn
    ? interpolate(localFrame, [0, FADE], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 1;
  const outO = fadeOut
    ? interpolate(localFrame, [dur - FADE, dur], [1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 1;
  return Math.min(inO, outO);
};

/** Minimal macOS-style browser chrome around a real desktop capture. */
const Browser: React.FC<{
  width: number;
  contentHeight: number;
  x?: number;
  y?: number;
  children: React.ReactNode;
}> = ({ width, contentHeight, x = 0, y = 0, children }) => {
  const TOOLBAR = 44;
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
        width,
        height: contentHeight + TOOLBAR,
        borderRadius: 18,
        overflow: 'hidden',
        boxShadow:
          '0 50px 110px rgba(0,0,0,0.7), 0 0 0 1px rgba(254,234,165,0.14), 0 0 70px rgba(196,151,70,0.14)',
      }}
    >
      <div
        style={{
          height: TOOLBAR,
          background: '#16161a',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', gap: 7 }}>
          {['#ff5f57', '#febc2e', '#28c840'].map(c => (
            <div key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c }} />
          ))}
        </div>
        <div
          style={{
            flex: 1,
            maxWidth: 420,
            margin: '0 auto',
            height: 26,
            background: '#26262b',
            borderRadius: 7,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily,
            fontSize: 14,
            fontWeight: 400,
            color: '#9a9aa2',
          }}
        >
          chravelapp.com
        </div>
        <div style={{ width: 60 }} />
      </div>
      <div style={{ width, height: contentHeight, background: BG, position: 'relative' }}>
        {children}
      </div>
    </div>
  );
};

/** Slow Ken Burns push for a real capture — gentle enough to keep text sharp. */
const Push: React.FC<{ src: string; localFrame: number; dur: number; maxScale?: number }> = ({
  src,
  localFrame,
  dur,
  maxScale = 1.03,
}) => {
  const scale = interpolate(localFrame, [0, dur], [1, maxScale], {
    extrapolateRight: 'clamp',
  });
  return (
    <Img
      src={staticFile(src)}
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        objectPosition: '50% 0%',
        transform: `scale(${scale})`,
        transformOrigin: '50% 30%',
        display: 'block',
      }}
    />
  );
};

/** Realistic iPhone frame around a real 390×844@3x PWA capture. */
const Phone: React.FC<{ src: string; width?: number; x?: number; y?: number }> = ({
  src,
  width = 310,
  x = 0,
  y = 0,
}) => {
  const BEZEL = 9;
  const STATUS = 38;
  const screenW = width - BEZEL * 2;
  const screenH = Math.round((screenW * 2532) / 1170) + STATUS;
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
        width,
        height: screenH + BEZEL * 2,
        borderRadius: 56,
        background: 'linear-gradient(135deg, #3a3a3e 0%, #1a1a1e 100%)',
        padding: BEZEL,
        boxShadow: '0 40px 90px rgba(0,0,0,0.75), 0 0 50px rgba(196,151,70,0.12)',
      }}
    >
      <div
        style={{
          width: screenW,
          height: screenH,
          borderRadius: 48,
          background: '#000',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* status bar + dynamic island over black, content starts below */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: STATUS,
            zIndex: 3,
            background: '#000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
          }}
        >
          <span style={{ fontFamily, fontSize: 13, fontWeight: 600, color: '#fff' }}>9:41</span>
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: 7,
              transform: 'translateX(-50%)',
              width: 86,
              height: 24,
              borderRadius: 13,
              background: '#0a0a0a',
              border: '1px solid #1c1c1e',
            }}
          />
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <div
              style={{
                width: 17,
                height: 10,
                borderRadius: 2.5,
                border: '1px solid rgba(255,255,255,0.5)',
                position: 'relative',
              }}
            >
              <div
                style={{ position: 'absolute', inset: 1.5, borderRadius: 1, background: '#fff' }}
              />
            </div>
          </div>
        </div>
        <Img
          src={staticFile(src)}
          style={{
            position: 'absolute',
            top: STATUS,
            left: 0,
            width: screenW,
            height: screenH - STATUS,
            objectFit: 'cover',
            objectPosition: '50% 0%',
            display: 'block',
          }}
        />
        {/* home indicator */}
        <div
          style={{
            position: 'absolute',
            bottom: 7,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 110,
            height: 5,
            borderRadius: 3,
            background: 'rgba(255,255,255,0.45)',
            zIndex: 3,
          }}
        />
      </div>
    </div>
  );
};

/** Lower-third caption pill. */
const Caption: React.FC<{ text: string; localFrame: number; dur: number }> = ({
  text,
  localFrame,
  dur,
}) => {
  const opacity = interpolate(localFrame, [6, 20, dur - 18, dur - 6], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const lift = interpolate(localFrame, [6, 24], [16, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 44,
        display: 'flex',
        justifyContent: 'center',
        opacity,
        transform: `translateY(${lift}px)`,
        zIndex: 6,
      }}
    >
      <div
        style={{
          fontFamily,
          fontWeight: 600,
          fontSize: 38,
          letterSpacing: -0.4,
          padding: '15px 34px',
          color: GOLD_PALE,
          background: 'rgba(7, 9, 17, 0.78)',
          border: `1px solid rgba(196,151,70,0.45)`,
          borderRadius: 999,
          boxShadow: '0 20px 50px rgba(0,0,0,0.55)',
        }}
      >
        {text}
      </div>
    </div>
  );
};

// ── Scenes ──────────────────────────────────────────────────────────────────

/** 0–4s: full-bleed dashboard. Frame 0 is the homepage poster frame. */
const OpeningScene: React.FC = () => {
  const f = useCurrentFrame();
  const opacity = useSceneOpacity(f, T.opening.dur, { fadeIn: false });
  const scale = interpolate(f, [0, T.opening.dur], [1, 1.045], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ opacity, background: BG }}>
      <Img
        src={staticFile('captures/desktop/dashboard.png')}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `scale(${scale})`,
          transformOrigin: '50% 38%',
          display: 'block',
        }}
      />
    </AbsoluteFill>
  );
};

/**
 * Standard feature scene: desktop capture in browser chrome on the left, the
 * same feature on the iPhone PWA on the right, caption below.
 */
const DuoScene: React.FC<{
  desktopSrc?: string;
  phoneSrc: string;
  caption: string;
  dur: number;
  /** Desktop captures: clipped tab shots are 3200×1504, full shots 3200×1800 */
  clipped?: boolean;
  /** Custom desktop content (e.g. multi-stage crossfades) instead of a single Push */
  desktopChildren?: React.ReactNode;
}> = ({ desktopSrc, phoneSrc, caption, dur, clipped = true, desktopChildren }) => {
  const f = useCurrentFrame();
  const opacity = useSceneOpacity(f, dur);
  const width = 1230;
  const contentHeight = clipped
    ? Math.round((width * 1504) / 3200)
    : Math.round((width * 1800) / 3200);
  // Phone slides in slightly after the desktop frame; quick cuts get a faster ramp.
  const quick = dur <= 90;
  const inStart = quick ? 2 : 8;
  const inEnd = quick ? 16 : 32;
  const phoneSlide = interpolate(f, [inStart, inEnd], [60, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const phoneOpacity = interpolate(f, [inStart, inEnd - 2], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{ opacity }}>
      <Backdrop />
      <Browser width={width} contentHeight={contentHeight} x={-230} y={-40}>
        {desktopChildren ?? (
          <Push src={desktopSrc as string} localFrame={f} dur={dur} maxScale={1.025} />
        )}
      </Browser>
      <div style={{ position: 'absolute', inset: 0, opacity: phoneOpacity }}>
        <Phone src={phoneSrc} width={310} x={650} y={-30 + phoneSlide} />
      </div>
      <Caption text={caption} localFrame={f} dur={dur} />
    </AbsoluteFill>
  );
};

/** 4–10s: the real Create Trip modal filling in across three captured stages. */
const CreateTripScene: React.FC = () => {
  const f = useCurrentFrame();
  const dur = T.create.dur;
  const stages = [
    'captures/desktop/create-trip-1-empty.png',
    'captures/desktop/create-trip-2-name.png',
    'captures/desktop/create-trip-3-filled.png',
  ];
  const stageDur = dur / stages.length;
  return (
    <DuoScene
      phoneSrc="captures/mobile/m-create-trip.png"
      caption="Create the trip — name, dates, cover, done"
      dur={dur}
      clipped={false}
      desktopChildren={stages.map((src, i) => {
        const start = i * stageDur;
        const o =
          i === 0
            ? interpolate(f, [start + stageDur - 10, start + stageDur], [1, 0], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              })
            : interpolate(
                f,
                [start - 10, start, start + stageDur - 10, start + stageDur],
                [0, 1, 1, i === stages.length - 1 ? 1 : 0],
                { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
              );
        return (
          <div key={src} style={{ position: 'absolute', inset: 0, opacity: o }}>
            <Push src={src} localFrame={f} dur={dur} maxScale={1.02} />
          </div>
        );
      })}
    />
  );
};

/** 50–56s: Pro trips — crew roster crossfading into role-filtered broadcasts. */
const ProScene: React.FC = () => {
  const f = useCurrentFrame();
  const dur = T.pro.dur;
  const half = dur / 2;
  const teamO = interpolate(f, [half - 8, half + 8], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <DuoScene
      phoneSrc="captures/mobile/m-pro-team.png"
      caption="Pro: roles, rosters & broadcasts for teams on tour"
      dur={dur}
      clipped={false}
      desktopChildren={
        <>
          <div style={{ position: 'absolute', inset: 0, opacity: 1 - teamO }}>
            <Push
              src="captures/desktop/pro-broadcasts.png"
              localFrame={f}
              dur={dur}
              maxScale={1.02}
            />
          </div>
          <div style={{ position: 'absolute', inset: 0, opacity: teamO }}>
            <Push src="captures/desktop/pro-team.png" localFrame={f} dur={dur} maxScale={1.02} />
          </div>
        </>
      }
    />
  );
};

/** 56–60s: split-screen finale with headline and CTA. */
const FinaleScene: React.FC = () => {
  const f = useCurrentFrame();
  const dur = T.finale.dur;
  const opacity = useSceneOpacity(f, dur, { fadeOut: false });
  const headlineO = interpolate(f, [10, 32], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const headlineY = interpolate(f, [10, 36], [22, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const ctaO = interpolate(f, [34, 56], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const width = 1080;
  const contentHeight = Math.round((width * 1800) / 3200);
  return (
    <AbsoluteFill style={{ opacity }}>
      <Backdrop />
      {/* headline + CTA */}
      <div
        style={{
          position: 'absolute',
          top: 86,
          left: 0,
          right: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 26,
          zIndex: 5,
          opacity: headlineO,
          transform: `translateY(${headlineY}px)`,
        }}
      >
        <div
          style={{
            fontFamily,
            fontWeight: 800,
            fontSize: 76,
            letterSpacing: -1.5,
            color: '#fff',
            textShadow: '0 8px 36px rgba(0,0,0,0.6)',
          }}
        >
          One app for every group trip.
        </div>
        <div
          style={{
            fontFamily,
            fontWeight: 700,
            fontSize: 32,
            color: '#0c0c0c',
            background: `linear-gradient(135deg, ${GOLD_PALE} 0%, ${GOLD} 100%)`,
            padding: '16px 42px',
            borderRadius: 999,
            boxShadow: '0 14px 44px rgba(196,151,70,0.35)',
            opacity: ctaO,
          }}
        >
          Create your first trip
        </div>
      </div>
      {/* devices */}
      <Browser width={width} contentHeight={contentHeight} x={-300} y={150}>
        <Img
          src={staticFile('captures/desktop/dashboard.png')}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </Browser>
      <Phone src="captures/mobile/m-chat.png" width={300} x={520} y={185} />
    </AbsoluteFill>
  );
};

// ── Composition ─────────────────────────────────────────────────────────────

export const HomepageProductDemo60: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: BG, fontFamily }}>
      <Sequence from={T.opening.from} durationInFrames={T.opening.dur}>
        <OpeningScene />
      </Sequence>
      <Sequence from={T.create.from} durationInFrames={T.create.dur}>
        <CreateTripScene />
      </Sequence>
      <Sequence from={T.chat.from} durationInFrames={T.chat.dur}>
        <DuoScene
          desktopSrc="captures/desktop/chat.png"
          phoneSrc="captures/mobile/m-chat.png"
          caption="One group chat per trip — plans never get buried"
          dur={T.chat.dur}
        />
      </Sequence>
      <Sequence from={T.broadcasts.from} durationInFrames={T.broadcasts.dur}>
        <DuoScene
          desktopSrc="captures/desktop/broadcasts.png"
          phoneSrc="captures/mobile/m-broadcasts.png"
          caption="Broadcasts for the updates everyone must see"
          dur={T.broadcasts.dur}
        />
      </Sequence>
      <Sequence from={T.concierge.from} durationInFrames={T.concierge.dur}>
        <DuoScene
          desktopSrc="captures/desktop/concierge.png"
          phoneSrc="captures/mobile/m-concierge.png"
          caption="AI Concierge plans with your group's context"
          dur={T.concierge.dur}
        />
      </Sequence>
      <Sequence from={T.calendar.from} durationInFrames={T.calendar.dur}>
        <DuoScene
          desktopSrc="captures/desktop/calendar.png"
          phoneSrc="captures/mobile/m-calendar.png"
          caption="One shared calendar, always in sync"
          dur={T.calendar.dur}
        />
      </Sequence>
      <Sequence from={T.places.from} durationInFrames={T.places.dur}>
        <DuoScene
          desktopSrc="captures/desktop/places.png"
          phoneSrc="captures/mobile/m-places.png"
          caption="Hotels, reservations & your group Basecamp"
          dur={T.places.dur}
        />
      </Sequence>
      <Sequence from={T.tasks.from} durationInFrames={T.tasks.dur}>
        <DuoScene
          desktopSrc="captures/desktop/tasks.png"
          phoneSrc="captures/mobile/m-tasks.png"
          caption="Assign tasks"
          dur={T.tasks.dur}
        />
      </Sequence>
      <Sequence from={T.polls.from} durationInFrames={T.polls.dur}>
        <DuoScene
          desktopSrc="captures/desktop/polls.png"
          phoneSrc="captures/mobile/m-polls.png"
          caption="Vote on plans"
          dur={T.polls.dur}
        />
      </Sequence>
      <Sequence from={T.media.from} durationInFrames={T.media.dur}>
        <DuoScene
          desktopSrc="captures/desktop/media.png"
          phoneSrc="captures/mobile/m-media.png"
          caption="Photos & files in one vault"
          dur={T.media.dur}
        />
      </Sequence>
      <Sequence from={T.payments.from} durationInFrames={T.payments.dur}>
        <DuoScene
          desktopSrc="captures/desktop/payments.png"
          phoneSrc="captures/mobile/m-payments.png"
          caption="Split costs without spreadsheets"
          dur={T.payments.dur}
        />
      </Sequence>
      <Sequence from={T.pro.from} durationInFrames={T.pro.dur}>
        <ProScene />
      </Sequence>
      <Sequence from={T.finale.from} durationInFrames={T.finale.dur}>
        <FinaleScene />
      </Sequence>
    </AbsoluteFill>
  );
};
