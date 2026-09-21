import { AppShell } from './components/AppShell';
import { Modal } from './components/Modal';
import { TodayPage } from './features/today/TodayPage';
import { useApp } from './state/AppProvider';
import { ObjectivesDialog } from './features/dialogs/ObjectivesDialog';
import { TaskDialog } from './features/dialogs/TaskDialog';
import { ScheduleTaskDialog } from './features/dialogs/ScheduleTaskDialog';
import { TimeEntriesDialog } from './features/dialogs/TimeEntriesDialog';
import { AttentionDetailDialog } from './features/dialogs/AttentionDetailDialog';
import { ExpensesDialog } from './features/dialogs/ExpensesDialog';
import { DemoInfoDialog } from './features/dialogs/DemoInfoDialog';
import { QuickAddDialog } from './features/quick-add/QuickAddDialog';
import { SwitchTimerDialog, ClockCorrectionDialog } from './features/dialogs/TimerDialogs';
export default function App() {
  const { dialog, setDialog, snapshot } = useApp();
  const titles = { objectives: 'Edit objectives', task: 'Task details', schedule: 'Schedule task', timeEntries: 'Time entries', attention: 'Attention details', expenses: 'Today’s expenses', demo: 'About this demo', quick: 'Quick Add', switch: 'Switch running task', clock: 'Correct active timer' };
  const quickTitles = { task: 'Add task', expense: dialog?.kind === 'quick' && dialog.recordId ? 'Edit expense' : 'Add expense', time: dialog?.kind === 'quick' && dialog.recordId ? 'Correct time entry' : 'Add time entry', material: 'Material adjustment', lead: 'Add lead' };
  const title = dialog ? dialog.kind === 'quick' && dialog.form ? quickTitles[dialog.form] : titles[dialog.kind] : '';
  return <AppShell><TodayPage />{dialog && <Modal title={title} onClose={() => setDialog(null)}>
    {snapshot.mode === 'conflict' ? <p role="alert">This demo changed in another tab. Reload to continue.</p> :
      dialog.kind === 'objectives' ? <ObjectivesDialog /> :
      dialog.kind === 'task' ? <TaskDialog key={dialog.id} id={dialog.id} /> :
      dialog.kind === 'schedule' ? <ScheduleTaskDialog key={dialog.id} id={dialog.id} /> :
      dialog.kind === 'timeEntries' ? <TimeEntriesDialog id={dialog.id} /> :
      dialog.kind === 'attention' ? <AttentionDetailDialog key={dialog.item.id} item={dialog.item} /> :
      dialog.kind === 'expenses' ? <ExpensesDialog /> :
      dialog.kind === 'demo' ? <DemoInfoDialog /> :
      dialog.kind === 'quick' ? <QuickAddDialog key={(dialog.form ?? 'menu') + (dialog.recordId ?? '')} {...dialog} /> :
      dialog.kind === 'switch' ? <SwitchTimerDialog taskId={dialog.taskId} /> : <ClockCorrectionDialog />}
  </Modal>}</AppShell>;
}
