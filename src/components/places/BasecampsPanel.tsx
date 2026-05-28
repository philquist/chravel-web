import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { MapPin, User, Lock, Plus, Building2, Home, HelpCircle, Pin, Check } from 'lucide-react';
import { BasecampLocation } from '@/types/basecamp';
import { BasecampSelector } from '../BasecampSelector';
import { basecampService, PersonalBasecamp } from '@/services/basecampService';
import { demoModeService } from '@/services/demoModeService';
import { useAuth } from '@/hooks/useAuth';
import { getEffectiveUserId } from '@/utils/demoUser';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useBasecamp } from '@/contexts/BasecampContext';
import { useUpdateTripBasecamp, useClearTripBasecamp } from '@/hooks/useTripBasecamp';
import { personalBasecampKeys } from '@/hooks/usePersonalBasecamp';
import { toast } from 'sonner';
import { DirectionsEmbed } from './DirectionsEmbed';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  BaseCampRecord,
  useCreatePersonalBaseCamp,
  useCreateTripBaseCamp,
  useDeletePersonalBaseCamp,
  useDeleteTripBaseCamp,
  usePersonalBaseCamps,
  useTripBaseCamps,
  useUpdatePersonalBaseCamp,
  useUpdateTripBaseCamp,
} from '@/hooks/useMultiBaseCamps';
import { resolveCurrentBaseCamp } from '@/utils/baseCamps';
import { useQueryClient } from '@tanstack/react-query';
import { BasecampManageMenu } from './BasecampManageMenu';

const LOG_PREFIX = '[BasecampsPanel]';

/** Dev-only logger — stripped from production builds by the bundler's dead-code elimination. */
const devLog = (...args: unknown[]): void => {
  if (import.meta.env.DEV) {
    console.log(...args);
  }
};
const devWarn = (...args: unknown[]): void => {
  if (import.meta.env.DEV) {
    console.warn(...args);
  }
};
const devError = (...args: unknown[]): void => {
  if (import.meta.env.DEV) {
    console.error(...args);
  }
};

export interface BasecampsPanelProps {
  tripId: string;
  tripBasecamp: BasecampLocation | null;
  /** @deprecated Use is now handled internally. Kept for backward compat / parent notification. */
  onTripBasecampSet?: (basecamp: BasecampLocation) => Promise<void> | void;
  /** @deprecated Use is now handled internally. Kept for backward compat / parent notification. */
  onTripBasecampClear?: () => Promise<void> | void;
  personalBasecamp?: PersonalBasecamp | null;
  onPersonalBasecampUpdate?: (basecamp: PersonalBasecamp | null) => void;
}

const labelOfCamp = (c: BaseCampRecord): string =>
  (c.label && c.label.trim()) || (c.place_name && c.place_name.trim()) || c.address;

const recordToLocation = (c: BaseCampRecord): BasecampLocation => ({
  address: c.address,
  name: c.label || c.place_name || undefined,
  type: 'hotel',
  coordinates: c.lat && c.lng ? { lat: c.lat, lng: c.lng } : undefined,
  startDate: c.start_date ?? undefined,
  endDate: c.end_date ?? undefined,
});

const legacyTripToSynthetic = (
  tripId: string,
  legacy: BasecampLocation | null,
): BaseCampRecord | null => {
  if (!legacy?.address) return null;
  return {
    id: 'legacy-trip',
    trip_id: tripId,
    address: legacy.address,
    label: legacy.name ?? null,
    place_name: legacy.name ?? null,
    lat: legacy.coordinates?.lat ?? null,
    lng: legacy.coordinates?.lng ?? null,
    start_date: legacy.startDate ?? null,
    end_date: legacy.endDate ?? null,
    order_index: 0,
  };
};

const legacyPersonalToSynthetic = (
  tripId: string,
  legacy: PersonalBasecamp | null,
): BaseCampRecord | null => {
  if (!legacy?.address) return null;
  return {
    id: `legacy-personal-${legacy.id ?? 'current'}`,
    trip_id: tripId,
    address: legacy.address,
    label: legacy.name ?? null,
    place_name: legacy.name ?? null,
    lat: legacy.latitude ?? null,
    lng: legacy.longitude ?? null,
    start_date: null,
    end_date: null,
    order_index: 0,
  };
};

export const BasecampsPanel: React.FC<BasecampsPanelProps> = ({
  tripId,
  tripBasecamp,
  onTripBasecampSet,
  onTripBasecampClear,
  personalBasecamp: externalPersonalBasecamp,
  onPersonalBasecampUpdate,
}) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isDemoMode } = useDemoMode();
  const { clearBasecamp } = useBasecamp();

  // ─── Mutations ─────────────────────────────────────────────────────────
  const updateTripBasecampMutation = useUpdateTripBasecamp(tripId);
  const clearTripBasecampMutation = useClearTripBasecamp(tripId);
  const createTripBaseCamp = useCreateTripBaseCamp(tripId);
  const updateTripBaseCamp = useUpdateTripBaseCamp(tripId);
  const deleteTripBaseCamp = useDeleteTripBaseCamp(tripId);
  const createPersonalBaseCamp = useCreatePersonalBaseCamp(tripId);
  const updatePersonalBaseCamp = useUpdatePersonalBaseCamp(tripId);
  const deletePersonalBaseCamp = useDeletePersonalBaseCamp(tripId);
  const { data: tripBaseCampRows = [] } = useTripBaseCamps(tripId);
  const { data: personalBaseCampRows = [] } = usePersonalBaseCamps(tripId);

  // ─── Local UI state ────────────────────────────────────────────────────
  const [internalPersonalBasecamp, setInternalPersonalBasecamp] = useState<PersonalBasecamp | null>(
    null,
  );
  const [showTripSelector, setShowTripSelector] = useState(false);
  const [showPersonalSelector, setShowPersonalSelector] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingTripCamp, setEditingTripCamp] = useState<BaseCampRecord | null>(null);
  const [editingPersonalCamp, setEditingPersonalCamp] = useState<BaseCampRecord | null>(null);
  const [pinnedTripCampId, setPinnedTripCampId] = useState<string | null>(null);
  const [pinnedPersonalCampId, setPinnedPersonalCampId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<null | {
    scope: 'trip' | 'personal';
    camp: BaseCampRecord;
  }>(null);

  // Use external state if provided, otherwise use internal state
  const personalBasecamp =
    externalPersonalBasecamp !== undefined ? externalPersonalBasecamp : internalPersonalBasecamp;
  const setPersonalBasecamp = onPersonalBasecampUpdate || setInternalPersonalBasecamp;

  const effectiveUserId = getEffectiveUserId(user?.id);

  // Load personal basecamp (only if not provided externally)
  useEffect(() => {
    if (externalPersonalBasecamp !== undefined) {
      setLoading(false);
      return;
    }

    const loadPersonalBasecamp = async () => {
      setLoading(true);
      try {
        if (isDemoMode) {
          const sessionBasecamp = demoModeService.getSessionPersonalBasecamp(
            tripId,
            effectiveUserId,
          );
          setInternalPersonalBasecamp(sessionBasecamp);
        } else if (user) {
          const dbBasecamp = await basecampService.getPersonalBasecamp(tripId, user.id);
          setInternalPersonalBasecamp(dbBasecamp);
        } else {
          setInternalPersonalBasecamp(null);
        }
      } catch (error) {
        devError('Failed to load personal basecamp:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPersonalBasecamp();
  }, [tripId, user, isDemoMode, effectiveUserId, externalPersonalBasecamp]);

  // ─── Derived: combined trip camps (multi-table preferred, legacy fallback) ───
  const tripCamps = useMemo<BaseCampRecord[]>(() => {
    if (tripBaseCampRows.length > 0) return tripBaseCampRows;
    const synthetic = legacyTripToSynthetic(tripId, tripBasecamp);
    return synthetic ? [synthetic] : [];
  }, [tripBaseCampRows, tripBasecamp, tripId]);

  const personalCamps = useMemo<BaseCampRecord[]>(() => {
    if (personalBaseCampRows.length > 0) return personalBaseCampRows;
    const synthetic = legacyPersonalToSynthetic(tripId, personalBasecamp ?? null);
    return synthetic ? [synthetic] : [];
  }, [personalBaseCampRows, personalBasecamp, tripId]);

  // Date-resolved "current" — only meaningful when rows have date ranges
  const resolvedTripCurrent = useMemo(
    () => resolveCurrentBaseCamp(tripCamps, new Date()),
    [tripCamps],
  );
  const resolvedPersonalCurrent = useMemo(
    () => resolveCurrentBaseCamp(personalCamps, new Date()),
    [personalCamps],
  );

  // Displayed camp = pinned override > date-resolved > first row
  const displayedTripCamp = useMemo<BaseCampRecord | null>(() => {
    const pinned = tripCamps.find(c => c.id === pinnedTripCampId);
    if (pinned) return pinned;
    if (resolvedTripCurrent) return resolvedTripCurrent as BaseCampRecord;
    return tripCamps[0] ?? null;
  }, [tripCamps, pinnedTripCampId, resolvedTripCurrent]);

  const displayedPersonalCamp = useMemo<BaseCampRecord | null>(() => {
    const pinned = personalCamps.find(c => c.id === pinnedPersonalCampId);
    if (pinned) return pinned;
    if (resolvedPersonalCurrent) return resolvedPersonalCurrent as BaseCampRecord;
    return personalCamps[0] ?? null;
  }, [personalCamps, pinnedPersonalCampId, resolvedPersonalCurrent]);

  const resolvedTripCurrentId = (resolvedTripCurrent as BaseCampRecord | null)?.id ?? null;
  const resolvedPersonalCurrentId = (resolvedPersonalCurrent as BaseCampRecord | null)?.id ?? null;

  /**
   * Trip basecamp SET handler — preserves dual-write to legacy column for backward compat
   * while routing the canonical record into the multi-table.
   */
  const handleTripBasecampSet = useCallback(
    async (newBasecamp: BasecampLocation) => {
      devLog(LOG_PREFIX, 'handleTripBasecampSet called:', {
        tripId,
        address: newBasecamp.address,
        editingId: editingTripCamp?.id,
      });

      try {
        // 1) Multi-table write (canonical going forward)
        if (editingTripCamp && !editingTripCamp.id.startsWith('legacy')) {
          await updateTripBaseCamp.mutateAsync({
            id: editingTripCamp.id,
            address: newBasecamp.address,
            label: newBasecamp.name ?? null,
            place_name: newBasecamp.name ?? null,
            lat: newBasecamp.coordinates?.lat ?? null,
            lng: newBasecamp.coordinates?.lng ?? null,
            start_date: newBasecamp.startDate ?? null,
            end_date: newBasecamp.endDate ?? null,
          });
        } else {
          await createTripBaseCamp.mutateAsync({
            address: newBasecamp.address,
            label: newBasecamp.name ?? null,
            place_name: newBasecamp.name ?? null,
            lat: newBasecamp.coordinates?.lat ?? null,
            lng: newBasecamp.coordinates?.lng ?? null,
            start_date: newBasecamp.startDate ?? null,
            end_date: newBasecamp.endDate ?? null,
          });
        }

        // 2) Legacy single-column write (best-effort, never blocks)
        try {
          await updateTripBasecampMutation.mutateAsync({
            name: newBasecamp.name,
            address: newBasecamp.address,
            latitude: newBasecamp.coordinates?.lat,
            longitude: newBasecamp.coordinates?.lng,
          });
        } catch (legacyError) {
          devWarn(LOG_PREFIX, 'Legacy single-column write failed (non-blocking):', legacyError);
        }

        toast.success(editingTripCamp ? 'Base camp updated' : 'Base camp added');
        setShowTripSelector(false);
        setEditingTripCamp(null);

        // Parent notification (best-effort)
        if (onTripBasecampSet) {
          try {
            await Promise.resolve(onTripBasecampSet(newBasecamp));
          } catch (notifyError) {
            devWarn(LOG_PREFIX, 'Parent onTripBasecampSet notification failed:', notifyError);
          }
        }
      } catch (mutationError) {
        devError(
          LOG_PREFIX,
          'Multi-table save failed, trying direct service fallback:',
          mutationError,
        );

        // Last-resort fallback: legacy direct service
        try {
          const result = await basecampService.setTripBasecamp(tripId, {
            name: newBasecamp.name,
            address: newBasecamp.address,
            latitude: newBasecamp.coordinates?.lat,
            longitude: newBasecamp.coordinates?.lng,
          });
          if (result.success) {
            setShowTripSelector(false);
            setEditingTripCamp(null);
            toast.success('Trip base camp saved');
          } else {
            toast.error(result.error || 'Failed to save trip base camp. Please try again.');
          }
        } catch (fallbackError) {
          devError(LOG_PREFIX, 'Both multi-table and direct fallback failed:', fallbackError);
          toast.error('Failed to save trip base camp. Please try again.');
        }
      }
    },
    [
      tripId,
      editingTripCamp,
      updateTripBaseCamp,
      createTripBaseCamp,
      updateTripBasecampMutation,
      onTripBasecampSet,
    ],
  );

  /**
   * Trip basecamp CLEAR handler — clears the displayed camp.
   * If multi-table rows exist, deletes the displayed row. Otherwise, falls back
   * to clearing the legacy single-column value.
   */
  const handleTripBasecampClear = useCallback(async () => {
    devLog(LOG_PREFIX, 'handleTripBasecampClear called');

    try {
      if (isDemoMode) {
        demoModeService.clearSessionTripBasecamp(tripId);
        clearBasecamp();
        toast.success('Trip base camp cleared');
        return;
      }

      const target = editingTripCamp ?? displayedTripCamp;

      if (target && !target.id.startsWith('legacy')) {
        await deleteTripBaseCamp.mutateAsync(target.id);
      }

      // Always also clear legacy column so single-column readers stay consistent
      // until they migrate to multi-table reads.
      try {
        await clearTripBasecampMutation.mutateAsync();
      } catch (legacyError) {
        devWarn(LOG_PREFIX, 'Legacy clear failed (non-blocking):', legacyError);
      }

      clearBasecamp();
      setShowTripSelector(false);
      setEditingTripCamp(null);

      if (onTripBasecampClear) {
        try {
          await Promise.resolve(onTripBasecampClear());
        } catch {
          // best-effort
        }
      }
    } catch (error) {
      devError(LOG_PREFIX, 'Failed to clear trip base camp:', error);
      toast.error('Failed to clear trip base camp');
    }
  }, [
    isDemoMode,
    tripId,
    editingTripCamp,
    displayedTripCamp,
    deleteTripBaseCamp,
    clearTripBasecampMutation,
    clearBasecamp,
    onTripBasecampClear,
  ]);

  const handlePersonalBasecampSet = useCallback(
    async (location: BasecampLocation) => {
      try {
        // Multi-table write
        if (editingPersonalCamp && !editingPersonalCamp.id.startsWith('legacy')) {
          await updatePersonalBaseCamp.mutateAsync({
            id: editingPersonalCamp.id,
            address: location.address,
            label: location.name ?? null,
            place_name: location.name ?? null,
            start_date: location.startDate ?? null,
            end_date: location.endDate ?? null,
          });
        } else if (user) {
          await createPersonalBaseCamp.mutateAsync({
            address: location.address,
            label: location.name ?? null,
            place_name: location.name ?? null,
            start_date: location.startDate ?? null,
            end_date: location.endDate ?? null,
          });
        }

        // Legacy single-column write (for demo mode this is the only path, and for
        // authenticated users it keeps single-column readers in sync until removal)
        let savedBasecamp: PersonalBasecamp | null = null;
        if (isDemoMode) {
          savedBasecamp = demoModeService.setSessionPersonalBasecamp({
            trip_id: tripId,
            user_id: effectiveUserId,
            name: location.name,
            address: location.address,
            latitude: undefined,
            longitude: undefined,
            type: location.type,
            confirmation_number: location.confirmationNumber,
          });
        } else if (user) {
          savedBasecamp = await basecampService.upsertPersonalBasecamp({
            trip_id: tripId,
            name: location.name,
            address: location.address,
            latitude: undefined,
            longitude: undefined,
            type: location.type,
            confirmation_number: location.confirmationNumber,
          });
        }

        if (savedBasecamp) {
          setPersonalBasecamp(savedBasecamp);
          queryClient.setQueryData(
            personalBasecampKeys.tripUser(tripId, effectiveUserId),
            savedBasecamp,
          );
        }

        toast.success(
          editingPersonalCamp ? 'Personal base camp updated' : 'Personal base camp added',
        );
        setShowPersonalSelector(false);
        setEditingPersonalCamp(null);
      } catch (error) {
        devError(LOG_PREFIX, 'Failed to set personal basecamp:', error);
        toast.error('Failed to save personal base camp. Please try again.');
      }
    },
    [
      editingPersonalCamp,
      isDemoMode,
      tripId,
      effectiveUserId,
      user,
      updatePersonalBaseCamp,
      createPersonalBaseCamp,
      queryClient,
      setPersonalBasecamp,
    ],
  );

  const handlePersonalBasecampClear = useCallback(async () => {
    try {
      const target = editingPersonalCamp ?? displayedPersonalCamp;

      if (target && !target.id.startsWith('legacy')) {
        await deletePersonalBaseCamp.mutateAsync(target.id);
      }

      if (isDemoMode) {
        demoModeService.deleteSessionPersonalBasecamp(tripId, effectiveUserId);
        setPersonalBasecamp(null);
        queryClient.setQueryData(personalBasecampKeys.tripUser(tripId, effectiveUserId), null);
      } else if (user && personalBasecamp) {
        const success = await basecampService.deletePersonalBasecamp(personalBasecamp.id);
        if (success) {
          setPersonalBasecamp(null);
          queryClient.setQueryData(personalBasecampKeys.tripUser(tripId, effectiveUserId), null);
        }
      }

      setShowPersonalSelector(false);
      setEditingPersonalCamp(null);
    } catch (error) {
      devError(LOG_PREFIX, 'Failed to delete personal basecamp:', error);
      toast.error('Failed to delete personal base camp. Please try again.');
    }
  }, [
    editingPersonalCamp,
    displayedPersonalCamp,
    deletePersonalBaseCamp,
    isDemoMode,
    tripId,
    effectiveUserId,
    user,
    personalBasecamp,
    queryClient,
    setPersonalBasecamp,
  ]);

  // ─── Menu callbacks ─────────────────────────────────────────────────────
  const handleSwitchTripCamp = useCallback(
    (camp: BaseCampRecord) => {
      setPinnedTripCampId(camp.id);
      const isResolvedCurrent = resolvedTripCurrentId === camp.id;
      toast.success(
        isResolvedCurrent ? 'Showing the current base camp' : `Switched to ${labelOfCamp(camp)}`,
      );
    },
    [resolvedTripCurrentId],
  );

  const handleSwitchPersonalCamp = useCallback(
    (camp: BaseCampRecord) => {
      setPinnedPersonalCampId(camp.id);
      const isResolvedCurrent = resolvedPersonalCurrentId === camp.id;
      toast.success(
        isResolvedCurrent ? 'Showing the current base camp' : `Switched to ${labelOfCamp(camp)}`,
      );
    },
    [resolvedPersonalCurrentId],
  );

  const handleEditTripCamp = useCallback((camp: BaseCampRecord) => {
    setEditingTripCamp(camp);
    setShowTripSelector(true);
  }, []);

  const handleEditPersonalCamp = useCallback((camp: BaseCampRecord) => {
    setEditingPersonalCamp(camp);
    setShowPersonalSelector(true);
  }, []);

  const handleDeleteTripCamp = useCallback((camp: BaseCampRecord) => {
    setConfirmDelete({ scope: 'trip', camp });
  }, []);

  const handleDeletePersonalCamp = useCallback((camp: BaseCampRecord) => {
    setConfirmDelete({ scope: 'personal', camp });
  }, []);

  const handleAddAnotherTrip = useCallback(() => {
    setEditingTripCamp(null);
    setShowTripSelector(true);
  }, []);

  const handleAddAnotherPersonal = useCallback(() => {
    setEditingPersonalCamp(null);
    setShowPersonalSelector(true);
  }, []);

  const performConfirmedDelete = useCallback(async () => {
    if (!confirmDelete) return;
    const { scope, camp } = confirmDelete;
    try {
      if (camp.id.startsWith('legacy')) {
        // Legacy synthetic row → clear the legacy single-column source
        if (scope === 'trip') {
          await handleTripBasecampClear();
        } else {
          await handlePersonalBasecampClear();
        }
      } else if (scope === 'trip') {
        await deleteTripBaseCamp.mutateAsync(camp.id);
        toast.success('Base camp deleted');
      } else {
        await deletePersonalBaseCamp.mutateAsync(camp.id);
        toast.success('Base camp deleted');
      }

      // Clear any session pin that referenced the deleted row.
      if (scope === 'trip' && pinnedTripCampId === camp.id) setPinnedTripCampId(null);
      if (scope === 'personal' && pinnedPersonalCampId === camp.id) setPinnedPersonalCampId(null);
    } catch (error) {
      devError(LOG_PREFIX, 'Delete failed:', error);
      toast.error('Failed to delete base camp');
    } finally {
      setConfirmDelete(null);
    }
  }, [
    confirmDelete,
    deleteTripBaseCamp,
    deletePersonalBaseCamp,
    pinnedTripCampId,
    pinnedPersonalCampId,
    handleTripBasecampClear,
    handlePersonalBasecampClear,
  ]);

  // Legacy-shape compat for DirectionsEmbed (which still reads the prop types).
  const directionsTripCamp: BasecampLocation | null = displayedTripCamp
    ? {
        address: displayedTripCamp.address,
        name: displayedTripCamp.label ?? displayedTripCamp.place_name ?? undefined,
        type: 'hotel',
        coordinates:
          displayedTripCamp.lat && displayedTripCamp.lng
            ? { lat: displayedTripCamp.lat, lng: displayedTripCamp.lng }
            : undefined,
      }
    : null;

  const directionsPersonalCamp: PersonalBasecamp | null = displayedPersonalCamp
    ? {
        id: displayedPersonalCamp.id,
        trip_id: tripId,
        user_id: effectiveUserId,
        name: displayedPersonalCamp.label || displayedPersonalCamp.place_name || undefined,
        address: displayedPersonalCamp.address,
        latitude: displayedPersonalCamp.lat ?? undefined,
        longitude: displayedPersonalCamp.lng ?? undefined,
        type:
          personalBasecamp?.type ??
          ((personalCamps.length === 1 && personalBasecamp?.type) || 'hotel'),
        confirmation_number: personalBasecamp?.confirmation_number ?? undefined,
        created_at: personalBasecamp?.created_at ?? new Date().toISOString(),
        updated_at: personalBasecamp?.updated_at ?? new Date().toISOString(),
      }
    : null;

  const tripHasManyCamps = tripBaseCampRows.length > 1;
  const personalHasManyCamps = personalBaseCampRows.length > 1;

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-4 ">
        {/* Trip Base Camp Card */}
        <div className="rounded-xl bg-glass-slate-card border border-glass-slate-border shadow-enterprise-lg overflow-hidden">
          <div className="p-2.5">
            {displayedTripCamp ? (
              <>
                <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <MapPin size={16} className="text-gold-primary flex-shrink-0" />
                    <h3 className="text-foreground font-semibold text-sm md:text-base truncate">
                      Trip Base Camp
                    </h3>
                    {tripHasManyCamps && (
                      <span className="text-[10px] text-muted-foreground">
                        {tripBaseCampRows.length} camps
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {tripCamps.length > 0 && (
                      <BasecampManageMenu
                        camps={tripCamps}
                        displayedCampId={displayedTripCamp.id}
                        resolvedCurrentId={resolvedTripCurrentId}
                        pinnedCampId={pinnedTripCampId}
                        accent="gold"
                        canManage={true}
                        triggerLabel={tripHasManyCamps ? 'Manage' : 'Manage'}
                        onSelect={handleSwitchTripCamp}
                        onEdit={handleEditTripCamp}
                        onDelete={handleDeleteTripCamp}
                        onAddAnother={handleAddAnotherTrip}
                      />
                    )}
                    <button
                      onClick={() => {
                        setEditingTripCamp(displayedTripCamp);
                        setShowTripSelector(true);
                      }}
                      aria-label="Edit trip base camp"
                      className="bg-muted/60 hover:bg-muted text-muted-foreground px-3 py-2 rounded-lg transition-colors text-sm border border-border min-h-[44px] flex items-center"
                    >
                      Edit
                    </button>
                  </div>
                </div>

                <div className="bg-glass-slate-bg/50 rounded-lg p-2.5 border border-glass-slate-border/50">
                  <div className="flex items-center gap-3">
                    <MapPin size={18} className="text-sky-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {(displayedTripCamp.label || displayedTripCamp.place_name) && (
                          <p className="text-foreground font-semibold text-base md:text-lg truncate">
                            {displayedTripCamp.label || displayedTripCamp.place_name}
                          </p>
                        )}
                        {pinnedTripCampId === displayedTripCamp.id &&
                          resolvedTripCurrentId !== displayedTripCamp.id && (
                            <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] bg-sky-900/40 text-sky-200 border border-sky-500/30">
                              <Pin size={9} />
                              Pinned
                            </span>
                          )}
                        {resolvedTripCurrentId === displayedTripCamp.id && tripHasManyCamps && (
                          <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] bg-gold-primary/15 text-gold-primary border border-gold-primary/30">
                            <Check size={9} />
                            Current
                          </span>
                        )}
                      </div>
                      <p className="text-muted-foreground text-base md:text-lg break-words">
                        {displayedTripCamp.address}
                      </p>
                      {(displayedTripCamp.start_date || displayedTripCamp.end_date) && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {displayedTripCamp.start_date && displayedTripCamp.end_date
                            ? `${displayedTripCamp.start_date} → ${displayedTripCamp.end_date}`
                            : displayedTripCamp.start_date
                              ? `Starts ${displayedTripCamp.start_date}`
                              : `Until ${displayedTripCamp.end_date}`}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <MapPin size={16} className="text-gold-primary flex-shrink-0" />
                  <h3 className="text-foreground font-semibold text-sm md:text-base">
                    Trip Base Camp
                  </h3>
                </div>
                <p className="text-gray-400 text-xs mb-2">
                  No basecamp set. Set one so the group can align meetups & recs.
                </p>
                <button
                  onClick={() => {
                    setEditingTripCamp(null);
                    setShowTripSelector(true);
                  }}
                  aria-label="Set trip base camp"
                  className="w-full bg-gray-800/80 text-white cta-gold-ring py-1.5 px-3 rounded-lg transition-all flex items-center justify-center gap-2 text-xs font-medium min-h-[44px] hover:opacity-90 hover:scale-[1.01] active:scale-[0.99]"
                >
                  <Plus size={12} />
                  Set Trip Base Camp
                </button>
              </>
            )}
          </div>
        </div>

        {/* Personal Base Camp Card */}
        <div className="rounded-xl bg-glass-slate-card border border-glass-slate-border shadow-enterprise-lg overflow-hidden">
          <div className="p-2.5">
            {loading ? (
              <div className="animate-pulse">
                <div className="h-5 bg-muted/60 rounded mb-2 w-1/2"></div>
                <div className="h-12 bg-muted/60 rounded"></div>
              </div>
            ) : displayedPersonalCamp ? (
              <>
                <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <User size={16} className="text-emerald-400 flex-shrink-0" />
                    <h3 className="text-foreground font-semibold text-sm md:text-base truncate">
                      Personal Base Camp
                    </h3>
                    <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs bg-emerald-900/40 text-emerald-200 border border-emerald-500/30">
                      <Lock size={8} />
                      Private
                    </span>
                    {personalHasManyCamps && (
                      <span className="text-[10px] text-muted-foreground">
                        {personalBaseCampRows.length} stays
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {personalCamps.length > 0 && (
                      <BasecampManageMenu
                        camps={personalCamps}
                        displayedCampId={displayedPersonalCamp.id}
                        resolvedCurrentId={resolvedPersonalCurrentId}
                        pinnedCampId={pinnedPersonalCampId}
                        accent="emerald"
                        canManage={true}
                        triggerLabel="Manage"
                        onSelect={handleSwitchPersonalCamp}
                        onEdit={handleEditPersonalCamp}
                        onDelete={handleDeletePersonalCamp}
                        onAddAnother={handleAddAnotherPersonal}
                      />
                    )}
                    <button
                      onClick={() => {
                        setEditingPersonalCamp(displayedPersonalCamp);
                        setShowPersonalSelector(true);
                      }}
                      aria-label="Edit personal base camp"
                      className="bg-muted/60 hover:bg-muted text-muted-foreground px-3 py-2 rounded-lg transition-colors text-sm border border-border min-h-[44px] flex items-center"
                    >
                      Edit
                    </button>
                  </div>
                </div>

                <div className="bg-glass-slate-bg/50 rounded-lg p-2.5 border border-glass-slate-border/50">
                  <div className="flex items-center gap-3">
                    <MapPin size={18} className="text-emerald-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {(displayedPersonalCamp.label || displayedPersonalCamp.place_name) && (
                          <p className="text-foreground font-semibold text-base md:text-lg truncate">
                            {displayedPersonalCamp.label || displayedPersonalCamp.place_name}
                          </p>
                        )}
                        {pinnedPersonalCampId === displayedPersonalCamp.id &&
                          resolvedPersonalCurrentId !== displayedPersonalCamp.id && (
                            <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] bg-sky-900/40 text-sky-200 border border-sky-500/30">
                              <Pin size={9} />
                              Pinned
                            </span>
                          )}
                        {resolvedPersonalCurrentId === displayedPersonalCamp.id &&
                          personalHasManyCamps && (
                            <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] bg-emerald-900/40 text-emerald-200 border border-emerald-500/30">
                              <Check size={9} />
                              Current
                            </span>
                          )}
                      </div>
                      <p className="text-muted-foreground text-base md:text-lg break-words">
                        {displayedPersonalCamp.address}
                      </p>
                      {(displayedPersonalCamp.start_date || displayedPersonalCamp.end_date) && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {displayedPersonalCamp.start_date && displayedPersonalCamp.end_date
                            ? `${displayedPersonalCamp.start_date} → ${displayedPersonalCamp.end_date}`
                            : displayedPersonalCamp.start_date
                              ? `Starts ${displayedPersonalCamp.start_date}`
                              : `Until ${displayedPersonalCamp.end_date}`}
                        </p>
                      )}
                      {personalBasecamp && (
                        <span className="inline-flex items-center gap-1 mt-1 text-xs text-gray-400">
                          {personalBasecamp.type === 'hotel' ? (
                            <>
                              <Building2 size={10} /> Hotel
                            </>
                          ) : personalBasecamp.type === 'short-term' ? (
                            <>
                              <Home size={10} /> Short-term Rental
                            </>
                          ) : (
                            <>
                              <HelpCircle size={10} /> Other
                            </>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <User size={16} className="text-emerald-400 flex-shrink-0" />
                  <h3 className="text-foreground font-semibold text-sm md:text-base">
                    Personal Base Camp
                  </h3>
                  <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs bg-emerald-900/40 text-emerald-200 border border-emerald-500/30">
                    <Lock size={8} />
                    Private
                  </span>
                </div>
                <p className="text-gray-400 text-xs mb-2">
                  Add the location of your accommodations. Only you can see this.
                </p>
                <button
                  onClick={() => {
                    setEditingPersonalCamp(null);
                    setShowPersonalSelector(true);
                  }}
                  aria-label="Set your personal base camp location"
                  className="w-full bg-gray-800/80 text-white cta-gold-ring py-1.5 px-3 rounded-lg transition-all flex items-center justify-center gap-2 text-xs font-medium min-h-[44px] hover:opacity-90 hover:scale-[1.01] active:scale-[0.99]"
                >
                  <Plus size={12} />
                  Set Your Location
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Directions Embed - Below basecamp cards */}
      <div className="mt-2 lg:mt-4">
        <DirectionsEmbed
          tripId={tripId}
          tripBasecamp={directionsTripCamp}
          personalBasecamp={directionsPersonalCamp}
        />
      </div>

      {/* Basecamp Selectors */}
      {showTripSelector && (
        <BasecampSelector
          isOpen={showTripSelector}
          onClose={() => {
            setShowTripSelector(false);
            setEditingTripCamp(null);
          }}
          onBasecampSet={handleTripBasecampSet}
          onBasecampClear={handleTripBasecampClear}
          currentBasecamp={editingTripCamp ? recordToLocation(editingTripCamp) : undefined}
        />
      )}
      {showPersonalSelector && (
        <BasecampSelector
          isOpen={showPersonalSelector}
          onClose={() => {
            setShowPersonalSelector(false);
            setEditingPersonalCamp(null);
          }}
          onBasecampSet={handlePersonalBasecampSet}
          onBasecampClear={handlePersonalBasecampClear}
          currentBasecamp={editingPersonalCamp ? recordToLocation(editingPersonalCamp) : undefined}
          isPersonal
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={open => {
          if (!open) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete base camp?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete
                ? `"${labelOfCamp(confirmDelete.camp)}" will be removed. This cannot be undone.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={performConfirmedDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
