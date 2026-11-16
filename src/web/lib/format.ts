const LOCALE = 'es';

const relative = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
const dateFormat = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
const numberFormat = new Intl.NumberFormat(LOCALE);
const compactFormat = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 });

export function timeAgo(timestamp: number, now = Date.now()): string {
  const seconds = Math.round((timestamp - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return 'recién';
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return relative.format(Math.round(seconds / 3600), 'hour');
  if (abs < 86400 * 7) return relative.format(Math.round(seconds / 86400), 'day');
  return dateFormat.format(timestamp);
}

export const formatDate = (timestamp: number) => dateFormat.format(timestamp);
export const formatDateTime = (timestamp: number) => dateTimeFormat.format(timestamp);
export const formatDay = (timestamp: number) => dayFormat.format(timestamp);
export const formatNumber = (value: number) => numberFormat.format(value);
export const formatCompact = (value: number) => compactFormat.format(value);

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const dayKey = (timestamp: number) => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

export function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Buen día';
  if (hour < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
