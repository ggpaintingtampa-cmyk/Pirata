import { tx, currentLocaleValue } from '../../i18n';
import { localeTag } from '../../i18n/locale';
import { useState, type CSSProperties } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Plus } from 'lucide-react';
import type { ScheduleBlock, TeamMember } from '@pirata/contracts/index';
import type { ModuleProps } from '../../services/moduleProps';
import { ScheduleTaskDialog } from './index';
import { clockMinute } from '../tasks-time/time';
import './styles.css';

type Mode='hours'|'day'|'week'|'month';
type Event=ScheduleBlock&{personId:string};
const COLORS=['#e5a93b','#78baff','#c7b2ff','#9ad7b5','#f5abc8','#c7ced8'];
function shifted(date:string,days:number){const value=new Date(date+'T12:00:00Z');value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);}
function weekStart(date:string){return shifted(date,-((new Date(date+'T12:00:00Z').getUTCDay()+6)%7));}
function dateLabel(date:string){return new Intl.DateTimeFormat(localeTag(currentLocaleValue()),{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));}

function TimeGrid({events,people,colors,onEdit,combined=false}:{events:Event[];people:TeamMember[];colors:Map<string,string>;onEdit(id:string):void;combined?:boolean}) {
  const start=Math.min(480,...events.map(event=>Math.floor(event.startMinute/60)*60)),end=Math.max(1080,...events.map(event=>Math.ceil(event.endMinute/60)*60));
  const columns=combined?[{id:'all',name:tx('Combined schedule')}]:[...people.map(person=>({id:person.id,name:person.name})),...(events.some(event=>!event.personId)?[{id:'',name:tx('Unassigned / shared')}]:[])];
  if(!columns.length)columns.push({id:'',name:tx('Shared schedule')});
  return <div className={'calendar-time-scroll '+(combined?'calendar-combined':'calendar-separated')}>
    <div className="calendar-time-head" style={{gridTemplateColumns:`48px repeat(${columns.length},minmax(140px,1fr))`}}><span>{tx('Time')}</span>{columns.map(column=><strong key={column.id}>{!combined&&column.id&&<span className="person-dot" style={{background:colors.get(column.id)}} aria-hidden="true"/>}{column.name}</strong>)}</div>
    <div className="calendar-time-body" style={{gridTemplateColumns:`48px repeat(${columns.length},minmax(140px,1fr))`,height:end-start+38}}>
      <div className="calendar-hours">{Array.from({length:(end-start)/60+1},(_,index)=><span key={index} style={{top:index*60}}>{clockMinute(start+index*60)}</span>)}</div>
      {columns.map(column=>{
        const items=events.filter(event=>combined||event.personId===column.id).sort((a,b)=>a.startMinute-b.startMinute||a.endMinute-b.endMinute);
        const ends:number[]=[];const positions=items.map(event=>{let lane=ends.findIndex(endMinute=>endMinute<=event.startMinute);if(lane<0)lane=ends.length;ends[lane]=event.endMinute;return{event,lane};});
        const lanes=Math.max(1,ends.length);
        return <div className="calendar-time-column" key={column.id} style={{backgroundSize:'100% 60px'}}>{positions.map(({event,lane})=><button key={event.id} className="calendar-event" disabled={!event.taskId} onClick={()=>event.taskId&&onEdit(event.taskId)} style={{top:event.startMinute-start,height:Math.max(36,event.endMinute-event.startMinute-2),left:`calc(${lane/lanes*100}% + 2px)`,width:`calc(${100/lanes}% - 4px)`,'--person-color':colors.get(event.personId)??COLORS[5]} as CSSProperties} aria-label={`${event.title}, ${people.find(person=>person.id===event.personId)?.name??tx('Shared or unassigned')}, ${clockMinute(event.startMinute)} ${tx('to')} ${clockMinute(event.endMinute)}${event.taskId?', '+tx('edit schedule'):''}`}><span>{event.title}</span><small>{clockMinute(event.startMinute)}–{clockMinute(event.endMinute)}</small></button>)}</div>;
      })}
    </div>
  </div>;
}

export function CalendarView(app:ModuleProps) {
  const [mode,setMode]=useState<Mode>('month'),[selectedDate,setDate]=useState<string|null>(null),[selectedPeople,setPeople]=useState<string[]|null>(null),[editing,setEditing]=useState<string|null>(null),[showShared,setShowShared]=useState(true);
  const date=selectedDate??app.businessDate,people=app.snapshot.team??[],selection=selectedPeople??people.map(person=>person.id);
  const colors=new Map(people.map((person,index)=>[person.id,COLORS[index%COLORS.length]]));
  const events:Event[]=app.snapshot.schedule.filter(event=>!event.taskId||!app.snapshot.tasks.find(task=>task.id===event.taskId)?.archivedAt).map(event=>({...event,personId:app.snapshot.tasks.find(task=>task.id===event.taskId)?.assigneeId??''})).filter(event=>event.personId?selection.includes(event.personId):showShared);
  const selectedMembers=people.filter(person=>selection.includes(person.id));
  const dayEvents=(day:string)=>events.filter(event=>event.date===day).sort((a,b)=>a.startMinute-b.startMinute||a.id.localeCompare(b.id));
  const monthStart=date.slice(0,7)+'-01',calendarStart=weekStart(monthStart),days=Array.from({length:mode==='month'?42:7},(_,index)=>shifted(mode==='month'?calendarStart:weekStart(date),index));
  const periodLabel=mode==='month'?new Intl.DateTimeFormat(localeTag(currentLocaleValue()),{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(monthStart+'T12:00:00Z')):mode==='week'?dateLabel(days[0])+' – '+dateLabel(days[6]):dateLabel(date);
  const periodCount=mode==='month'?events.filter(event=>event.date.slice(0,7)===date.slice(0,7)).length:mode==='week'?events.filter(event=>days.includes(event.date)).length:dayEvents(date).length;
  function move(direction:number){if(mode==='month'){const next=new Date(monthStart+'T12:00:00Z');next.setUTCMonth(next.getUTCMonth()+direction);setDate(next.toISOString().slice(0,10));}else setDate(shifted(date,direction*(mode==='week'?7:1)));}
  function eventCard(event:Event){return <button className="calendar-agenda-event" key={event.id} disabled={!event.taskId} style={{'--person-color':colors.get(event.personId)??COLORS[5]} as CSSProperties} onClick={()=>event.taskId&&setEditing(event.taskId)} aria-label={`${event.title}, ${people.find(person=>person.id===event.personId)?.name??tx('Shared or unassigned')}, ${clockMinute(event.startMinute)}–${clockMinute(event.endMinute)}${event.taskId?', '+tx('edit schedule'):''}`}><small>{clockMinute(event.startMinute)}–{clockMinute(event.endMinute)}</small><strong>{event.title}</strong></button>;}
  return <section className="work-module calendar-module" aria-label={tx('Calendar')}>
    <div className="calendar-heading-actions"><button className="calendar-add" onClick={()=>setEditing('')}><Plus size={16} aria-hidden="true"/>{tx('Schedule task')}</button></div>
    <div className="calendar-modes" role="group" aria-label={tx('Calendar view')}>{([['hours','Time grid'],['day','Day'],['week','Week'],['month','Month']] as const).map(([value,label])=><button key={value} aria-pressed={mode===value} onClick={()=>setMode(value)}>{tx(label)}</button>)}</div>
    <div className="calendar-control-panel">
      <div className="calendar-period-controls"><h3>{periodLabel}</h3><button aria-label={tx('Previous period')} onClick={()=>move(-1)}><ChevronLeft size={20} aria-hidden="true"/></button><button aria-label={tx('Next period')} onClick={()=>move(1)}><ChevronRight size={20} aria-hidden="true"/></button></div>
      <div className="calendar-toolbar"><button className="calendar-today" onClick={()=>setDate(app.businessDate)}>{tx('Today')}</button><label className="work-field"><span>{tx('Calendar date')}</span><input type="date" value={date} onChange={event=>{if(event.target.value)setDate(event.target.value);}}/></label></div>
    </div>
    <div className="calendar-period-heading"><span aria-live="polite">{periodCount} {periodCount===1?tx('scheduled block'):tx('scheduled blocks')}</span><p className="calendar-timezone"><Clock3 size={14} aria-hidden="true"/><span>{tx('New York time')}</span></p></div>
    {mode==='hours'&&<>{!dayEvents(date).length&&<div className="calendar-empty"><CalendarDays size={22} aria-hidden="true"/><p>{tx('No work scheduled for this date. There’s room to make a plan.')}</p></div>}<TimeGrid events={dayEvents(date)} people={selectedMembers} colors={colors} onEdit={setEditing}/><TimeGrid events={dayEvents(date)} people={selectedMembers} colors={colors} onEdit={setEditing} combined/></>}
    {mode==='day'&&<div className="calendar-agenda">{dayEvents(date).length?dayEvents(date).map(eventCard):<div className="calendar-empty"><CalendarDays size={24} aria-hidden="true"/><p>{tx('No work scheduled. Add a time block when you are ready.')}</p></div>}</div>}
    {mode==='week'&&<div className="calendar-week">{days.map(day=><section key={day} className={day===app.businessDate?'calendar-current-day':''}><button className="calendar-day-heading" aria-current={day===app.businessDate?'date':undefined} onClick={()=>{setDate(day);setMode('hours');}}>{dateLabel(day)}<ChevronRight size={14} aria-hidden="true"/></button>{dayEvents(day).length?dayEvents(day).map(eventCard):<p>{tx('No plans')}</p>}</section>)}</div>}
    {mode==='month'&&<div className="calendar-month"><div className="calendar-weekdays">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day=><span key={day}>{tx(day)}</span>)}</div><div className="calendar-month-days">{days.map(day=><button key={day} className={[day.slice(0,7)!==date.slice(0,7)&&'calendar-other-month',day===app.businessDate&&'calendar-current-day',day===date&&'calendar-selected-day'].filter(Boolean).join(' ')} aria-current={day===app.businessDate?'date':undefined} aria-label={`${dateLabel(day)}, ${dayEvents(day).length} ${tx('scheduled blocks, open day')}`} onClick={()=>{setDate(day);setMode('day');}}><strong>{Number(day.slice(-2))}</strong><span className="calendar-month-dots" aria-hidden="true">{[...new Set(dayEvents(day).map(event=>event.personId))].slice(0,5).map(personId=><span key={personId} className="person-dot" style={{background:colors.get(personId)??COLORS[5]}}/>)}</span><span className="calendar-month-titles">{dayEvents(day).slice(0,2).map(event=><span key={event.id} style={{borderColor:colors.get(event.personId)??COLORS[5]}}>{clockMinute(event.startMinute)} {event.title}</span>)}</span></button>)}</div></div>}
    <fieldset className="calendar-people"><legend>{tx('Filter by team')}</legend><button type="button" aria-pressed={selection.length===people.length} onClick={()=>setPeople(people.map(person=>person.id))}>{tx('Everyone')}</button>{people.map(person=><label key={person.id} className={selection.includes(person.id)?'calendar-person-selected':''} style={{'--person-color':colors.get(person.id)} as CSSProperties}><input type="checkbox" checked={selection.includes(person.id)} onChange={event=>setPeople(event.target.checked?[...selection,person.id]:selection.filter(id=>id!==person.id))}/><span className="person-dot" style={{background:colors.get(person.id)}} aria-hidden="true"/>{person.name}</label>)}</fieldset>
    <label className="calendar-shared-toggle"><span><span className="person-dot" style={{background:COLORS[5]}} aria-hidden="true"/>{tx('Shared / unassigned')}</span><input type="checkbox" role="switch" checked={showShared} onChange={event=>setShowShared(event.target.checked)}/></label>
    <p className="calendar-help">{tx('Choose a block to edit its time. Overlaps require an explicit choice; other plans stay where you put them.')}</p>
    {editing!==null&&<ScheduleTaskDialog {...app} businessDate={date} selection={{taskId:editing||undefined}} onClose={()=>setEditing(null)}/>}
  </section>;
}
