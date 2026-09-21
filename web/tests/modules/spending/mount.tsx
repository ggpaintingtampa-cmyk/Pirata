import { useEffect, useState, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import type { BusinessSnapshot } from '@pirata/contracts/index';
import { businessDate } from '@pirata/domain/lib/dates';
import { createBusinessService } from '../../../src/services/api';
import type { ModuleProps } from '../../../src/services/moduleProps';
import { ExpenseForm, ExpensesView } from '../../../src/features/spending';
import { InventoryView, MaterialDetail, MaintenanceDetail } from '../../../src/features/inventory';
import '../../../src/styles/tokens.css';
import '../../../src/styles/global.css';
const service = createBusinessService();
const views: Record<string, ComponentType<ModuleProps>> = { ExpenseForm, ExpensesView, InventoryView, MaterialDetail, MaintenanceDetail };
export function Harness() {
  const [snapshot, setSnapshot] = useState<BusinessSnapshot | null>(null), [message, setMessage] = useState(''), [password, setPassword] = useState(''), [initialized, setInitialized] = useState(false), [closed, setClosed] = useState(false);
  async function refresh() { const next = await service.snapshot(); setSnapshot(current => current && current.revision > next.revision ? current : next); }
  useEffect(() => { void service.session().then(s => s.authenticated ? refresh() : undefined).catch(e => setMessage(String(e))).finally(() => setInitialized(true)); }, []);
  const params = new URLSearchParams(location.search), View = views[params.get('view') ?? 'ExpensesView'];
  const selection = Object.fromEntries(['expenseId', 'projectId', 'materialId', 'equipmentId', 'maintenanceId'].flatMap(key => params.has(key) ? [[key, params.get(key)!]] : []));
  if (!initialized) return <p>Initializing session…</p>;
  if (!snapshot) return <main><h1>Group B isolated preview</h1><form onSubmit={e => { e.preventDefault(); void service.login(password).then(() => { setPassword(''); return refresh(); }).catch(e => setMessage(String(e))); }}><label>Fixture password<input type="password" value={password} onChange={e => setPassword(e.target.value)} /></label><button>Sign in</button></form><p role="status">{message}</p></main>;
  const navigate = (kind: string, id?: string | null) => setMessage(kind + (id ? ': ' + id : ''));
  return <main id="main" tabIndex={-1}><header style={{ padding: '12px 18px', borderBottom: '1px solid #d5dfd8' }}><strong>PIRATA · ISOLATED PREVIEW</strong><button data-testid="refresh" onClick={() => void refresh()}>Refresh data</button><p role="status" aria-live="polite">{message}</p></header><section data-testid="module-view">{closed ? <p>Closed</p> : <View service={service} snapshot={snapshot} businessDate={businessDate(snapshot.serverNow)} selection={selection} refresh={refresh} onClose={() => { setClosed(true); navigate('Closed'); }} onSaved={setMessage} onOpenTask={id => navigate('Task', id)} onAddTask={id => navigate('Add task', id)} onOpenExpense={id => navigate('Expense', id)} onAddExpense={id => navigate('Add expense', id)} onOpenProject={id => navigate('Project', id)} onOpenClient={id => navigate('Client', id)} />}</section></main>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
