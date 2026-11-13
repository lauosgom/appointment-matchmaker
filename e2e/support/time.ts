// Colombia time (UTC−5, no daylight saving), mirroring frontend/src/lib/datetime.ts.
const OFFSET_MS = 5 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, "0");
const shifted = (iso: string | Date) => new Date(new Date(iso).getTime() - OFFSET_MS);

/** DD/MM/YYYY, as the UI shows dates. */
export function formatDate(iso: string | Date): string {
  const d = shifted(iso);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/** HH:MM (24 h), as the UI shows times. */
export function formatTime(iso: string | Date): string {
  const d = shifted(iso);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** YYYY-MM-DD in Colombia. */
export function dayKey(iso: string | Date): string {
  const d = shifted(iso);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function colombiaYear(iso: string | Date = new Date()): string {
  return String(shifted(iso).getUTCFullYear());
}

/**
 * "YYYY-MM-DDTHH:mm" in Colombia time, `days` days from today (Colombia),
 * the value a datetime-local input takes.
 */
export function local(days: number, hour: number, minute = 0): string {
  const today = shifted(new Date());
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + days));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(hour)}:${pad(minute)}`;
}

/** Colombia "YYYY-MM-DDTHH:mm" -> ISO UTC. */
export function toIso(localValue: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(localValue);
  if (!m) throw new Error(`Bad local datetime ${localValue}`);
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  return new Date(Date.UTC(y, mo - 1, d, h, mi) + OFFSET_MS).toISOString();
}

/** A date at least `days` ahead, at `hour` Colombia time, as ISO UTC. */
export const at = (days: number, hour: number, minute = 0) => toIso(local(days, hour, minute));
