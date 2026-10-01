import { useState } from 'react';
import { DeleteButton } from '../trash';
import { ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { templateDepth, type TemplateNode, type TemplateRequirement } from '@pirata/contracts/index';
import type { ModuleProps } from '../../services/moduleProps';
import { useT } from '../../i18n';
import { TranslatedText } from '../../components/TranslatedText';
import { useCan } from '../../state/permissions';
import { WorkDialog } from '../tasks-time/WorkDialog';
import { runCommand } from '../work/commands';
import { RequirementChips, RequirementsEditor, cleanRequirements, requirementCounts, type RequirementDraft } from './RequirementsEditor';
import './styles.css';
type Draft = { title: string; description: string; requirements: RequirementDraft[]; children: Draft[] };
type Catalog = { materials: { id: string; name: string }[]; equipment: { id: string; name: string }[] };
const empty = (): Draft => ({ title: '', description: '', requirements: [], children: [] });
/** Old trees have no `requirements`; the editor shows them as empty and saves them only when something was added. */
const toDraft = (nodes: readonly TemplateNode[]): Draft[] => nodes.map(n => ({ title: n.title, description: n.description ?? '', requirements: (n.requirements ?? []).map(r => ({ ...r })), children: toDraft(n.children ?? []) }));
const clean = (nodes: Draft[], catalog: Catalog): TemplateNode[] => nodes.filter(n => n.title.trim()).map(n => { const requirements = cleanRequirements(n.requirements, catalog); return { title: n.title.trim(), description: n.description.trim(), ...(requirements.length ? { requirements } : {}), children: clean(n.children, catalog) }; });
function parseTree(text: string | null | undefined): TemplateNode[] { try { return text ? JSON.parse(text) as TemplateNode[] : []; } catch { return []; } }
const allRequirements = (nodes: readonly TemplateNode[]): TemplateRequirement[] => nodes.flatMap(n => [...(n.requirements ?? []), ...allRequirements(n.children ?? [])]);
function TreePreview({ nodes, depth = 0, kind, id, prefix = 'tree' }: { nodes: readonly TemplateNode[]; depth?: number; kind: 'taskTemplate' | 'projectTemplate'; id: string; prefix?: string }) {
  return <ul className={'template-tree depth-' + depth}>{nodes.map((node, i) => <li key={i}><span><TranslatedText kind={kind} id={id} field={`${prefix}.${i}.title`} text={node.title} compact /></span>{node.description && <small><TranslatedText kind={kind} id={id} field={`${prefix}.${i}.description`} text={node.description} compact /></small>}<RequirementChips rows={node.requirements ?? []} />{node.children?.length ? <TreePreview nodes={node.children} depth={depth + 1} kind={kind} id={id} prefix={`${prefix}.${i}`} /> : null}</li>)}</ul>;
}
function NodeEditor({ node, depth, path, catalog, onChange, onRemove, t }: { node: Draft; depth: number; path: string; catalog: Catalog; onChange(next: Draft): void; onRemove(): void; t(key: string, vars?: Record<string, string | number>): string }) {
  const update = (i: number, child: Draft) => onChange({ ...node, children: node.children.map((c, j) => j === i ? child : c) });
  const counts = requirementCounts(node.requirements.filter(r => r.name.trim()));
  return <div className={'template-node depth-' + depth}>
    <div className="template-node-fields"><input placeholder={t(depth === 0 ? 'templates.task' : depth === 1 ? 'templates.subtask' : 'templates.tiny')} value={node.title} onChange={e => onChange({ ...node, title: e.target.value })} /><input placeholder={t('templates.description')} value={node.description} onChange={e => onChange({ ...node, description: e.target.value })} /><button type="button" aria-label={t('templates.remove')} onClick={onRemove}><Trash2 size={15} aria-hidden="true" /></button></div>
    <details><summary>{t('templates.requirements.summary', counts)}</summary><RequirementsEditor idPrefix={path} value={node.requirements} onChange={requirements => onChange({ ...node, requirements })} materials={catalog.materials} equipment={catalog.equipment} /></details>
    {node.children.map((child, i) => <NodeEditor key={i} node={child} depth={depth + 1} path={path + '-' + i} catalog={catalog} t={t} onChange={next => update(i, next)} onRemove={() => onChange({ ...node, children: node.children.filter((_, j) => j !== i) })} />)}
    {depth < 2 && <button type="button" className="work-link-button" onClick={() => onChange({ ...node, children: [...node.children, empty()] })}><Plus size={14} aria-hidden="true" />{t(depth === 0 ? 'templates.addSubtask' : 'templates.addTiny')}</button>}
  </div>;
}
type Editor = { kind: 'task' | 'project'; id?: string; nodes: Draft[]; name: string; note: string };
export function TemplatesView(app: ModuleProps) {
  const t = useT(), canManage = useCan('template.manage');
  const [editor, setEditor] = useState<Editor | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [apply, setApply] = useState<null | { kind: 'task' | 'project'; id: string; projectId: string }>(null);
  const projects = app.snapshot.projects.filter(p => p.status !== 'completed');
  const catalog: Catalog = { materials: app.snapshot.materials.map(m => ({ id: m.id, name: m.name })), equipment: app.snapshot.equipment.filter(e => e.archivedAt === null).map(e => ({ id: e.id, name: e.name })) };
  const run = async (command: Parameters<typeof runCommand>[1], done?: () => void) => { setBusy(true); const message = await runCommand(app, command); setError(message ?? ''); setBusy(false); if (!message) { done?.(); app.onSaved(t('templates.saved')); } };
  const save = () => { if (!editor) return; const tree = clean(editor.nodes, catalog); if (!editor.name.trim() || !tree.length) { setError(t('templates.needName')); return; } if (templateDepth(tree) > 3) { setError(t('templates.tooDeep')); return; }
    const name = editor.name.trim(), note = editor.note.trim();
    void run(editor.kind === 'project' ? editor.id ? { type: 'projectTemplate.update', id: editor.id, name, note, tree } : { type: 'projectTemplate.save', name, note, tree } : editor.id ? { type: 'taskTemplate.updateTree', id: editor.id, name, tree } : { type: 'taskTemplate.saveTree', name, tree }, () => setEditor(null)); };
  const applyTarget = apply ? (apply.kind === 'project' ? app.snapshot.projectTemplates?.find(i => i.id === apply.id)?.tree : app.snapshot.taskTemplates?.find(i => i.id === apply.id)?.tree) : null;
  const applyCounts = requirementCounts(allRequirements(parseTree(applyTarget)));
  const version = (item: { version?: number }) => <span className="template-version">v{item.version ?? 1}</span>;
  return <section className="work-module templates-view" aria-label={t('shell.view.templates')}>
    {canManage && <div className="live-actions"><button className="work-primary" onClick={() => setEditor({ kind: 'project', nodes: [empty()], name: '', note: '' })}><Plus size={16} aria-hidden="true" />{t('templates.newProject')}</button><button onClick={() => setEditor({ kind: 'task', nodes: [empty()], name: '', note: '' })}><Plus size={16} aria-hidden="true" />{t('templates.newTask')}</button></div>}
    <h3>{t('templates.projectTemplates')}</h3>
    {!(app.snapshot.projectTemplates ?? []).length && <p className="empty-state">{t('templates.noneProject')}</p>}
    {(app.snapshot.projectTemplates ?? []).map(item => <article key={item.id} className="card template-card"><h4><TranslatedText kind="projectTemplate" id={item.id} field="name" text={item.name} compact />{version(item)}</h4>{item.note && <TranslatedText kind="projectTemplate" id={item.id} field="note" text={item.note} as="p" />}<TreePreview nodes={parseTree(item.tree)} kind="projectTemplate" id={item.id} /><div className="live-actions"><button type="button" onClick={() => setApply({ kind: 'project', id: item.id, projectId: projects[0]?.id ?? '' })}>{t('templates.applyProject')}<ChevronRight size={15} aria-hidden="true" /></button>{canManage && <button type="button" onClick={() => setEditor({ kind: 'project', id: item.id, nodes: toDraft(parseTree(item.tree)), name: item.name, note: item.note })}><Pencil size={14} aria-hidden="true" />{t('templates.edit')}</button>}{canManage && <DeleteButton app={app} kind="projectTemplate" id={item.id} label={item.name} />}</div></article>)}
    <h3>{t('templates.taskTemplates')}</h3>
    {!(app.snapshot.taskTemplates ?? []).length && <p className="empty-state">{t('templates.noneTask')}</p>}
    {(app.snapshot.taskTemplates ?? []).map(item => { const tree = parseTree(item.tree); return <article key={item.id} className="card template-card"><h4><TranslatedText kind="taskTemplate" id={item.id} field="name" text={item.name} compact />{tree.length > 0 && version(item)}</h4>{tree.length ? <TreePreview nodes={tree} kind="taskTemplate" id={item.id} /> : <p className="muted">{(JSON.parse(item.titles) as string[]).join(' · ')}</p>}<div className="live-actions">{tree.length > 0 && <button type="button" onClick={() => setApply({ kind: 'task', id: item.id, projectId: projects[0]?.id ?? '' })}>{t('templates.applyTask')}<ChevronRight size={15} aria-hidden="true" /></button>}{canManage && tree.length > 0 && <button type="button" onClick={() => setEditor({ kind: 'task', id: item.id, nodes: toDraft(tree), name: item.name, note: '' })}><Pencil size={14} aria-hidden="true" />{t('templates.edit')}</button>}{canManage && <DeleteButton app={app} kind="taskTemplate" id={item.id} label={item.name} />}</div></article>; })}
    {editor && <WorkDialog title={t(editor.id ? 'templates.editTitle' : editor.kind === 'project' ? 'templates.newProject' : 'templates.newTask')} onClose={() => setEditor(null)}>
      {editor.id && <p className="muted">{t('templates.editHint')}</p>}
      <label className="work-field">{t('templates.name')}<input value={editor.name} onChange={e => setEditor({ ...editor, name: e.target.value })} /></label>
      {editor.kind === 'project' && <label className="work-field">{t('templates.note')}<input value={editor.note} onChange={e => setEditor({ ...editor, note: e.target.value })} /></label>}
      {editor.nodes.map((node, i) => <NodeEditor key={i} node={node} depth={0} path={'node-' + i} catalog={catalog} t={t} onChange={next => setEditor({ ...editor, nodes: editor.nodes.map((n, j) => j === i ? next : n) })} onRemove={() => setEditor({ ...editor, nodes: editor.nodes.filter((_, j) => j !== i) })} />)}
      <button type="button" className="work-link-button" onClick={() => setEditor({ ...editor, nodes: [...editor.nodes, empty()] })}><Plus size={14} aria-hidden="true" />{t('templates.addTask')}</button>
      <p className="muted">{t('templates.requirements.hint')}</p>
      {error && <p role="alert" className="work-error">{error}</p>}
      <div className="live-actions"><button type="button" className="work-primary" disabled={busy} onClick={save}>{t('templates.save')}</button><button type="button" onClick={() => setEditor(null)}>{t('templates.cancel')}</button></div>
    </WorkDialog>}
    {apply && <WorkDialog title={t('templates.applyTitle')} onClose={() => setApply(null)}>
      <label className="work-field">{t('templates.project')}<select value={apply.projectId} onChange={e => setApply({ ...apply, projectId: e.target.value })}>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <p className="muted">{t('templates.requirements.applySummary', applyCounts)}</p>
      {error && <p role="alert" className="work-error">{error}</p>}
      <div className="live-actions"><button type="button" className="work-primary" disabled={busy || !apply.projectId} onClick={() => void run(apply.kind === 'project' ? { type: 'projectTemplate.apply', templateId: apply.id, projectId: apply.projectId } : { type: 'taskTemplate.applyTree', templateId: apply.id, projectId: apply.projectId, parentTaskId: null }, () => setApply(null))}>{t('templates.apply')}</button><button type="button" onClick={() => setApply(null)}>{t('templates.cancel')}</button></div>
    </WorkDialog>}
  </section>;
}
