export type ViewName = 'work'|'ask'|'updates'|'calendar'|'progress'|'shopping'|'team'|'ai-settings'|'settings'|'today'|'projects'|'project'|'inventory'|'clients'|'more'|'spending'|'tasks'|'files';
export interface View { name: ViewName; id?: string }
const names = new Set<ViewName>(['work','ask','updates','calendar','progress','shopping','team','ai-settings','settings','today','projects','project','inventory','clients','more','spending','tasks','files']);
export const ownerViews = new Set<ViewName>(['team','ai-settings','settings','spending']);
export function viewHref(view: View): string {
  return '#/' + (view.name === 'more' ? 'menu' : view.name) + (view.id ? '/' + encodeURIComponent(view.id) : '');
}
export function readView(hash: string, isOwner: boolean): View {
  try {
    const [raw, encodedId, extra] = hash.replace(/^#\/?/, '').split('/');
    const name = (raw === 'menu' ? 'more' : raw) as ViewName;
    if (!names.has(name) || (!isOwner && ownerViews.has(name)) || extra !== undefined) return { name: 'work' };
    const id = encodedId ? decodeURIComponent(encodedId) : undefined;
    if (id && (id.length > 100 || !['project','clients'].includes(name))) return { name: 'work' };
    if (name === 'project' && !id) return { name: 'projects' };
    return { name, ...(id ? { id } : {}) };
  } catch { return { name: 'work' }; }
}

export function navigationAllowed(): boolean {
  if (document.querySelector('[data-save-phase="saving"], [data-save-phase="uncertain"], [data-save-phase="saved"], [data-import-phase="busy"], [data-import-phase="uncertain"], [data-import-phase="saved"]')) return false;
  return !document.querySelector('[data-form-dirty="true"]') || window.confirm('Leave this page and discard your unsaved changes?');
}
