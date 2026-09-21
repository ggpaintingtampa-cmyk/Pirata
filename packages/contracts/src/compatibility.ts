import type { AppState } from '@pirata/domain/domain/types';
import { validateState } from '@pirata/domain/domain/schema';
import { businessDate } from '@pirata/domain/lib/dates';
import type { BusinessSnapshot } from './index.js';

/** Read-only projection for existing Today selectors. Never persist under the v1 key. */
export function toLegacyState(s:BusinessSnapshot):AppState {
  const base = ({id,createdAt}: {id:string;createdAt:number}) => ({id,createdAt});
  return validateState({schemaVersion:1,timezone:s.timezone,currency:s.currency,seededOn:businessDate(s.serverNow),
    projects:s.projects.map(p=>({id:p.id,name:p.name,clientName:s.clients.find(c=>c.id===p.clientId)?.name||p.clientName||'General business',status:p.status})),
    tasks:s.tasks.map(t=>({...base(t),projectId:t.projectId,title:t.title,estimatedMinutes:Math.max(1,t.estimatedMinutes),status:t.status,note:t.note})),
    objectives:s.objectives.map(o=>({id:o.id,date:o.date,title:o.title,taskId:o.taskId,status:o.status,note:o.note,rank:o.rank})),
    schedule:s.schedule.map(b=>({id:b.id,date:b.date,startMinute:b.startMinute,endMinute:b.endMinute,kind:b.kind,title:b.title,taskId:b.taskId})),
    timeEntries:s.timeEntries.map(e=>e.source==='timer'?{id:e.id,taskId:e.taskId,source:e.source,startedAt:e.startedAt,endedAt:e.endedAt,note:e.note}:{id:e.id,taskId:e.taskId,source:e.source,date:e.date,durationSeconds:e.durationSeconds,note:e.note}),
    runningTimer:s.runningTimer,
    expenses:s.expenses.map(e=>({...base(e),purchaseDate:e.purchaseDate,description:e.description,category:e.category,amountCents:e.amountCents,projectId:e.projectId})),
    materials:s.materials.map(m=>({id:m.id,name:m.name,product:m.product,color:m.color,finish:m.finish,unit:m.unit,stockMinor:m.stockMinor})),
    materialRequirements:s.materialRequirements.map(r=>({id:r.id,materialId:r.materialId,projectId:r.projectId,neededMinor:r.neededMinor,reservedMinor:r.reservedMinor})),
    materialAdjustments:s.materialAdjustments.map(a=>({...base(a),materialId:a.materialId,deltaMinor:a.deltaMinor,reason:a.reason,note:a.note})),
    maintenance:s.maintenance.map(m=>({id:m.id,equipmentName:s.equipment.find(e=>e.id===m.equipmentId)?.name||m.equipmentName,title:m.title,dueDate:m.dueDate,completedAt:m.completedAt})),
    leads:s.leads.map(l=>({id:l.id,name:l.name,phone:l.phone,email:l.email,workDescription:l.workDescription,nextFollowUpDate:l.nextFollowUpDate,followUps:l.followUps.map(f=>({id:f.id,at:f.at,note:f.note}))}))});
}
