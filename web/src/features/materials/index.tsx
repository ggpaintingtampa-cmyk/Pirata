import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import type { ShoppingItem } from '@pirata/contracts/index';
import type { ModuleProps } from '../../services/moduleProps';
import { useT, useLocale } from '../../i18n';
import { formatDateTime } from '../../i18n/locale';
import { TranslatedText } from '../../components/TranslatedText';
import { useCan } from '../../state/permissions';
import { runCommand } from '../work/commands';
import { RequestDialog } from './RequestDialog';
import { DeleteButton, mayDelete } from '../trash';
import './styles.css';
export type MaterialsFilter = 'open' | 'received' | 'all';
/** Pure filter shared with the unit test. */
export function filterRequests(items: readonly ShoppingItem[], filter: MaterialsFilter, projectId = '', createdBy = ''): ShoppingItem[] {
  return items.filter(item => !item.archivedAt && (filter === 'all' || (filter === 'received') === Boolean(item.receivedAt)) && (!projectId || item.projectId === projectId) && (!createdBy || item.createdBy === createdBy)).sort((a, b) => Number(Boolean(a.receivedAt)) - Number(Boolean(b.receivedAt)) || b.createdAt - a.createdAt);
}
/** Materials requests (replaces the Shopping list): item, quantity, for a project / task / person, received yes/no. */
export function MaterialsView(app: ModuleProps) {
  const t = useT(), locale = useLocale(), office = useCan('plan.others'), me = app.snapshot.currentUser?.id ?? '';
  const [filter, setFilter] = useState<MaterialsFilter>('open'), [projectId, setProjectId] = useState(''), [person, setPerson] = useState(''), [dialog, setDialog] = useState<null | { item?: ShoppingItem }>(null), [busy, setBusy] = useState('');
  const items = filterRequests(app.snapshot.shoppingItems ?? [], filter, projectId, person), team = app.snapshot.team ?? [];
  const name = (id: string | null | undefined) => team.find(m => m.id === id)?.name ?? '—', project = (id: string | null | undefined) => app.snapshot.projects.find(p => p.id === id)?.name ?? '', task = (id: string | null | undefined) => app.snapshot.tasks.find(item => item.id === id)?.title ?? '';
  const run = async (id: string, command: Parameters<typeof runCommand>[1]) => { setBusy(id); const message = await runCommand(app, command); setBusy(''); if (message) app.onSaved(message); };
  return <section className="work-module materials-view" aria-label={t('shell.view.materials')}>
    <div className="task-results-heading"><div className="cp-tabs" role="group">{(['open', 'received', 'all'] as const).map(value => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{t('materials.' + value)}</button>)}</div><button type="button" className="work-primary" onClick={() => setDialog({})}><Plus size={16} aria-hidden="true" />{t('materials.request')}</button></div>
    <div className="report-filters"><label className="work-field">{t('materials.filter.project')}<select value={projectId} onChange={e => setProjectId(e.target.value)}><option value="">{t('materials.filter.anyProject')}</option>{app.snapshot.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label className="work-field">{t('materials.filter.person')}<select value={person} onChange={e => setPerson(e.target.value)}><option value="">{t('materials.filter.any')}</option>{team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label></div>
    {!items.length && <p className="empty-state">{t('materials.none')}</p>}
    <ul className="materials-list">{items.map(item => { const mine = item.createdBy === me, editable = mine || office; return <li key={item.id} className={'materials-row' + (item.receivedAt ? ' is-received' : '')}>
      <button type="button" className={'day-check' + (item.receivedAt ? ' is-done' : '')} aria-pressed={Boolean(item.receivedAt)} aria-label={item.receivedAt ? t('materials.markOpen') : t('materials.markReceived')} disabled={!editable || busy === item.id} onClick={() => void run(item.id, { type: 'materialRequest.setReceived', id: item.id, received: !item.receivedAt })}>{item.receivedAt && <Check size={14} aria-hidden="true" />}</button>
      <div className="materials-main"><strong><TranslatedText kind="materialRequest" id={item.id} field="title" text={item.title} compact />{item.quantity ? ' × ' + item.quantity : ''}</strong>
        <small>{t('materials.for')}: {item.taskId ? task(item.taskId) + ' · ' + project(item.projectId) : item.projectId ? project(item.projectId) : item.forUserId === me ? t('materials.forMe') : name(item.forUserId)} · {t('materials.requestedBy', { name: name(item.createdBy), time: formatDateTime(locale, item.createdAt) })}</small>
        {item.note && <small><TranslatedText kind="materialRequest" id={item.id} field="note" text={item.note} compact /></small>}{item.receivedAt && <small className="materials-received">{t('materials.receivedBy', { name: name(item.receivedBy), time: formatDateTime(locale, item.receivedAt) })}</small>}</div>
      {editable && <div className="live-actions"><button type="button" onClick={() => setDialog({ item })}>{t('materials.edit')}</button>{mayDelete(app, 'materialRequest', item as unknown as Record<string, unknown>) && <DeleteButton app={app} kind="materialRequest" id={item.id} label={item.title}>{t('materials.remove')}</DeleteButton>}</div>}
    </li>; })}</ul>
    {dialog && <RequestDialog app={app} item={dialog.item} onClose={() => setDialog(null)} onDone={() => setDialog(null)} />}
  </section>;
}
