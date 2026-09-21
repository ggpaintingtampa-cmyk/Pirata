import { AlertCircle, PaintBucket, Wrench, UserRound } from 'lucide-react';
import type { AttentionItem } from '../../domain/selectors';
import { EmptyState } from '../../components/EmptyState';
export function AttentionCard({ items, onView }: { items: AttentionItem[]; onView: (item: AttentionItem) => void }) {
  return <section className="card attention-card" aria-labelledby="attention-heading"><div className="section-heading"><h2 id="attention-heading"><AlertCircle size={21} />Needs attention</h2><span className="attention-count">{items.length}</span></div>
    {items.length ? <ul className="attention-list">{items.map(item => { const Icon = item.kind === 'maintenance' ? Wrench : item.kind === 'shortage' ? PaintBucket : UserRound; return <li key={item.id}><span className="attention-icon"><Icon size={19} /></span><div className="attention-copy"><strong>{item.title}</strong><small>{item.detail}</small>{item.dueDate && <small className={item.overdue ? 'overdue' : ''}>{item.overdue ? 'Overdue · ' + item.dueDate : 'Due today'}</small>}</div><button className="text-button" aria-label={'View ' + item.title} onClick={() => onView(item)}>View</button></li>; })}</ul> : <EmptyState>Nothing needs attention today.</EmptyState>}
  </section>;
}
