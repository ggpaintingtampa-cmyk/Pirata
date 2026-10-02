import { useState } from 'react';
import type { ModuleProps } from '../../services/moduleProps';
import { useT, tx } from '../../i18n';
import { WorkDialog } from '../tasks-time/WorkDialog';
import { WorkForm } from '../tasks-time/WorkForm';

/** Assigning a task is independent of choosing a day. Reuse the reviewed task mutation and retry-safe form. */
export function AssignTaskDialog({app,userId,onClose}:{app:ModuleProps;userId:string;onClose():void}) {
  const t=useT(),[query,setQuery]=useState('');
  const name=app.snapshot.team?.find(member=>member.id===userId)?.name??'';
  const available=app.snapshot.tasks.filter(task=>!task.archivedAt&&task.status!=='done'&&task.assigneeId!==userId);
  return <WorkDialog title={t('work.assign.title',{name})} onClose={onClose}>
    <p>{t('work.assign.hint')}</p>
    <WorkForm app={app} initial={{taskId:''}} message={t('work.assign.saved')} done={onClose} submitLabel={t('work.assign.save',{name})}
      validate={(values):Record<string,string>=>available.some(task=>task.id===values.taskId)?{}:{taskId:t('work.assign.choose')}}
      command={values=>{
        const task=available.find(item=>item.id===values.taskId);
        return {type:'task.update',id:values.taskId,title:task?.title??'',description:task?.description??'',projectId:task?.projectId??null,parentTaskId:task?.parentTaskId??null,estimatedMinutes:task?.estimatedMinutes??0,note:task?.note??'',assigneeId:userId};
      }}>{draft=>{
        const selected=available.find(task=>task.id===draft.values.taskId);
        const candidates=available.filter(task=>task.id===draft.values.taskId||[task.title,app.snapshot.projects.find(project=>project.id===task.projectId)?.name??''].some(text=>text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
        return <>
          <label className="work-field">{tx('Search tasks')}<input type="search" value={query} onChange={event=>setQuery(event.target.value)}/></label>
          {draft.field('taskId',t('work.assign.task'),{options:[{value:'',label:t('work.assign.choose')},...candidates.map(task=>({value:task.id,label:task.title+' · '+(app.snapshot.projects.find(project=>project.id===task.projectId)?.name??tx('Unfiled'))}))]})}
          {selected&&<p>{t('work.assign.current',{name:app.snapshot.team?.find(member=>member.id===selected.assigneeId)?.name??t('work.unassigned')})}</p>}
          {!available.length&&<p>{t('work.assign.empty')}</p>}
        </>;
      }}</WorkForm>
  </WorkDialog>;
}
