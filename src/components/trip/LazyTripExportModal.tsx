import { Suspense, lazy } from 'react';
import type { TripExportModalProps } from './TripExportModal';

const TripExportModal = lazy(async () => {
  const mod = await import('./TripExportModal');
  return { default: mod.TripExportModal };
});

export const LazyTripExportModal = (props: TripExportModalProps) => (
  <Suspense fallback={null}>
    <TripExportModal {...props} />
  </Suspense>
);
