import React,{useEffect,useState} from 'react';
import {ScrollView,Text,View,Modal} from 'react-native';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {useProject} from '@/hooks/use-project';
import {useProjectRole} from '@/hooks/use-project-role';
import {useColorScheme} from '@/hooks/use-color-scheme';
import {useAuth} from '@/store/auth';
import {useProjectMembers} from '@/hooks/use-project-members';
import {fetchProjectMembers} from '@/store/project-team';
import {isLead} from '@/utils/teamwork';
import {isProjectWork} from '@/utils/projectBacklog';
import {completedAt,type Task} from '@/utils/taskUtils';
import type {Sprint} from '@/utils/sprintUtils';
import {mergeTaskStatusColumns,projectColumnIdFor,type TaskStatusColumn} from '@/utils/taskStatuses';
import {ProjectScreenShell,projectShellColors} from './ProjectScreenShell';
import {TeamButton,TeamInput} from './TeamTaskPanel';
import {useProjectRecords,saveProjectRecord} from './useProjectRecords';
export function ProjectBacklog({archive=false}:{archive?:boolean}){
 const {id}=useLocalSearchParams<{id:string}>(),router=useRouter(),{project}=useProject(id),role=useProjectRole(id),{user}=useAuth();
 const dark=useColorScheme()==='dark',c=projectShellColors(dark,project?.color??'#7C3AED',project?.appearance);
 const tasks=useProjectRecords<Task>('tasks').filter(t=>t.projectId===id),sprints=useProjectRecords<Sprint>('sprints').filter(s=>s.projectId===id),columns=mergeTaskStatusColumns(useProjectRecords<TaskStatusColumn>('task_statuses'),id),members=useProjectMembers(id);
 useEffect(()=>{void fetchProjectMembers(id).catch(()=>{});},[id]);
 const [tab,setTab]=useState<'backlog'|'idea'|'bug'>('backlog'),[search,setSearch]=useState(''),[sprint,setSprint]=useState('all'),[mine,setMine]=useState(false),[person,setPerson]=useState('all'),[priority,setPriority]=useState('all'),[sort,setSort]=useState('newest'),[from,setFrom]=useState(''),[to,setTo]=useState(''),[error,setError]=useState('');
 const [draft,setDraft]=useState<Partial<Task>|null>(null),[busy,setBusy]=useState(false);
 async function run(fn:()=>Promise<unknown>){setBusy(true);setError('');try{await fn();}catch(e){setError(String(e));}finally{setBusy(false);}}
 const completedKey=(t:Task)=>{const d=completedAt(t);return d&&Number.isFinite(d.getTime())?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`:'';};
 const filtered=tasks.filter(t=>(archive?t.status==='done'&&!t.backlogKind:tab==='backlog'?!isProjectWork(t,columns)&&!t.backlogKind:t.backlogKind===tab)&&t.title.toLowerCase().includes(search.toLowerCase())&&(!mine||t.assigneeId===String(user?.id))&&(sprint==='all'||(sprint==='none'?!t.sprintId:t.sprintId===sprint))&&(person==='all'||(person==='none'?!t.assigneeId:t.assigneeId===person))&&(priority==='all'||String(t.priorityLevel??'none')===priority)&&(!archive||(!from||Boolean(completedKey(t)&&completedKey(t)>=from))&&(!to||Boolean(completedKey(t)&&completedKey(t)<=to)))).sort((a,b)=>sort==='name'?a.title.localeCompare(b.title):sort==='priority'?(a.priorityLevel??6)-(b.priorityLevel??6):sort==='oldest'?completedKey(a).localeCompare(completedKey(b)):completedKey(b).localeCompare(completedKey(a)));
 const groups=archive||tab!=='backlog'?[{id:'all',name:archive?'Архів':tab==='idea'?'Ідеї':'Баги',tasks:filtered}]:[{id:'none',name:'Без спринта',tasks:filtered.filter(t=>!sprints.some(s=>s.id===t.sprintId))},...sprints.map(s=>({...s,tasks:filtered.filter(t=>t.sprintId===s.id)}))];
 const choices=(label:string,value:string,onChange:(v:string)=>void,options:{id:string;name:string}[])=><View style={{gap:4}}><Text style={{color:c.sub}}>{label}</Text><ScrollView horizontal contentContainerStyle={{gap:6}}>{options.map(o=><TeamButton key={o.id} label={(value===o.id?'✓ ':'')+o.name} onPress={()=>onChange(o.id)}/>)}</ScrollView></View>;
 return <ProjectScreenShell project={project} isDark={dark} title={archive?'Архів':'Беклог'}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,paddingBottom:120,gap:12}}>
 {!archive&&choices('Розділ',tab,v=>{setTab(v as typeof tab);setSprint('all');setPerson('all');setPriority('all');},[{id:'backlog',name:'Беклог'},{id:'idea',name:'Ідеї'},{id:'bug',name:'Баги'}])}
 <TeamInput label="Пошук" value={search} onChange={setSearch}/><TeamButton label={(mine?'✓ ':'')+'Призначені мені'} onPress={()=>setMine(!mine)}/>
 {choices('Спринт',sprint,setSprint,[{id:'all',name:'Усі спринти'},{id:'none',name:'Без спринта'},...sprints])}
 {choices('Виконавець',person,setPerson,[{id:'all',name:'Усі'},{id:'none',name:'Не призначено'},...members.map(m=>({id:String(m.user.id),name:m.user.name||m.user.email}))])}
 {choices('Пріоритет',priority,setPriority,[{id:'all',name:'Усі'},...Array.from({length:6},(_,i)=>({id:String(i),name:`P${i}`})),{id:'none',name:'Без пріоритету'}])}
 {archive&&<>{choices('Сортування',sort,setSort,[{id:'newest',name:'Новіші'},{id:'oldest',name:'Старіші'},{id:'name',name:'Назва'},{id:'priority',name:'Пріоритет'}])}<TeamInput label="Завершено від (РРРР-ММ-ДД)" value={from} onChange={setFrom}/><TeamInput label="Завершено до (РРРР-ММ-ДД)" value={to} onChange={setTo}/></>}
 <TeamButton label="Скинути фільтри" onPress={()=>{setSearch('');setMine(false);setSprint('all');setPerson('all');setPriority('all');setFrom('');setTo('');}}/>
 {!archive&&role!=='viewer'&&<TeamButton label={tab==='idea'?'Нова ідея':tab==='bug'?'Новий баг':'Нове завдання'} onPress={()=>tab==='backlog'?router.push({pathname:'/(tabs)',params:{create:'1',projectId:id}} as never):setDraft({backlogKind:tab,title:'',description:'',bugSeverity:'normal'})}/>}
 {!!error&&<Text accessibilityRole="alert" style={{color:'#DB4444'}}>{error}</Text>}
 {groups.filter(g=>g.tasks.length).map(g=><View key={g.id} style={{gap:8}}><Text style={{color:c.text,fontWeight:'700'}}>{g.name} · {g.tasks.length}</Text>{g.tasks.map(t=><View key={t.id} style={{borderWidth:1,borderColor:c.border,borderRadius:10,padding:12,gap:8}}><TeamButton label={t.title} onPress={()=>t.backlogKind?setDraft(t):router.push({pathname:'/(tabs)',params:{open:t.id}} as never)}/>{!archive&&isLead(role)&&<>{choices('Перенести у спринт',t.sprintId??'none',v=>void run(()=>saveProjectRecord('tasks',{...t,sprintId:v==='none'?undefined:v})),[{id:'none',name:'Без спринта'},...sprints])}<TeamButton disabled={busy} label={t.backlogKind?'Перетворити на завдання':'В роботу'} onPress={()=>void run(()=>saveProjectRecord('tasks',t.backlogKind?{...t,backlogKind:undefined,description:[t.description,t.bugSteps&&`Кроки: ${t.bugSteps}`,t.bugExpected&&`Очікувано: ${t.bugExpected}`,t.bugActual&&`Фактично: ${t.bugActual}`].filter(Boolean).join('\n\n')}:{...t,status:'active',kanbanColumnId:projectColumnIdFor('status-in-progress',columns,id)}))}/></>}</View>)}</View>)}
 {!filtered.length&&<Text style={{color:c.sub}}>Немає записів</Text>}
 </ScrollView><Modal visible={!!draft} animationType="slide" onRequestClose={()=>setDraft(null)}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:24,paddingTop:60,paddingBottom:80,gap:12,backgroundColor:c.bg1}}>{draft&&<><Text style={{color:c.text,fontWeight:'700',fontSize:22}}>{draft.backlogKind==='bug'?'Баг':'Ідея'}</Text><TeamInput label={draft.backlogKind==='bug'?'Назва багу':'Назва ідеї'} value={draft.title??''} onChange={v=>setDraft({...draft,title:v})}/><TeamInput label={draft.backlogKind==='bug'?'Опис проблеми':'Ідея та очікувана користь'} value={draft.description??''} onChange={v=>setDraft({...draft,description:v})} multiline/>{draft.backlogKind==='bug'&&<>{(['bugSteps','bugExpected','bugActual'] as const).map((key,i)=><TeamInput key={key} label={['Кроки відтворення','Очікуваний результат','Фактичний результат'][i]} value={draft[key]??''} onChange={v=>setDraft({...draft,[key]:v})} multiline/>)}{choices('Важливість',draft.bugSeverity??'normal',v=>setDraft({...draft,bugSeverity:v as Task['bugSeverity']}),[{id:'low',name:'Низька'},{id:'normal',name:'Звичайна'},{id:'high',name:'Висока'},{id:'critical',name:'Критична'}])}</>}{role!=='viewer'&&(!draft.id||isLead(role))&&<TeamButton label="Зберегти" disabled={busy||!draft.title?.trim()} onPress={()=>void run(async()=>{await saveProjectRecord('tasks',{id:`draft-${Date.now()}`,createdAt:new Date().toISOString(),createdBy:String(user?.id),projectId:id,status:'active',subtasks:[],...draft,title:draft.title!.trim()} as Task);setDraft(null);})}/>}<TeamButton label="Закрити" onPress={()=>setDraft(null)}/></>}</ScrollView></Modal></ProjectScreenShell>;
}
