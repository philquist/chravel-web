import { format } from 'date-fns';

const toDateOnly = (date: Date, timezone?: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const d = parts.find(p => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
};

export interface BaseCampLike {
  order_index: number;
  label?: string | null;
  place_name?: string | null;
  address: string;
  google_place_id?: string | null;
  lat?: number | null;
  lng?: number | null;
  start_date?: string | null;
  end_date?: string | null;
}

export const resolveCurrentBaseCamp = (
  camps: BaseCampLike[],
  date = new Date(),
  timezone?: string,
): BaseCampLike | null => {
  if (!camps.length) return null;
  const today = toDateOnly(date, timezone);
  const ordered = [...camps].sort(
    (a, b) =>
      a.order_index - b.order_index ||
      `${a.start_date ?? ''}`.localeCompare(`${b.start_date ?? ''}`),
  );

  const active = ordered.find(c => {
    if (!c.start_date && !c.end_date) return false;
    const start = c.start_date ?? c.end_date;
    const end = c.end_date ?? c.start_date;
    if (!start || !end) return false;
    return today >= start && today <= end;
  });
  if (active) return active;

  const next = ordered.find(c => !!c.start_date && c.start_date > today);
  if (next) return next;

  return ordered[ordered.length - 1] ?? null;
};

export const formatBaseCampLabel = (camp: BaseCampLike): string => {
  const title = camp.label || camp.place_name || camp.address;
  if (!camp.start_date && !camp.end_date) return title;
  const start = camp.start_date ? format(new Date(`${camp.start_date}T00:00:00`), 'MMM d') : '?';
  const end = camp.end_date ? format(new Date(`${camp.end_date}T00:00:00`), 'MMM d') : '?';
  return `${title} · ${start}–${end}`;
};

export const toDirectionsLocation = (camp: BaseCampLike | null | undefined): string | null => {
  if (!camp) return null;
  if (camp.lat && camp.lng) return `${camp.lat},${camp.lng}`;
  if (camp.address) return camp.address;
  if (camp.google_place_id) return `place_id:${camp.google_place_id}`;
  return null;
};
