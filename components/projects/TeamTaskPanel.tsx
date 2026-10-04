import {useColorScheme} from '@/hooks/use-color-scheme';
import { TeamResultFiles } from './TeamResultFiles';
import {TeamButton,TeamInput} from './TeamControls';
import React, { useEffect, useState } from 'react';
import { Text, View, Switch } from 'react-native';
import { useAuth } from '@/store/auth';
import { useProjectMembers } from '@/hooks/use-project-members';
import { fetchProjectMembers } from '@/store/project-team';
import { loadData } from '@/store/storage';
import { saveSyncedChanges } from '@/store/synced-storage';
import { syncProject } from '@/store/project-sync';
import { apiFetch } from '@/store/api';
import { projectedRemaining, type WorkloadRow, dependencyWarnings, resultProblem, taskRights, type TeamRole } from '@/utils/teamwork';
import type { Task } from '@/utils/taskUtils';
export {TeamButton,TeamInput} from './TeamControls';

export function TeamTaskPanel({task,role,onSaved}: {task:Task;role:TeamRole;onSaved?:()=>void}) {
  const textColor=useColorScheme()==='dark'?'#F0EEFF':'#302341';
  const {user}=useAuth(), uid=String(user?.id??''),pid=task.projectId!;
  const members=useProjectMembers(pid).filter(m=>m.role!=='viewer');
  const [draft,setDraft]=useState(task),[error,setError]=useState(''),[busy,setBusy]=useState(false),[tasks,setTasks]=useState<Task[]>([]);
  const [startColumn,setStartColumn]=useState<string|null>(null);
  useEffect(()=>{void loadData<{id:string;projectId?:string;sourceStatusId?:string;type?:string}[]>('task_statuses',[]).then(columns=>{const col=columns.find(c=>c.projectId===pid&&c.sourceStatusId==='status-in-progress')??columns.find(c=>c.projectId===pid&&c.type==='in_progress');setStartColumn(col?.id??null);});},[pid]);
  useEffect(()=>setDraft(task),[task]);
  useEffect(()=>{void fetchProjectMembers(pid).catch(()=>{});void loadData<Task[]>('tasks',[]).then(setTasks);},[pid]);
  const rights=taskRights(task,role,uid);
  const [workload,setWorkload]=useState<WorkloadRow[]>([]);
  useEffect(()=>{if(rights.lead)void apiFetch<{results:WorkloadRow[]}>(`/projects/${encodeURIComponent(pid)}/workload/`).then(r=>setWorkload(r.results)).catch(()=>{});},[pid,rights.lead,task.updatedAt]);
  const load=workload.find(row=>row.userId===draft.assigneeId);
  const remaining=load ? projectedRemaining(load,task,draft) : null;
  const set=<K extends keyof Task>(key:K,value:Task[K])=>setDraft(d=>({...d,[key]:value}));
  const commit=async(patch:Partial<Task>={})=>{
    setError('');const next={...draft,...patch,updatedAt:new Date().toISOString()};
    if(next.blocked&&!next.blockReason?.trim()){setError('Поясніть перешкоду.');return;}
    if(patch.reviewState==='pending'||patch.status==='done'){const problem=resultProblem(next);if(problem){setError(problem);return;}}
    if(patch.reviewState==='changes_requested'&&!next.reviewFeedback?.trim()){setError('Поясніть доопрацювання.');return;}
    setBusy(true);
    try{
      if(patch.status){const columns=await loadData<{id:string;projectId?:string;isDone:boolean;name?:string;sourceStatusId?:string}[]>('task_statuses',[]);const col=(patch.reviewState==='pending'?columns.find(c=>c.projectId===pid&&(c.sourceStatusId==='team-review'||/перевір|review/i.test(c.name??''))):undefined)??columns.find(c=>c.projectId===pid&&(patch.status==='done'?c.isDone:!c.isDone));if(col)next.kanbanColumnId=col.id;}
      const all=await loadData<Task[]>('tasks',[]);await saveSyncedChanges('tasks',all,all.map(t=>t.id===task.id?next:t));
      setDraft(next);onSaved?.();void syncProject(pid);
    }catch(e){setError(String(e));}finally{setBusy(false);}
  };
  const person=(label:string,value:string|null|undefined,key:'assigneeId'|'reviewerId'|'blockedById',enabled:boolean,exclude?:string|null)=><View style={{gap:6}}><Text style={{color:textColor}}>{label}: {members.find(m=>String(m.user.id)===value)?.user.name||members.find(m=>String(m.user.id)===value)?.user.email||'Не призначено'}</Text>{enabled&&<View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}><TeamButton label="Не призначено" onPress={()=>set(key,null)}/>{members.filter(m=>String(m.user.id)!==exclude).map(m=><TeamButton key={m.user.id} label={(String(m.user.id)===value?'✓ ':'')+(m.user.name||m.user.email)} onPress={()=>set(key,String(m.user.id))}/>)}</View>}</View>;
  return <View style={{gap:12,padding:12,borderWidth:1,borderColor:'#9E93B2',borderRadius:14}}>
    <Text style={{color:textColor,fontSize:18,fontWeight:'700'}}>Відповідальність і результат</Text>
    {person('Відповідальний',draft.assigneeId,'assigneeId',rights.lead)}
    {rights.execute&&startColumn&&task.kanbanColumnId!==startColumn&&task.status!=='done'&&task.reviewState!=='pending'&&<TeamButton label="Почати роботу" onPress={()=>void commit({kanbanColumnId:startColumn})}/>}
    {rights.take&&<TeamButton label="Взяти завдання собі" disabled={busy} onPress={()=>void commit({assigneeId:uid})}/>}
    <TeamInput label="Дедлайн (РРРР-ММ-ДД)" value={draft.deadline?.slice(0,10)??''} onChange={v=>set('deadline',v)} editable={rights.plan}/>
    <TeamInput label="Пріоритет P0–P5" numeric value={draft.priorityLevel==null?'':String(draft.priorityLevel)} onChange={v=>set('priorityLevel',v===''?null:Math.min(5,Math.max(0,Number(v))) as Task['priorityLevel'])} editable={rights.plan}/>
    <TeamInput label="Оцінка, хвилин" numeric value={draft.estimatedMinutes==null?'':String(draft.estimatedMinutes)} onChange={v=>set('estimatedMinutes',v===''?undefined:Number(v))} editable={rights.execute}/>
    {load&&<Text style={{color:textColor}}>{remaining===null?'Доступність не вказана':`Залишок цього тижня після змін: ${Math.round(remaining/6)/10} год`}{remaining!==null&&remaining<0?' · Перевантаження — перевірте строки':''}{load.unestimated?` · Без оцінки: ${load.unestimated}`:''}</Text>}
    {rights.lead&&<View style={{flexDirection:'row',alignItems:'center',gap:8}}><Switch accessibilityLabel="Потрібна перевірка" value={!!draft.reviewRequired} onValueChange={v=>set('reviewRequired',v)}/><Text style={{color:textColor}}>Потрібна перевірка</Text></View>}
    {(draft.reviewRequired||rights.lead)&&person('Перевіряльник',draft.reviewerId,'reviewerId',rights.lead,draft.assigneeId)}
    {rights.lead&&<View style={{gap:6}}><Text style={{color:textColor}}>Обов’язковий результат</Text>{([['summary','Опис'],['link','Посилання'],['file','Файл']] as const).map(([key,label])=><View key={key} style={{flexDirection:'row',alignItems:'center',gap:8}}><Switch accessibilityLabel={label} value={draft.resultRequirements?.includes(key)??false} onValueChange={v=>set('resultRequirements',v?[...(draft.resultRequirements??[]),key]:(draft.resultRequirements??[]).filter(k=>k!==key))}/><Text style={{color:textColor}}>{label}</Text></View>)}</View>}
    <TeamInput label="Результат роботи" value={draft.resultSummary??''} multiline editable={rights.execute} onChange={v=>set('resultSummary',v)}/>
    <TeamInput label="Посилання на результат (кожне з нового рядка)" value={(draft.resultLinks??[]).join('\n')} multiline editable={rights.execute} onChange={v=>set('resultLinks',v.split('\n').filter(Boolean))}/>
    <TeamResultFiles projectId={pid} ids={draft.resultFiles??[]} editable={rights.execute} onChange={files=>set("resultFiles",files)}/>
    {task.reviewState==='pending'&&<Text style={{color:textColor}}>Очікує перевірки</Text>}{task.reviewState==='approved'&&<Text style={{color:textColor}}>Результат прийнято</Text>}
    {!!task.reviewFeedback&&<Text style={{color:textColor}}>Зауваження: {task.reviewFeedback}</Text>}
    {rights.submit&&task.reviewState==='pending'&&<TeamButton label="Відкликати з перевірки" onPress={()=>void commit({reviewState:'none',status:'active'})}/>}
    {rights.review&&<TeamInput label="Що потрібно доопрацювати" multiline value={draft.reviewFeedback??''} onChange={v=>set('reviewFeedback',v)}/>}
    <View style={{flexDirection:'row',alignItems:'center',gap:8}}><Switch accessibilityLabel="Заблоковано" disabled={!rights.execute} value={!!draft.blocked} onValueChange={v=>set('blocked',v)}/><Text style={{color:textColor}}>Заблоковано</Text></View>
    {draft.blocked&&<><TeamInput label="Причина перешкоди" editable={rights.execute} value={draft.blockReason??''} onChange={v=>set('blockReason',v)}/>{person('Від кого очікується дія',draft.blockedById,'blockedById',rights.execute)}</>}
    {rights.lead&&<View style={{gap:6}}><Text style={{color:textColor}}>Залежить від завдань</Text>{tasks.filter(t=>t.projectId===pid&&t.id!==task.id).map(t=><TeamButton key={t.id} label={(draft.dependencyIds?.includes(t.id)?'✓ ':'')+t.title} onPress={()=>set('dependencyIds',draft.dependencyIds?.includes(t.id)?draft.dependencyIds.filter(id=>id!==t.id):[...(draft.dependencyIds??[]),t.id])}/>)}</View>}
    {dependencyWarnings(draft,tasks).map(t=><Text key={t.id} style={{color:'#A46B1B'}}>Ще не завершено: {t.title}. Починати роботу можна.</Text>)}
    {!!error&&<Text accessibilityRole="alert" style={{color:'#D94040'}}>{error}</Text>}
    {rights.execute&&<TeamButton label="Зберегти зміни" disabled={busy} onPress={()=>void commit()}/>}
    {rights.submit&&task.status!=='done'&&task.reviewState!=='pending'&&<TeamButton label={draft.reviewRequired?'Передати на перевірку':'Завершити завдання'} disabled={busy} onPress={()=>void commit(draft.reviewRequired?{reviewState:'pending',status:'active'}:{status:'done'})}/>}
    {rights.review&&<><TeamButton label="Прийняти результат" disabled={busy} onPress={()=>void commit({reviewState:'approved',status:'done'})}/><TeamButton label="Повернути на доопрацювання" disabled={busy} onPress={()=>void commit({reviewState:'changes_requested',status:'active'})}/></>}
    {rights.execute&&task.status==='done'&&<TeamButton label="Повернути в роботу" onPress={()=>void commit({status:'active',reviewState:'none'})}/>}
  </View>;
}
