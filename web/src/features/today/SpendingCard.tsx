import { Wallet, ArrowUpRight } from 'lucide-react';
import type { AppState, Expense } from '../../domain/types';
import { projectName, spendingTotal, todaysExpenses } from '../../domain/selectors';
import { formatMoney } from '../../lib/money';
import { EmptyState } from '../../components/EmptyState';
export function SpendingCard({ state, date, onAll, onEdit }: { state: AppState; date: string; onAll: () => void; onEdit: (expense: Expense) => void }) {
  const expenses = todaysExpenses(state, date).slice(0, 3);
  return <section className="card spending-card" aria-labelledby="spending-heading"><div className="section-heading"><h2 id="spending-heading"><Wallet size={21} />Spent today</h2><button className="text-button" onClick={onAll}>View all<ArrowUpRight size={16} /></button></div>
    <p className="spending-total">{formatMoney(spendingTotal(state, date))}</p><p className="spending-caption">Recorded purchases · USD</p>
    {expenses.length ? <ul className="expense-list">{expenses.map(e => <li key={e.id}><button className="expense-row" onClick={() => onEdit(e)}><span><strong>{e.description}</strong><small>{projectName(state, e.projectId)}</small></span><strong className="expense-amount">{formatMoney(e.amountCents)}</strong></button></li>)}</ul> : <EmptyState>No spending recorded today.</EmptyState>}
    <p className="card-footnote">Includes general business expenses.</p>
  </section>;
}
