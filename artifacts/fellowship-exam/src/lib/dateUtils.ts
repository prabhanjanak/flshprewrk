/**
 * Shared date/time formatting utilities.
 * All dates → DD-MM-YYYY
 * All times → HH:MM AM/PM  (12-hour)
 */

/**
 * Format any date-like value to DD-MM-YYYY.
 * Returns "—" when the value is null/undefined/empty.
 */
export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  
  // Use UTC methods for date-only inputs or midnight UTC timestamps to prevent timezone shifts
  const isDateOnly = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
  const isMidnightUTC = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
  
  if (isDateOnly || isMidnightUTC) {
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const yyyy = d.getUTCFullYear();
    return `${dd}-${mm}-${yyyy}`;
  }

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/**
 * Format any date-like value to HH:MM AM/PM (12-hour).
 * Returns "—" when the value is null/undefined/empty.
 */
export function fmtTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;
}

/**
 * Format any date-like value to DD-MM-YYYY HH:MM AM/PM.
 * Returns "—" when the value is null/undefined/empty.
 */
export function fmtDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return `${fmtDate(d)}  ${fmtTime(d)}`;
}

/**
 * Returns a locale date-string comparison key DD-MM-YYYY for "today" filtering.
 * Usage:  submissions.filter(s => fmtDate(s.submittedAt) === todayKey())
 */
export function todayKey(): string {
  return fmtDate(new Date());
}
