import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {backtestQuery,isStrategyId,normalizeBacktest,readStrategyBacktests,resolveStrategy,strategyIdentity} from '../src/backtests/history-api.ts';
import {backtestsHref,createdTime,duration,durationTitle,recordDuration,frequencyLabel,optionalValue,pageOf,recordStatus,resultHref,selectRecords} from '../src/backtests/history-model.ts';
import {submission,submit} from '../src/backtests/submission.ts';

// Constructed protocol fixtures only. Product code always reads the real service.
const originalFetch=globalThis.fetch,originalStorage=globalThis.localStorage;
afterEach(()=>{globalThis.fetch=originalFetch;if(originalStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=originalStorage;});
const strategy='研究/同名 策略.py',other='另一个目录/同名 策略.py',identity=strategyIdentity(strategy);
const item=(n=1,overrides={})=>({job_id:'m2job-'+n.toString(16).padStart(32,'0'),strategy_id:strategy,name:'同名策略',created_at:'2024-03-08T02:30:00Z',updated_at:'2024-03-08T03:30:00Z',start_date:'2024-03-04',end_date:'2024-03-08',frequency:'1d',initial_cash:100000,status:'succeeded',stored_status:'succeeded',display_status:'succeeded',execution_state:'current_runtime',result_available:true,result:{},summary:{net_return:0,max_drawdown:0.1},error:null,result_error:null,...overrides});
const response=(items,overrides={})=>({strategy_id:strategy,identity_model:'saved_relative_path',total:items.length,unassigned_count:9,offset:0,limit:100,items,...overrides});
const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});

test('strategy query keeps the full directory identity and never falls back to an unassigned/global query',()=>{
  const q=new URLSearchParams(backtestQuery(strategy).split('?')[1]);assert.equal(q.get('strategy_id'),strategy);assert.equal(q.get('limit'),'100');
  assert.notEqual(backtestQuery(strategy),backtestQuery(other));
  for(const invalid of ['',undefined,'../a.py','/a.py','a//b.py','a\\b.py','a.txt','a\nb.py','x/'.repeat(600)+'a.py']){assert.equal(isStrategyId(invalid),false);assert.throws(()=>backtestQuery(invalid));}
  assert.equal(new URLSearchParams(backtestsHref({strategy}).split('?')[1]).get('strategy'),strategy);
});

test('multi-page real-service reads retain every record once with the same strategy filter',async()=>{
  const entries=Array.from({length:105},(_,i)=>item(i+1)),calls=[],controller=new AbortController();
  globalThis.fetch=async(url,options)=>{calls.push({url,options});const offset=Number(new URLSearchParams(url.split('?')[1]).get('offset'));return json(response(entries.slice(offset,offset+100),{total:105,offset}));};
  const result=await readStrategyBacktests(identity,controller.signal);
  assert.equal(result.records.length,105);assert.equal(result.unassociatedCount,9);assert.equal(calls.length,2);
  for(const call of calls){assert.equal(new URLSearchParams(call.url.split('?')[1]).get('strategy_id'),strategy);assert.equal(call.options.signal,controller.signal);assert.equal(call.options.method,'GET');}
  assert.equal(pageOf(selectRecords(result.records,''),6).length,5);
});

test('wrong strategy, mixed rows, duplicated records and incomplete pages are errors, not empty or partial success',async()=>{
  for(const value of [response([item()],{strategy_id:other}),response([item(1,{strategy_id:other})]),response([item(1,{strategy_id:null})]),response([item(),item()]),response([item()],{total:2}),response([],{identity_model:'name_match'})]){
    globalThis.fetch=async()=>json(value);await assert.rejects(readStrategyBacktests(identity));
  }
});

test('a changing pagination total cannot be presented as a complete strategy history',async()=>{
  let call=0;globalThis.fetch=async()=>json(call++?response([item(102)],{total:102,offset:100}):response(Array.from({length:100},(_,i)=>item(i+1)),{total:101}));
  await assert.rejects(readStrategyBacktests(identity),/发生变化/);
});

test('old unassigned history stays unassigned even when its name and source resemble the selected file',async()=>{
  const old=item();globalThis.fetch=async()=>json({job_id:old.job_id,family:'python',request:{name:'同名策略',source:'same source'}});
  await assert.rejects(resolveStrategy(new URLSearchParams({job:old.job_id,strategy})),/未记录策略归属/);
  globalThis.fetch=async()=>json({job_id:old.job_id,family:'python',request:{strategy_id:other,name:'同名策略'}});
  await assert.rejects(resolveStrategy(new URLSearchParams({job:old.job_id,strategy})),/不一致/);
  assert.deepEqual(await resolveStrategy(new URLSearchParams({job:old.job_id})),strategyIdentity(other));
});

test('missing duration/version/metrics never become made-up elapsed time, Python version or zero',()=>{
  const record=normalizeBacktest(item(),strategy);
  assert.equal(record.durationSeconds,null);assert.equal(duration(record.durationSeconds),'—');assert.equal(optionalValue(record,'python'),'—');assert.equal(optionalValue(record,'sharpe'),'—');
  assert.equal(record.summary.net_return,0);assert.equal(duration(0),'00分00秒');assert.equal(duration(3661),'1时01分01秒');
  assert.deepEqual(normalizeBacktest(item(2,{stored_status:'failed',display_status:'failed',result_available:false,summary:{net_return:0.99}}),strategy).summary,{});
  assert.deepEqual(createdTime('2024-03-08T02:30:00Z'),['2024-03-08','10:30:00']);assert.equal(frequencyLabel('1d'),'每天');assert.equal(recordStatus('failed'),'失败');
});

test('search is scoped to supplied strategy records and results preserve old-runtime read-only routing',()=>{
  const a=normalizeBacktest(item(1,{name:'调整后',created_at:'2024-03-09T00:00:00Z'}),strategy),b=normalizeBacktest(item(2,{name:'最初版本',execution_state:'runtime_unavailable'}),strategy);
  assert.deepEqual(selectRecords([b,a],'').map(r=>r.id),[a.id,b.id]);assert.deepEqual(selectRecords([b,a],'调整').map(r=>r.id),[a.id]);
  const current=new URLSearchParams(resultHref(a,strategy).split('?')[1]),historical=new URLSearchParams(resultHref(b,strategy).split('?')[1]);
  assert.equal(current.get('strategy'),strategy);assert.equal(current.get('history'),null);assert.equal(historical.get('history'),'1');assert.equal(historical.get('job'),b.id);
});

test('new submissions bind the saved file slot and report uncertain transport failures',async()=>{
  const catalogue={environment_id:'a'.repeat(64),external_securities_required:false,universe:'strategy_subscription'};
  const draft={name:'同名策略',filePath:strategy,source:'def initialize(context): pass',start:'2024-03-04',end:'2024-03-08',capital:'100000',frequency:'1d'};
  const body=submission(draft,catalogue,'original');assert.equal(body.strategy_id,strategy);
  assert.equal('strategy_id' in submission({...draft,filePath:undefined},catalogue,'new'),false);
  assert.throws(()=>submission({...draft,filePath:'../a.py'},catalogue,'new'),/标识无效/);
  const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
  globalThis.fetch=async()=>{throw Error('lost');};await assert.rejects(submit(body));
});

const progress=(overrides={})=>({job_id:item().job_id,started_at:'2026-10-25T01:00:00Z',sampled_at:'2026-10-25T01:00:26Z',elapsed_seconds:26.86,terminal:false,...overrides});
test('running and terminal list timing reuse server execution snapshots without counting queue time',()=>{
  const running=normalizeBacktest(item(1,{stored_status:'running',display_status:'running',progress:progress()}),strategy);
  assert.equal(running.durationSeconds,26.86);assert.equal(running.durationState,'running');assert.equal(recordDuration(running),'00分26秒');assert.match(durationTitle(running),/运行中/);
  for(const status of ['succeeded','failed','cancelled']){
    const finished=normalizeBacktest(item(1,{stored_status:status,display_status:status,progress:progress({terminal:true,finished_at:'2026-10-25T01:00:26Z'})}),strategy);
    assert.equal(finished.durationSeconds,26.86);assert.equal(finished.durationState,'finished');assert.match(durationTitle(finished),/已结束/);
    assert.deepEqual(normalizeBacktest(item(1,{stored_status:status,display_status:status,progress:progress({terminal:true,finished_at:'2026-10-25T01:00:26Z'})}),strategy),finished);
  }
});
test('a terminal database row does not turn an interrupted last sample into a complete duration',()=>{
  const interrupted=normalizeBacktest(item(1,{stored_status:'failed',progress:progress({terminal:true,finished_at:null})}),strategy);
  assert.equal(interrupted.durationState,'observed');assert.equal(recordDuration(interrupted),'≥ 00分26秒');assert.match(durationTitle(interrupted),/完整用时未知/);
  const retired=normalizeBacktest(item(1,{stored_status:'running',execution_state:'runtime_unavailable',progress:progress()}),strategy);
  assert.equal(retired.durationState,'observed');
});
test('missing, mismatched or invalid timing stays unknown, including after refresh',()=>{
  for(const value of [null,{},progress({job_id:item(2).job_id}),progress({elapsed_seconds:-1}),progress({elapsed_seconds:Infinity}),progress({elapsed_seconds:'26'}),progress({started_at:'bad'}),progress({sampled_at:null})]){
    const record=normalizeBacktest(item(1,{progress:value}),strategy);
    assert.equal(record.durationSeconds,null);assert.equal(record.durationState,'unknown');assert.equal(recordDuration(record),'—');
  }
  const zero=normalizeBacktest(item(1,{stored_status:'running',progress:progress({elapsed_seconds:0})}),strategy);
  assert.equal(zero.durationSeconds,0);assert.equal(recordDuration(zero),'00分00秒');
});
