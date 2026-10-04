import {useEffect,useState} from 'react';
import {loadData,subscribeToStorage} from '@/store/storage';
import {saveSyncedChanges} from '@/store/synced-storage';
export function useProjectRecords<T>(key:string) {
 const [rows,setRows]=useState<T[]>([]);
 useEffect(()=>{let alive=true;const read=()=>void loadData<T[]>(key,[]).then(data=>{if(alive)setRows(data);});read();const off=subscribeToStorage(k=>{if(k===key)read();});return()=>{alive=false;off();};},[key]);return rows;
}
export async function saveProjectRecord<T extends {id:string}>(key:string,record:T){const rows=await loadData<T[]>(key,[]);await saveSyncedChanges(key,rows,rows.some(r=>r.id===record.id)?rows.map(r=>r.id===record.id?record:r):[...rows,record]);}
