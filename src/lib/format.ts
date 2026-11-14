// Date formatting with a fixed locale and time zone, so server-rendered HTML and the
// browser always agree (no hydration mismatch) and staff see shop-local times.
const LOCALE = "en-IN";
const TIME_ZONE = "Asia/Kolkata";

const dateFmt = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: TIME_ZONE,
});
const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: TIME_ZONE,
});
const shortDateFmt = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  timeZone: TIME_ZONE,
});

const toDate = (d: Date | string) => (typeof d === "string" ? new Date(d) : d);

export const formatDate = (d: Date | string) => dateFmt.format(toDate(d));
export const formatDateTime = (d: Date | string) => dateTimeFmt.format(toDate(d));
export const formatShortDate = (d: Date | string) => shortDateFmt.format(toDate(d));

/** "just now", "5 min ago", "3 h ago", "2 d ago", else a short date. `now` is explicit for testability. */
export function timeAgo(d: Date | string, now: Date = new Date()): string {
  const seconds = Math.round((now.getTime() - toDate(d).getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return formatDate(d);
}

export function formatPct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}
