import { describe, it, expect } from 'vitest';
import type { Attachment, BusinessSnapshot } from '@pirata/contracts/index';
import { filesFor } from '../../src/features/collaboration/hierarchy';
const attachment = (id: string, parentType: Attachment['parentType'], parentId: string): Attachment => ({ id, parentType, parentId, createdAt: 1, updatedAt: 1, name: id + '.jpg', mimeType: 'image/jpeg', size: 100, removedAt: null, uploadedBy: 'person' });
const snapshot = { projects: [{ id: 'project', clientId: 'client' }, { id: 'other', clientId: 'other-client' }], tasks: [{ id: 'task', projectId: 'project' }, { id: 'child', projectId: 'project', parentTaskId: 'task' }, { id: 'unfiled', projectId: null }], attachments: [attachment('client-file', 'client', 'client'), attachment('project-file', 'project', 'project'), attachment('task-file', 'task', 'task'), attachment('child-file', 'task', 'child'), attachment('unfiled-file', 'task', 'unfiled'), attachment('other-file', 'project', 'other')] } as BusinessSnapshot;
describe('attachment hierarchy', () => {
  it('shows each binary once at its task, project and client while retaining its direct parent', () => {
    expect(filesFor(snapshot, { parentType: 'task', parentId: 'task' }).map(f => f.id)).toEqual(['task-file', 'child-file']);
    expect(filesFor(snapshot, { parentType: 'project', parentId: 'project' }).map(f => f.id)).toEqual(['project-file', 'task-file', 'child-file']);
    const files = filesFor(snapshot, { parentType: 'client', parentId: 'client' }); expect(files.map(f => f.id)).toEqual(['client-file', 'project-file', 'task-file', 'child-file']); expect(files.find(f => f.id === 'task-file')?.parentType).toBe('task');
  });
  it('preserves unfiled tasks and follows an explicit later filing without copying attachments', () => {
    expect(filesFor(snapshot, { parentType: 'task', parentId: 'unfiled' }).map(f => f.id)).toEqual(['unfiled-file']);
    const filed = { ...snapshot, tasks: snapshot.tasks.map(t => t.id === 'unfiled' ? { ...t, projectId: 'project' } : t) };
    expect(filesFor(filed, { parentType: 'client', parentId: 'client' }).map(f => f.id)).toContain('unfiled-file'); expect(filed.attachments).toBe(snapshot.attachments);
  });
});
