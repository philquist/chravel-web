import React, { useState } from 'react';
import { LogOut, FlaskConical } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDemoMode } from '@/hooks/useDemoMode';
import { ExitDemoModal } from './ExitDemoModal';

/**
 * DemoTripBar — in-layout demo affordance for trip/event detail screens.
 *
 * Rendered as a normal flex child *between* the header and the menu pills (NOT fixed/absolute),
 * so it reserves its own height and can never overlap the pills, the back button, or content.
 * The global floating <ExitDemoButton /> is suppressed on these routes (see App.tsx) to avoid
 * the previous z-50 collision. Shows only while demo mode is active.
 */
export const DemoTripBar: React.FC = () => {
  const { isDemoMode } = useDemoMode();
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);

  if (!isDemoMode) return null;

  return (
    <>
      <div className="flex-shrink-0 z-40 flex items-center justify-between gap-2 px-4 py-1.5 bg-orange-500/10 border-b border-orange-500/20">
        <div className="flex items-center gap-1.5 min-w-0">
          <FlaskConical size={12} className="flex-shrink-0 text-orange-400" />
          <span className="text-[11px] font-medium text-orange-300 truncate">
            Demo Mode — exploring sample data
          </span>
        </div>
        <button
          onClick={() => setShowModal(true)}
          aria-label="Exit demo mode"
          className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-md border border-orange-500/40 text-orange-300 text-[11px] font-medium hover:bg-orange-500/20 active:scale-95 transition-all"
        >
          <LogOut size={11} />
          <span>Exit Demo</span>
        </button>
      </div>

      <ExitDemoModal
        open={showModal}
        onOpenChange={setShowModal}
        onNavigate={() => navigate('/')}
      />
    </>
  );
};
