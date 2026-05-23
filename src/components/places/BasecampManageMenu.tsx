import React from 'react';
import { ChevronDown, MoreHorizontal, Plus, Check, Pencil, Trash2, Pin } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import type { BaseCampRecord } from '@/hooks/useMultiBaseCamps';

type Accent = 'gold' | 'emerald';

interface BasecampManageMenuProps {
  camps: BaseCampRecord[];
  displayedCampId: string | null;
  /** id of the camp that the date-based resolver picked (null if synthesized/no match) */
  resolvedCurrentId: string | null;
  /** id the user has pinned this session (overrides date-based) */
  pinnedCampId: string | null;
  accent: Accent;
  canManage: boolean;
  triggerLabel: string;
  onSelect: (camp: BaseCampRecord) => void;
  onEdit: (camp: BaseCampRecord) => void;
  onDelete: (camp: BaseCampRecord) => void;
  onAddAnother: () => void;
}

const accentText: Record<Accent, string> = {
  gold: 'text-gold-primary',
  emerald: 'text-emerald-300',
};

const accentBadgeBg: Record<Accent, string> = {
  gold: 'bg-gold-primary/15 text-gold-primary border-gold-primary/30',
  emerald: 'bg-emerald-900/40 text-emerald-200 border-emerald-500/30',
};

const formatDates = (start?: string | null, end?: string | null): string => {
  if (!start && !end) return 'No dates';
  if (start && end) return `${start} → ${end}`;
  return start ? `Starts ${start}` : `Until ${end}`;
};

const labelOf = (c: BaseCampRecord): string =>
  (c.label && c.label.trim()) || (c.place_name && c.place_name.trim()) || c.address;

interface CampListBodyProps {
  camps: BaseCampRecord[];
  displayedCampId: string | null;
  resolvedCurrentId: string | null;
  pinnedCampId: string | null;
  accent: Accent;
  canManage: boolean;
  onSelect: (camp: BaseCampRecord) => void;
  onEdit: (camp: BaseCampRecord) => void;
  onDelete: (camp: BaseCampRecord) => void;
  onAddAnother: () => void;
  /** Used by the mobile sheet to close itself after an action. */
  onAfterAction?: () => void;
}

const CampListBody: React.FC<CampListBodyProps> = ({
  camps,
  displayedCampId,
  resolvedCurrentId,
  pinnedCampId,
  accent,
  canManage,
  onSelect,
  onEdit,
  onDelete,
  onAddAnother,
  onAfterAction,
}) => {
  const wrap = (fn: () => void) => () => {
    fn();
    onAfterAction?.();
  };

  return (
    <div className="flex flex-col">
      {camps.length === 0 && (
        <div className="px-3 py-4 text-sm text-muted-foreground">No base camps yet.</div>
      )}

      {camps.map(camp => {
        const isDisplayed = camp.id === displayedCampId;
        const isResolvedCurrent = camp.id === resolvedCurrentId;
        const isPinned = camp.id === pinnedCampId;

        return (
          <div
            key={camp.id}
            className={`flex items-start gap-2 px-3 py-2.5 border-b border-glass-slate-border/40 last:border-b-0 ${
              isDisplayed ? 'bg-glass-slate-bg/40' : ''
            }`}
          >
            <button
              type="button"
              onClick={wrap(() => onSelect(camp))}
              className="flex-1 min-w-0 text-left min-h-[44px]"
              aria-label={`Switch to ${labelOf(camp)}`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium text-foreground truncate">{labelOf(camp)}</p>
                {isResolvedCurrent && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] border ${accentBadgeBg[accent]}`}
                  >
                    <Check size={9} />
                    Current
                  </span>
                )}
                {isPinned && !isResolvedCurrent && (
                  <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] border bg-sky-900/40 text-sky-200 border-sky-500/30">
                    <Pin size={9} />
                    Pinned
                  </span>
                )}
              </div>
              {camp.address && labelOf(camp) !== camp.address && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">{camp.address}</p>
              )}
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {formatDates(camp.start_date, camp.end_date)}
              </p>
            </button>

            {canManage && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={wrap(() => onEdit(camp))}
                  aria-label={`Edit ${labelOf(camp)}`}
                  className="p-2 rounded-md hover:bg-muted text-muted-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={wrap(() => onDelete(camp))}
                  aria-label={`Delete ${labelOf(camp)}`}
                  className="p-2 rounded-md hover:bg-red-900/30 text-red-300 min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>
        );
      })}

      {canManage && (
        <button
          type="button"
          onClick={wrap(onAddAnother)}
          className={`flex items-center gap-2 px-3 py-3 text-sm ${accentText[accent]} hover:bg-muted/40 min-h-[44px]`}
        >
          <Plus size={14} />
          Add another base camp
        </button>
      )}
    </div>
  );
};

export const BasecampManageMenu: React.FC<BasecampManageMenuProps> = props => {
  const {
    camps,
    accent,
    triggerLabel,
    canManage,
    onAddAnother,
    displayedCampId,
    resolvedCurrentId,
    pinnedCampId,
    onSelect,
    onEdit,
    onDelete,
  } = props;
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(false);

  const triggerVisual = (
    <span
      className={`inline-flex items-center gap-1 text-xs ${accentText[accent]} min-h-[44px] px-1`}
    >
      <MoreHorizontal size={14} />
      {triggerLabel}
      <ChevronDown size={14} />
    </span>
  );

  if (isMobile) {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          {triggerVisual}
        </button>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="bg-glass-slate-card border-glass-slate-border">
            <SheetHeader>
              <SheetTitle className="text-foreground">Manage base camps</SheetTitle>
            </SheetHeader>
            <div className="mt-2">
              <CampListBody
                camps={camps}
                displayedCampId={displayedCampId}
                resolvedCurrentId={resolvedCurrentId}
                pinnedCampId={pinnedCampId}
                accent={accent}
                canManage={canManage}
                onSelect={onSelect}
                onEdit={onEdit}
                onDelete={onDelete}
                onAddAnother={onAddAnother}
                onAfterAction={() => setOpen(false)}
              />
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-haspopup="menu" aria-expanded={open}>
          {triggerVisual}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[320px] max-h-[380px] overflow-y-auto bg-glass-slate-card border-glass-slate-border p-0"
      >
        <DropdownMenuLabel className="px-3 py-2 text-xs text-muted-foreground">
          Base camps for this trip
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-glass-slate-border/60" />
        <CampListBody
          camps={camps}
          displayedCampId={displayedCampId}
          resolvedCurrentId={resolvedCurrentId}
          pinnedCampId={pinnedCampId}
          accent={accent}
          canManage={canManage}
          onSelect={onSelect}
          onEdit={onEdit}
          onDelete={onDelete}
          onAddAnother={onAddAnother}
          onAfterAction={() => setOpen(false)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
