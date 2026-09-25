import { tx } from '../../i18n';
import { useState } from 'react';
import type { Expense } from '@pirata/contracts/index';
import { formatMoney, parseMoneyToCents } from '@pirata/domain/lib/money';
import type { ModuleProps } from '../../services/moduleProps';
import { RecordForm } from './RecordForm';
import { RecordModal } from './RecordModal';
import { filteredExpenses, totalCents } from './selectors';
import './styles.css';

const categories: Expense['category'][] = ['materials', 'tools', 'fuel', 'maintenance', 'other'];
const decimal = (cents: number) => String(Math.floor(cents / 100)) + '.' + String(cents % 100).padStart(2, '0');
export function ExpenseForm(app: ModuleProps & { backLabel?: string; onDone?(): void }) {
  const existing = app.snapshot.expenses.find(e => e.id === app.selection?.expenseId);
  const [initial] = useState(() => ({ description: existing?.description ?? '', purchaseDate: existing?.purchaseDate ?? app.businessDate, category: existing?.category ?? 'materials', amountCents: existing ? decimal(existing.amountCents) : '', projectId: existing?.projectId ?? (existing ? '' : app.selection?.projectId ?? '') }));
  if (app.selection?.expenseId && !existing) return <RecordModal title={tx('Purchase unavailable')} onClose={app.onClose}><p>{tx('This purchase is no longer available. Refresh and review.')}</p><button data-cancel>{tx('Close')}</button></RecordModal>;
  return <RecordModal title={existing ? 'Edit purchase' : 'Add purchase'} onClose={app.onClose} backLabel={app.backLabel}>
    <RecordForm app={app} initial={initial} fields={[
      { name: 'description', label: tx('Description') },
      { name: 'amountCents', label: tx('Amount ($)'), hint: tx('Positive dollars, with at most two decimal places.') },
      { name: 'purchaseDate', label: tx('Purchase date'), type: 'date' },
      { name: 'category', label: tx('Category'), type: 'select', options: categories.map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) })) },
      { name: 'projectId', label: tx('Project'), type: 'select', options: [{ value: '', label: tx('General business') }, ...app.snapshot.projects.map(p => ({ value: p.id, label: p.name + (p.status === 'completed' ? ' (completed)' : '') }))] },
    ]} validate={(v): Record<string, string> => parseMoneyToCents(v.amountCents) === null ? { amountCents: 'Enter a positive amount with at most two decimals; no signs or exponents.' } : {}}
      command={v => { const fields = { description: v.description, purchaseDate: v.purchaseDate, category: v.category as Expense['category'], amountCents: parseMoneyToCents(v.amountCents)!, projectId: v.projectId || null }; return existing ? { type: 'expense.update', id: existing.id, ...fields } : { type: 'expense.create', ...fields }; }}
      message={existing ? 'Purchase updated.' : 'Purchase recorded.'} done={app.onDone ?? app.onClose} />
  </RecordModal>;
}
export function ExpensesView(app: ModuleProps) {
  const [date, setDate] = useState(app.businessDate), [project, setProject] = useState(app.selection?.projectId ?? '*');
  const [edit, setEdit] = useState<{ expenseId?: string } | null>(app.selection?.expenseId ? { expenseId: app.selection.expenseId } : null);
  const expenses = filteredExpenses(app.snapshot, date, project);
  let total: string;
  try { total = formatMoney(totalCents(expenses)); } catch { total = 'Total too large — narrow the filters'; }
  return <section className="sp-module" aria-label={tx('Spending')}>
    <header className="sp-header"><div><p className="sp-eyebrow">{tx('RECORDED PURCHASES')}</p><h2>{tx('Spending')}</h2><p>{tx('Every purchase, in one place.')}</p></div><button className="primary" onClick={() => setEdit({})}>{tx('Add purchase')}</button></header>
    <div className="sp-filters"><label>{tx('Purchase date filter')}<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label><label>{tx('Project filter')}<select value={project} onChange={e => setProject(e.target.value)}><option value="*">{tx('All projects and General business')}</option><option value="">{tx('General business')}</option>{app.snapshot.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button onClick={() => setDate('')}>{tx('All dates')}</button><button onClick={() => setDate(app.businessDate)}>{tx('Today')}</button></div>
    <div className="sp-total"><span>{tx('Active-filter total')}</span><strong>{total}</strong><small>{expenses.length} {expenses.length === 1 ? 'purchase' : 'purchases'}</small></div>
    <ul className="sp-records">{expenses.map(expense => <li key={expense.id}><div><h3>{expense.description}</h3><p>{expense.purchaseDate} · {expense.category}</p>{expense.projectId ? <button className="sp-link" onClick={() => app.onOpenProject(expense.projectId!)}>{app.snapshot.projects.find(p => p.id === expense.projectId)?.name ?? 'Project'}</button> : <p>{tx('General business')}</p>}</div><div className="sp-amount"><strong>{formatMoney(expense.amountCents)}</strong><button aria-label={'Edit ' + expense.description} onClick={() => setEdit({ expenseId: expense.id })}>{tx('Edit')}</button></div></li>)}</ul>
    {!expenses.length && <p className="sp-empty">{tx('No purchases match these filters.')}</p>}
    {edit && <ExpenseForm key={edit.expenseId ?? 'new'} {...app} selection={{ ...edit, projectId: project === '*' ? app.selection?.projectId : project || undefined }} onClose={() => setEdit(null)} />}
  </section>;
}
