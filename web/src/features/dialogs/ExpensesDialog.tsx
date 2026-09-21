import { useApp } from '../../state/AppProvider';
import { todaysExpenses, spendingTotal, projectName } from '../../domain/selectors';
import { formatMoney } from '../../lib/money';
import { EmptyState } from '../../components/EmptyState';
export function ExpensesDialog() {
  const { state, date, setDialog } = useApp(); const expenses = todaysExpenses(state!, date);
  return <><p className="dialog-intro">{date} · {expenses.length} purchases · <strong>{formatMoney(spendingTotal(state!, date))}</strong></p>
    {expenses.length ? <ul className="record-list">{expenses.map(e => <li key={e.id}><div><strong>{e.description} · {formatMoney(e.amountCents)}</strong><small>{projectName(state!, e.projectId)} · {e.category}</small></div><button className="secondary" data-clean aria-label={'Edit ' + e.description} onClick={() => setDialog({ kind: 'quick', form: 'expense', recordId: e.id })}>Edit</button></li>)}</ul> : <EmptyState>No expenses for today.</EmptyState>}
    <button className="primary wide-button" data-clean onClick={() => setDialog({ kind: 'quick', form: 'expense' })}>Add expense</button><div className="form-footer"><button className="secondary" data-cancel>Close</button></div>
  </>;
}
