import {ProjectDiscussions} from './ProjectDiscussions';
import {actualWorkload} from '@/utils/workloadActual';
import {TeamOfflineStatus} from './TeamOfflineStatus';
import React, { useCallback, useEffect, useState } from 'react';
import { Modal, useWindowDimensions, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useProject } from '@/hooks/use-project';
import { useProjectRole } from '@/hooks/use-project-role';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/store/auth';
import { useI18n } from '@/store/i18n';
import { loadData, subscribeToStorage } from '@/store/storage';
import { saveSyncedChanges } from '@/store/synced-storage';
import { syncProject } from '@/store/project-sync';
import { apiFetch } from '@/store/api';
import { ProjectScreenShell, projectShellColors } from './ProjectScreenShell';
import { ProjectSyncIndicator } from './ProjectSyncIndicator';
import { TeamTaskPanel, TeamButton, TeamInput } from './TeamTaskPanel';
import { CommentsSection } from '@/components/shared/CommentsSection';
import type { Task } from '@/utils/taskUtils';
import { teamPreferencesId, isLead, isComplete, myWork, progress, type Discussion, type Milestone, type TeamPreferences, type WorkloadRow } from '@/utils/teamwork';

const makeId=()=>`tw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`;
function useRows<T>(key:string) {
  const [rows,setRows]=useState<T[]>([]);
  useEffect(()=>{let mounted=true;const read=()=>void loadData<T[]>(key,[]).then(r=>{if(mounted)setRows(r);});read();const off=subscribeToStorage(k=>{if(k===key)read();});return()=>{mounted=false;off();};},[key]);
  return rows;
}
async function saveRow<T extends {id:string}>(key:string,record:T) {
  const rows=await loadData<T[]>(key,[]);const exists=rows.some(r=>r.id===record.id);
  await saveSyncedChanges(key,rows,exists?rows.map(r=>r.id===record.id?record:r):[...rows,record]);
}
export function TeamWorkspace({mode='my-work',embedded=false}: {mode?:'my-work'|'discussions'|'workload'|'overview';embedded?:boolean}) {
  const {id:pid,task:taskId,discussion:discussionId}=useLocalSearchParams<{id:string;task?:string;discussion?:string}>();
  const router=useRouter(),{height}=useWindowDimensions();
  const [inviteSkipped,setInviteSkipped]=useState(false),[showMilestones,setShowMilestones]=useState(false);
  const {project}=useProject(pid),role=useProjectRole(pid),{user}=useAuth(),uid=String(user?.id??'');
  const isDark=useColorScheme()==='dark',c=projectShellColors(isDark,project?.color??'#7C3AED',project?.appearance);
  const {tr,lang}=useI18n(); const locale=lang;
  const tasks=useRows<Task>('tasks').filter(t=>t.projectId===pid && !t.backlogKind);
  const discussions=useRows<Discussion>('discussions').filter(t=>t.projectId===pid);
  const milestones=useRows<Milestone>('milestones').filter(t=>t.projectId===pid);
  const allPrefs=useRows<TeamPreferences>('team_preferences').filter(t=>t.projectId===pid);
  const prefs=allPrefs.find(p=>p.userId===uid);
  const [selected,setSelected]=useState<string|null>(taskId??null);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [loads,setLoads]=useState<WorkloadRow[]>([]),[hours,setHours]=useState('');
  const [milestoneTitle,setMilestoneTitle]=useState(''),[milestoneDate,setMilestoneDate]=useState(''),[milestoneTasks,setMilestoneTasks]=useState<string[]>([]);
  useEffect(()=>setHours(prefs?.weeklyHours==null?'':String(prefs.weeklyHours)),[prefs?.weeklyHours]);
  const refreshLoad=useCallback(()=>apiFetch<{results:WorkloadRow[]}>(`/projects/${encodeURIComponent(pid)}/workload/`).then(r=>setLoads(r.results)),[pid]);
  useEffect(()=>{if(isLead(role))void refreshLoad().catch(()=>{});},[refreshLoad,role]);
  const run=async(action:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await action();void syncProject(pid);}catch(e){setError(String(e));}finally{setBusy(false);}};
  const pref=(patch:Partial<TeamPreferences>)=>saveRow('team_preferences',{...prefs,id:teamPreferencesId(pid,uid),userId:uid,projectId:pid,...patch});
  const mine=myWork(tasks,uid),counts=progress(mode==='my-work'?tasks.filter(t=>t.assigneeId===uid):tasks),selectedTask=tasks.find(t=>t.id===selected);
  const label=mode==='discussions'?'Обговорення':mode==='workload'?'Навантаження':mode==='overview'?'Командний прогрес':'Моя робота';
  const section=(name:string,items:readonly {id:string;title:string}[])=><View style={{gap:8}}><Text style={{color:c.text,fontSize:17,fontWeight:'700'}}>{name} · {items.length}</Text>{items.slice(0,5).map(t=><TeamButton key={t.id} label={t.title} onPress={()=>setSelected(t.id)}/>)}{items.length>5&&<TeamButton label={`Перейти на сторінку · ${items.length} записів`} onPress={()=>router.push(`/project/${pid}/tasks` as never)}/>}
{!items.length&&<Text style={{color:c.sub}}>Немає завдань</Text>}</View>;
  const content=<View style={{gap:18,padding:16}}>
    <ProjectSyncIndicator projectId={pid} accent={c.accent} subColor={c.sub} dimColor={c.dim}/>
    <TeamOfflineStatus projectId={pid}/>
    <Text style={{color:c.sub}}>Стартовий екран: {prefs?.homePage??(isLead(role)?'overview':'my-work')}</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}><TeamButton label="Моя робота" onPress={()=>void run(()=>pref({homePage:'my-work'}))}/><TeamButton label="Огляд" onPress={()=>void run(()=>pref({homePage:'overview'}))}/>{(mode==='my-work'||mode==='overview')&&role!=='viewer'&&<TeamButton label="Нове завдання" onPress={()=>router.push({pathname:'/(tabs)',params:{create:'1',projectId:pid}} as never)}/>}</View>
    {!!error&&<Text accessibilityRole="alert" style={{color:'#DB4444'}}>{error}</Text>}
    {(mode==='my-work'||mode==='overview')&&<>
      <Text style={{color:c.text}}>Готово {counts.done}/{counts.total} · На перевірці {counts.pending} · Перешкоди {counts.blocked} · Прострочено {counts.overdue}</Text>
      {isLead(role)&&tasks.length===0&&!inviteSkipped&&<View style={{gap:10}}><Text style={{color:c.text}}>Проєкт створено. Запросіть команду або пропустіть цей крок.</Text><TeamButton label="Запросити учасників" onPress={()=>router.push(`/project/${pid}/members` as never)}/><TeamButton label="Пропустити запрошення" onPress={()=>setInviteSkipped(true)}/></View>}
      {section('Потрібна моя перевірка',mine.reviews)}{section('Від мене очікується дія',mine.blockers)}{section('Мої завдання',mine.assigned)}{section('Можна взяти в роботу',mine.available)}
      {mode==='overview'&&section('Усі активні завдання',tasks.filter(t=>!isComplete(t)))}
      {mode==='overview'&&<><TeamButton label={`Контрольні точки · ${milestones.length}`} onPress={()=>setShowMilestones(!showMilestones)}/>{showMilestones&&<>{milestones.map(m=>{const linked=tasks.filter(t=>m.taskIds.includes(t.id));return <Text key={m.id} style={{color:c.text}}>{m.title} · {m.deadline||'Без строку'} · {linked.filter(isComplete).length}/{linked.length}</Text>;})}
      {isLead(role)&&<><TeamInput label="Назва контрольної точки" value={milestoneTitle} onChange={setMilestoneTitle}/><TeamInput label="Дата (РРРР-ММ-ДД)" value={milestoneDate} onChange={setMilestoneDate}/>{tasks.map(t=><TeamButton key={t.id} label={(milestoneTasks.includes(t.id)?'✓ ':'')+t.title} onPress={()=>setMilestoneTasks(p=>p.includes(t.id)?p.filter(id=>id!==t.id):[...p,t.id])}/>)}<TeamButton label="Додати контрольну точку" disabled={busy||!milestoneTitle.trim()} onPress={()=>void run(async()=>{await saveRow<Milestone>('milestones',{id:makeId(),projectId:pid,title:milestoneTitle,deadline:milestoneDate,taskIds:milestoneTasks});setMilestoneTitle('');setMilestoneTasks([]);})}/></>}</>}</>}
    </>}
    {mode==='discussions'&&<ProjectDiscussions projectId={pid} initialId={discussionId}/>}
    {mode==='workload'&&<>
      <Text style={{color:c.text}}>Поточний тиждень і прострочена робота. Безстрокові завдання показані окремо.</Text>
      <TeamInput label="Моя доступність, годин на тиждень" numeric value={hours} onChange={setHours}/><TeamButton label="Зберегти доступність" onPress={()=>void run(async()=>{await pref({weeklyHours:hours===''?null:Number(hours)});await syncProject(pid);if(isLead(role))await refreshLoad();})}/>
      {loads.map(w=><CapacityRow key={w.userId} row={w} actual={actualWorkload(tasks,w.userId)} onSave={h=>void run(async()=>{const old=allPrefs.find(p=>p.userId===w.userId);await saveRow('team_preferences',{...old,id:teamPreferencesId(pid,w.userId),userId:w.userId,projectId:pid,weeklyHours:h});await syncProject(pid);await refreshLoad();})}/>)}
    </>}
    {selectedTask&&<Modal visible animationType="slide" onRequestClose={()=>setSelected(null)}><View style={{flex:1,backgroundColor:c.bg1,paddingTop:48}}><ScrollView style={{maxHeight:height-48}} contentContainerStyle={{padding:16,paddingBottom:48,gap:10}} keyboardShouldPersistTaps="handled"><Text style={{color:c.text,fontSize:20,fontWeight:'700'}}>{selectedTask.title}</Text><TeamButton label="Закрити завдання" onPress={()=>setSelected(null)}/><TeamButton label={prefs?.watchedTaskIds?.includes(selectedTask.id)?'Не стежити':'Стежити'} onPress={()=>void run(()=>pref({watchedTaskIds:prefs?.watchedTaskIds?.includes(selectedTask.id)?prefs.watchedTaskIds.filter(id=>id!==selectedTask.id):[...(prefs?.watchedTaskIds??[]),selectedTask.id]}))}/>{discussions.filter(d=>d.taskIds?.includes(selectedTask.id)).map(d=><TeamButton key={d.id} label={`Обговорення · ${d.title}`} onPress={()=>{setSelected(null);router.push(`/project/${pid}/discussions?discussion=${d.id}` as never);}}/>)}<TeamTaskPanel key={selectedTask.id} task={selectedTask} role={role}/><CommentsSection projectId={pid} targetType="task" targetId={selectedTask.id} isOwner={role==='owner'} currentUserId={role==='viewer'?null:uid} colors={c} isDark={isDark} locale={locale} tr={tr}/></ScrollView></View></Modal>}
  </View>;
  if(embedded)return content;
  return <ProjectScreenShell project={project} isDark={isDark} title={label}><ScrollView contentContainerStyle={{paddingBottom:120}} keyboardShouldPersistTaps="handled">{content}</ScrollView></ProjectScreenShell>;
}
function CapacityRow({row:w,actual,onSave}:{actual:ReturnType<typeof actualWorkload>;row:WorkloadRow;onSave:(hours:number|null)=>void}) {
  const textColor=useColorScheme()==='dark'?'#F0EEFF':'#302341';
  const [value,setValue]=useState(w.weeklyHours==null?'':String(w.weeklyHours));
  return <View style={{gap:8,borderWidth:1,borderColor:'#9E93B2',padding:12,borderRadius:12}}><Text style={{color:textColor,fontWeight:'700'}}>{w.name}</Text><Text style={{color:textColor}}>Активних завдань: {actual.activeCount}</Text><Text style={{color:textColor}}>Середній час: {actual.averageMinutes===null?'Немає даних':`${Math.round(actual.averageMinutes)} хв`} · Вибірка: {actual.sampleCount}</Text><Text style={{color:textColor}}>Прогноз: {actual.forecastMinutes===null?'Немає даних':`${(actual.forecastMinutes/60).toFixed(1)} год`}</Text><TeamInput label="Доступність, год/тиждень" numeric value={value} onChange={setValue}/><TeamButton label="Зберегти доступність учасника" onPress={()=>onSave(value===''?null:Number(value))}/></View>;
}
