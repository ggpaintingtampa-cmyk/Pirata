import { useState } from 'react';
import { Camera, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { orderedChildren, type Task } from '@pirata/contracts/index';
import type { ModuleProps } from '../../services/moduleProps';
import type { RegisteredDialogProps } from '../../live/dialogRegistry';
import { useT } from '../../i18n';
import { useRole } from '../../state/permissions';
import { WorkDialog } from '../tasks-time/WorkDialog';
import { FilesPanel } from '../collaboration';
import { runCommand } from '../work/commands';
import { createMutation, createSubmission } from '../../services/api';
import '../facts/styles.css';
/** Create a record and return its id (the snapshot refresh happens afterwards). */
async function createAndGetId(app: ModuleProps, command: Parameters<typeof runCommand>[1]): Promise<{ id?: string; error?: string }> {
  try { const result = await createSubmission(app.service, createMutation(command, app.snapshot.revision)).submit(); await app.refresh(); return { id: result.result.id }; }
  catch (cause) { return { error: (cause as Error).message || 'Could not save.' }; }
}
/** Sales fast capture (R-SALES-2): client + name, then tasks one per line with photos while talking to the client. */
export function CaptureFlow({ app, onClose, onDone, clientId }: { app: ModuleProps; onClose(): void; onDone(): void; clientId?: string }) {
  const t = useT(), role = useRole();
  const clients = app.snapshot.clients.filter(c => c.archivedAt === null);
  const [projectId, setProjectId] = useState<string | null>(null), [client, setClient] = useState(clientId ?? clients[0]?.id ?? ''), [newClient, setNewClient] = useState(!clients.length), [clientName, setClientName] = useState(''), [clientPhone, setClientPhone] = useState('');
  const [name, setName] = useState(''), [address, setAddress] = useState(''), [title, setTitle] = useState(''), [subtaskFor, setSubtaskFor] = useState<string | null>(null), [subtitle, setSubtitle] = useState(''), [photosFor, setPhotosFor] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const project = app.snapshot.projects.find(p => p.id === projectId), tasks = projectId ? orderedChildren(app.snapshot.tasks, null, projectId) : [];
  const start = async () => {
    if (!name.trim() || (newClient ? !clientName.trim() : !client)) { setError(t('sales.capture.need')); return; }
    setBusy(true); setError('');
    let clientRef = client;
    if (newClient) { const made = await createAndGetId(app, { type: 'client.create', name: clientName.trim(), phone: clientPhone.trim(), email: '', note: '' }); if (!made.id) { setError(made.error ?? ''); setBusy(false); return; } clientRef = made.id; }
    const made = await createAndGetId(app, { type: 'project.create', name: name.trim(), clientId: clientRef, clientName: '', address: address.trim(), note: '' });
    setBusy(false);
    if (!made.id) { setError(made.error ?? ''); return; }
    setProjectId(made.id);
  };
  const addTask = async (parentTaskId: string | null, text: string) => { if (!text.trim() || !projectId) return; setBusy(true); const message = await runCommand(app, { type: 'task.create', title: text.trim(), projectId, parentTaskId, estimatedMinutes: 0, note: '' }); setBusy(false); setError(message ?? ''); if (!message) { if (parentTaskId) { setSubtitle(''); } else setTitle(''); } };
  const remove = async (task: Task) => { if (!window.confirm(t('sales.capture.removeConfirm', { title: task.title }))) return; setBusy(true); setError((await runCommand(app, { type: 'task.archive', id: task.id, archived: true })) ?? ''); setBusy(false); };
  const rename = async (task: Task) => { const next = window.prompt(t('sales.capture.rename'), task.title); if (!next || next.trim() === task.title) return; setBusy(true); setError((await runCommand(app, { type: 'task.update', id: task.id, title: next.trim(), projectId: task.projectId, estimatedMinutes: task.estimatedMinutes, note: task.note, parentTaskId: task.parentTaskId ?? null })) ?? ''); setBusy(false); };
  const finish = async (review: boolean) => { if (review && project) { setBusy(true); const message = await runCommand(app, { type: 'project.setStatus', id: project.id, status: 'sold' }); setBusy(false); if (message) { setError(message); return; } } onDone(); if (project) app.onOpenProject(project.id); };
  if (!projectId) return <WorkDialog title={t('sales.capture.title')} onClose={onClose}>
    <p className="muted">{t('sales.capture.intro')}</p>
    {!newClient && <label className="work-field">{t('sales.capture.client')}<select value={client} onChange={e => setClient(e.target.value)}>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
    {newClient ? <><label className="work-field">{t('sales.capture.clientName')}<input value={clientName} onChange={e => setClientName(e.target.value)} /></label><label className="work-field">{t('sales.capture.clientPhone')}<input type="tel" value={clientPhone} onChange={e => setClientPhone(e.target.value)} /></label>{clients.length > 0 && <button type="button" className="work-link-button" onClick={() => setNewClient(false)}>{t('sales.capture.existingClient')}</button>}</> : <button type="button" className="work-link-button" onClick={() => setNewClient(true)}><Plus size={14} aria-hidden="true" />{t('sales.capture.newClient')}</button>}
    <label className="work-field">{t('sales.capture.projectName')}<input value={name} onChange={e => setName(e.target.value)} placeholder={t('sales.capture.projectPlaceholder')} /></label>
    <label className="work-field">{t('sales.capture.address')}<input value={address} onChange={e => setAddress(e.target.value)} /></label>
    {error && <p role="alert" className="work-error">{error}</p>}
    <div className="live-actions"><button type="button" className="work-primary" disabled={busy} onClick={() => void start()}>{t('sales.capture.start')}</button><button type="button" onClick={onClose}>{t('templates.cancel')}</button></div>
  </WorkDialog>;
  return <WorkDialog title={project?.name ?? t('sales.capture.title')} className="capture-dialog" onClose={onClose}>
    <p className="muted">{t('sales.capture.walkHint')}</p>
    <details className="quick-task-capture"><summary><span><Camera size={16} aria-hidden="true" />{t('sales.capture.projectPhotos')}</span><ChevronDown size={16} aria-hidden="true" /></summary><FilesPanel app={app} parentType="project" parentId={projectId} /></details>
    <div className="capture-add"><input placeholder={t('sales.capture.taskPlaceholder')} value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void addTask(null, title); } }} /><button type="button" className="work-primary" disabled={busy || !title.trim()} onClick={() => void addTask(null, title)}><Plus size={16} aria-hidden="true" />{t('sales.capture.addTask')}</button></div>
    <ul className="capture-tasks">{tasks.map(task => { const subs = orderedChildren(app.snapshot.tasks, task.id, task.projectId ?? null); return <li key={task.id} className="capture-task">
      <div className="capture-task-row"><strong>{task.title}</strong><button type="button" aria-label={t('sales.capture.rename')} disabled={busy} onClick={() => void rename(task)}>{t('sales.capture.renameShort')}</button><button type="button" disabled={busy} onClick={() => setSubtaskFor(subtaskFor === task.id ? null : task.id)}>{t('sales.capture.subtask')}</button><button type="button" aria-pressed={photosFor === task.id} disabled={busy} onClick={() => setPhotosFor(photosFor === task.id ? null : task.id)}><Camera size={14} aria-hidden="true" />{t('sales.capture.photo')}</button><button type="button" aria-label={t('sales.capture.remove')} disabled={busy} onClick={() => void remove(task)}><Trash2 size={14} aria-hidden="true" /></button></div>
      {subs.map(sub => <div key={sub.id} className="capture-task-row capture-task-sub"><ChevronRight size={12} aria-hidden="true" /><strong>{sub.title}</strong><button type="button" aria-label={t('sales.capture.remove')} disabled={busy} onClick={() => void remove(sub)}><Trash2 size={13} aria-hidden="true" /></button></div>)}
      {subtaskFor === task.id && <div className="capture-add"><input placeholder={t('sales.capture.subtaskPlaceholder')} value={subtitle} onChange={e => setSubtitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void addTask(task.id, subtitle); } }} /><button type="button" disabled={busy || !subtitle.trim()} onClick={() => void addTask(task.id, subtitle)}>{t('sales.capture.addTask')}</button></div>}
      {photosFor === task.id && <FilesPanel app={app} parentType="task" parentId={task.id} />}
    </li>; })}</ul>
    {!tasks.length && <p className="empty-state">{t('sales.capture.noTasks')}</p>}
    {error && <p role="alert" className="work-error">{error}</p>}
    <div className="live-actions">{project?.status === 'draft' ? <><button type="button" className="work-primary" disabled={busy} onClick={() => void finish(true)}>{t('sales.sendToReview')}</button><button type="button" disabled={busy} onClick={() => void finish(false)}>{t('sales.capture.saveDraft')}</button></> : <button type="button" className="work-primary" disabled={busy} onClick={() => void finish(false)}>{t('sales.capture.done')}</button>}</div>
    {role === 'sales' && <p className="muted">{t('sales.capture.repHint')}</p>}
  </WorkDialog>;
}
export function CaptureDialog({ app, onClose, onDone }: RegisteredDialogProps) { return <CaptureFlow app={app} onClose={onClose} onDone={onDone} />; }
