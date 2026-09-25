import { useId } from 'react';
/** Minute-of-day picker backed by a native time input (replaces typed HH:MM and ISO strings). */
export function minuteToTime(minute:number|null):string {return minute===null?'':String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0');}
export function timeToMinute(value:string):number|null {const m=/^(\d{2}):(\d{2})$/.exec(value);return m?Number(m[1])*60+Number(m[2]):null;}
export function TimeField({label,value,onChange,required,hint,disabled,step=300}:{label:string;value:number|null;onChange(minute:number|null):void;required?:boolean;hint?:string;disabled?:boolean;step?:number}) {
  const id=useId();
  return <label className="field time-field" htmlFor={id}><span>{label}</span><input id={id} type="time" step={step} value={minuteToTime(value)} required={required} disabled={disabled} onChange={e=>onChange(timeToMinute(e.target.value))}/>{hint&&<small>{hint}</small>}</label>;
}
