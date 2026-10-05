/**
 * Time and Date Utilities for Sologix Energy
 * Explicitly operates in Asia/Kolkata (IST = UTC+5:30)
 */

export const IST_TIMEZONE = "Asia/Kolkata";

/**
 * Returns current work date in YYYY-MM-DD format strictly in Asia/Kolkata timezone.
 */
export function getWorkDateIST(date: Date = new Date()): string {
  // Use Intl.DateTimeFormat to reliably extract year, month, day in Asia/Kolkata
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date); // outputs YYYY-MM-DD
}

/**
 * Returns hour and minute in Asia/Kolkata for a given Date.
 */
export function getISTTimeParts(date: Date = new Date()): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: IST_TIMEZONE,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);

  const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
  return { hour, minute };
}

/**
 * Returns a JavaScript Date object corresponding to 21:00:00 IST on the given workDate (YYYY-MM-DD).
 * 21:00 IST = 15:30 UTC
 */
export function get2100IST(workDate: string): Date {
  return new Date(`${workDate}T21:00:00+05:30`);
}

/**
 * Calculates working minutes between checkInAt and checkOutAt.
 */
export function calculateWorkingMinutes(checkInAt: Date, checkOutAt: Date): number {
  const diffMs = checkOutAt.getTime() - checkInAt.getTime();
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / (1000 * 60));
}
