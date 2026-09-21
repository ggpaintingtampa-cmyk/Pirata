import { useEffect, useState, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import type { BusinessSnapshot } from '@pirata/contracts/index';
import { businessDate } from '@pirata/domain/lib/dates';
import { createBusinessService } from '../../../../src/services/api';
import type { ModuleProps } from '../../../../src/services/moduleProps';
import * as tasks from '../../../../src/features/tasks-time';
import * as planning from '../../../../src/features/planning';
import {WorkView,ProgressView} from '../../../../src/features/work';
import '../../../../src/styles/tokens.css';
import '../../../../src/styles/global.css';
import '../../../../src/styles/app.css';
const service = createBusinessService();
const views: Record<string, ComponentType<ModuleProps>> = {TaskList:tasks.TaskList,TaskEditor:tasks.TaskEditor,TimerControls:tasks.TimerControls,TimeEntriesView:tasks.TimeEntriesView,TaskChecklist:tasks.TaskChecklist,WorkView,ProgressView,...planning};
export function Harness() {
  const params = new URLSearchParams(location.search);
  const [view, setView] = useState(params.get('view') ?? 'TaskList');
  const [selection, setSelection] = useState<ModuleProps['selection']>(Object.fromEntries(['taskId', 'projectId'].flatMap(k => params.has(k) ? [[k, params.get(k)!]] : [])));
  const [snapshot, setSnapshot] = useState<BusinessSnapshot | null>(null), [ready, setReady] = useState(false), [message, setMessage] = useState(''), [password, setPassword] = useState('');
  async function refresh() { const next = await service.snapshot(); setSnapshot(current => current && current.revision > next.revision ? current : next); }
  useEffect(() => { void service.session().then(async s => { if (s.authenticated) await refresh(); setReady(true); }).catch(e => setMessage(String(e))); }, []);
  function navigate(name: string, next: ModuleProps['selection'] = selection) { setSelection(next); setView(name); }
  if (!ready) return <p>Initializing session…</p>;
  if (!snapshot) return <main className="work-module"><h1>Group A isolated harness</h1><form onSubmit={e => { e.preventDefault(); void service.login(password).then(refresh).catch(e => setMessage(String(e))); }}><label>Fixture password<input type="password" value={password} onChange={e => setPassword(e.target.value)} /></label><button>Sign in</button></form><p role="status">{message}</p></main>;
  const View = views[view];
  return <main id="main" tabIndex={-1} className="work-module" style={{ padding: 16, maxWidth: 900, margin: 'auto' }}><h1>Group A isolated harness</h1><nav className="work-actions">{['TaskList', 'TimerControls', 'TimeEntriesView', 'ObjectiveEditor', 'ScheduleTaskDialog'].map(v => <button key={v} onClick={() => navigate(v)}>{v}</button>)}<button onClick={() => void refresh().catch(e => setMessage(String(e)))}>Refresh snapshot</button></nav><p role="status">{message}</p>
    <section data-testid="module-view"><View key={view + JSON.stringify(selection)} service={service} snapshot={snapshot} businessDate={businessDate(snapshot.serverNow)} selection={selection} refresh={refresh} onClose={() => navigate('TaskList')} onSaved={setMessage}
      onOpenTask={id => navigate('TaskEditor', { taskId: id })} onAddTask={id => navigate('TaskEditor', id ? { projectId: id } : {})}
      onOpenExpense={() => setMessage('Expense callback')} onAddExpense={() => setMessage('Add expense callback')} onOpenProject={id => setMessage('Project: ' + id)} onOpenClient={id => setMessage('Client: ' + id)} /></section>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
