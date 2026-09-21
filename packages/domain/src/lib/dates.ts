export function businessDate(now: number): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now));
  const get = (type: string) => parts.find(part => part.type === type)!.value;
  return get('year') + '-' + get('month') + '-' + get('day');
}
export function isLocalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}
export function dateLabel(date: string, weekday = false): string {
  // Date-only values stay date-only; UTC is used solely to format their calendar components.
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...(weekday ? { weekday: 'long' as const } : {}), month: 'long', day: 'numeric' }).format(new Date(date + 'T12:00:00Z'));
}
export function minuteLabel(minute: number): string { return String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0'); }
export function parseTime(value: string): number | null {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number); return hours * 60 + minutes;
}
export function timestampInput(at: number): string {
  const date = new Date(at);
  const p = (value: number) => String(value).padStart(2, '0');
  return date.getFullYear() + '-' + p(date.getMonth() + 1) + '-' + p(date.getDate()) + 'T' + p(date.getHours()) + ':' + p(date.getMinutes()) + ':' + p(date.getSeconds());
}
