import React,{useEffect,useState} from 'react';
import {Text,View} from 'react-native';
import {useColorScheme} from '@/hooks/use-color-scheme';
import {hasPendingProjectOutbox} from '@/store/project-sync';
import {loadConflicts,type SyncConflict} from '@/store/sync-conflicts';
import {loadData,subscribeToStorage} from '@/store/storage';
import {useI18n} from '@/store/i18n';

export function TeamOfflineStatus({projectId}:{projectId:string}) {
  const {tr}=useI18n();const t=tr.teamOffline;
  const color=useColorScheme()==='dark'?'#F0EEFF':'#302341';
  const [pending,setPending]=useState(false),[conflicts,setConflicts]=useState<SyncConflict[]>([]);
  const [rejected,setRejected]=useState<{projectId:string;rejection:{detail?:string};mutation?:{data?:Record<string,unknown>}}[]>([]);
  useEffect(()=>{
    let alive=true;
    const read=async()=>{const [p,c,r]=await Promise.all([hasPendingProjectOutbox(projectId),loadConflicts(),loadData<typeof rejected>('team_rejected_drafts',[])]);if(alive){setPending(p);setConflicts(c.filter(row=>row.local?.projectId===projectId));setRejected(r.filter(row=>row.projectId===projectId));}};
    void read();const off=subscribeToStorage(()=>{void read();});return()=>{alive=false;off();};
  },[projectId]);
  return <View style={{gap:8}}>{pending&&<Text accessibilityRole="alert" style={{color}}>{t.pending}</Text>}{conflicts.map(row=><View key={row.id} style={{gap:6}}><Text style={{color,fontWeight:'700'}}>{t.conflict.replace('{title}',String(row.local?.title??t.recordFallback))}</Text>{([[t.fieldTitle,row.local?.title],[t.fieldDescription,row.local?.description],[t.fieldComment,row.local?.body],[t.fieldResult,row.local?.resultSummary],[t.fieldDeadline,row.local?.deadline],[t.fieldPriority,row.local?.priorityLevel]] as [string,unknown][]).filter(([,value])=>value!=null).map(([label,value])=><Text key={label} selectable style={{color}}>{label}: {String(value)}</Text>)}</View>)}{rejected.map((row,i)=><View key={i}><Text style={{color}}>{t.rejected.replace('{detail}',row.rejection.detail??t.rejectedFallback)}</Text><Text selectable style={{color}}>{String(row.mutation?.data?.title??row.mutation?.data?.body??'')} {String(row.mutation?.data?.resultSummary??'')}</Text></View>)}</View>;
}
