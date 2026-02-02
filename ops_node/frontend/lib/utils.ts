import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind CSS classes with clsx
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format date/time for display. Uses working timezone if provided, else browser local.
 * API returns UTC ISO strings; we show in selected timezone.
 */
export function formatDate(date: string | Date, timezone?: string): string {
  const d = new Date(date);
  if (timezone) {
    return d.toLocaleString('en-US', { timeZone: timezone });
  }
  return d.toLocaleString();
}

/**
 * Format relative time
 */
export function formatRelativeTime(date: string | Date, timezone?: string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(date, timezone);
}

/**
 * Format date and time for display. Uses working timezone if provided.
 */
export function formatDateTime(date: string | Date, timezone?: string): string {
  const d = new Date(date);
  const opts: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  };
  if (timezone) opts.timeZone = timezone;
  return d.toLocaleString('en-US', opts);
}

/**
 * Format full date with time
 */
export function formatFullDateTime(date: string | Date, timezone?: string): string {
  const d = new Date(date);
  const opts: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  };
  if (timezone) opts.timeZone = timezone;
  return d.toLocaleString('en-US', opts);
}
