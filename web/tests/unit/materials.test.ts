import { describe, expect, it } from 'vitest';
import type { ShoppingItem } from '@pirata/contracts/index';
import { filterRequests } from '../../src/features/materials';
const item = (id: string, extra: Partial<ShoppingItem> = {}): ShoppingItem => ({ id, createdAt: Number(id.slice(1)), updatedAt: 1, title: id, note: '', projectId: 'p', sourceNoteId: null, checkedAt: null, createdBy: 'jose', quantity: '', taskId: null, forUserId: null, receivedAt: null, receivedBy: null, archivedAt: null, ...extra });
const items = [item('r1'), item('r2', { receivedAt: 5, receivedBy: 'm' }), item('r3', { projectId: 'q', createdBy: 'ana' }), item('r4', { archivedAt: 9 })];
describe('material request filters', () => {
  it('splits open and received, hides removed, newest first', () => {
    expect(filterRequests(items, 'open').map(i => i.id)).toEqual(['r3', 'r1']);
    expect(filterRequests(items, 'received').map(i => i.id)).toEqual(['r2']);
    expect(filterRequests(items, 'all').map(i => i.id)).toEqual(['r3', 'r1', 'r2']);
  });
  it('filters by project and requester', () => {
    expect(filterRequests(items, 'all', 'q').map(i => i.id)).toEqual(['r3']);
    expect(filterRequests(items, 'all', '', 'jose').map(i => i.id)).toEqual(['r1', 'r2']);
  });
});
