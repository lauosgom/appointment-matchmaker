// Colombia time (UTC-5, no daylight saving) helpers. All instants are stored as ISO UTC.
const OFFSET_MS = 5 * 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, "0");

function shifted(iso: string | Date) {
  return new Date(new Date(iso).getTime() - OFFSET_MS);
}

/** DD/MM/AAAA */
export function formatDate(iso: string | Date): string {
  const d = shifted(iso);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/** HH:MM 24h */
export function formatTime(iso: string | Date): string {
  const d = shifted(iso);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function formatDateTime(iso: string | Date): string {
  return `${formatDate(iso)} ${formatTime(iso)}`;
}

/** YYYY-MM-DD in Colombia time */
export function colombiaDayKey(iso: string | Date): string {
  const d = shifted(iso);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function colombiaYear(iso: string | Date): string {
  return String(shifted(iso).getUTCFullYear());
}

/** "YYYY-MM-DDTHH:mm" entered in Colombia time -> ISO UTC */
export function fromColombiaLocal(local: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) throw new Error("Formato de fecha y hora inválido");
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  return new Date(Date.UTC(y, mo - 1, d, h, mi) + OFFSET_MS).toISOString();
}
