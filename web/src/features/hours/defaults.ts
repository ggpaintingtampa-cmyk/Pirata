// P04: prefill rules for the hours dialog, kept pure for unit tests.
import { presence, type BusinessSnapshot } from '@pirata/contracts/index';
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** The project with presence for the person on that date, else the first active project. */
export function preselectProject(snapshot: Pick<BusinessSnapshot, 'projects' | 'dayAssignments'>, person: string, date: string): string {
  const active = snapshot.projects.filter(p => p.status !== 'completed' && p.status !== 'draft');
  return active.find(p => presence(snapshot, date, p.id).includes(person))?.id ?? active[0]?.id ?? '';
}
/** The local calendar date to prefill: the selected day when valid, else the business date. Dates are plain strings, never converted through UTC. */
export function prefillDate(selected: string | undefined, businessDate: string): string { return selected && DATE_RE.test(selected) ? selected : businessDate; }
