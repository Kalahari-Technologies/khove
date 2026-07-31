// Human-friendly formatting shared across charts, tooltips, and widgets. The rule:
// never surface a raw ISO date like "2026-06-25" — show "25th June" (and append the
// year only when it isn't the current year, e.g. "25th June, 2026").

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** 1 → "1st", 2 → "2nd", 3 → "3rd", 4 → "4th", 11 → "11th" … */
function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/** Parse date-only strings as LOCAL time so "2026-06-25" doesn't shift a day by tz. */
function toDate(input: string | number | Date): Date {
  if (input instanceof Date) return input;
  if (typeof input === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return new Date(input);
  }
  return new Date(input);
}

/**
 * "25th June", or "25th June, 2026" when the year isn't the current one (or
 * `alwaysYear` is set). Returns the input string unchanged if it isn't a date.
 */
export function prettyDate(input: string | number | Date, opts?: { alwaysYear?: boolean }): string {
  const d = toDate(input);
  if (Number.isNaN(d.getTime())) return String(input);
  const showYear = opts?.alwaysYear || d.getFullYear() !== new Date().getFullYear();
  const base = `${ordinal(d.getDate())} ${MONTHS[d.getMonth()]}`;
  return showYear ? `${base}, ${d.getFullYear()}` : base;
}

// A plain date value on a chart axis or tooltip (YYYY-MM-DD or a full ISO stamp).
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]|$)/;

/**
 * Chart axis / tooltip label formatter: reformat values that look like dates into
 * `prettyDate`, and pass everything else (sprint names, week labels) through as-is —
 * so it's safe to hang on every chart regardless of what the x-axis holds.
 */
export function chartDateLabel(v: unknown): string {
  if (typeof v === "string" && ISO_DATE.test(v)) return prettyDate(v);
  return v == null ? "" : String(v);
}

/** Round a numeric tooltip value to at most one decimal (2.142857… → "2.1", 6 → "6"). */
export function roundTip(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  return String(Math.round(n * 10) / 10);
}
