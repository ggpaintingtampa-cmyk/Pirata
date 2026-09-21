import { describe, expect, it } from 'vitest';
import { readView, viewHref, type View } from '../../src/live/navigation';

describe('workspace routes', () => {
  it('keeps record selection when sharing or refreshing a page', () => {
    const views: View[] = [{ name: 'work' }, { name: 'more' }, { name: 'project', id: 'project / α' }, { name: 'clients', id: 'client-123' }];
    for (const view of views) expect(readView(viewHref(view), true)).toEqual(view);
  });
  it('rejects owner-only destinations for employees', () => {
    for (const name of ['team','ai-settings','settings','spending']) expect(readView('#/'+name, false)).toEqual({ name: 'work' });
    expect(readView('#/calendar', false)).toEqual({ name: 'calendar' });
    expect(readView('#/files', false)).toEqual({ name: 'files' });
  });
  it('safely handles missing, malformed and unsupported routes', () => {
    for (const hash of ['', '#main', '#/unknown', '#/project/%zz', '#/work/123', '#/clients/a/extra', '#/project/'+'a'.repeat(101)]) expect(readView(hash, true)).toEqual({ name: 'work' });
    expect(readView('#/project', true)).toEqual({ name: 'projects' });
  });
});
