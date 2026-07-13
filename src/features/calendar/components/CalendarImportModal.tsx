import React, { useState, useCallback, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Upload,
  FileText,
  Calendar,
  MapPin,
  Clock,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Image,
  Type,
  Wand2,
  Globe,
  Link,
  Mail,
  Camera,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { findDuplicateEvents } from '@/utils/calendarImport';
import {
  parseCalendarFile,
  parseTextWithAI,
  parseURLSchedule,
  SmartParseResult,
  getFormatLabel,
} from '@/utils/calendarImportParsers';
import { calendarService, TripEvent } from '@/services/calendarService';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { tripKeys } from '@/lib/queryKeys';
import { useSmartImportDropzone } from '@/hooks/useSmartImportDropzone';
import { useModalFileDropGuard } from '@/hooks/useModalFileDropGuard';
import { validateImportUrl } from '@/features/calendar/utils/importUrlValidation';
import { SmartImportGmail } from '@/features/smart-import/components/SmartImportGmail';
import { SmartImportReview } from '@/features/smart-import/components/SmartImportReview';
import type { SmartImportCandidate } from '@/features/smart-import/types';
import { gmailAcceptedCandidatesToSmartParseResult } from '@/features/calendar/utils/gmailReservationsToCalendarParseResult';
import { normalizeCalendarCategory } from '@/constants/calendarCategories';
import { useConsumerSubscription } from '@/hooks/useConsumerSubscription';
import { useDeferredPaidAccess } from '@/hooks/useDeferredPaidAccess';
import { useFeatureFlag } from '@/lib/featureFlags';
import { useNavigate } from 'react-router-dom';
import {
  summarizeHomeAwayClassifications,
  type HomeAwayNeutral,
} from '@/features/calendar/utils/homeAwayClassification';
import {
  buildImportBatchIdempotencyKey,
  buildImportFingerprint,
} from '@/features/calendar/utils/importFingerprint';
import {
  createCalendarImportBatch,
  finalizeCalendarImportBatch,
  undoCalendarImportBatch,
} from '@/features/calendar/utils/calendarImportBatch';

interface CalendarImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tripId: string;
  existingEvents: TripEvent[];
  onImportComplete?: () => void;
  /** Pre-loaded result from background import — opens directly in preview */
  pendingResult?: SmartParseResult | null;
  /** Called when clearing a pending result */
  onClearPendingResult?: () => void;
  /** Called to start a background URL import (closes modal immediately) */
  onStartBackgroundImport?: (url: string) => void;
}

type ImportState = 'idle' | 'parsing' | 'preview' | 'importing' | 'complete' | 'review_gmail';
type HomeAwayFilter = 'all' | HomeAwayNeutral;

const buildFormatBadges = (includeGmail: boolean) => {
  const base = [
    { label: 'ICS', icon: Calendar },
    { label: 'CSV', icon: FileSpreadsheet },
    { label: 'Excel', icon: FileSpreadsheet },
    { label: 'PDF', icon: FileText },
    { label: 'Image', icon: Image },
    { label: 'URL', icon: Globe },
  ];
  return includeGmail ? [...base, { label: 'Gmail', icon: Mail }] : base;
};

const IMPORT_CONTROL_CLASS =
  'h-12 min-h-[48px] rounded-xl border-amber-500/60 hover:bg-amber-400 hover:text-black hover:border-amber-400';

function resolveSourceType(sourceFormat: SmartParseResult['sourceFormat']): string {
  switch (sourceFormat) {
    case 'gmail':
      return 'gmail_import';
    case 'ics':
    case 'csv':
    case 'excel':
    case 'url':
    case 'pdf':
    case 'image':
    case 'text':
      return 'bulk_import';
    default:
      return 'bulk_import';
  }
}

export const CalendarImportModal: React.FC<CalendarImportModalProps> = ({
  isOpen,
  onClose,
  tripId,
  existingEvents,
  onImportComplete,
  pendingResult: externalPendingResult,
  onClearPendingResult,
  onStartBackgroundImport,
}) => {
  const [state, setState] = useState<ImportState>('idle');
  const [parseResult, setParseResult] = useState<SmartParseResult | null>(null);
  const [duplicateIndices, setDuplicateIndices] = useState<Set<number>>(new Set());
  const [excludedIndices, setExcludedIndices] = useState<Set<number>>(new Set());
  const [homeAwayFilter, setHomeAwayFilter] = useState<HomeAwayFilter>('all');
  const [importProgress, setImportProgress] = useState({ imported: 0, skipped: 0, failed: 0 });
  const [importingProgress, setImportingProgress] = useState({ completed: 0, total: 0 });
  const [lastImportBatchId, setLastImportBatchId] = useState<string | null>(null);
  const [showPasteInput, setShowPasteInput] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [parsingSource, setParsingSource] = useState<'file' | 'text' | 'url' | 'gmail'>('file');
  const [gmailCandidates, setGmailCandidates] = useState<SmartImportCandidate[]>([]);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { tier, subscription, isSuperAdmin } = useConsumerSubscription();
  const gmailFlagEnabled = useFeatureFlag('gmail_smart_import', false);
  const hasPaidAccess = useDeferredPaidAccess({
    tier,
    status: subscription?.status,
    isSuperAdmin,
    active: isOpen,
  });
  const canUseGmailSmartImport = gmailFlagEnabled && hasPaidAccess;
  const formatBadges = buildFormatBadges(gmailFlagEnabled);
  const { onDragOverCapture, onDropCapture } = useModalFileDropGuard({ enabled: isOpen });

  const homeAwaySummary = useMemo(() => {
    if (!parseResult) {
      return summarizeHomeAwayClassifications([]);
    }
    return summarizeHomeAwayClassifications(
      parseResult.events.map((event, index) => ({
        title: event.title,
        location: event.location,
        description: event.description,
        explicitLabel: parseResult.eventMeta?.[index]?.homeAwayNeutral ?? null,
      })),
    );
  }, [parseResult]);

  const processParseResult = useCallback(
    (result: SmartParseResult) => {
      setParseResult(result);
      setExcludedIndices(new Set());
      setHomeAwayFilter('all');
      setLastImportBatchId(null);

      if (!result.isValid || result.events.length === 0) {
        setState('idle');
        toast.error('No events found', {
          description: result.errors[0] || 'Could not extract any calendar events from this file',
        });
        return;
      }

      const duplicates = findDuplicateEvents(
        result.events,
        existingEvents.map(e => ({
          start_time: e.start_time,
          end_time: e.end_time,
          title: e.title,
        })),
      );
      setDuplicateIndices(duplicates);
      setState('preview');
    },
    [existingEvents],
  );

  const processFile = useCallback(
    async (file: File) => {
      setParsingSource('file');
      setState('parsing');
      const result = await parseCalendarFile(file, { tripId });
      processParseResult(result);
    },
    [processParseResult, tripId],
  );

  const { getRootProps, getInputProps, isDragActive, getCameraInputProps } = useSmartImportDropzone(
    {
      onFileSelected: processFile,
      disabled: state === 'parsing' || state === 'importing' || state === 'review_gmail',
    },
  );

  const cameraInputProps = getCameraInputProps();

  const resetState = useCallback(() => {
    setState('idle');
    setParseResult(null);
    setDuplicateIndices(new Set());
    setExcludedIndices(new Set());
    setHomeAwayFilter('all');
    setImportProgress({ imported: 0, skipped: 0, failed: 0 });
    setShowPasteInput(false);
    setPasteText('');
    setUrlInput('');
    setParsingSource('file');
    setGmailCandidates([]);
    setLastImportBatchId(null);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClearPendingResult?.();
    onClose();
  }, [resetState, onClose, onClearPendingResult]);

  // Load external pending result (from background import) when modal opens
  React.useEffect(() => {
    if (
      isOpen &&
      externalPendingResult &&
      externalPendingResult.isValid &&
      externalPendingResult.events.length > 0
    ) {
      processParseResult(externalPendingResult);
    }
  }, [isOpen, externalPendingResult, processParseResult]);

  const handlePasteSubmit = useCallback(async () => {
    if (!pasteText.trim()) return;

    setParsingSource('text');
    setState('parsing');
    const result = await parseTextWithAI(pasteText.trim());
    processParseResult(result);
  }, [pasteText, processParseResult]);

  const urlValidation = validateImportUrl(urlInput);

  const handleUrlImport = useCallback(async () => {
    if (!urlValidation.isValid) return;

    // If background import handler is available, use it (close modal, import in background)
    if (onStartBackgroundImport) {
      onStartBackgroundImport(urlValidation.normalizedUrl);
      resetState();
      onClose();
      return;
    }

    // Fallback: synchronous import (kept for safety)
    setParsingSource('url');
    setState('parsing');
    const result = await parseURLSchedule(urlValidation.normalizedUrl, { tripId });
    processParseResult(result);
  }, [urlValidation, processParseResult, onStartBackgroundImport, resetState, onClose, tripId]);

  const toggleExcluded = useCallback((index: number) => {
    setExcludedIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const isIndexFilteredOut = useCallback(
    (index: number) => {
      if (homeAwayFilter === 'all') return false;
      const classification =
        homeAwaySummary.classifications[index]?.classification ?? ('unknown' as HomeAwayNeutral);
      return classification !== homeAwayFilter;
    },
    [homeAwayFilter, homeAwaySummary.classifications],
  );

  const selectedIndices = useMemo(() => {
    if (!parseResult) return [] as number[];
    return parseResult.events
      .map((_, index) => index)
      .filter(
        index =>
          !duplicateIndices.has(index) && !excludedIndices.has(index) && !isIndexFilteredOut(index),
      );
  }, [parseResult, duplicateIndices, excludedIndices, isIndexFilteredOut]);

  const invalidateCalendar = useCallback(async () => {
    try {
      await queryClient.cancelQueries({ queryKey: tripKeys.calendar(tripId) });
      await queryClient.invalidateQueries({ queryKey: tripKeys.calendar(tripId) });
    } catch (cacheError) {
      if (import.meta.env.DEV) console.warn('Failed to invalidate calendar cache:', cacheError);
    }
  }, [queryClient, tripId]);

  const handleUndoImport = useCallback(
    async (batchId: string, forceDeleteEdited = false) => {
      try {
        const result = await undoCalendarImportBatch(batchId, { forceDeleteEdited });
        await invalidateCalendar();
        if (onImportComplete) {
          try {
            await onImportComplete();
          } catch {
            // parent refresh is best-effort
          }
        }

        if (result.conflicted > 0 && !forceDeleteEdited) {
          toast.message('Some events were edited after import', {
            description: `${result.reverted} reverted · ${result.conflicted} edited left in place`,
            action: {
              label: 'Undo all',
              onClick: () => {
                void handleUndoImport(batchId, true);
              },
            },
            duration: 12000,
          });
          return;
        }

        toast.success('Import undone', {
          description: `${result.reverted} event${result.reverted !== 1 ? 's' : ''} removed`,
        });
      } catch (error) {
        toast.error('Undo failed', {
          description: error instanceof Error ? error.message : 'Could not undo this import',
        });
      }
    },
    [invalidateCalendar, onImportComplete],
  );

  const handleImport = useCallback(async () => {
    if (!parseResult) return;

    setState('importing');

    const eventsToInsert = selectedIndices.map(index => {
      const event = parseResult.events[index];
      let endTime: string | undefined;
      if (event.endTime && event.endTime.getTime() !== event.startTime.getTime()) {
        endTime = event.isAllDay
          ? new Date(
              Date.UTC(
                event.endTime.getUTCFullYear(),
                event.endTime.getUTCMonth(),
                event.endTime.getUTCDate(),
                23,
                59,
                59,
                999,
              ),
            ).toISOString()
          : event.endTime.toISOString();
      } else if (event.isAllDay) {
        const s = event.startTime;
        endTime = new Date(
          Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate(), 23, 59, 59, 999),
        ).toISOString();
      }

      const rawCategory = parseResult.eventMeta?.[index]?.eventCategory;
      const eventCategory = rawCategory ? normalizeCalendarCategory(rawCategory) : 'other';
      const isGmail = parseResult.sourceFormat === 'gmail';
      const isICS = parseResult.sourceFormat === 'ics';
      const fingerprint = buildImportFingerprint({
        title: event.title,
        startTime: event.startTime,
        endTime: event.endTime,
        location: event.location,
        sourceFormat: parseResult.sourceFormat,
        sourceUrl: parseResult.urlMeta ? urlInput || null : null,
        externalUid: event.uid,
      });
      const startIso = event.startTime.toISOString();

      return {
        trip_id: tripId,
        title: event.title,
        description: event.description,
        start_time: startIso,
        end_time: endTime,
        location: event.location,
        event_category: eventCategory,
        include_in_itinerary: true,
        is_all_day: event.isAllDay ?? false,
        source_type: resolveSourceType(parseResult.sourceFormat),
        source_data: {
          imported_from: parseResult.sourceFormat,
          original_uid: event.uid,
          import_fingerprint: fingerprint,
          home_away_neutral:
            homeAwaySummary.classifications[index]?.classification ??
            parseResult.eventMeta?.[index]?.homeAwayNeutral ??
            'unknown',
          import_snapshot: {
            title: event.title,
            start_time: startIso,
            end_time: endTime ?? null,
            location: event.location ?? null,
          },
          ...(isGmail ? { from_gmail_smart_import: true as const } : {}),
        },
        idempotency_key:
          isICS && event.uid && !event.uid.startsWith('imported-')
            ? event.uid
            : fingerprint.startsWith('uid:')
              ? event.uid
              : fingerprint,
      };
    });

    const skipped = parseResult.events.length - eventsToInsert.length;
    setImportProgress({ imported: 0, skipped, failed: 0 });
    setImportingProgress({ completed: 0, total: eventsToInsert.length });

    let imported = 0;
    let failed = 0;
    let batchId: string | null = null;

    try {
      if (eventsToInsert.length > 0) {
        const fingerprints = eventsToInsert.map(e =>
          String((e.source_data as { import_fingerprint?: string }).import_fingerprint ?? ''),
        );
        const batchKey = buildImportBatchIdempotencyKey({
          tripId,
          sourceFormat: parseResult.sourceFormat,
          sourceUrl: parseResult.sourceFormat === 'url' ? urlInput || null : null,
          eventFingerprints: fingerprints,
        });

        const batch = await createCalendarImportBatch({
          tripId,
          sourceFormat: parseResult.sourceFormat,
          sourceLabel: getFormatLabel(parseResult.sourceFormat),
          sourceUrl: parseResult.sourceFormat === 'url' ? urlInput || null : null,
          idempotencyKey: batchKey,
          warnings: parseResult.errors.slice(0, 20),
        });
        batchId = batch?.id ?? null;
        setLastImportBatchId(batchId);

        const result = await calendarService.bulkCreateEvents(
          eventsToInsert.map(event => ({
            ...event,
            import_batch_id: batchId,
          })),
          (completed, total) => {
            setImportingProgress({ completed, total });
          },
        );
        imported = result.imported;
        failed = result.failed;

        if (batchId) {
          try {
            await finalizeCalendarImportBatch(batchId, { imported, skipped, failed });
          } catch (finalizeError) {
            toast.error('Import saved, but batch tracking failed', {
              description:
                finalizeError instanceof Error
                  ? finalizeError.message
                  : 'Undo metadata may be incomplete. Try refreshing.',
            });
          }
        }
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Bulk import failed:', error);
      failed = eventsToInsert.length - imported;
      if (batchId) {
        try {
          await finalizeCalendarImportBatch(batchId, { imported, skipped, failed });
        } catch (finalizeError) {
          if (import.meta.env.DEV) {
            console.warn('Failed to finalize import batch after error:', finalizeError);
          }
        }
      }
    }

    setImportProgress({ imported, skipped, failed });
    setState('complete');

    if (imported > 0) {
      let description = `${imported} event${imported !== 1 ? 's' : ''} imported`;
      if (skipped > 0) {
        description += `, ${skipped} skipped`;
      }
      if (failed > 0) {
        description += `, ${failed} failed`;
      }
      toast.success('Import complete', {
        description,
        action:
          batchId != null
            ? {
                label: 'Undo',
                onClick: () => {
                  void handleUndoImport(batchId!);
                },
              }
            : undefined,
        duration: 12000,
      });
    } else if (skipped > 0 && failed === 0) {
      toast.info('No new events', {
        description: `All selected events were duplicates or deselected`,
      });
    } else {
      toast.error('Import failed', { description: 'No events could be imported' });
    }

    await invalidateCalendar();

    if (onImportComplete) {
      try {
        await onImportComplete();
      } catch (refreshError) {
        if (import.meta.env.DEV)
          console.warn('Failed to refresh events after import:', refreshError);
      }
    }
  }, [
    parseResult,
    selectedIndices,
    duplicateIndices,
    excludedIndices,
    tripId,
    urlInput,
    homeAwaySummary.classifications,
    onImportComplete,
    invalidateCalendar,
    handleUndoImport,
  ]);

  const eventsToImport = selectedIndices.length;
  const duplicateCount = duplicateIndices.size;
  const hasImportFailure = importProgress.imported === 0 && importProgress.failed > 0;
  const dateRangeLabel = useMemo(() => {
    if (!parseResult || parseResult.events.length === 0) return null;
    const times = parseResult.events.map(e => e.startTime.getTime()).sort((a, b) => a - b);
    const start = new Date(times[0]);
    const end = new Date(times[times.length - 1]);
    if (start.toDateString() === end.toDateString()) {
      return format(start, 'MMM d, yyyy');
    }
    return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
  }, [parseResult]);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-lg w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-hidden flex flex-col"
        onDragOverCapture={onDragOverCapture}
        onDropCapture={onDropCapture}
      >
        <DialogHeader className="pr-10 text-left">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Upload className="w-5 h-5 shrink-0" aria-hidden />
            Import Calendar Events
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain pr-1">
          {/* ── Idle State ── */}
          {state === 'idle' && (
            <div className="space-y-4">
              {/* Drop zone */}
              <div
                {...getRootProps()}
                className={cn(
                  'border-2 border-dashed rounded-xl p-4 sm:p-8 text-center transition-colors cursor-pointer',
                  'hover:border-primary/50 hover:bg-primary/5',
                  'border-border bg-muted/30',
                  isDragActive && 'border-primary ring-2 ring-primary/30 bg-primary/10',
                )}
              >
                <input {...getInputProps()} />
                <FileText className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 text-foreground/60" />
                <p className="text-sm text-foreground/70 mb-1">
                  {isDragActive
                    ? 'Drop your file here...'
                    : 'Tap to choose a file, or take a photo of a schedule'}
                </p>
                <p className="hidden sm:block text-xs text-foreground/55 mb-3">
                  Drag and drop also works on desktop
                </p>

                {/* Format badges */}
                <div className="flex flex-wrap justify-center gap-1.5 mb-4">
                  {formatBadges.map(({ label, icon: Icon }) => (
                    <span
                      key={label}
                      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted text-foreground/70"
                    >
                      <Icon className="w-3 h-3" />
                      {label}
                    </span>
                  ))}
                </div>

                <Button variant="outline" className={IMPORT_CONTROL_CLASS} type="button">
                  Choose File
                </Button>

                {/* URL import section - stop propagation so clicking doesn't open file picker */}
                <div
                  className="mt-4 pt-4 border-t border-border/50 w-full"
                  onClick={e => e.stopPropagation()}
                  onKeyDown={e => e.stopPropagation()}
                >
                  <p className="text-xs text-foreground/70 mb-2 flex items-center justify-center gap-1.5">
                    <Link className="w-3.5 h-3.5" />
                    or import from a URL
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                    <Input
                      type="url"
                      placeholder="Schedule URL (team site, tour dates…)"
                      value={urlInput}
                      onChange={e => setUrlInput(e.target.value)}
                      className="flex-1 min-w-0 text-sm rounded-xl h-12 min-h-[48px] border-amber-500/60 focus:border-amber-400"
                      aria-invalid={urlInput.trim().length > 0 && !urlValidation.isValid}
                      aria-label="Schedule URL"
                      onKeyDown={e => {
                        if (e.key === 'Enter' && urlValidation.isValid) {
                          handleUrlImport();
                        }
                      }}
                    />
                    <Button
                      variant="outline"
                      onClick={handleUrlImport}
                      disabled={!urlValidation.isValid}
                      className={cn(
                        'w-full sm:w-auto sm:shrink-0',
                        IMPORT_CONTROL_CLASS,
                        'disabled:hover:bg-transparent disabled:hover:text-current disabled:hover:border-input',
                      )}
                    >
                      <Globe className="w-4 h-4 mr-1.5" />
                      Import
                    </Button>
                  </div>
                  {urlInput.trim().length > 0 && !urlValidation.isValid && urlValidation.error && (
                    <p className="mt-2 text-xs text-destructive text-left">{urlValidation.error}</p>
                  )}
                </div>
              </div>

              {/* Camera capture — outside drop root to avoid double pickers */}
              <div className="sm:hidden">
                <input
                  {...cameraInputProps}
                  ref={node => {
                    cameraInputRef.current = node;
                    const propRef = cameraInputProps.ref;
                    if (typeof propRef === 'function') propRef(node);
                  }}
                />
                <Button
                  variant="outline"
                  className="w-full min-h-[44px]"
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <Camera className="w-4 h-4 mr-2" />
                  Take Photo of Schedule
                </Button>
              </div>

              {gmailFlagEnabled && (
                <div
                  className="rounded-xl border border-border/60 bg-muted/20 px-3 py-3 mb-1"
                  onClick={e => e.stopPropagation()}
                  onKeyDown={e => e.stopPropagation()}
                >
                  <p className="text-xs text-foreground/70 mb-2 text-center flex items-center justify-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 shrink-0" aria-hidden />
                    or scan Gmail for reservations
                  </p>
                  {canUseGmailSmartImport ? (
                    <SmartImportGmail
                      tripId={tripId}
                      onImportStarted={() => {
                        setParsingSource('gmail');
                        setState('parsing');
                      }}
                      onImportComplete={candidates => {
                        setGmailCandidates(candidates);
                        setState('review_gmail');
                      }}
                      onImportError={() => setState('idle')}
                    />
                  ) : (
                    <div className="text-center text-sm text-foreground/70 px-2 pb-2 space-y-2">
                      <p>Gmail scanning is available on Explorer and above.</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-[44px]"
                        type="button"
                        onClick={async () => {
                          const { getFeaturePaywallConfig } =
                            await import('@/components/subscription/featurePaywall');
                          const paywall = getFeaturePaywallConfig('smart_import_calendar');
                          navigate(
                            `${paywall.destination.pathname}${paywall.destination.search}`,
                            paywall.destination.state
                              ? { state: paywall.destination.state }
                              : undefined,
                          );
                        }}
                      >
                        View plans
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Paste schedule toggle */}
              <div className="flex items-center gap-3 px-1">
                <Switch
                  checked={showPasteInput}
                  onCheckedChange={setShowPasteInput}
                  id="paste-toggle"
                />
                <label
                  htmlFor="paste-toggle"
                  className="flex items-center gap-2 text-sm text-foreground/75 cursor-pointer"
                >
                  <Type className="w-4 h-4" />
                  Paste schedule text instead
                </label>
              </div>

              {showPasteInput && (
                <div className="space-y-3">
                  <Textarea
                    placeholder="Paste your schedule here — email text, itinerary, list of events..."
                    value={pasteText}
                    onChange={e => setPasteText(e.target.value)}
                    className="min-h-[120px] rounded-xl"
                  />
                  <Button
                    onClick={handlePasteSubmit}
                    disabled={!pasteText.trim()}
                    className="w-full min-h-[44px]"
                  >
                    <Wand2 className="w-4 h-4 mr-2" />
                    Extract Events with AI
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ── Parsing State ── */}
          {state === 'parsing' && (
            <div className="flex flex-col items-center justify-center py-12" role="status">
              <div className="animate-spin h-10 w-10 gold-gradient-spinner mb-4" />
              <p className="text-foreground/70 text-center px-4">
                {parsingSource === 'gmail'
                  ? 'Scanning Gmail for travel confirmations...'
                  : parsingSource === 'url'
                    ? 'Scanning website for schedule...'
                    : parsingSource === 'text'
                      ? 'AI is extracting events from text...'
                      : 'Parsing calendar file...'}
              </p>
            </div>
          )}

          {state === 'review_gmail' && (
            <div className="px-1 pb-2">
              <SmartImportReview
                candidates={gmailCandidates}
                tripId={tripId}
                onAccept={async accepted => {
                  const parsed = gmailAcceptedCandidatesToSmartParseResult(accepted);
                  if (!parsed.isValid || parsed.events.length === 0) {
                    toast.error('No calendar-ready events', {
                      description:
                        parsed.errors[0] ??
                        'Selected items did not include usable date/time fields.',
                    });
                    setGmailCandidates([]);
                    setState('idle');
                    return;
                  }
                  processParseResult(parsed);
                }}
                onCancel={() => {
                  setGmailCandidates([]);
                  setState('idle');
                }}
              />
            </div>
          )}

          {/* ── Preview State ── */}
          {state === 'preview' && parseResult && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex items-center justify-between gap-3 p-4 bg-muted/50 rounded-lg">
                <div className="min-w-0">
                  <p className="font-medium">
                    {eventsToImport} of {parseResult.events.length} event
                    {parseResult.events.length !== 1 ? 's' : ''} selected
                  </p>
                  <div className="flex items-center flex-wrap gap-2 mt-1">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                      {getFormatLabel(parseResult.sourceFormat)}
                    </span>
                    {dateRangeLabel && (
                      <span className="text-xs text-foreground/65">{dateRangeLabel}</span>
                    )}
                    {duplicateCount > 0 && (
                      <span className="text-xs text-amber-500">
                        {duplicateCount} duplicate{duplicateCount !== 1 ? 's' : ''} skipped
                      </span>
                    )}
                    {parseResult.urlMeta && parseResult.urlMeta.eventsFiltered > 0 && (
                      <span className="text-xs text-foreground/65">
                        ({parseResult.urlMeta.eventsFiltered} past event
                        {parseResult.urlMeta.eventsFiltered !== 1 ? 's' : ''} excluded)
                      </span>
                    )}
                  </div>
                </div>
                <Calendar className="w-8 h-8 text-primary shrink-0" aria-hidden />
              </div>

              {homeAwaySummary.canOfferFilter && (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Home away filter">
                  {(
                    [
                      ['all', 'All'],
                      ['home', `Home (${homeAwaySummary.homeCount})`],
                      ['away', `Away (${homeAwaySummary.awayCount})`],
                      ['neutral', `Neutral (${homeAwaySummary.neutralCount})`],
                      ['unknown', `Unknown (${homeAwaySummary.unknownCount})`],
                    ] as const
                  ).map(([value, label]) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant={homeAwayFilter === value ? 'default' : 'outline'}
                      className="min-h-[40px]"
                      onClick={() => setHomeAwayFilter(value)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              )}

              {/* Warnings */}
              {parseResult.errors.length > 0 && (
                <Card className="bg-amber-500/10 border-amber-500/30">
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-amber-500 mb-1">Warnings</p>
                        <ul className="text-foreground/70 space-y-0.5">
                          {parseResult.errors.slice(0, 5).map((error, i) => (
                            <li key={i}>{error}</li>
                          ))}
                          {parseResult.errors.length > 5 && (
                            <li>...and {parseResult.errors.length - 5} more</li>
                          )}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Event list */}
              <div className="space-y-2 max-h-[min(50vh,360px)] overflow-y-auto">
                {parseResult.events.map((event, index) => {
                  const isDuplicate = duplicateIndices.has(index);
                  const isExcluded = excludedIndices.has(index);
                  const isFiltered = isIndexFilteredOut(index);
                  const confidence = parseResult.confidenceScores?.[index];
                  const homeAway = homeAwaySummary.classifications[index]?.classification;
                  const selected = !isDuplicate && !isExcluded && !isFiltered;

                  if (homeAwayFilter !== 'all' && isFiltered && !isDuplicate) {
                    return null;
                  }

                  return (
                    <Card
                      key={`${event.uid}-${index}`}
                      className={cn(
                        'transition-opacity',
                        (isDuplicate || isExcluded || isFiltered) && 'opacity-60',
                      )}
                    >
                      <CardContent className="py-3 px-4">
                        <div className="flex items-start gap-3">
                          {!isDuplicate ? (
                            <Checkbox
                              checked={selected}
                              onCheckedChange={() => toggleExcluded(index)}
                              className="mt-1 min-h-[20px] min-w-[20px]"
                              aria-label={`Select ${event.title}`}
                            />
                          ) : (
                            <div className="w-5 shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p
                                className={cn(
                                  'font-medium truncate',
                                  isDuplicate && 'line-through',
                                )}
                              >
                                {event.title}
                              </p>
                              {isDuplicate && (
                                <span className="text-xs bg-amber-500/20 text-amber-500 px-2 py-0.5 rounded">
                                  Duplicate
                                </span>
                              )}
                              {homeAwaySummary.canOfferFilter &&
                                homeAway &&
                                homeAway !== 'unknown' && (
                                  <span className="text-xs bg-muted px-2 py-0.5 rounded capitalize text-foreground/70">
                                    {homeAway}
                                  </span>
                                )}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-sm text-foreground/65">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" />
                                {format(
                                  event.startTime,
                                  event.isAllDay ? 'MMM d, yyyy' : 'MMM d, h:mm a',
                                )}
                              </span>
                              {event.location && (
                                <span className="flex items-center gap-1 truncate">
                                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                                  <span className="truncate">{event.location}</span>
                                </span>
                              )}
                            </div>
                            {confidence !== undefined && confidence < 0.9 && (
                              <div className="mt-1">
                                <span className="text-xs text-foreground/60">
                                  Confidence: {Math.round(confidence * 100)}%
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Importing State ── */}
          {state === 'importing' && (
            <div
              className="flex flex-col items-center justify-center py-12 px-4 w-full max-w-sm mx-auto"
              role="status"
              aria-live="polite"
            >
              <div className="animate-spin h-10 w-10 gold-gradient-spinner mb-4" />
              <p className="text-foreground/70 mb-3 text-center">
                {importingProgress.total > 0
                  ? `Importing ${importingProgress.completed}/${importingProgress.total} events`
                  : `Importing ${eventsToImport} event${eventsToImport !== 1 ? 's' : ''}...`}
              </p>
              {importingProgress.total > 0 && (
                <Progress
                  value={
                    importingProgress.total > 0
                      ? (importingProgress.completed / importingProgress.total) * 100
                      : 0
                  }
                  className="w-full h-2.5 mb-2"
                />
              )}
              <p className="text-xs text-foreground/60 text-center">
                {importingProgress.total > 0 && importingProgress.completed > 0
                  ? 'Progress updates as each batch is saved'
                  : 'Starting import...'}
              </p>
            </div>
          )}

          {/* ── Complete State ── */}
          {state === 'complete' && (
            <div className="flex flex-col items-center justify-center py-12">
              {hasImportFailure ? (
                <>
                  <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
                  <p className="font-medium text-lg mb-2">Import Failed</p>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-12 h-12 text-green-500 mb-4" />
                  <p className="font-medium text-lg mb-2">Import Complete</p>
                </>
              )}
              <div className="text-sm text-foreground/70 text-center space-y-1">
                {importProgress.imported > 0 && (
                  <p>
                    {importProgress.imported} event{importProgress.imported !== 1 ? 's' : ''}{' '}
                    imported
                  </p>
                )}
                {importProgress.skipped > 0 && (
                  <p>
                    {importProgress.skipped} event{importProgress.skipped !== 1 ? 's' : ''} skipped
                  </p>
                )}
                {importProgress.failed > 0 && (
                  <p className="text-red-500">
                    {importProgress.failed} event{importProgress.failed !== 1 ? 's' : ''} failed to
                    import
                  </p>
                )}
                {lastImportBatchId && importProgress.imported > 0 && (
                  <p className="text-xs text-foreground/60 mt-2">
                    You can undo this import from the toast or below.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row gap-2 pt-4 border-t pb-[env(safe-area-inset-bottom,0px)]">
          {state === 'preview' && (
            <>
              <Button variant="outline" onClick={resetState} className="flex-1 min-h-[44px]">
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={eventsToImport === 0}
                className="flex-1 min-h-[44px]"
              >
                Import {eventsToImport} Event{eventsToImport !== 1 ? 's' : ''}
              </Button>
            </>
          )}
          {state === 'complete' && (
            <>
              {hasImportFailure && (
                <Button variant="outline" onClick={resetState} className="flex-1 min-h-[44px]">
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  Retry
                </Button>
              )}
              {lastImportBatchId && importProgress.imported > 0 && (
                <Button
                  variant="outline"
                  className="flex-1 min-h-[44px]"
                  onClick={() => void handleUndoImport(lastImportBatchId)}
                >
                  Undo import
                </Button>
              )}
              <Button onClick={handleClose} className="flex-1 min-h-[44px]">
                Done
              </Button>
            </>
          )}
          {(state === 'idle' || state === 'parsing') && (
            <Button variant="outline" onClick={handleClose} className="flex-1 min-h-[44px]">
              Cancel
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
