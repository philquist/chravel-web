import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin,
  Users,
  MoreHorizontal,
  Archive,
  EyeOff,
  UserPlus,
  Trash2,
  FileDown,
  Share2,
} from 'lucide-react';
import { CardStatItem } from './ui/CardStatItem';
import { CalendarGlyph } from './ui/CalendarGlyph';
import { useShallow } from 'zustand/react/shallow';
import { EventData } from '../types/events';
import { useTripVariant } from '../contexts/TripVariantContext';
import { ArchiveConfirmDialog } from './ArchiveConfirmDialog';
import { DeleteTripConfirmDialog } from './DeleteTripConfirmDialog';
import { InviteModal } from './InviteModal';
import { ShareTripModal } from './share/ShareTripModal';
import { LazyTripExportModal } from './trip/LazyTripExportModal';
import { useToast } from '../hooks/use-toast';
import { useDeleteTrip } from '../hooks/useDeleteTrip';
import { archiveService } from '../services/archiveService';
import { useAuth } from '../hooks/useAuth';
import {
  getPeopleCountValue,
  formatPeopleCount,
  calculateDaysCount,
  calculateEventPlacesCount,
} from '../utils/tripStatsUtils';
import { useDemoTripMembersStore } from '../store/demoTripMembersStore';
import { useDemoMode } from '../hooks/useDemoMode';
import { getProTripColor } from '../utils/proTripColors';
import { getDemoTripCoverFallback } from '@/data/demoTripCoverFallbacks';
import { buildCoverBackgroundImage } from '@/utils/coverImageStyle';
import { getExportData } from '../services/tripExportDataService';
import { orderExportSections } from '../utils/exportSectionOrder';
import { ExportSection } from '../types/tripExport';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Badge } from './ui/badge';
import { buttonVariants } from './ui/button';
import { cn } from '@/lib/utils';

// Stable empty array reference - prevents infinite re-renders from Zustand selector
const EMPTY_PARTICIPANTS: Array<{ id: number | string; name: string; avatar?: string }> = [];

// Extended event type for fields that may exist on real trip objects but aren't in EventData
interface EventCardProps {
  event: EventData;
  onArchiveSuccess?: () => void;
  onHideSuccess?: () => void;
  onDeleteSuccess?: () => void;
}

export const EventCard = ({
  event,
  onArchiveSuccess,
  onHideSuccess,
  onDeleteSuccess,
}: EventCardProps) => {
  const navigate = useNavigate();
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { accentColors } = useTripVariant();
  const { isDemoMode } = useDemoMode();
  const { deleteTrip, isDeleting } = useDeleteTrip();

  // Get color for this event - uses saved color if available, otherwise deterministic fallback
  const eventColor = getProTripColor(event.id, event.card_color);
  const demoCoverFallback = isDemoMode ? getDemoTripCoverFallback(event.id) : undefined;

  // Get added members from the demo store - use stable empty array reference with shallow comparison
  const eventIdStr = event.id.toString();
  const addedDemoMembers = useDemoTripMembersStore(
    useShallow(state =>
      isDemoMode && state.addedMembers[eventIdStr]
        ? state.addedMembers[eventIdStr]
        : EMPTY_PARTICIPANTS,
    ),
  );

  // Calculate updated people count including added members
  const totalPeopleCount = React.useMemo(() => {
    let baseCount = getPeopleCountValue(event);
    // Ensure at least 1 person (creator) is counted
    if (baseCount === 0) baseCount = 1;

    return formatPeopleCount(baseCount + addedDemoMembers.length);
  }, [event, addedDemoMembers]);

  const handleViewEvent = () => {
    navigate(`/event/${event.id}`);
  };

  const handleExportPdf = useCallback(
    async (sections: ExportSection[], signal: AbortSignal) => {
      const orderedSections = orderExportSections(sections);
      const exportData = await getExportData(event.id.toString(), orderedSections);

      signal.throwIfAborted();

      const { generateClientPDF } = await import('../utils/exportPdfClient');

      const blob = await generateClientPDF(
        {
          tripId: event.id.toString(),
          tripTitle: exportData.trip.title,
          destination: exportData.trip.destination,
          dateRange: exportData.trip.dateRange,
          description: exportData.trip.description,
          calendar: exportData.calendar,
          payments: exportData.payments,
          polls: exportData.polls,
          tasks: exportData.tasks,
          places: exportData.places,
          roster: exportData.roster,
          broadcasts: exportData.broadcasts,
          attachments: exportData.attachments,
          agenda: exportData.agenda,
          lineup: exportData.lineup,
        },
        orderedSections,
      );

      signal.throwIfAborted();

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exportData.trip.title.replace(/[^a-zA-Z0-9]/g, '_')}_Recap.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    [event.id],
  );

  const handleArchiveEvent = async () => {
    try {
      await archiveService.archiveTrip(event.id.toString(), 'event');
      toast({
        title: 'Event archived',
        description: `"${event.title}" has been archived. View it in the Archived tab.`,
      });
      setShowArchiveDialog(false);
      onArchiveSuccess?.();
    } catch {
      toast({
        title: 'Failed to archive event',
        description: 'There was an error archiving your event. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleHideEvent = async () => {
    try {
      await archiveService.hideTrip(event.id.toString());
      toast({
        title: 'Event hidden',
        description: `"${event.title}" is now hidden. Enable "Show Hidden Trips" in Settings to view it.`,
      });
      onHideSuccess?.();
    } catch {
      toast({
        title: 'Failed to hide event',
        description: 'There was an error hiding your event. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteEventForMe = async () => {
    if (!user?.id) {
      toast({
        title: 'Not logged in',
        description: 'You must be logged in to manage trips.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const result = await deleteTrip(event.id.toString(), event.created_by);
      toast({
        title: result.action === 'archived' ? 'Event archived' : 'Event removed',
        description:
          result.action === 'archived'
            ? `"${event.title}" has been archived.`
            : `"${event.title}" has been removed from your account.`,
      });
      setShowDeleteDialog(false);
      onDeleteSuccess?.();
    } catch {
      toast({
        title: 'Failed to remove event',
        description: 'There was an error removing the event. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const actionButtonClass = cn(
    buttonVariants({ variant: 'ghost', size: 'sm' }),
    // Match TripCard/ProTripCard: ghost hover text would be accent-foreground (black) on glass CTAs.
    'bg-black/30 hover:bg-black/40 text-white border border-white/20 hover:border-white/30 hover:text-white active:text-white focus-visible:text-white md:min-h-[44px] md:text-sm text-xs px-3 py-2.5 md:py-3 rounded-lg md:rounded-xl',
  );

  // Build share trip data for ShareTripModal
  const shareTripData = {
    id: event.id,
    title: event.title,
    location: event.location,
    dateRange: event.dateRange,
    participants: [] as Array<{ id: number | string; name: string; avatar: string }>,
    coverPhoto: event.coverPhoto,
    peopleCount: getPeopleCountValue(event),
  };

  return (
    <div
      className={cn(
        'bg-gradient-to-br backdrop-blur-xl border border-white/15 hover:border-white/30 rounded-2xl md:rounded-3xl overflow-hidden transition-all duration-300 shadow-black/30 hover:scale-[1.02] hover:shadow-2xl relative group',
        eventColor.cardGradient,
      )}
    >
      {/* Header */}
      <div
        className={`relative h-48 bg-gradient-to-br from-${accentColors.primary}/20 to-${accentColors.secondary}/20 p-6`}
      >
        {/* Cover photo overlay if available */}
        {event.coverPhoto ? (
          <div
            className="absolute inset-0 bg-cover bg-center opacity-25"
            style={buildCoverBackgroundImage(event.coverPhoto, demoCoverFallback)}
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />

        <div className="relative z-10 flex justify-between items-start h-full">
          {/* Event Info */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col justify-end">
            <div className="flex items-center gap-2 mb-2">
              <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30">Event</Badge>
            </div>
            <h3
              className="text-lg md:text-xl font-bold text-white mb-2 line-clamp-2 md:line-clamp-1"
              title={event.title}
            >
              {event.title}
            </h3>
            <div className="flex items-center gap-2 text-white/80 mb-2 min-w-0">
              <MapPin size={16} className="gold-gradient-icon" />
              <span className="font-medium truncate" title={event.location}>
                {event.location}
              </span>
            </div>
            <div className="flex items-center gap-2 text-white/80 min-w-0">
              <span className="gold-gradient-icon inline-flex">
                <CalendarGlyph size={16} />
              </span>
              <span className="font-medium truncate" title={event.dateRange}>
                {event.dateRange}
              </span>
            </div>
          </div>

          {/* Menu Button */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="text-white/60 hover:text-white hover:bg-white/10 transition-all duration-200 p-2 rounded-xl shrink-0">
                <MoreHorizontal size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-background border-border">
              <DropdownMenuItem
                onClick={() => setShowArchiveDialog(true)}
                className="text-muted-foreground hover:text-foreground"
              >
                <Archive className="mr-2 h-4 w-4" />
                Archive Event
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleHideEvent}
                className="text-muted-foreground hover:text-foreground"
              >
                <EyeOff className="mr-2 h-4 w-4" />
                Hide Event
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowDeleteDialog(true)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete for me
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Stats Grid - icon above → number → label (bordered container for Events) */}
        <div className="grid grid-cols-3 gap-4 mb-6 bg-black/20 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
          <CardStatItem icon={Users} value={totalPeopleCount} label="People" />
          <CardStatItem
            icon={CalendarGlyph}
            value={calculateDaysCount(event.dateRange)}
            label="Days"
          />
          <CardStatItem
            icon={MapPin}
            value={
              event.placesCount != null
                ? event.placesCount > 0
                  ? event.placesCount.toString()
                  : '—'
                : calculateEventPlacesCount(event)
            }
            label="Places"
          />
        </div>

        {/* Organizer Display */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users size={16} className="gold-gradient-icon" />
              <span className="text-white font-medium">Organizer</span>
            </div>
            <span className="text-gray-300 text-sm font-medium truncate max-w-[60%] text-right">
              {event.organizer_display_name || '—'}
            </span>
          </div>
        </div>

        {/* Action Buttons - 2x2 Grid matching TripCard/ProTripCard */}
        <div className="grid grid-cols-2 gap-2 md:gap-3">
          <button onClick={() => setShowExportModal(true)} className={actionButtonClass}>
            <FileDown size={16} />
            Recap
          </button>
          <button onClick={() => setShowInviteModal(true)} className={actionButtonClass}>
            <UserPlus size={16} />
            Invite
          </button>
          <button onClick={handleViewEvent} className={actionButtonClass}>
            View Event
          </button>
          <button onClick={() => setShowShareModal(true)} className={actionButtonClass}>
            <Share2 size={16} />
            Share
          </button>
        </div>
      </div>

      <ArchiveConfirmDialog
        isOpen={showArchiveDialog}
        onClose={() => setShowArchiveDialog(false)}
        onConfirm={handleArchiveEvent}
        tripTitle={event.title}
        isArchiving={true}
      />

      <DeleteTripConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDeleteEventForMe}
        tripTitle={event.title}
        isLoading={isDeleting}
      />

      <InviteModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        tripName={event.title}
        tripId={event.id}
        tripType="event"
      />

      <LazyTripExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={handleExportPdf}
        tripName={event.title}
        tripId={event.id.toString()}
        tripType="event"
      />

      <ShareTripModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        trip={shareTripData}
      />
    </div>
  );
};
