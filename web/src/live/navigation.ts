import { can, type Capability, type Role } from '@pirata/contracts/permissions';
import { tx } from '../i18n';
export type ViewName = 'work'|'ask'|'updates'|'calendar'|'progress'|'team'|'ai-settings'|'translation-settings'|'settings'|'projects'|'project'|'inventory'|'clients'|'more'|'spending'|'tasks'|'files'|'report'|'hours'|'pay'|'insights'|'materials'|'tools'|'templates'|'trash';
export interface View { name: ViewName; id?: string }
const names = new Set<ViewName>(['work','ask','updates','calendar','progress','team','ai-settings','translation-settings','settings','projects','project','inventory','clients','more','spending','tasks','files','report','hours','pay','insights','materials','tools','templates','trash']);
/** Old addresses keep working: Today folded into Daily, Shopping became Materials requests. */
const aliases: Record<string, ViewName> = { menu: 'more', today: 'work', shopping: 'materials' };
/** Views that need a capability; everything else is open to every signed-in role. */
export const viewCapability: Partial<Record<ViewName, Capability>> = { team: 'team.admin', 'ai-settings': 'ask.admin', 'translation-settings': 'ask.admin', settings: 'settings.admin', spending: 'money.costs', pay: 'money.costs', trash: 'records.delete' };
/** Views that accept a second path segment. */
const paramViews: Partial<Record<ViewName, 'id'|'date'>> = { project: 'id', clients: 'id', insights: 'id', report: 'date', hours: 'date' };
export function viewAllowed(name: ViewName, role: Role|undefined): boolean { const cap = viewCapability[name]; return !cap || can(role, cap); }
export function viewHref(view: View): string {
  return '#/' + (view.name === 'more' ? 'menu' : view.name) + (view.id ? '/' + encodeURIComponent(view.id) : '');
}
export function readView(hash: string, role: Role|undefined): View {
  try {
    const [raw, encodedId, extra] = hash.replace(/^#\/?/, '').split('/');
    const name = (aliases[raw] ?? raw) as ViewName;
    if (!names.has(name) || !viewAllowed(name, role) || extra !== undefined) return { name: 'work' };
    const id = encodedId ? decodeURIComponent(encodedId) : undefined;
    if (id && (id.length > 100 || !paramViews[name])) return { name: 'work' };
    if (name === 'project' && !id) return { name: 'projects' };
    return { name, ...(id ? { id } : {}) };
  } catch { return { name: 'work' }; }
}

export function navigationAllowed(): boolean {
  if (document.querySelector('[data-save-phase="saving"], [data-save-phase="uncertain"], [data-save-phase="saved"], [data-import-phase="busy"], [data-import-phase="uncertain"], [data-import-phase="saved"]')) return false;
  return !document.querySelector('[data-form-dirty="true"]') || window.confirm(tx('shell.confirm.leave'));
}
