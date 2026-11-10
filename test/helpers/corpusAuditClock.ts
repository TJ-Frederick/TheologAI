import {vi} from 'vitest';
/** Keep real650ms admission semantics while advancing unit-fixture time in small steps. */
export async function withCorpusAuditClock<T>(work:()=>Promise<T>):Promise<T>{
 if(vi.isFakeTimers())return work();
 vi.useFakeTimers();
 let complete=false;
 const result=work().then(value=>({value}),error=>({error})).finally(()=>{complete=true;});
 try{while(!complete)await vi.advanceTimersByTimeAsync(5);const outcome=await result;if('error'in outcome)throw outcome.error;return outcome.value;}
 finally{vi.useRealTimers();}
}
