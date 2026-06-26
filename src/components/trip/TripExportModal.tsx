import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { X, Download, FileText, Crown, Check } from 'lucide-react';
import { ExportSection } from '@/types/tripExport';
import { isConsumerTrip } from '@/utils/tripTierDetector';
import { useConsumerSubscription } from '@/hooks/useConsumerSubscription';
import { usePdfExportUsage } from '@/hooks/usePdfExportUsage';
import { useVisualViewportHeight } from '@/hooks/useVisualViewportHeight';
import { useIsMobile } from '@/hooks/use-mobile';
import { Badge } from '@/components/ui/badge';
import { CONSUMER_PRICE_DISPLAY } from '@/billing/pricingDisplay';

export interface TripExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (sections: ExportSection[], signal: AbortSignal) => Promise<void>;
  tripName: string;
  tripId: string;
  tripType?: 'consumer' | 'pro' | 'event';
}

const TRIP_SECTIONS: Array<{ id: ExportSection; label: string }> = [
  { id: 'calendar', label: 'Calendar' },
  { id: 'payments', label: 'Payments' },
  { id: 'polls', label: 'Polls' },
  { id: 'places', label: 'Places & Explore Links' },
  { id: 'attachments', label: 'Attachments' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'broadcasts', label: 'Broadcasts' },
  { id: 'roster', label: 'Members' },
];

const EVENT_SECTIONS: Array<{ id: ExportSection; label: string }> = [
  { id: 'agenda', label: 'Agenda' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'broadcasts', label: 'Broadcasts' },
  { id: 'lineup', label: 'Lineup' },
  { id: 'polls', label: 'Polls' },
  { id: 'tasks', label: 'Tasks' },
];

export const TripExportModal: React.FC<TripExportModalProps> = ({
  isOpen,
  onClose,
  onExport,
  tripName,
  tripId,
  tripType,
}) => {
  const _isConsumer = isConsumerTrip(tripId);
  const { upgradeToTier, isLoading: isUpgrading } = useConsumerSubscription();
  const { recordExport, getUsageStatus, isPaidUser, canExport } = usePdfExportUsage(tripId);

  const isEvent = tripType === 'event';
  const sections = isEvent ? EVENT_SECTIONS : TRIP_SECTIONS;

  // Free users get 1 export per trip, paid users get unlimited
  const hasExportAccess = isPaidUser || canExport;

  const [selectedSections, setSelectedSections] = useState<ExportSection[]>(
    sections.map(s => s.id),
  );
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMobile = useIsMobile();
  const visualViewportHeight = useVisualViewportHeight(isOpen && isMobile);

  // Notify free users who have used up their free export — replaces the old persistent banner
  useEffect(() => {
    if (isOpen && !isPaidUser && !canExport) {
      toast.info("You've used your free export for this trip. Upgrade for unlimited recaps.");
    }
  }, [isOpen, isPaidUser, canExport]);

  const toggleSection = (sectionId: ExportSection) => {
    setSelectedSections(prev =>
      prev.includes(sectionId) ? prev.filter(id => id !== sectionId) : [...prev, sectionId],
    );
  };

  const handleExport = async () => {
    if (selectedSections.length === 0) {
      setError('Please select at least one section for your recap');
      return;
    }

    // Abort any previous in-flight export
    abortControllerRef.current?.abort();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Auto-abort after 90 seconds
    const timeoutId = setTimeout(() => {
      controller.abort(new Error('Export timed out. Please try again.'));
    }, 90_000);

    setIsExporting(true);
    setError(null);

    try {
      await onExport(selectedSections, controller.signal);
      // Record the export for free users
      if (!isPaidUser) {
        recordExport();
      }
      onClose();
    } catch (err) {
      // If the abort was triggered, surface the abort reason as the error
      if (controller.signal.aborted) {
        const reason = controller.signal.reason;
        setError(reason instanceof Error ? reason.message : 'Export timed out. Please try again.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to create trip recap');
      }
    } finally {
      clearTimeout(timeoutId);
      abortControllerRef.current = null;
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  // Free users: 1 export per trip, Paid users: unlimited
  const hasAccess = hasExportAccess;
  const _usageStatus = getUsageStatus();
  const showUpgradePrompt = !isPaidUser && !canExport;

  const headerTitle = isEvent ? 'Create Event Recap' : 'Create Trip Recap';

  const panelMaxHeight =
    isMobile && visualViewportHeight != null ? `${visualViewportHeight}px` : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-2">
      <div
        data-testid="trip-export-modal-panel"
        className="trip-export-modal-panel grid min-h-0 w-full max-w-md grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-t-2xl border border-gray-700 bg-gray-900 shadow-2xl md:max-w-xl max-h-[100dvh] sm:max-h-[calc(100dvh-2rem)] sm:rounded-xl"
        style={panelMaxHeight ? { maxHeight: panelMaxHeight } : undefined}
      >
        {/* Header — safe top inset without stacking extra padding on top of large notches */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-700/50 px-3 pb-2 pt-[max(8px,calc(env(safe-area-inset-top,0px)+6px))]">
          <div className="flex items-center gap-2">
            <div className="bg-gradient-to-br from-[#e8af48] via-[#c49746] to-[#a07a32] p-1.5 rounded-lg shadow-[0_0_8px_rgba(196,151,70,0.3)]">
              <FileText size={16} className="text-black" />
            </div>
            <h2 className="text-base font-bold gold-gradient-text">{headerTitle}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-2 -m-1 min-w-[44px] min-h-[44px] flex items-center justify-center"
            disabled={isExporting}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div
          data-testid="trip-export-modal-scroll"
          className="min-h-0 min-w-0 overflow-y-auto px-3 pt-1.5 pb-2"
          style={
            hasAccess
              ? undefined
              : { paddingBottom: 'max(16px, calc(env(safe-area-inset-bottom, 0px) + 16px))' }
          }
        >
          {/* Upgrade prompt when free export is used */}
          {showUpgradePrompt ? (
            <div className="bg-gradient-to-r from-[#c49746]/10 to-[#e8af48]/15 border border-[#c49746]/30 rounded-lg p-4 mb-3">
              <div className="flex items-center gap-2 mb-2">
                <Crown size={18} className="text-[#e8af48]" />
                <h3 className="text-sm font-semibold gold-gradient-text">
                  Upgrade for Unlimited Exports
                </h3>
              </div>
              <p className="text-gray-300 text-xs mb-3">
                You've used your free export for this trip. Upgrade to create unlimited PDF recaps
                and share your adventures with everyone!
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={() => upgradeToTier('explorer', 'monthly')}
                  disabled={isUpgrading}
                  className="flex-1 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-white px-3 py-2.5 text-sm rounded-lg transition-all disabled:opacity-50 min-h-[44px]"
                >
                  {isUpgrading
                    ? 'Processing...'
                    : `Explorer from ${CONSUMER_PRICE_DISPLAY.explorer.monthly}/mo`}
                </button>
                <button
                  onClick={() => upgradeToTier('frequent-chraveler', 'monthly')}
                  disabled={isUpgrading}
                  className="flex-1 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-white px-3 py-2.5 text-sm rounded-lg transition-all disabled:opacity-50 min-h-[44px]"
                >
                  {isUpgrading
                    ? 'Processing...'
                    : `Frequent Chraveler from ${CONSUMER_PRICE_DISPLAY['frequent-chraveler'].monthly}/mo`}
                </button>
              </div>
              <p className="text-gray-400 text-[10px] mt-2 text-center">
                💡 Tip: Check your sent messages for the PDF you already exported
              </p>
            </div>
          ) : (
            <>
              {/* Unlimited badge for paid users */}
              {isPaidUser && (
                <div className="flex items-center gap-2 mb-3 md:mb-4">
                  <Badge
                    variant="secondary"
                    className="bg-[#c49746]/20 text-[#feeaa5] text-[10px] border border-[#c49746]/30"
                  >
                    <Crown size={10} className="mr-1 text-[#e8af48]" />
                    Unlimited Exports
                  </Badge>
                </div>
              )}

              <p className="text-gray-400 text-xs mb-2 md:mb-3">Select sections to include</p>

              {/* Section Selection */}
              <div className="grid grid-cols-2 gap-1.5 mb-2 md:mb-3 md:gap-2">
                {sections.map(section => {
                  const isSelected = selectedSections.includes(section.id);
                  return (
                    <label
                      key={section.id}
                      className={`group flex items-center gap-2 rounded-lg border px-2 py-1.5 transition-all min-h-[36px] cursor-pointer focus-within:outline-none focus-within:ring-2 focus-within:ring-[#e8af48]/80 focus-within:ring-offset-2 focus-within:ring-offset-gray-900 md:min-h-[40px] md:px-2.5 ${
                        isSelected
                          ? 'bg-[#c49746]/20 border-[#c49746]/70 hover:border-[#e8af48] hover:bg-[#c49746]/25'
                          : 'bg-gray-800/60 border-gray-700/60 hover:border-gray-500 hover:bg-gray-800/90'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-all ${
                          isSelected
                            ? 'bg-gradient-to-br from-[#e8af48] via-[#c49746] to-[#a07a32] shadow-[0_0_6px_rgba(196,151,70,0.4)]'
                            : 'border border-gray-600 bg-gray-900 group-hover:border-gray-500'
                        }`}
                      >
                        {isSelected && <Check size={10} className="text-black" strokeWidth={3} />}
                      </div>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSection(section.id)}
                        className="sr-only"
                        aria-label={`Include ${section.label}`}
                      />
                      <span
                        className={`text-xs font-medium truncate ${isSelected ? 'text-white' : 'text-gray-200 group-hover:text-white'}`}
                      >
                        {section.label}
                      </span>
                    </label>
                  );
                })}
              </div>

              {error && (
                <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-2 mb-2 md:mb-3">
                  <p className="text-red-200 text-xs">{error}</p>
                </div>
              )}
              <div aria-live="assertive" aria-atomic="true" className="sr-only" role="status">
                {error ? `Export error: ${error}` : ''}
              </div>
            </>
          )}
        </div>

        {/* Footer — privacy note + actions stay pinned below the scroll region */}
        {hasAccess && (
          <div
            data-testid="trip-export-modal-footer"
            className="flex flex-shrink-0 flex-col border-t border-gray-700 bg-gray-900"
            style={{ paddingBottom: 'max(8px, calc(env(safe-area-inset-bottom, 0px) + 8px))' }}
          >
            <p className="px-3 pt-2 text-[10px] leading-snug text-gray-400">
              <span className="text-[#c49746]">🔒</span> Emails and phone numbers hidden.
            </p>
            <div className="flex items-center justify-end gap-2 px-3 py-2">
              <button
                onClick={onClose}
                disabled={isExporting}
                className="px-4 py-2 text-sm rounded-lg text-gray-300 hover:text-white transition-colors disabled:opacity-50 min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={isExporting || selectedSections.length === 0}
                className="bg-gradient-to-r from-[#e8af48] via-[#c49746] to-[#a07a32] hover:from-[#f0b850] hover:via-[#d4a74f] hover:to-[#b08a3e] text-black font-semibold px-4 py-2 text-sm rounded-lg transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] shadow-[0_0_12px_rgba(196,151,70,0.3)] hover:shadow-[0_0_16px_rgba(196,151,70,0.45)]"
              >
                {isExporting ? (
                  <>
                    <div className="h-4 w-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    Create Recap
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
