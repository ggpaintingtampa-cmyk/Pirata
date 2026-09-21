import type { Attachment, BusinessSnapshot } from '@pirata/contracts/index';
export type FileParent = { parentType: 'task' | 'project' | 'client'; parentId: string };
export function filesFor(snapshot: BusinessSnapshot, parent: FileParent): Attachment[] {
  const projects = new Set(parent.parentType === 'client' ? snapshot.projects.filter(p => p.clientId === parent.parentId).map(p => p.id) : parent.parentType === 'project' ? [parent.parentId] : []);
  const tasks = new Set(snapshot.tasks.filter(t => projects.has(t.projectId ?? '') || parent.parentType === 'task' && (t.id === parent.parentId || t.parentTaskId === parent.parentId)).map(t => t.id));
  return (snapshot.attachments ?? []).filter(f => f.parentType === parent.parentType && f.parentId === parent.parentId || f.parentType === 'project' && projects.has(f.parentId) || f.parentType === 'task' && tasks.has(f.parentId));
}
