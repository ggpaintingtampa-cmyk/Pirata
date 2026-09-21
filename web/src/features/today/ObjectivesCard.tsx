import { Target, Check } from 'lucide-react';
import type { Objective } from '../../domain/types';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
export function ObjectivesCard({ objectives, onEdit }: { objectives: Objective[]; onEdit: () => void }) {
  const done = objectives.filter(o => o.status === 'done').length;
  return <section className="card objectives-card" aria-labelledby="objectives-heading"><div className="section-heading"><h2 id="objectives-heading"><Target size={21} />Today's objectives</h2><button className="text-button" onClick={onEdit}>Edit<span className="sr-only"> objectives</span></button></div>
    <div className="objective-progress"><span>{done} of {objectives.length} complete</span><div className="progress-track" aria-hidden="true"><div style={{ width: (objectives.length ? done / objectives.length * 100 : 0) + '%' }} /></div></div>
    {objectives.length ? <ol className="objectives-list">{objectives.map((o, index) => <li key={o.id}><span className={'objective-number ' + (o.status === 'done' ? 'complete' : '')}>{o.status === 'done' ? <Check size={17} /> : String(index + 1).padStart(2, '0')}</span><div><span className={o.status === 'done' ? 'completed-title' : ''}>{o.title}</span>{o.note && <small>{o.note}</small>}</div><StatusBadge status={o.status} /></li>)}</ol> : <EmptyState>Choose up to three outcomes for today.</EmptyState>}
  </section>;
}
