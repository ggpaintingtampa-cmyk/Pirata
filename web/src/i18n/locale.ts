import type { Locale } from './index';
/** P13: one place for locale-dependent formatting. Business time stays America/New_York; only the rendering language changes. */
export const BUSINESS_TIMEZONE = 'America/New_York';
export function localeTag(locale: Locale): 'en-US' | 'es-US' { return locale === 'es' ? 'es-US' : 'en-US'; }
const cache = new Map<string, Intl.DateTimeFormat>();
export function dateTimeFormat(locale: Locale, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = locale + JSON.stringify(options);
  let format = cache.get(key);
  if (!format) { format = new Intl.DateTimeFormat(localeTag(locale), { timeZone: BUSINESS_TIMEZONE, ...options }); cache.set(key, format); }
  return format;
}
/** Short date with time, e.g. "Sep 29, 3:05 PM" / "29 sept, 3:05 p. m.". */
export const formatDateTime = (locale: Locale, at: number) => dateTimeFormat(locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(at);
export const formatClockMinute = (locale: Locale, minute: number) => new Intl.DateTimeFormat(localeTag(locale), { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(Date.UTC(2000, 0, 1, Math.floor(minute / 60), minute % 60));
export const formatTime = (locale: Locale, at: number) => dateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(at);
export const formatShortDate = (locale: Locale, at: number) => dateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(at);
/** Calendar dates (YYYY-MM-DD) are formatted through UTC so they never shift. */
export function formatCalendarDate(locale: Locale, date: string, options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }): string {
  return new Intl.DateTimeFormat(localeTag(locale), { timeZone: 'UTC', ...options }).format(new Date(date + 'T12:00:00Z'));
}
export const formatNumber = (locale: Locale, value: number, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(localeTag(locale), options).format(value);
/** Money stays USD in both languages; only grouping and decimal marks follow the locale. */
export const formatMoneyFor = (locale: Locale, cents: number) => new Intl.NumberFormat(localeTag(locale), { style: 'currency', currency: 'USD' }).format(cents / 100);
export const formatHours = (locale: Locale, minutes: number) => formatNumber(locale, minutes / 60, { maximumFractionDigits: minutes % 60 ? 2 : 0 });
