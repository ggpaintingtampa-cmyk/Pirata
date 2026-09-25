import { FileText } from 'lucide-react';
import type { Attachment } from '@pirata/contracts/index';
import { useT } from '../i18n';
export const fileContentUrl=(id:string,preview=false)=>'/api/v1/files/'+encodeURIComponent(id)+'/content'+(preview?'?preview=1':'');
/** Very small thumbnails (Andres: "small, very small"); tap opens the file. Pass already-filtered attachments. */
export function ThumbStrip({attachments,max=8,onOpen,size=40}:{attachments:Attachment[];max?:number;onOpen?(id:string):void;size?:number}) {
  const t=useT(),visible=attachments.filter(a=>!a.removedAt).slice(0,max),extra=attachments.filter(a=>!a.removedAt).length-visible.length;
  if(!visible.length)return null;
  const open=(a:Attachment)=>onOpen?onOpen(a.id):window.open(fileContentUrl(a.id),'_blank','noopener');
  return <div className="thumb-strip" role="list">{visible.map(a=><button key={a.id} type="button" role="listitem" className="thumb" style={{width:size,height:size}} aria-label={t('shell.openFile')+': '+a.name} onClick={()=>open(a)}>
    {a.mimeType.startsWith('image/')?<img src={fileContentUrl(a.id,true)} alt="" loading="lazy" width={size} height={size}/>:<FileText size={Math.round(size*0.5)} aria-hidden="true"/>}
  </button>)}{extra>0&&<span className="thumb-more">+{extra}</span>}</div>;
}
