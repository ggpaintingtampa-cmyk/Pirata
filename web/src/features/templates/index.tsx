import { useState } from 'react';
import { DeleteButton } from '../trash';
import { ChevronRight, Plus, Trash2 } from 'lucide-react';
import { templateDepth, type TemplateNode } from '@pirata/contracts/index';
import type { ModuleProps } from '../../services/moduleProps';
import { useT } from '../../i18n';
import { useCan } from '../../state/permissions';
import { WorkDialog } from '../tasks-time/WorkDialog';
import { runCommand } from '../work/commands';
import './styles.css';
type Draft = { title: string; description: string; children: Draft[] };
const empty = (): Draft => ({ title: '', description: '', children: [] });
const clean = (nodes: Draft[]): TemplateNode[] => nodes.filter(n => n.title.trim()).map(n => ({ title: n.title.trim(), description: n.description.trim(), children: clean(n.children) }));
function parseTree(text: string | null | undefined): TemplateNode[] { try { return text ? JSON.parse(text) as TemplateNode[] : []; } catch { return []; } }
function TreePreview({ nodes, depth = 0 }: { nodes: readonly TemplateNode[]; depth?: number }) {
  return <ul className={'template-tree depth-' + depth}>{nodes.map((node, i) => <li key={i}><span>{node.title}</span>{node.description && <small>{node.description}</small>}{node.children?.length ? <TreePreview nodes={node.children} depth={depth + 1} /> : null}</li>)}</ul>;
}
function NodeEditor({ node, depth, onChange, onRemove, t }: { node: Draft; depth: number; onChange(next: Draft): void; onRemove(): void; t(key: string): string }) {
  const update = (i: number, child: Draft) => onChange({ ...node, children: node.children.map((c, j) => j === i ? child : c) });
  return <div className={'template-node depth-' + depth}>
    <div className="template-node-fields"><input placeholder={t(depth === 0 ? 'templates.task' : depth === 1 ? 'templates.subtask' : 'templates.tiny')} value={node.title} onChange={e => onChange({ ...node, title: e.target.value })} /><input placeholder={t('templates.description')} value={node.description} onChange={e => onChange({ ...node, description: e.target.value })} /><button type="button" aria-label={t('templates.remove')} onClick={onRemove}><Trash2 size={15} aria-hidden="true" /></button></div>
    {node.children.map((child, i) => <NodeEditor key={i} node={child} depth={depth + 1} t={t} onChange={next => update(i, next)} onRemove={() => onChange({ ...node, children: node.children.filter((_, j) => j !== i) })} />)}
    {depth < 2 && <button type="button" className="work-link-button" onClick={() => onChange({ ...node, children: [...node.children, empty()] })}><Plus size={14} aria-hidden="true" />{t(depth === 0 ? 'templates.addSubtask' : 'templates.addTiny')}</button>}
  </div>;
}
export function TemplatesView(app: ModuleProps) {
  const t = useT(), canManage = useCan('template.manage');
  const [editor, setEditor] = useState<null | { kind: 'task' | 'project'; nodes: Draft[]; name: string; note: string }>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [apply, setApply] = useState<null | { kind: 'task' | 'project'; id: string; projectId: string }>(null);
  const projects = app.snapshot.projects.filter(p => p.status !== 'completed');
  const run = async (command: Parameters<typeof runCommand>[1], done?: () => void) => { setBusy(true); const message = await runCommand(app, command); setError(message ?? ''); setBusy(false); if (!message) { done?.(); app.onSaved(t('templates.saved')); } };
  const save = () => { if (!editor) return; const tree = clean(editor.nodes); if (!editor.name.trim() || !tree.length) { setError(t('templates.needName')); return; } if (templateDepth(tree) > 3) { setError(t('templates.tooDeep')); return; }
    void run(editor.kind === 'project' ? { type: 'projectTemplate.save', name: editor.name.trim(), note: editor.note.trim(), tree } : { type: 'taskTemplate.saveTree', name: editor.name.trim(), tree }, () => setEditor(null)); };
  return <section className="work-module templates-view" aria-label={t('shell.view.templates')}>
    {canManage && <div className="live-actions"><button className="work-primary" onClick={() => setEditor({ kind: 'project', nodes: [empty()], name: '', note: '' })}><Plus size={16} aria-hidden="true" />{t('templates.newProject')}</button><button onClick={() => setEditor({ kind: 'task', nodes: [empty()], name: '', note: '' })}><Plus size={16} aria-hidden="true" />{t('templates.newTask')}</button></div>}
    <h3>{t('templates.projectTemplates')}</h3>
    {!(app.snapshot.projectTemplates ?? []).length && <p className="empty-state">{t('templates.noneProject')}</p>}
    {(app.snapshot.projectTemplates ?? []).map(item => <article key={item.id} className="card template-card"><h4>{item.name}</h4>{item.note && <p>{item.note}</p>}<TreePreview nodes={parseTree(item.tree)} /><div className="live-actions"><button type="button" onClick={() => setApply({ kind: 'project', id: item.id, projectId: projects[0]?.id ?? '' })}>{t('templates.applyProject')}<ChevronRight size={15} aria-hidden="true" /></button>{canManage && <DeleteButton app={app} kind="projectTemplate" id={item.id} label={item.name} />}</div></article>)}
    <h3>{t('templates.taskTemplates')}</h3>
    {!(app.snapshot.taskTemplates ?? []).length && <p className="empty-state">{t('templates.noneTask')}</p>}
    {(app.snapshot.taskTemplates ?? []).map(item => { const tree = parseTree(item.tree); return <article key={item.id} className="card template-card"><h4>{item.name}</h4>{tree.length ? <TreePreview nodes={tree} /> : <p className="muted">{(JSON.parse(item.titles) as string[]).join(' · ')}</p>}<div className="live-actions">{tree.length > 0 && <button type="button" onClick={() => setApply({ kind: 'task', id: item.id, projectId: projects[0]?.id ?? '' })}>{t('templates.applyTask')}<ChevronRight size={15} aria-hidden="true" /></button>}{canManage && <DeleteButton app={app} kind="taskTemplate" id={item.id} label={item.name} />}</div></article>; })}
    {editor && <WorkDialog title={t(editor.kind === 'project' ? 'templates.newProject' : 'templates.newTask')} onClose={() => setEditor(null)}>
      <label className="work-field">{t('templates.name')}<input value={editor.name} onChange={e => setEditor({ ...editor, name: e.target.value })} /></label>
      {editor.kind === 'project' && <label className="work-field">{t('templates.note')}<input value={editor.note} onChange={e => setEditor({ ...editor, note: e.target.value })} /></label>}
      {editor.nodes.map((node, i) => <NodeEditor key={i} node={node} depth={0} t={t} onChange={next => setEditor({ ...editor, nodes: editor.nodes.map((n, j) => j === i ? next : n) })} onRemove={() => setEditor({ ...editor, nodes: editor.nodes.filter((_, j) => j !== i) })} />)}
      <button type="button" className="work-link-button" onClick={() => setEditor({ ...editor, nodes: [...editor.nodes, empty()] })}><Plus size={14} aria-hidden="true" />{t('templates.addTask')}</button>
      {error && <p role="alert" className="work-error">{error}</p>}
      <div className="live-actions"><button type="button" className="work-primary" disabled={busy} onClick={save}>{t('templates.save')}</button><button type="button" onClick={() => setEditor(null)}>{t('templates.cancel')}</button></div>
    </WorkDialog>}
    {apply && <WorkDialog title={t('templates.applyTitle')} onClose={() => setApply(null)}>
      <label className="work-field">{t('templates.project')}<select value={apply.projectId} onChange={e => setApply({ ...apply, projectId: e.target.value })}>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      {error && <p role="alert" className="work-error">{error}</p>}
      <div className="live-actions"><button type="button" className="work-primary" disabled={busy || !apply.projectId} onClick={() => void run(apply.kind === 'project' ? { type: 'projectTemplate.apply', templateId: apply.id, projectId: apply.projectId } : { type: 'taskTemplate.applyTree', templateId: apply.id, projectId: apply.projectId, parentTaskId: null }, () => setApply(null))}>{t('templates.apply')}</button><button type="button" onClick={() => setApply(null)}>{t('templates.cancel')}</button></div>
    </WorkDialog>}
  </section>;
}
