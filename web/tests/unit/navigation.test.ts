import { describe, expect, it } from 'vitest';
import { readView, viewHref, viewAllowed, type View } from '../../src/live/navigation';

describe('workspace routes', () => {
  it('keeps record selection when sharing or refreshing a page', () => {
    const views: View[] = [{ name: 'work' }, { name: 'more' }, { name: 'project', id: 'project / α' }, { name: 'clients', id: 'client-123' }, { name: 'insights', id: 'p1' }, { name: 'report', id: '2026-09-25' }];
    for (const view of views) expect(readView(viewHref(view), 'owner')).toEqual(view);
  });
  it('rejects capability-gated destinations for workers and managers', () => {
    for (const name of ['team','ai-settings','settings','spending','pay']) expect(readView('#/'+name, 'worker')).toEqual({ name: 'work' });
    for (const name of ['team','ai-settings','settings','spending','pay']) expect(readView('#/'+name, 'manager')).toEqual({ name: 'work' });
    for (const name of ['calendar','files','report','hours','materials','tools','templates','insights']) expect(readView('#/'+name, 'worker')).toEqual({ name });
    expect(viewAllowed('pay', 'owner')).toBe(true);
    expect(viewAllowed('pay', 'sales')).toBe(false);
  });
  it('maps retired addresses to their replacements', () => {
    expect(readView('#/today', 'worker')).toEqual({ name: 'work' });
    expect(readView('#/shopping', 'worker')).toEqual({ name: 'materials' });
    expect(readView('#/menu', 'worker')).toEqual({ name: 'more' });
  });
  it('safely handles missing, malformed and unsupported routes', () => {
    for (const hash of ['', '#main', '#/unknown', '#/project/%zz', '#/work/123', '#/clients/a/extra', '#/project/'+'a'.repeat(101)]) expect(readView(hash, 'owner')).toEqual({ name: 'work' });
    expect(readView('#/project', 'owner')).toEqual({ name: 'projects' });
    expect(readView('#/team', undefined)).toEqual({ name: 'work' });
  });
});
