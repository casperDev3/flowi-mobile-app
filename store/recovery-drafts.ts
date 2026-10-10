import {loadData,saveDataChecked} from './storage';
import {withStorageLock} from './storage-lock';
import {authoredText} from '@/utils/recoveryDraft';
export interface RecoveryDraft {id:string;text:Record<string,string>;savedAt:string}
export const loadRecoveryDrafts=()=>loadData<RecoveryDraft[]>('local_recovery_drafts',[]);
export async function preserveRecoveryDraft(id:string,local:Record<string,unknown>,base:Record<string,unknown>) {
  const text=authoredText(local,base);if(!Object.keys(text).length)return;
  await withStorageLock('local_recovery_drafts',async()=>{
    const rows=await loadRecoveryDrafts();
    await saveDataChecked('local_recovery_drafts',[...rows.filter(r=>r.id!==id),{id,text,savedAt:new Date().toISOString()}]);
  });
}
export async function dismissRecoveryDraft(id:string){await withStorageLock('local_recovery_drafts',async()=>saveDataChecked('local_recovery_drafts',(await loadRecoveryDrafts()).filter(r=>r.id!==id)));}
