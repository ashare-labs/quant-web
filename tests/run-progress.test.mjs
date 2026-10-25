import test from 'node:test';
import assert from 'node:assert/strict';
import {progressView,stopJobPolling,memoryText} from '../src/results/progress.ts';
const p={job_id:'job-1',attempt:1,phase:'executing',completed_trading_days:10,total_trading_days:1454,simulation_date:'2020-02-14',elapsed_seconds:11,current_rss_bytes:900*1024**2,last_rss_bytes:900*1024**2,peak_rss_bytes:1100*1024**2,terminal:false};
const job={job_id:'job-1',status:'running',progress:p};
test('real completed days determine percentage, including zero; RSS can exceed retired 1 GiB',()=>{
 const view=progressView(job);assert.equal(view.ratio,10/1454);assert.equal(view.memory,900*1024**2);assert.equal(memoryText(view.p.peak_rss_bytes),'1100.0 MiB');
 assert.equal(progressView({...job,progress:{...p,completed_trading_days:0}}).ratio,0);
});
test('preparing and missing denominators stay indeterminate, never invent ETA',()=>{
 for(const progress of [null,{...p,phase:'preparing'},{...p,total_trading_days:null},{...p,total_trading_days:9},{...p,job_id:'other'}])assert.equal(progressView({...job,progress}).determinate,false);
 assert.equal(progressView({...job,progress:{...p,phase:'preparing'}}).stage,'正在准备数据');
});
test('finalization is identified separately from completed trading days and terminal DB state wins',()=>{
 const sealed={...p,completed_trading_days:1454,phase:'finalizing'};
 assert.equal(progressView({...job,progress:sealed}).stage,'正在封存结果');
 for(const status of ['failed','cancelled','succeeded']){
  const terminal={...job,status,progress:sealed};assert.equal(stopJobPolling(terminal),true);assert.equal(progressView(terminal).running,false);assert.equal(progressView(terminal).memoryLabel,'最后采样内存');
 }
 assert.equal(stopJobPolling(job),false);
 assert.equal(progressView({...job,status:'cancelling'}).stage,'正在取消');
});
test('refresh consumes the same task snapshot without resubmission or a recovery action',()=>{
 assert.deepEqual(progressView(JSON.parse(JSON.stringify(job))),progressView(job));
 assert.equal(memoryText(null),'—');assert.equal(memoryText(0),'0.0 MiB');
});

// Actual polling hook; isolated hook scheduling does not claim browser visual QA.
import {readFileSync} from 'node:fs';
import {setImmediate} from 'node:timers/promises';
import ts from 'typescript';
const compiled=ts.transpileModule(readFileSync(new URL('../src/shared/ui.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
function harness(){
 const r={slots:[],effects:[],cleanup:[],timers:new Map(),calls:[],next:0,path:'/python/jobs/job-1',dirty:false};let index=0;
 const react={useState(value){const i=index++;if(!(i in r.slots))r.slots[i]=value;return[r.slots[i],v=>{r.slots[i]=typeof v==='function'?v(r.slots[i]):v;r.dirty=true;}];},useRef(value){return r.slots[index++]??={current:value};},useEffect(effect,deps){const i=index++,before=r.slots[i];if(!before||deps.some((d,n)=>!Object.is(d,before[n]))){r.slots[i]=deps;r.effects.push(()=>{r.cleanup[i]?.();r.cleanup[i]=effect();});}}};
 const api={api(path,_body,signal){return new Promise((resolve,reject)=>r.calls.push({path,signal,resolve,reject}));},errorText:e=>e.message};
 const module={exports:{}};
 new Function('require','module','exports','setTimeout','clearTimeout',compiled)(name=>name==='react'?react:name==='./api'?api:{},module,module.exports,(fn)=>{const id=++r.next;r.timers.set(id,fn);return id;},id=>r.timers.delete(id));
 r.render=()=>{index=0;r.dirty=false;r.value=module.exports.useResource(r.path,5000,false,{retainOnError:true,stopWhen:stopJobPolling});while(r.effects.length)r.effects.shift()();};
 r.flush=async()=>{await setImmediate();for(let n=0;r.dirty&&n<5;n++)r.render();};
 r.tick=async()=>{const pair=r.timers.entries().next().value;assert(pair,'expected next poll');r.timers.delete(pair[0]);pair[1]();await r.flush();};
 r.close=()=>r.cleanup.forEach(fn=>fn?.());r.render();return r;
}
test('polling retains latest progress through disconnection and stops at database terminal status',async()=>{
 const r=harness();try{
  r.calls[0].resolve(job);await r.flush();assert.equal(r.value.data.progress.completed_trading_days,10);
  await r.tick();r.calls[1].reject(Error('offline'));await r.flush();assert.equal(r.value.error,'offline');assert.equal(r.value.data.job_id,'job-1');
  await r.tick();r.calls[2].resolve({...job,status:'succeeded',progress:{...p,completed_trading_days:1454}});await r.flush();assert.equal(r.value.error,'');assert.equal(r.value.data.status,'succeeded');assert.equal(r.timers.size,0);
  assert(r.calls.every(c=>c.path==='/python/jobs/job-1'));
 }finally{r.close();}
});
test('switching tasks or refreshing aborts stale replies without submitting or using old progress',async()=>{
 const r=harness();try{
  const stale=r.calls[0];r.path='/python/jobs/job-2';r.render();await r.flush();assert(stale.signal.aborted);assert.equal(r.value.data,null);
  stale.resolve(job);await r.flush();assert.equal(r.value.data,null);
  const other={...job,job_id:'job-2',progress:{...p,job_id:'job-2'}};r.calls[1].resolve(other);await r.flush();assert.equal(r.value.data.job_id,'job-2');
  r.value.refresh();await r.flush();assert.equal(r.value.data.job_id,'job-2');r.calls[2].resolve({...other,status:'failed'});await r.flush();assert.equal(r.timers.size,0);
 }finally{r.close();}
});
