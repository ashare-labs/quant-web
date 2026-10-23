import test, {afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {environment, submission, submit, readPending, pendingKey} from '../src/backtests/submission.ts';
import {ApiError} from '../src/shared/api.ts';

const originalFetch=globalThis.fetch, originalStorage=globalThis.localStorage;
afterEach(()=>{globalThis.fetch=originalFetch;if(originalStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=originalStorage;});
const catalogue={environment_id:'a'.repeat(64),external_securities_required:false,universe:'strategy_subscription'};
const draft={name:'需求回测',source:'def initialize(context): pass',start:'2024-03-04',end:'2024-03-08',capital:'100,000',frequency:'1d'};
const json=(v,status=200)=>new Response(JSON.stringify(v),{status});
const job=request=>({contract_version:'python-minute-jobs.v1',job_id:'m2job-'+'b'.repeat(32),request:{...request,securities:[],warmup_sessions:20}});
function storage(){const data=new Map();globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};return data;}

test('both explicit frequencies submit source demand without an external universe or warmup',()=>{
  for(const frequency of ['1d','1m']){
    const body=submission({...draft,frequency},catalogue,'stable-key');
    assert.equal(body.frequency,frequency);assert.equal(body.initial_cash,100000);
    assert.equal(body.source,draft.source);assert.equal('securities' in body,false);assert.equal('warmup_sessions' in body,false);
  }
  assert.throws(()=>submission({...draft,frequency:undefined},catalogue,'key'),/日频或分钟/);
  assert.throws(()=>environment({...catalogue,external_securities_required:true}),/按需取数/);
  assert.throws(()=>submission({...draft,source:' '},catalogue,'key'),/Python/);
  assert.throws(()=>submission({...draft,end:''},catalogue,'key'));
});

test('lost acceptance is recovered using identical frozen source, mode and idempotency key',async()=>{
  const data=storage(),request=submission(draft,catalogue,'original-key'),calls=[];
  globalThis.fetch=async(url,options)=>{assert.equal(data.has(pendingKey),true);calls.push({url,body:JSON.parse(options.body)});if(calls.length===1)throw Error('lost response');return json(job(request),201);};
  await assert.rejects(submit(request),e=>e instanceof ApiError&&e.uncertain);
  const retry=readPending();assert.deepEqual(retry,request);
  const accepted=await submit(retry);assert.equal(accepted.job_id,job(request).job_id);
  assert.deepEqual(calls[0],calls[1]);assert.equal(readPending(),null);
});

test('storage refusal prevents a request whose key cannot be retained',async()=>{
  let sent=false;globalThis.localStorage={setItem(){throw Error('quota');}};globalThis.fetch=async()=>{sent=true;};
  await assert.rejects(submit(submission(draft,catalogue,'key')),/quota/);assert.equal(sent,false);
});

test('uncertain commit errors and mismatched receipts preserve the original request',async()=>{
  for(const response of [json({error:{code:'DATABASE_OPERATION_REFUSED',message:'commit uncertain'}},409),json({error:{code:'UNAVAILABLE'}},503),json(job({...submission(draft,catalogue,'key'),frequency:'1m'}),201)]){
    storage();const request=submission(draft,catalogue,'key');globalThis.fetch=async()=>response;
    await assert.rejects(submit(request),e=>e instanceof ApiError&&e.uncertain);assert.deepEqual(readPending(),request);
  }
});

test('confirmed rejection clears recovery state; acknowledged acceptance survives cleanup failure',async()=>{
  storage();const request=submission(draft,catalogue,'key');globalThis.fetch=async()=>json({error:{code:'PYTHON_SYNTAX_ERROR',message:'syntax'}},422);
  await assert.rejects(submit(request),e=>!e.uncertain);assert.equal(readPending(),null);
  globalThis.localStorage.removeItem=()=>{throw Error('cleanup blocked');};globalThis.fetch=async()=>json(job(request),201);
  assert.equal((await submit(request)).job_id,job(request).job_id);assert.deepEqual(readPending(),request);
});

test('corrupt recovery records are preserved rather than replaced with a new submission',()=>{
  const data=storage();data.set(pendingKey,'{"name":"keep"}');assert.throws(readPending,/无法读取/);assert.equal(data.get(pendingKey),'{"name":"keep"}');
});
