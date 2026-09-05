import { formatDate, formatTime } from "./datetime";

export type Slot = {
  id: string;
  starts_at: string;
  ends_at: string;
  window_id?: string | null;
  capacity?: number | null;
};

export type EventWindow = {
  id: string;
  starts_at: string;
  ends_at: string;
  slot_duration_minutes: number;
  event_id?: string;
};

export type SlotGroup<T extends Slot> = {
  key: string;
  label: string;
  items: T[];
};

export const MIN_SLOT_DURATION_MINUTES = 5;

export function generateSlots(startIso: string, endIso: string, durationMinutes: number) {
  const out: { starts_at: string; ends_at: string }[] = [];
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  const step = Math.max(MIN_SLOT_DURATION_MINUTES, Math.round(durationMinutes)) * 60 * 1000;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return out;
  for (let cur = start; cur + step <= end; cur += step) {
    out.push({
      starts_at: new Date(cur).toISOString(),
      ends_at: new Date(cur + step).toISOString(),
    });
  }
  return out;
}

/** Human readable message when a schedule cannot produce any slot, `null` when valid. */
export function validateSchedule(
  startIso: string | null,
  endIso: string | null,
  durationMinutes: number
): string | null {
  if (!startIso || !endIso) return "Veuillez renseigner la date, l'heure de début et l'heure de fin.";
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (start >= end) return "L'heure de fin doit être postérieure à l'heure de début.";
  if (!Number.isFinite(durationMinutes) || durationMinutes < MIN_SLOT_DURATION_MINUTES) {
    return `La durée d'un créneau doit être d'au moins ${MIN_SLOT_DURATION_MINUTES} minutes.`;
  }
  if (durationMinutes * 60 * 1000 > end - start) {
    return "La durée d'un créneau dépasse la plage horaire choisie.";
  }
  return null;
}

function byStart(a: Slot, b: Slot) {
  return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
}

function windowLabel(win: EventWindow): string {
  const duration = win.slot_duration_minutes ? ` — ${win.slot_duration_minutes} min` : "";
  return `${formatDate(win.starts_at)} — ${formatTime(win.starts_at)} → ${formatTime(win.ends_at)}${duration}`;
}

function inferredLabel(items: Slot[]): string {
  const first = items[0];
  const last = items[items.length - 1];
  const durMin = Math.max(
    1,
    Math.round((new Date(first.ends_at).getTime() - new Date(first.starts_at).getTime()) / 60000)
  );
  return `${formatDate(first.starts_at)} — ${formatTime(first.starts_at)} → ${formatTime(last.ends_at)} — ${durMin} min`;
}

/**
 * Groups slots by their window, falling back to a per-day grouping for slots
 * that predate windows. Groups and their slots are sorted chronologically and
 * the input array is never mutated.
 */
export function groupSlots<T extends Slot>(slots: T[], windows: EventWindow[]): SlotGroup<T>[] {
  const byWindow = new Map<string, T[]>();
  const byDay = new Map<string, T[]>();

  for (const slot of slots) {
    const bucket = slot.window_id ? byWindow : byDay;
    const key = slot.window_id ?? new Date(slot.starts_at).toDateString();
    const arr = bucket.get(key);
    if (arr) arr.push(slot);
    else bucket.set(key, [slot]);
  }

  const winById = new Map(windows.map((w) => [w.id, w] as const));

  const groups: Array<SlotGroup<T> & { startAt: number }> = [];

  for (const [winId, items] of byWindow) {
    const sorted = items.slice().sort(byStart);
    const win = winById.get(winId);
    groups.push({
      key: winId,
      label: win ? windowLabel(win) : inferredLabel(sorted),
      items: sorted,
      startAt: new Date(win ? win.starts_at : sorted[0].starts_at).getTime(),
    });
  }

  for (const [day, items] of byDay) {
    const sorted = items.slice().sort(byStart);
    groups.push({
      key: day,
      label: inferredLabel(sorted),
      items: sorted,
      startAt: new Date(sorted[0].starts_at).getTime(),
    });
  }

  return groups
    .sort((a, b) => a.startAt - b.startAt)
    .map(({ key, label, items }) => ({ key, label, items }));
}

export function remainingSeats(capacity: number | null | undefined, booked: number): number {
  return Math.max(0, Math.max(1, capacity ?? 1) - booked);
}
