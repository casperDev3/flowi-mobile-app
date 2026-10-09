import {useColorScheme} from '@/hooks/use-color-scheme';
import React, {useState} from 'react';
import {Text,View} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import {File,Paths} from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {apiFetch} from '@/store/api';
import {TeamButton} from './TeamControls';
import {useI18n} from '@/store/i18n';
export function TeamResultFiles({projectId,ids,onChange,editable}:{projectId:string;ids:string[];onChange:(ids:string[])=>void;editable:boolean}) {
  const {tr}=useI18n();const t=tr.teamResultFiles;
  const textColor=useColorScheme()==='dark'?'#F0EEFF':'#302341';
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[names,setNames]=useState<Record<string,string>>({});
  const base=`/projects/${encodeURIComponent(projectId)}/attachments/`;
  const upload=async()=>{setError('');setBusy(true);try{const result=await DocumentPicker.getDocumentAsync({copyToCacheDirectory:true});if(result.canceled)return;const asset=result.assets[0];const file=new File(asset.uri);if(file.size>1024*1024){setError(t.tooBig);return;}const row=await apiFetch<{id:string;name:string}>(base,{method:'POST',body:{name:asset.name,contentType:asset.mimeType,content:await file.base64()}});setNames(n=>({...n,[row.id]:row.name}));onChange([...ids,row.id]);}catch(e){setError(String(e));}finally{setBusy(false);}};
  const download=async(id:string)=>{setError('');try{const row=await apiFetch<{content:string;name:string}>(base+encodeURIComponent(id)+'/');setNames(n=>({...n,[id]:row.name}));const file=new File(Paths.cache,`${id}-${row.name.replace(/[^\p{L}\p{N}._-]/gu,'_')}`);file.write(row.content,{encoding:'base64'});if(await Sharing.isAvailableAsync())await Sharing.shareAsync(file.uri);}catch(e){setError(String(e));}};
  if(!editable&&!ids.length)return null;
  return <View style={{gap:8}}><Text style={{color:textColor}}>{t.title}</Text>{ids.map((id,i)=><View key={id} style={{gap:6}}><TeamButton label={names[id]??t.open.replace('{n}',String(i+1))} onPress={()=>void download(id)}/>{editable&&<TeamButton label={t.remove} onPress={()=>onChange(ids.filter(x=>x!==id))}/>}</View>)}{editable&&<TeamButton label={t.add} disabled={busy||ids.length>=20} onPress={()=>void upload()}/>} {!!error&&<Text accessibilityRole="alert" style={{color:'#DB4444'}}>{error}</Text>}</View>;
}
