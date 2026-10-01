// P03: review the destination, the options and the exact count before one atomic copy command.
import { useState } from 'react';
import { taskDepth, type BulkCopyInclude, type Task } from '@pirata/contracts/index';
import type { ModuleProps } from '../../services/moduleProps';
import { useT } from '../../i18n';
import { WorkDialog } from '../tasks-time/WorkDialog';
import { CommandButton } from '../tasks-time/TaskChecklist';
import { liveDescendants, normalizeTaskRoots, subtreeDepth, useSelection } from './selection';
export function BulkCopyDialog({ app, taskIds, onClose }: { app: ModuleProps; taskIds: string[]; onClose(): void }) {
  const t = useT(), selection = useSelection(), all = app.snapshot.tasks, projects = app.snapshot.projects.filter(p => p.status !== 'completed');
  const [projectId, setProjectId] = useState(projects[0]?.id ?? ''), [parentTaskId, setParent] = useState('');
  const [include, setInclude] = useState<BulkCopyInclude>({ children: true, requirements: true, estimates: true, notes: true, assignments: false, schedule: false });
  const roots = normalizeTaskRoots(all, taskIds).map(id => all.find(task => task.id === id)).filter((task): task is Task => Boolean(task));
  const nodesOf = (root: Task) => include.children ? 1 + liveDescendants(all, root.id).length : 1;
  const total = roots.reduce((n, root) => n + nodesOf(root), 0);
  const requirementCount = (root: Task) => (app.snapshot.taskRequirements ?? []).filter(r => r.taskId === root.id || (include.children && liveDescendants(all, root.id).some(d => d.id === r.taskId))).length;
  const parents = all.filter(task => task.projectId === projectId && !task.parentTaskId && !task.archivedAt && task.status !== 'done');
  const base = parentTaskId ? taskDepth(all, parentTaskId) + 1 : 0;
  const tooDeep = roots.some(root => base + (include.children ? subtreeDepth(all, root.id) : 0) > 2);
  const option = (key: keyof BulkCopyInclude) => <label key={key} className="bulk-option"><input type="checkbox" checked={include[key]} onChange={e => setInclude({ ...include, [key]: e.target.checked })} />{t('bulk.copy.include.' + key)}</label>;
  return <WorkDialog title={t('bulk.copy.title')} onClose={onClose} className="bulk-dialog">
    <label className="work-field">{t('bulk.copy.project')}<select value={projectId} onChange={e => { setProjectId(e.target.value); setParent(''); }}>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <label className="work-field">{t('bulk.copy.parent')}<select value={parentTaskId} onChange={e => setParent(e.target.value)}><option value="">{t('bulk.copy.topLevel')}</option>{parents.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
    <fieldset className="bulk-options"><legend>{t('bulk.copy.options')}</legend>{(['children', 'requirements', 'estimates', 'notes'] as const).map(option)}<p className="muted">{t('bulk.copy.explicitHint')}</p>{(['assignments', 'schedule'] as const).map(option)}</fieldset>
    <p className="muted">{t('bulk.copy.excluded')}</p>
    <ul className="bulk-preview">{roots.map(root => <li key={root.id}><strong>{root.title}</strong><small>{t('bulk.copy.rootSummary', { children: nodesOf(root) - 1, requirements: requirementCount(root) })}</small></li>)}</ul>
    {tooDeep && <p role="alert" className="work-error">{t('bulk.copy.tooDeep')}</p>}
    <div className="live-actions">
      <CommandButton app={app} disabled={!projectId || !roots.length || tooDeep || total > 1000} command={{ type: 'task.bulkCopy', sourceTaskIds: roots.map(root => root.id), destination: { projectId, parentTaskId: parentTaskId || null }, include, expectedCount: total }} message={t('bulk.copy.done', { count: total })} onSuccess={() => { selection?.stop(); onClose(); }}>{t('bulk.copy.confirm', { count: total })}</CommandButton>
      <button type="button" onClick={onClose}>{t('templates.cancel')}</button>
    </div>
  </WorkDialog>;
}
