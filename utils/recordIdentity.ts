/** Latest revision of a sync record wins; independent project IDs stay distinct. */
export function uniqueRecords<T extends {id?: unknown; projectId?: unknown; updatedAt?: unknown}>(records: readonly T[]): T[] {
  const rows=new Map<string,T>();
  for(const [index,row] of (records??[]).entries()) {
    if(!row)continue;
    const key=row.id ? `${row.projectId??''}:${row.id}` : `missing:${index}`;
    const previous=rows.get(key);
    const stamp=(value:T)=>typeof value.updatedAt==='string' ? Date.parse(value.updatedAt)||0 : 0;
    if(!previous||stamp(row)>=stamp(previous))rows.set(key,row);
  }
  return [...rows.values()];
}
