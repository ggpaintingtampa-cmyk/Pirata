import { ClipboardList, Wallet, Clock3, PackagePlus, UserPlus, ArrowLeft, ChevronRight } from 'lucide-react';
import { useApp, type QuickKind } from '../../state/AppProvider';
import { TaskForm } from './TaskForm';
import { ExpenseForm } from './ExpenseForm';
import { TimeEntryForm } from './TimeEntryForm';
import { MaterialAdjustmentForm } from './MaterialAdjustmentForm';
import { LeadForm } from './LeadForm';
export function QuickAddDialog({ form, recordId, taskId, materialId }: { form?: QuickKind; recordId?: string; taskId?: string; materialId?: string }) {
  const { setDialog } = useApp();
  if (!form) return <><p className="dialog-intro">A quick update, then back to work.</p><div className="quick-choices">{[
    { kind: 'task' as const, label: 'Task', caption: 'Plan the next piece of work', Icon: ClipboardList },
    { kind: 'expense' as const, label: 'Expense', caption: 'Record a purchase', Icon: Wallet },
    { kind: 'time' as const, label: 'Time entry', caption: 'Log time you already worked', Icon: Clock3 },
    { kind: 'material' as const, label: 'Material adjustment', caption: 'Restock, use, or correct quantities', Icon: PackagePlus },
    { kind: 'lead' as const, label: 'Lead', caption: 'Keep track of a new inquiry', Icon: UserPlus },
  ].map(({ kind, label, caption, Icon }) => <button key={kind} data-clean onClick={() => setDialog({ kind: 'quick', form: kind })}><span className="choice-icon"><Icon size={23} /></span><span><strong>{label}</strong><small>{caption}</small></span><ChevronRight size={20} /></button>)}</div><div className="form-footer"><button className="secondary" data-cancel>Cancel</button></div></>;
  return <><button className="text-button back-button" data-navigate onClick={() => setDialog({ kind: 'quick' })}><ArrowLeft size={17} />All quick actions</button>
    {form === 'task' ? <TaskForm /> : form === 'expense' ? <ExpenseForm recordId={recordId} /> : form === 'time' ? <TimeEntryForm recordId={recordId} taskId={taskId} /> : form === 'material' ? <MaterialAdjustmentForm materialId={materialId} /> : <LeadForm />}
  </>;
}
