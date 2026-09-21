import type { TimeEntry } from '../domain/types.js';
export function entryMilliseconds(entry: TimeEntry): number {
  return entry.source === 'timer' ? entry.endedAt - entry.startedAt : entry.durationSeconds * 1000;
}
export function formatDuration(milliseconds: number): string {
  const minutes = Math.round(Math.max(0, milliseconds) / 60000);
  const hours = Math.floor(minutes / 60);
  return hours ? hours + 'h' + (minutes % 60 ? ' ' + minutes % 60 + 'm' : '') : minutes + 'm';
}
export function formatClock(milliseconds: number): string {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  return [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map(v => String(v).padStart(2, '0')).join(':');
}
