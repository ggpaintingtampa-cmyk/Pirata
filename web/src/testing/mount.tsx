import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ComponentType } from 'react';
import type { BusinessSnapshot } from '@pirata/contracts/index';
import { businessDate } from '@pirata/domain/lib/dates';
import { createBusinessService } from '../services/api';
import type { ModuleProps } from '../services/moduleProps';
import { moduleViews } from './registry';
import '../styles/tokens.css';
import '../styles/global.css';
import '../styles/app.css';
const service=createBusinessService();
export function Harness(){
  const [snapshot,setSnapshot]=useState<BusinessSnapshot|null>(null),[message,setMessage]=useState(''),[password,setPassword]=useState('');
  async function refresh(){const next=await service.snapshot();setSnapshot(current=>current&&current.revision>next.revision?current:next);}
  useEffect(()=>{void service.session().then(s=>{if(s.authenticated)return refresh();}).catch(e=>setMessage(String(e)));},[]);
  const params=new URLSearchParams(location.search),module=params.get('module')??'clients-projects',view=params.get('view')??'ClientsView';
  const views=moduleViews[module as keyof typeof moduleViews];
  const View=views?.[view as keyof typeof views] as ComponentType<ModuleProps>|undefined;
  const selection=Object.fromEntries(['clientId','projectId','taskId','expenseId','materialId','equipmentId','maintenanceId','leadId'].flatMap(key=>params.has(key)?[[key,params.get(key)!]]:[]));
  if(!snapshot)return <main><h1>Isolated module harness</h1><form onSubmit={e=>{e.preventDefault();void service.login(password).then(()=>{setPassword('');return refresh();}).catch(e=>setMessage(String(e)));}}><label>Fixture password<input type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label><button>Sign in</button></form><p role="status">{message}</p></main>;
  const navigate=(kind:string,id?:string|null)=>setMessage(kind+(id?': '+id:''));
  return <main><h1>Isolated module harness</h1><p role="status">{message}</p>{View?<section data-testid="module-view"><View service={service} snapshot={snapshot} businessDate={businessDate(snapshot.serverNow)} selection={selection} refresh={refresh} onClose={()=>navigate('Closed')} onSaved={setMessage} onOpenTask={id=>navigate('Task',id)} onAddTask={id=>navigate('Add task',id)} onOpenExpense={id=>navigate('Expense',id)} onAddExpense={id=>navigate('Add expense',id)} onOpenProject={id=>navigate('Project',id)} onOpenClient={id=>navigate('Client',id)}/></section>:<p>Unknown module view.</p>}</main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
