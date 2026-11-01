import {useCallback,useEffect,useState} from 'react';
import {loadData,loadDataResult,retryStorageRead,subscribeToStorage} from '@/store/storage';
import {saveSyncedChanges} from '@/store/synced-storage';
export function useProjectRecords<T>(key:string) {
 const [rows,setRows]=useState<T[]>([]);
 useEffect(()=>{let alive=true;const read=()=>void loadData<T[]>(key,[]).then(data=>{if(alive)setRows(data);});read();const off=subscribeToStorage(k=>{if(k===key)read();});return()=>{alive=false;off();};},[key]);return rows;
}
/**
 * Те саме, що useProjectRecords, але зі СТАНОМ читання — для станів зони
 * (Layout System v2.4): `loading` → скелет, `error` → «Повторити» всередині
 * зони. «Не прочиталось» ≠ «порожньо» (аудит E2, ERR-01): при збої рядки
 * лишаються попередніми, а не підміняються порожнім масивом.
 */
export function useProjectRecordsState<T>(key:string) {
 const [rows,setRows]=useState<T[]>([]);
 const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
 const [attempt,setAttempt]=useState(0);
 useEffect(()=>{
  let alive=true;
  const read=(retry:boolean)=>void (retry?retryStorageRead:loadDataResult)<T[]>(key,[]).then(result=>{
   if(!alive)return;
   if(!result.ok||!Array.isArray(result.value)){
    if(__DEV__)console.warn(`[project records] «${key}» не прочитались:`,result.ok?'не масив':result.error);
    setStatus('error');return;
   }
   setRows(result.value);setStatus('ready');
  });
  read(attempt>0);
  const off=subscribeToStorage(k=>{if(k===key)read(false);});
  return()=>{alive=false;off();};
 },[key,attempt]);
 const retry=useCallback(()=>{setStatus('loading');setAttempt(n=>n+1);},[]);
 return {rows,status,retry};
}
export async function saveProjectRecord<T extends {id:string}>(key:string,record:T){const rows=await loadData<T[]>(key,[]);await saveSyncedChanges(key,rows,rows.some(r=>r.id===record.id)?rows.map(r=>r.id===record.id?record:r):[...rows,record]);}
