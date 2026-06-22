import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin,
  User,
  Users,
  MoreHorizontal,
  Archive,
  Flame,
  TrendingUp,
  EyeOff,
  FileDown,
  Trash2,
  ArrowUpDown,
} from 'lucide-react';
import { CardStatItem } from './ui/CardStatItem';
import { CalendarGlyph } from './ui/CalendarGlyph';
import { useShallow } from 'zustand/react/shallow';
import { InviteModal } from './InviteModal';
import { ShareTripModal } from './share/ShareTripModal';
import { ArchiveConfirmDialog } from './ArchiveConfirmDialog';
import { DeleteTripConfirmDialog } from './DeleteTripConfirmDialog';
import { LazyTripExportModal } from './trip/LazyTripExportModal';
import { OptimizedImage } from './OptimizedImage';
import { archiveTrip, hideTrip } from '../services/archiveService';
import { useDeleteTrip } from '../hooks/useDeleteTrip';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/use-toast';
import { Badge } from './ui/badge';
import { gamificationService } from '../services/gamificationService';
import { isConsumerTrip } from '../utils/tripTierDetector';
import { useDemoTripMembersStore } from '../store/demoTripMembersStore';
import { useDemoMode } from '../hooks/useDemoMode';
import { ExportSection } from '@/types/tripExport';
import { demoModeService } from '../services/demoModeService';
import { openOrDownloadBlob } from '../utils/download';
import { orderExportSections } from '../utils/exportSectionOrder';
import { useConsumerSubscription } from '../hooks/useConsumerSubscription';
import { calculateDaysCount } from '../utils/tripStatsUtils';
import { usePrefetchTrip } from '../hooks/usePrefetchTrip';
import { getDemoTripCoverFallback } from '@/data/demoTripCoverFallbacks';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { buttonVariants } from './ui/button';
import { cn } from '@/lib/utils';

interface Participant {
  id: number | string; // Support both numeric IDs (demo) and UUID strings (Supabase)
  name: string;
  avatar: string;
}

// Stable empty array reference - prevents infinite re-renders from Zustand selector
const EMPTY_PARTICIPANTS: Array<{ id: number | string; name: string; avatar?: string }> = [];

interface Trip {
  id: number | string;
  title: string;
  location: string;
  dateRange: string;
  participants: Participant[];
  coverPhoto?: string;
  coverDisplayMode?: 'cover' | 'contain';
  placesCount?: number;
  peopleCount?: number;
  created_by?: string;
}

// Query key constant shared with useTrips
const _TRIPS_QUERY_KEY = 'trips';

interface TripCardProps {
  trip: Trip;
  onArchiveSuccess?: () => void;
  onHideSuccess?: () => void;
  onDeleteSuccess?: () => void;
  /** When true, loads cover photo eagerly (for above-the-fold cards) */
  priority?: boolean;
  /** Render a normal-looking card in pending mode with trip actions disabled. */
  pendingApproval?: boolean;
  pendingBadgeLabel?: string;
  pendingSecondaryActionLabel?: string;
  onPendingSecondaryAction?: () => void;
  isPendingSecondaryActionLoading?: boolean;
  reorderMode?: boolean;
  onMoveTrip?: () => void;
  onExitMoveMode?: () => void;
}

export const TripCard = ({
  trip,
  onArchiveSuccess,
  onHideSuccess,
  onDeleteSuccess,
  priority = false,
  pendingApproval = false,
  pendingBadgeLabel = 'Pending Approval',
  pendingSecondaryActionLabel,
  onPendingSecondaryAction,
  isPendingSecondaryActionLoading = false,
  reorderMode = false,
  onMoveTrip,
  onExitMoveMode,
}: TripCardProps) => {
  const navigate = useNavigate();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { deleteTrip, isDeleting } = useDeleteTrip();
  const [showExportModal, setShowExportModal] = useState(false);
  const { toast } = useToast();
  const { isDemoMode } = useDemoMode();
  const { user } = useAuth();
  const { tier } = useConsumerSubscription();
  const { prefetch } = usePrefetchTrip();

  // Free users use archive-first (no hard delete) to preserve their trips
  const isFreeUser = tier === 'free';

  // Get added members from the demo store - use stable empty array reference with shallow comparison
  const tripIdStr = trip.id.toString();
  const addedDemoMembers = useDemoTripMembersStore(
    useShallow(state =>
      isDemoMode && state.addedMembers[tripIdStr]
        ? state.addedMembers[tripIdStr]
        : EMPTY_PARTICIPANTS,
    ),
  );

  // ⚡ PERFORMANCE: Prefetch trip data + JS chunks on hover/focus/touch
  // Touch prefetch fires when the finger lands — gives ~100-300ms head start
  // before the click event navigates, which is the gap users feel on mobile.
  const handlePrefetch = useCallback(() => {
    prefetch(tripIdStr);
    // Warm the TripDetail route chunk + first-visit tab chunks so navigation
    // doesn't pay download latency. import() is idempotent + cached.
    void import('@/pages/TripDetail').catch(() => {});
  }, [prefetch, tripIdStr]);

  const handleMoveModeCardClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!reorderMode) return;
      event.preventDefault();
      event.stopPropagation();
      setIsMenuOpen(false);
      onExitMoveMode?.();
    },
    [reorderMode, onExitMoveMode],
  );

  const handleViewTrip = () => {
    if (reorderMode) {
      setIsMenuOpen(false);
      onExitMoveMode?.();
      return;
    }
    if (pendingApproval) {
      toast({
        title: 'Your request is still pending approval.',
        description: 'Contact the person who invited you to help expedite approval.',
      });
      return;
    }
    navigate(`/trip/${trip.id}`);
  };

  const actionButtonClass = cn(
    buttonVariants({ variant: 'ghost', size: 'sm' }),
    // Ghost applies hover:text-accent-foreground (black in theme); keep labels white on tap/hover (mobile + desktop).
    'min-h-[44px] bg-white/5 text-white border border-white/10 hover:bg-white/10 hover:border-primary/30 hover:text-white active:text-white focus-visible:text-white disabled:opacity-50 disabled:cursor-not-allowed md:text-sm text-xs px-2 md:px-3 py-2.5 md:py-3 rounded-xl',
  );
  const secondaryActionButtonClass = cn(
    actionButtonClass,
    'flex items-center justify-center gap-1.5',
  );

  const handleArchiveTrip = async () => {
    // Demo mode: session-scoped, non-persistent archive
    if (isDemoMode) {
      demoModeService.archiveTripSession(trip.id.toString());
      toast({
        title: 'Trip archived',
        description: `"${trip.title}" has been archived. View it in the Archived tab.`,
      });
      setShowArchiveDialog(false);
      onArchiveSuccess?.();
      return;
    }

    // Authenticated mode: persist to database
    try {
      await archiveTrip(trip.id.toString(), 'consumer');
      toast({
        title: 'Trip archived',
        description: `"${trip.title}" has been archived. View it in the Archived tab.`,
      });
      setShowArchiveDialog(false);
      onArchiveSuccess?.();
    } catch {
      toast({
        title: 'Failed to archive trip',
        description: 'There was an error archiving your trip. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleHideTrip = async () => {
    // Demo mode: session-scoped, non-persistent hide
    if (isDemoMode) {
      demoModeService.hideTripSession(trip.id.toString());
      toast({
        title: 'Trip hidden',
        description: `"${trip.title}" is now hidden. Enable "Show Hidden Trips" in Settings to view it.`,
      });
      onHideSuccess?.();
      return;
    }

    // Authenticated mode: persist to database
    try {
      await hideTrip(trip.id.toString());
      toast({
        title: 'Trip hidden',
        description: `"${trip.title}" is now hidden. Enable "Show Hidden Trips" in Settings to view it.`,
      });
      onHideSuccess?.();
    } catch {
      toast({
        title: 'Failed to hide trip',
        description: 'There was an error hiding your trip. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Check if current user is the trip creator
  const isCreator = user?.id === trip.created_by;

  const handleDeleteTripForMe = async () => {
    // Demo mode: block delete with toast - demo trips are deletion-proof
    if (isDemoMode) {
      toast({
        title: 'Demo trip',
        description: 'This is a demo trip and cannot be deleted.',
      });
      setShowDeleteDialog(false);
      return;
    }

    if (!user?.id) {
      toast({
        title: 'Not logged in',
        description: 'You must be logged in to manage trips.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const result = await deleteTrip(trip.id.toString(), trip.created_by);
      toast({
        title: result.action === 'archived' ? 'Trip archived' : 'Trip removed',
        description:
          result.action === 'archived'
            ? `"${trip.title}" has been archived.`
            : `"${trip.title}" has been removed from your account.`,
      });
      setShowDeleteDialog(false);
      onDeleteSuccess?.();
    } catch {
      toast({
        title: 'Failed to remove trip',
        description: 'There was an error removing the trip. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Complete PDF export handler - same logic as in-trip export
  const handleExportPdf = useCallback(
    async (sections: ExportSection[], signal: AbortSignal) => {
      const orderedSections = orderExportSections(sections);
      const tripIdStr = trip.id.toString();
      const isNumericId = !tripIdStr.includes('-'); // UUIDs have dashes, demo IDs don't

      if (import.meta.env.DEV) {
        console.log('[TripCard Export] Starting export', {
          tripId: tripIdStr,
          isNumericId,
          isDemoMode,
          sections,
        });
      }

      toast({
        title: 'Creating Recap',
        description: `Building your trip memories for "${trip.title}"...`,
      });

      try {
        let blob: Blob;

        if (isDemoMode || isNumericId) {
          const mockCalendar = demoModeService.getMockCalendarEvents(tripIdStr);
          const mockAttachments = demoModeService.getMockAttachments(tripIdStr);
          // Demo mode - use mock data from services
          if (import.meta.env.DEV) console.log('[TripCard Export] Using demo mode data');

          const mockPayments = demoModeService.getMockPayments(tripIdStr);
          const mockPolls = demoModeService.getMockPolls(tripIdStr);
          const mockTasks = demoModeService.getMockTasks(tripIdStr);
          const mockPlaces = demoModeService.getMockPlaces(tripIdStr);

          const { generateClientPDF } = await import('../utils/exportPdfClient');
          blob = await generateClientPDF(
            {
              tripId: tripIdStr,
              tripTitle: trip.title,
              destination: trip.location,
              dateRange: trip.dateRange,
              calendar: orderedSections.includes('calendar') ? mockCalendar : undefined, // Demo trips use in-trip calendar view
              payments:
                orderedSections.includes('payments') && mockPayments.length > 0
                  ? {
                      items: mockPayments,
                      total: mockPayments.reduce((sum, p) => sum + p.amount, 0),
                      currency: mockPayments[0]?.currency || 'USD',
                    }
                  : undefined,
              polls: orderedSections.includes('polls') ? mockPolls : undefined,
              tasks: orderedSections.includes('tasks')
                ? mockTasks.map(task => ({
                    title: task.title,
                    description: task.description,
                    completed: task.completed,
                  }))
                : undefined,
              places: orderedSections.includes('places') ? mockPlaces : undefined,
              attachments: orderedSections.includes('attachments') ? mockAttachments : undefined,
            },
            orderedSections,
            { customization: { compress: true, maxItemsPerSection: 100 } },
          );
        } else {
          // Authenticated mode - fetch real data from Supabase
          if (import.meta.env.DEV)
            console.log('[TripCard Export] Fetching real data from Supabase');

          const { getExportData } = await import('../services/tripExportDataService');
          const realData = await getExportData(tripIdStr, orderedSections);

          if (!realData) {
            throw new Error('Could not fetch trip data for export');
          }

          const { generateClientPDF } = await import('../utils/exportPdfClient');
          blob = await generateClientPDF(
            {
              tripId: tripIdStr,
              tripTitle: realData.trip.title,
              destination: realData.trip.destination,
              dateRange: realData.trip.dateRange,
              description: realData.trip.description,
              calendar: realData.calendar,
              payments: realData.payments,
              polls: realData.polls,
              tasks: realData.tasks,
              places: realData.places,
              roster: realData.roster,
              attachments: realData.attachments,
            },
            orderedSections,
            { customization: { compress: true, maxItemsPerSection: 100 } },
          );
        }

        if (import.meta.env.DEV)
          console.log('[TripCard Export] PDF generated, blob size:', blob.size);

        signal.throwIfAborted();

        // Generate filename
        const sanitizedTitle = trip.title.replace(/[^a-zA-Z0-9]/g, '_');
        const filename = `Trip_${sanitizedTitle}_${Date.now()}.pdf`;

        // Download the blob
        await openOrDownloadBlob(blob, filename, { mimeType: 'application/pdf' });

        toast({
          title: 'Recap ready',
          description: `PDF downloaded: ${filename}`,
        });
      } catch (error) {
        if (signal.aborted) throw signal.reason;
        toast({
          title: 'Recap failed',
          description:
            error instanceof Error ? error.message : 'Failed to generate PDF. Please try again.',
          variant: 'destructive',
        });
        throw error; // Re-throw so TripExportModal can show error state
      }
    },
    [trip, isDemoMode, toast],
  );

  // Merge base participants with added demo members
  const allParticipants = React.useMemo(() => {
    if (!isDemoMode || addedDemoMembers.length === 0) {
      return trip.participants;
    }
    const existingIds = new Set(trip.participants.map(p => p.id.toString()));
    const newMembers = addedDemoMembers
      .filter(m => !existingIds.has(m.id.toString()))
      .map(m => ({
        id: typeof m.id === 'string' ? parseInt(m.id, 10) || 0 : (m.id as number),
        name: m.name,
        avatar: m.avatar || '',
      }));
    return [...trip.participants, ...newMembers];
  }, [trip.participants, addedDemoMembers, isDemoMode]);

  // Ensure all participants have proper avatar URLs
  const participantsWithAvatars = allParticipants.map((participant, index) => ({
    ...participant,
    avatar:
      participant.avatar ||
      `https://images.unsplash.com/photo-${1649972904349 + index}-6e44c42644a7?w=40&h=40&fit=crop&crop=face`,
  }));

  // Gamification features for consumer trips only
  const isConsumer = isConsumerTrip(trip.id.toString());
  const daysUntil = isConsumer ? gamificationService.getDaysUntilTrip(trip.id.toString()) : 0;
  const momentum = isConsumer ? gamificationService.getTripMomentum(trip.id.toString()) : 'cold';
  const demoCoverFallback = isDemoMode ? getDemoTripCoverFallback(trip.id) : undefined;
  const coverFit = trip.coverDisplayMode === 'contain' ? 'contain' : 'cover';

  return (
    <div
      className="group w-full min-w-0 bg-white/5 hover:bg-white/10 backdrop-blur-xl border border-white/15 hover:border-primary/25 rounded-2xl overflow-hidden transition-all duration-300 motion-safe:hover:-translate-y-1 shadow-enterprise hover:shadow-enterprise-md"
      onMouseEnter={handlePrefetch}
      onFocus={handlePrefetch}
      onTouchStart={handlePrefetch}
      onClickCapture={handleMoveModeCardClick}
    >
      {/* Trip Image/Header - Responsive with lazy loading */}
      <div className="trips-card-hero on-media dark-section relative bg-gradient-to-br from-gold-dark/20 via-gold-primary/10 to-transparent p-3 md:p-4 tablet:p-6">
        {trip.coverPhoto && (
          <OptimizedImage
            src={trip.coverPhoto}
            alt={`${trip.title} cover`}
            fallbackSrc={demoCoverFallback}
            lazy={!priority}
            priority={priority}
            fit={coverFit}
            showBlurBackdrop={coverFit === 'contain'}
            className="absolute inset-0 opacity-80"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent"></div>
        <div className="relative z-10 flex justify-between items-start h-full">
          <div className="flex-1 min-h-0 overflow-hidden">
            <div className="flex items-start gap-3 mb-2">
              <div className="flex-1">
                <h3
                  title={trip.title}
                  className="text-base md:text-lg tablet:text-xl font-bold tracking-tight text-white transition-all duration-300 line-clamp-2 md:line-clamp-1 md:truncate"
                >
                  {trip.title}
                </h3>
                {/* Trip Status Badges - Hidden on mobile to save space */}
                {isConsumer && (
                  <div className="hidden md:flex gap-2 mt-1 flex-wrap max-h-8 overflow-hidden">
                    {momentum === 'hot' && (
                      <Badge
                        variant="secondary"
                        className="bg-red-500/20 text-red-300 border-red-500/30"
                      >
                        <Flame size={12} className="mr-1" />
                        Hot
                      </Badge>
                    )}
                    {momentum === 'warm' && (
                      <Badge
                        variant="secondary"
                        className="bg-orange-500/20 text-orange-300 border-orange-500/30"
                      >
                        <TrendingUp size={12} className="mr-1" />
                        Active
                      </Badge>
                    )}
                    {daysUntil > 0 && daysUntil <= 7 && (
                      <Badge variant="gold" className="shadow-ring-glow">
                        {daysUntil} {daysUntil === 1 ? 'day' : 'days'} left
                      </Badge>
                    )}
                  </div>
                )}
                {pendingApproval && (
                  <div className="flex gap-2 mt-1">
                    <Badge
                      variant="secondary"
                      className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
                    >
                      {pendingBadgeLabel}
                    </Badge>
                  </div>
                )}
              </div>
            </div>
            <div className="flex min-w-0 items-center gap-2 text-white mb-1 md:mb-3 text-sm md:text-base">
              <MapPin size={14} className="md:hidden gold-gradient-icon" />
              <MapPin size={18} className="hidden md:block gold-gradient-icon" />
              <span
                title={trip.location}
                className="min-w-0 font-medium max-w-full md:max-w-[220px] md:truncate"
              >
                {trip.location}
              </span>
            </div>
            <div className="flex min-w-0 items-center gap-2 text-white text-sm md:text-base">
              <span className="md:hidden inline-flex gold-gradient-icon">
                <CalendarGlyph size={14} />
              </span>
              <span className="hidden md:inline-flex gold-gradient-icon">
                <CalendarGlyph size={18} />
              </span>
              <span
                title={trip.dateRange}
                className="min-w-0 font-medium max-w-full md:max-w-[220px] md:truncate"
              >
                {trip.dateRange}
              </span>
            </div>
          </div>
          {/* Archive menu - hidden for pending-approval cards */}
          {!pendingApproval && (
            <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  className="text-white/60 hover:text-white transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100 p-2 hover:bg-white/10 rounded-lg md:rounded-xl min-h-11 min-w-11 inline-flex items-center justify-center"
                  aria-label="Trip actions"
                >
                  <MoreHorizontal size={18} className="md:hidden" />
                  <MoreHorizontal size={20} className="hidden md:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-background border-border">
                {onMoveTrip && (
                  <>
                    <DropdownMenuItem
                      onClick={() => {
                        setIsMenuOpen(false);
                        onMoveTrip();
                      }}
                      className="text-muted-foreground hover:text-foreground min-h-11"
                    >
                      <ArrowUpDown className="mr-2 h-4 w-4" />
                      Move Trip
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem
                  onClick={() => setShowArchiveDialog(true)}
                  className="text-muted-foreground hover:text-foreground min-h-11"
                >
                  <Archive className="mr-2 h-4 w-4" />
                  Archive Trip
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleHideTrip}
                  className="text-muted-foreground hover:text-foreground min-h-11"
                >
                  <EyeOff className="mr-2 h-4 w-4" />
                  Hide Trip
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-destructive hover:text-destructive min-h-11"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete for me
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Trip Content - Responsive padding */}
      <div className="p-3 md:p-4 tablet:p-6">
        {/* Quick Stats - icon above → number → label */}
        <div className="flex justify-between items-center md:grid md:grid-cols-3 md:gap-4 mb-3 md:mb-4 tablet:mb-6">
          <CardStatItem
            icon={Users}
            value={trip.peopleCount ?? participantsWithAvatars.length}
            label="People"
          />
          <CardStatItem
            icon={CalendarGlyph}
            value={calculateDaysCount(trip.dateRange)}
            label="Days"
          />
          <CardStatItem icon={MapPin} value={trip.placesCount ?? 0} label="Places" />
        </div>

        {/* Action grid: same 4 actions at all breakpoints (md+ used to collapse to View + menu, which regressed tablet/PWA UX). */}
        <div className="grid grid-cols-2 gap-2 md:gap-3">
          <button
            type="button"
            onClick={() => {
              if (pendingApproval) return;
              setShowExportModal(true);
            }}
            disabled={pendingApproval}
            className={secondaryActionButtonClass}
          >
            <FileDown size={14} className="shrink-0 md:hidden" />
            <FileDown size={16} className="shrink-0 hidden md:inline" />
            Recap
          </button>

          <button
            type="button"
            onClick={() => {
              if (pendingApproval) return;
              setShowInviteModal(true);
            }}
            disabled={pendingApproval}
            className={secondaryActionButtonClass}
          >
            <User size={14} className="shrink-0 md:hidden" />
            <User size={16} className="shrink-0 hidden md:inline" />
            Invite
          </button>

          <button
            type="button"
            onClick={handleViewTrip}
            onMouseEnter={handlePrefetch}
            onFocus={handlePrefetch}
            onTouchStart={handlePrefetch}
            className={actionButtonClass}
            aria-label={pendingApproval ? 'View trip (pending approval)' : 'View trip'}
          >
            View
          </button>

          <button
            type="button"
            onClick={() => {
              if (pendingApproval) return;
              setShowShareModal(true);
            }}
            disabled={pendingApproval}
            className={actionButtonClass}
          >
            Share
          </button>
        </div>
        {pendingApproval && pendingSecondaryActionLabel && onPendingSecondaryAction && (
          <button
            type="button"
            onClick={onPendingSecondaryAction}
            disabled={isPendingSecondaryActionLoading}
            className="mt-3 w-full text-sm font-medium rounded-lg py-2.5 px-3 min-h-[44px] border border-border/80 bg-background/30 hover:bg-background/50 text-foreground disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isPendingSecondaryActionLoading ? 'Canceling…' : pendingSecondaryActionLabel}
          </button>
        )}
      </div>

      <InviteModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        tripName={trip.title}
        tripId={trip.id.toString()}
      />

      <ShareTripModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        trip={{
          ...trip,
          participants: participantsWithAvatars,
          peopleCount: trip.peopleCount ?? participantsWithAvatars.length,
        }}
      />

      <ArchiveConfirmDialog
        isOpen={showArchiveDialog}
        onClose={() => setShowArchiveDialog(false)}
        onConfirm={handleArchiveTrip}
        tripTitle={trip.title}
        isArchiving={true}
      />

      <DeleteTripConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDeleteTripForMe}
        tripTitle={trip.title}
        isLoading={isDeleting}
        isCreator={isCreator && !isFreeUser}
      />

      <LazyTripExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={handleExportPdf}
        tripName={trip.title}
        tripId={trip.id.toString()}
      />
    </div>
  );
};
