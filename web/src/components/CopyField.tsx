import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useT } from '../i18n';
/** A labelled value with a one-tap copy button (no tap-to-call by design). */
export function CopyField({label,value,hint}:{label:string;value:string;hint?:string}) {
  const t=useT(),[copied,setCopied]=useState(false),timer=useRef<number|undefined>(undefined);
  useEffect(()=>()=>window.clearTimeout(timer.current),[]);
  const copy=async()=>{
    try{await navigator.clipboard.writeText(value);}
    catch{const area=document.createElement('textarea');area.value=value;document.body.append(area);area.select();try{document.execCommand('copy');}catch{/* unsupported */}area.remove();}
    setCopied(true);window.clearTimeout(timer.current);timer.current=window.setTimeout(()=>setCopied(false),1500);
  };
  return <div className="copy-field"><span className="copy-field-label">{label}</span><span className="copy-field-value" data-testid="copy-value">{value||'—'}</span>{hint&&<small className="copy-field-hint">{hint}</small>}
    {value&&<button type="button" className="copy-field-button" aria-label={t('shell.copy')+' '+label} onClick={()=>void copy()}>{copied?<Check size={15} aria-hidden="true"/>:<Copy size={15} aria-hidden="true"/>}{copied?t('shell.copied'):t('shell.copy')}</button>}</div>;
}
