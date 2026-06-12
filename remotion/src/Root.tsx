import { Composition, Folder } from 'remotion';
import { ChravelLaunch } from './ChravelLaunch';
import { TripCreationFlow, TRIP_CREATION_DURATION } from './compositions/TripCreationFlow';
import { LiveSharedCalendar, LIVE_CALENDAR_DURATION } from './compositions/LiveSharedCalendar';
import { AIConciergeAction, AI_CONCIERGE_DURATION } from './compositions/AIConciergeAction';
import { PaymentSplit, PAYMENT_SPLIT_DURATION } from './compositions/PaymentSplit';
import { MediaVault, MEDIA_VAULT_DURATION } from './compositions/MediaVault';
import { PollsAndTasks, POLLS_TASKS_DURATION } from './compositions/PollsAndTasks';
import { TabNavigationHero, TAB_NAV_DURATION } from './compositions/TabNavigationHero';
import { BeforeAfterChaos, BEFORE_AFTER_DURATION } from './compositions/BeforeAfterChaos';
import { BRollOverlay, BROLL_OVERLAY_DURATION } from './compositions/BRollOverlay';
import { ProductLaunchV2, PRODUCT_LAUNCH_V2_DURATION } from './compositions/ProductLaunchV2';
import { HomepageHeroDemo, HOMEPAGE_HERO_DURATION } from './compositions/HomepageHeroDemo';
import { HomepageHeroDemo60, HOMEPAGE_HERO_60_DURATION } from './compositions/HomepageHeroDemo60';
import {
  HomepageProductDemo60,
  HOMEPAGE_PRODUCT_DEMO_60_DURATION,
} from './compositions/HomepageProductDemo60';
import { MobileAppDemo, MOBILE_DEMO_DURATION } from './compositions/MobileAppDemo';

const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;

export const RemotionRoot = () => {
  return (
    <>
      {/* 60-second homepage demo from fresh real-UI captures (desktop + iPhone PWA).
          Capture frames first: node remotion/scripts/capture-demo-frames.mjs */}
      <Composition
        id="HomepageProductDemo60"
        component={HomepageProductDemo60}
        durationInFrames={HOMEPAGE_PRODUCT_DEMO_60_DURATION}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />

      {/* 60-second product walkthrough built from REAL Tokyo Adventure screenshots */}
      <Composition
        id="HomepageHeroDemo60"
        component={HomepageHeroDemo60}
        durationInFrames={HOMEPAGE_HERO_60_DURATION}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />

      {/* Legacy homepage hero (kept for back-compat) */}
      <Composition
        id="HomepageHeroDemo"
        component={HomepageHeroDemo}
        durationInFrames={HOMEPAGE_HERO_DURATION}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />

      {/* Mobile vertical product demo (1080x1920, ~13s) */}
      <Composition
        id="MobileAppDemo"
        component={MobileAppDemo}
        durationInFrames={MOBILE_DEMO_DURATION}
        fps={FPS}
        width={1080}
        height={1920}
      />

      {/* Original launch video */}
      <Composition
        id="ChravelLaunch"
        component={ChravelLaunch}
        durationInFrames={FPS * 60}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />

      {/* Product Launch V2 — real screenshots */}
      <Composition
        id="ProductLaunchV2"
        component={ProductLaunchV2}
        durationInFrames={PRODUCT_LAUNCH_V2_DURATION}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />

      {/* B-Roll Clips */}
      <Folder name="BRoll">
        <Composition
          id="TripCreationFlow"
          component={TripCreationFlow}
          durationInFrames={TRIP_CREATION_DURATION}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />
        <Composition
          id="LiveSharedCalendar"
          component={LiveSharedCalendar}
          durationInFrames={LIVE_CALENDAR_DURATION}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />
        <Composition
          id="AIConciergeAction"
          component={AIConciergeAction}
          durationInFrames={AI_CONCIERGE_DURATION}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />
        <Composition
          id="PaymentSplit"
          component={PaymentSplit}
          durationInFrames={PAYMENT_SPLIT_DURATION}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />
        <Composition
          id="MediaVault"
          component={MediaVault}
          durationInFrames={MEDIA_VAULT_DURATION}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />
        <Composition
          id="PollsAndTasks"
          component={PollsAndTasks}
          durationInFrames={POLLS_TASKS_DURATION}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />
        <Composition
          id="TabNavigationHero"
          component={TabNavigationHero}
          durationInFrames={TAB_NAV_DURATION}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />
        <Composition
          id="BeforeAfterChaos"
          component={BeforeAfterChaos}
          durationInFrames={BEFORE_AFTER_DURATION}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />
        <Composition
          id="BRollOverlay"
          component={BRollOverlay}
          durationInFrames={BROLL_OVERLAY_DURATION}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
          defaultProps={{
            videoFile: undefined,
          }}
        />
      </Folder>
    </>
  );
};
