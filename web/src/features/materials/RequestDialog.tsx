import { useState } from 'react';
import { orderedChildren, type ShoppingItem } from '@pirata/contracts/index';
import type { RegisteredDialogProps } from '../../live/dialogRegistry';
import { useT } from '../../i18n';
import { WorkDialog } from '../tasks-time/WorkDialog';
import { runCommand } from '../work/commands';
/** Request materials for a project, a task or a person (R-MAT-1). Also edits an existing request's item, quantity and notes. */
export function RequestDialog({ app, projectId, taskId, onClose, onDone, item }: RegisteredDialogProps & { item?: ShoppingItem }) {
  const t = useT(), me = app.snapshot.currentUser?.id ?? '', projects = app.snapshot.projects.filter(p => p.status !== 'completed'), team = (app.snapshot.team ?? []).filter(m => !m.disabledAt);
  const initialTask = taskId ? app.snapshot.tasks.find(task => task.id === taskId) : undefined;
  const [target, setTarget] = useState<'project' | 'person'>(initialTask || projectId || !team.length ? 'project' : 'project');
  const [project, setProject] = useState(initialTask?.projectId ?? projectId ?? projects[0]?.id ?? ''), [task, setTask] = useState(taskId ?? ''), [person, setPerson] = useState(me);
  const [title, setTitle] = useState(item?.title ?? ''), [quantity, setQuantity] = useState(item?.quantity ?? ''), [note, setNote] = useState(item?.note ?? ''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const tasks = project ? app.snapshot.tasks.filter(candidate => candidate.projectId === project && !candidate.archivedAt && candidate.status !== 'done') : [];
  const label = (id: string) => { const candidate = app.snapshot.tasks.find(c => c.id === id); if (!candidate) return id; const parent = candidate.parentTaskId ? app.snapshot.tasks.find(c => c.id === candidate.parentTaskId) : undefined; return (parent ? parent.title + ' › ' : '') + candidate.title; };
  const save = async () => {
    if (!title.trim()) { setError(t('materials.dialog.needItem')); return; }
    if (!item && target === 'project' && !project) { setError(t('materials.dialog.needTarget')); return; }
    setBusy(true);
    const message = await runCommand(app, item ? { type: 'materialRequest.update', id: item.id, title: title.trim(), quantity: quantity.trim(), note: note.trim() } : { type: 'materialRequest.create', title: title.trim(), quantity: quantity.trim(), note: note.trim(), projectId: target === 'project' ? project : null, taskId: target === 'project' && task ? task : null, forUserId: target === 'person' ? person : null });
    setBusy(false); setError(message ?? '');
    if (!message) { app.onSaved(t('materials.dialog.saved')); onDone(); }
  };
  return <WorkDialog title={t('materials.dialog.title')} onClose={onClose}>
    <label className="work-field">{t('materials.dialog.item')}<input value={title} maxLength={160} onChange={e => setTitle(e.target.value)} placeholder="Primer, 3/4 nap rollers…" /></label>
    <label className="work-field">{t('materials.dialog.quantity')}<input value={quantity} maxLength={80} onChange={e => setQuantity(e.target.value)} placeholder="2 gal" /></label>
    {!item && <>
      <div className="task-capture-choice"><span className="task-capture-label">{t('materials.dialog.target')}</span><div className="task-estimate-choices" role="group" aria-label={t('materials.dialog.target')}><button type="button" aria-pressed={target === 'project'} onClick={() => setTarget('project')}>{t('materials.forProject')}</button><button type="button" aria-pressed={target === 'person'} onClick={() => setTarget('person')}>{t('materials.forPerson')}</button></div></div>
      {target === 'project' ? <><label className="work-field">{t('materials.dialog.project')}<select value={project} onChange={e => { setProject(e.target.value); setTask(''); }}>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="work-field">{t('materials.dialog.task')}<select value={task} onChange={e => setTask(e.target.value)}><option value="">{t('materials.dialog.anyTask')}</option>{[...orderedChildren(tasks, null, project), ...tasks.filter(c => c.parentTaskId)].map(c => <option key={c.id} value={c.id}>{label(c.id)}</option>)}</select></label></>
        : <label className="work-field">{t('materials.dialog.person')}<select value={person} onChange={e => setPerson(e.target.value)}>{team.map(m => <option key={m.id} value={m.id}>{m.id === me ? t('materials.forMe') + ' · ' : ''}{m.name}</option>)}</select></label>}
    </>}
    <label className="work-field">{t('materials.dialog.note')}<textarea rows={2} value={note} onChange={e => setNote(e.target.value)} /></label>
    {error && <p role="alert" className="work-error">{error}</p>}
    <div className="live-actions"><button type="button" className="work-primary" disabled={busy} onClick={() => void save()}>{t('materials.dialog.save')}</button><button type="button" onClick={onClose}>{t('templates.cancel')}</button></div>
  </WorkDialog>;
}
