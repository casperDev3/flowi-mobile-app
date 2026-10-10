import cases from './fixtures/s2-accounting.json';
import {totalSeconds,groupByDay,taskOptions,type TimeRecord} from '@/utils/timeEntries';
for(const c of cases)test(c.name,()=>{
 const rows=c.rows as unknown as TimeRecord[];
 expect(totalSeconds(rows)).toBe(c.seconds);
 expect(groupByDay(rows).reduce((n,g)=>n+g.seconds,0)).toBe(c.seconds);
 expect(taskOptions(rows).reduce((n,g)=>n+g.seconds,0)).toBe(c.seconds);
});
import {calcTotalsByCurrency} from '@/utils/financeUtils';
test('financial retries and fractional amounts match web',()=>{
 const date=new Date(2026,9,10).toISOString();
 const txs=[{id:'a',type:'income',amount:.1,currency:'UAH',date},{id:'a',type:'income',amount:.1,currency:'UAH',date},{id:'b',type:'income',amount:.2,currency:'UAH',date},{id:'c',type:'transfer',amount:99,currency:'UAH',date}];
 const result=calcTotalsByCurrency(txs as Parameters<typeof calcTotalsByCurrency>[0],new Date(2026,9,10));
 expect(result.UAH.income).toBe(.3);expect(result.UAH.balance).toBe(.3);
});
