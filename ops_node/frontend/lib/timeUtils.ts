/**
 * Time-of-day conversion: local (browser or specified TZ) <-> UTC
 * User enters time, we store/process UTC. Display converts UTC -> local.
 * Optional timezone: when managing devices in another region, use "working timezone".
 */

const pad2 = (n: number) => String(n).padStart(2, '0');

const STORAGE_KEY = 'ops_working_timezone';

/** Get working timezone from localStorage. Empty = use browser local. */
export function getWorkingTimezone(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(STORAGE_KEY) || '';
}

/** Set working timezone (e.g. 'America/New_York'). Empty = browser local. */
export function setWorkingTimezone(tz: string): void {
  if (typeof window === 'undefined') return;
  if (tz) localStorage.setItem(STORAGE_KEY, tz);
  else localStorage.removeItem(STORAGE_KEY);
}

/** Common timezones for device operations */
export const WORKING_TIMEZONES: { value: string; label: string }[] = [
  { value: '', label: 'My browser (local)' },
  { value: 'Asia/Karachi', label: 'Pakistan (PKT)' },
  { value: 'America/New_York', label: 'US Eastern (ET)' },
  { value: 'America/Chicago', label: 'US Central (CT)' },
  { value: 'America/Denver', label: 'US Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'US Pacific (PT)' },
  { value: 'Europe/London', label: 'UK (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Europe Central (CET)' },
  { value: 'Asia/Dubai', label: 'UAE (GST)' },
  { value: 'UTC', label: 'UTC' },
];

function getOffsetMinutes(timeZone: string, date: Date = new Date()): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset',
    });
    const parts = formatter.formatToParts(date);
    const tz = parts.find((p) => p.type === 'timeZoneName')?.value || '';
    const match = tz.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
    if (!match) return 0;
    const sign = match[1] === '-' ? 1 : -1;
    const hours = parseInt(match[2], 10);
    const mins = parseInt(match[3] || '0', 10);
    return sign * (hours * 60 + mins);
  } catch {
    return 0;
  }
}

/**
 * Convert time (HH:mm or HH:mm:ss) to UTC time string for API.
 * If timezone is empty, uses browser local. Otherwise uses the specified timezone.
 */
export function timeLocalToUTC(localTime: string, timezone?: string): string {
  const [h, m, s = 0] = localTime.split(':').map(Number);
  const localMins = h * 60 + m + s / 60;

  if (!timezone) {
    const d = new Date();
    d.setHours(h, m, s, 0);
    const uh = d.getUTCHours();
    const um = d.getUTCMinutes();
    const us = d.getUTCSeconds();
    return `${pad2(uh)}:${pad2(um)}:${pad2(us)}`;
  }

  const offsetSeconds = getOffsetMinutes(timezone) * 60;
  const localSeconds = h * 3600 + m * 60 + s;
  const utcSeconds = ((localSeconds - offsetSeconds) % 86400 + 86400) % 86400;
  const uh = Math.floor(utcSeconds / 3600) % 24;
  const um = Math.floor((utcSeconds % 3600) / 60);
  const us = Math.floor(utcSeconds % 60);
  return `${pad2(uh)}:${pad2(um)}:${pad2(us)}`;
}

/**
 * Convert UTC time string (HH:mm or HH:mm:ss) from API to local for display.
 * If timezone is empty, uses browser local. Otherwise uses the specified timezone.
 */
export function timeUTCToLocal(utcTime: string, timezone?: string): string {
  const [h, m, s = 0] = utcTime.split(':').map(Number);
  const utcMins = h * 60 + m + s / 60;

  if (!timezone) {
    const d = new Date();
    d.setUTCHours(h, m, s, 0);
    const lh = d.getHours();
    const lm = d.getMinutes();
    return `${pad2(lh)}:${pad2(lm)}`;
  }

  const offset = getOffsetMinutes(timezone);
  const localMins = utcMins + offset;
  const totalMins = ((localMins % 1440) + 1440) % 1440;
  const lh = Math.floor(totalMins / 60) % 24;
  const lm = Math.floor(totalMins % 60);
  return `${pad2(lh)}:${pad2(lm)}`;
}
