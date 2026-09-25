import { useId } from 'react';
/** Calendar date picker producing YYYY-MM-DD (business dates are America/New_York calendar days). */
export function DateField({label,value,onChange,required,hint,disabled,min,max}:{label:string;value:string;onChange(date:string):void;required?:boolean;hint?:string;disabled?:boolean;min?:string;max?:string}) {
  const id=useId();
  return <label className="field date-field" htmlFor={id}><span>{label}</span><input id={id} type="date" value={value} required={required} disabled={disabled} min={min} max={max} onChange={e=>onChange(e.target.value)}/>{hint&&<small>{hint}</small>}</label>;
}
/** Add days to a YYYY-MM-DD string without timezone drift. */
export function addDays(date:string,days:number):string {const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
