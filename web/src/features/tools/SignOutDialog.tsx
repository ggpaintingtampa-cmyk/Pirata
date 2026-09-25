import { useState } from 'react';
import type { RegisteredDialogProps } from '../../live/dialogRegistry';
import { useT } from '../../i18n';
import { WorkDialog } from '../tasks-time/WorkDialog';
import { runCommand } from '../work/commands';
/** Take a tool: tool, project used (optional), note. Nothing required beyond the tool (R-TOOL-1). */
export function SignOutDialog({ app, projectId, onClose, onDone, equipmentId }: RegisteredDialogProps & { equipmentId?: string }) {
  const t = useT(), open = new Set((app.snapshot.toolSignOuts ?? []).filter(row => row.returnedAt === null).map(row => row.equipmentId));
  const tools = app.snapshot.equipment.filter(tool => tool.archivedAt === null && (tool.requiresSignOut || tool.id === equipmentId) && (!open.has(tool.id) || tool.id === equipmentId));
  const [tool, setTool] = useState(equipmentId ?? tools[0]?.id ?? ''), [project, setProject] = useState(projectId ?? ''), [note, setNote] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const projects = app.snapshot.projects.filter(p => p.status !== 'completed');
  const save = async () => {
    setBusy(true);
    const message = await runCommand(app, { type: 'tool.signOut', equipmentId: tool, projectId: project || null, takenAt: null, note: note.trim() });
    setBusy(false); setError(message ?? '');
    if (!message) { app.onSaved(t('tools.dialog.taken')); onDone(); }
  };
  return <WorkDialog title={t('tools.dialog.title')} onClose={onClose}>
    {!tools.length ? <p className="empty-state">{t('tools.dialog.noneAvailable')}</p> : <label className="work-field">{t('tools.dialog.tool')}<select value={tool} onChange={e => setTool(e.target.value)}>{tools.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    <label className="work-field">{t('tools.dialog.project')}<select value={project} onChange={e => setProject(e.target.value)}><option value="">{t('tools.dialog.noProject')}</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <label className="work-field">{t('tools.dialog.note')}<input value={note} maxLength={1000} onChange={e => setNote(e.target.value)} placeholder="Truck 2" /></label>
    {error && <p role="alert" className="work-error">{error}</p>}
    <div className="live-actions"><button type="button" className="work-primary" disabled={busy || !tool} onClick={() => void save()}>{t('tools.dialog.take')}</button><button type="button" onClick={onClose}>{t('templates.cancel')}</button></div>
  </WorkDialog>;
}
