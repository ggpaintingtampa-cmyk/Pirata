import type { BusinessSnapshot } from '@pirata/contracts/index';
import { entryMilliseconds } from '@pirata/domain/lib/time';
/** Sum precise milliseconds, then format once. A backward active clock is unknown. */
export function actualMilliseconds(snapshot: BusinessSnapshot, taskId: string, serverNow: number): number | null {
  const timer = snapshot.runningTimer?.taskId === taskId ? snapshot.runningTimer : null;
  if (timer && serverNow < timer.startedAt) return null;
  return snapshot.timeEntries.filter(e => e.taskId === taskId).reduce((sum, e) => sum + entryMilliseconds(e), 0) + (timer ? serverNow - timer.startedAt : 0);
}
export function minute(text: string): number {
  if (!/^\d{2}:\d{2}$/.test(text)) return NaN;
  const [h, m] = text.split(':').map(Number);
  return m < 60 && h <= 24 && (h < 24 || m === 0) ? h * 60 + m : NaN;
}
export function clockMinute(value: number): string { return String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0'); }
export function timestamp(text: string): number { return /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(text) ? Date.parse(text) : NaN; }
