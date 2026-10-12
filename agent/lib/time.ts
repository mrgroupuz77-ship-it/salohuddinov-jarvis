// Time-zone aware helpers. All instants are stored in UTC (timestamptz);
// everything shown to the owner is rendered in the configured zone.

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday ... 6 = Saturday
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export const UZ_WEEKDAYS = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];
export const UZ_MONTHS = [
  "yanvar", "fevral", "mart", "aprel", "may", "iyun",
  "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr",
];

export function zonedParts(date: Date, tz: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: WEEKDAY_INDEX[parts.weekday as string] ?? 0,
  };
}

/** Offset of `tz` from UTC at `date`, in minutes (Tashkent = +300). */
export function tzOffsetMinutes(date: Date, tz: string): number {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const actual = Math.floor(date.getTime() / 60_000) * 60_000;
  return Math.round((asUtc - actual) / 60_000);
}

/** UTC instant for a wall-clock time in `tz`. */
export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, tz: string): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offset = tzOffsetMinutes(guess, tz);
  const result = new Date(guess.getTime() - offset * 60_000);
  // Re-check once for zones whose offset differs at the corrected instant (DST edges).
  const offset2 = tzOffsetMinutes(result, tz);
  return offset2 === offset ? result : new Date(guess.getTime() - offset2 * 60_000);
}

const pad = (n: number) => String(n).padStart(2, "0");

export function dateKey(date: Date, tz: string): string {
  const p = zonedParts(date, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function startOfLocalDay(date: Date, tz: string): Date {
  const p = zonedParts(date, tz);
  return zonedTimeToUtc(p.year, p.month, p.day, 0, 0, tz);
}

export function addLocalDays(date: Date, days: number, tz: string): Date {
  const p = zonedParts(date, tz);
  const base = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
  return zonedTimeToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), p.hour, p.minute, tz);
}

/** [start, end) of the local day containing `date`. */
export function dayRange(date: Date, tz: string): { start: Date; end: Date } {
  const start = startOfLocalDay(date, tz);
  const p = zonedParts(date, tz);
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  const end = zonedTimeToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0, tz);
  return { start, end };
}

/** Monday-start week containing `date`: [start, end). */
export function weekRange(date: Date, tz: string): { start: Date; end: Date } {
  const p = zonedParts(date, tz);
  const sinceMonday = (p.weekday + 6) % 7;
  const monday = new Date(Date.UTC(p.year, p.month - 1, p.day - sinceMonday));
  const nextMonday = new Date(Date.UTC(p.year, p.month - 1, p.day - sinceMonday + 7));
  return {
    start: zonedTimeToUtc(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate(), 0, 0, tz),
    end: zonedTimeToUtc(nextMonday.getUTCFullYear(), nextMonday.getUTCMonth() + 1, nextMonday.getUTCDate(), 0, 0, tz),
  };
}

/** Calendar month containing `date` shifted by `offset` months: [start, end). */
export function monthRange(date: Date, tz: string, offset = 0): { start: Date; end: Date; year: number; month: number } {
  const p = zonedParts(date, tz);
  const first = new Date(Date.UTC(p.year, p.month - 1 + offset, 1));
  const after = new Date(Date.UTC(p.year, p.month + offset, 1));
  return {
    start: zonedTimeToUtc(first.getUTCFullYear(), first.getUTCMonth() + 1, 1, 0, 0, tz),
    end: zonedTimeToUtc(after.getUTCFullYear(), after.getUTCMonth() + 1, 1, 0, 0, tz),
    year: first.getUTCFullYear(),
    month: first.getUTCMonth() + 1,
  };
}

export function isoWeekKey(date: Date, tz: string): string {
  const p = zonedParts(date, tz);
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${pad(week)}`;
}

export function formatLocal(date: Date, tz: string): string {
  const p = zonedParts(date, tz);
  return `${pad(p.day)}.${pad(p.month)}.${p.year} ${pad(p.hour)}:${pad(p.minute)}`;
}

export function formatLocalDate(date: Date, tz: string): string {
  const p = zonedParts(date, tz);
  return `${p.day}-${UZ_MONTHS[p.month - 1]}`;
}

/** Parses "HH:MM" (24h). */
export function parseHm(value: string): { hour: number; minute: number } | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return m ? { hour: Number(m[1]), minute: Number(m[2]) } : null;
}

/**
 * Detects Uzbek time expressions where AM/PM is ambiguous, e.g. "soat 3",
 * "3 da", "ertaga 5ga". Returns the ambiguous phrases (empty when clear).
 */
export function findAmbiguousTimes(text: string): string[] {
  const lower = text.toLowerCase();
  const qualifier = /(ertalab|tong|kechqurun|kechki|kechasi|tunda|tushdan keyin|kunduzi|abetdan|obeddan|pm|am)/;
  const found: string[] = [];
  const re = /(?:soat\s*)?\b([1-9]|1[0-2])(?:\s*(?:da|ga|larda|lar|:00))?\b/g;
  const timeHint = /(soat|da\b|ga\b|larda|:00)/;
  let m: RegExpExecArray | null;
  while ((m = re.exec(lower)) !== null) {
    const phrase = m[0].trim();
    if (!timeHint.test(phrase)) continue;
    const windowText = lower.slice(Math.max(0, m.index - 20), m.index + phrase.length + 20);
    if (qualifier.test(windowText)) continue;
    // Skip quantities like "3 ta", "5 kun", "2 soat davomida".
    const after = lower.slice(m.index + m[0].length, m.index + m[0].length + 8);
    if (/^\s*(ta|kun|hafta|oy|yil|soat|daqiqa|minut|marta|%)/.test(after)) continue;
    found.push(phrase);
  }
  return found;
}
