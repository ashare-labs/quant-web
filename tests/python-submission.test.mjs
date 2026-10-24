import test, {afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {environment, submission, submit, submitCurrent} from '../src/backtests/submission.ts';
import {ApiError} from '../src/shared/api.ts';

const originalFetch=globalThis.fetch, originalStorage=globalThis.localStorage;
afterEach(()=>{globalThis.fetch=originalFetch;if(originalStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=originalStorage;});
const catalogue={environment_id:'a'.repeat(64),external_securities_required:false,universe:'strategy_subscription'};
const draft={id:'draft-A',name:'需求回测',filePath:'研究/需求回测.py',source:'def initialize(context): pass',start:'2024-03-04',end:'2024-03-08',capital:'100,000',frequency:'1d'};
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

test('100亿元 reaches both submission bodies while invalid cash and permission refusals remain rejected',async()=>{
  storage();
  for(const frequency of ['1d','1m']){
    const request=submission({...draft,frequency,capital:'10,000,000,000'},catalogue,'synthetic-key');
    globalThis.fetch=async(_url,options)=>{
      const body=JSON.parse(options.body);
      assert.equal(body.initial_cash,10_000_000_000);
      assert.equal(body.frequency,frequency);
      return json({error:{code:'PERMISSION_DENIED',message:'Permission denied'}},403);
    };
    await assert.rejects(submit(request),e=>e instanceof ApiError&&e.status===403&&!e.uncertain);
    for(const capital of ['10,000,000,000.01','0','-1','NaN','Infinity','1e309'])assert.throws(()=>submission({...draft,frequency,capital},catalogue,'key'),/初始资金/);
  }
});

const attemptKey='quantweb-python-idempotency-v1:'+draft.id, legacyKey='quantweb-python-pending-v1';
const acceptCurrent=async(_url,options)=>json(job(JSON.parse(options.body)),201);

test('same current body after lost acceptance or empty 502 reuses its key across refresh; acknowledged run can run again',async()=>{
  for(const failure of ['network','gateway']){
    const data=storage(),sent=[];
    globalThis.fetch=async(_url,options)=>{sent.push(JSON.parse(options.body));if(failure==='network')throw Error('lost');return new Response('',{status:502});};
    await assert.rejects(submitCurrent(draft,catalogue),e=>e instanceof ApiError&&e.uncertain);
    const token=JSON.parse(data.get(attemptKey));assert.equal(token.key,sent[0].idempotency_key);
    // Re-import the module to simulate a refresh with only browser storage retained.
    const refreshed=await import('../src/backtests/submission.ts?refresh='+failure);
    globalThis.fetch=async(_url,options)=>{const body=JSON.parse(options.body);sent.push(body);return json(job(body),201);};
    await refreshed.submitCurrent({...draft},catalogue);
    assert.deepEqual(sent[1],sent[0]);assert.equal(data.has(attemptKey),false);
    await refreshed.submitCurrent(draft,catalogue);
    assert.notEqual(sent[2].idempotency_key,sent[0].idempotency_key);
  }
});

test('changed source, config, strategy identity or environment always sends the current request',async()=>{
  const changes=[{source:'def initialize(context): pass # B'},{start:'2024-03-05'},{end:'2024-03-07'},{capital:'200000'},{frequency:'1m'},{name:'B'},{filePath:'另目录/B.py'}];
  for(const patch of [...changes,null]){
    storage();const sent=[];
    globalThis.fetch=async(_url,options)=>{sent.push(JSON.parse(options.body));throw Error('lost');};
    await assert.rejects(submitCurrent(draft,catalogue));
    const current={...draft,...patch},env=patch?catalogue:{...catalogue,environment_id:'f'.repeat(64)};
    globalThis.fetch=async(_url,options)=>{const body=JSON.parse(options.body);sent.push(body);return json(job(body),201);};
    await submitCurrent(current,env);
    assert.notEqual(sent[1].idempotency_key,sent[0].idempotency_key);
    assert.deepEqual(sent[1],submission(current,env,sent[1].idempotency_key));
  }
});

test('an uncertain request never skips current validation or locks another draft',async()=>{
  storage();let count=0;
  globalThis.fetch=async()=>{count++;throw Error('lost');};await assert.rejects(submitCurrent(draft,catalogue));
  for(const patch of [{source:''},{start:''},{frequency:'bad'},{capital:'0'}])await assert.rejects(submitCurrent({...draft,...patch},catalogue));
  assert.equal(count,1);
  globalThis.fetch=acceptCurrent;const other=await submitCurrent({...draft,id:'draft-B',name:'B'},catalogue);
  assert.equal(other.request.name,'B');
});

test('confirmed failures allow corrected submissions; uncertain errors retain only matching idempotency',async()=>{
  for(const status of [403,422,503]){
    const data=storage();globalThis.fetch=async()=>json({error:{code:'FAILED',message:'failed'}},status);
    await assert.rejects(submitCurrent(draft,catalogue));assert.equal(data.has(attemptKey),status===503);
    globalThis.fetch=acceptCurrent;await submitCurrent({...draft,source:draft.source+' # corrected'},catalogue);
    assert.equal(data.has(attemptKey),false);
  }
});

test('mismatched acceptance remains an explicit error, with no restoration command',async()=>{
  storage();globalThis.fetch=async(_url,options)=>json(job({...JSON.parse(options.body),frequency:'1m'}),201);
  await assert.rejects(submitCurrent(draft,catalogue),e=>e.uncertain&&e.code==='INVALID_JOB_RESPONSE'&&!e.message.includes('找回'));
});

test('concurrent identical sends reuse a key and do not erase a newer different attempt',async()=>{
  const data=storage(),resolvers=[],sent=[];
  globalThis.fetch=(_url,options)=>{const body=JSON.parse(options.body);sent.push(body);return new Promise(resolve=>resolvers.push(()=>resolve(json(job(body),201))));};
  const a=submitCurrent(draft,catalogue),b=submitCurrent(draft,catalogue),c=submitCurrent({...draft,capital:'200000'},catalogue);
  assert.equal(sent[0].idempotency_key,sent[1].idempotency_key);assert.notEqual(sent[1].idempotency_key,sent[2].idempotency_key);
  resolvers[0]();resolvers[1]();await Promise.all([a,b]);assert.equal(JSON.parse(data.get(attemptKey)).key,sent[2].idempotency_key);
  resolvers[2]();await c;assert.equal(data.has(attemptKey),false);
});

test('obsolete global records cannot replace current work or block start; matching old key avoids upgrade duplicates',async()=>{
  for(const raw of ['broken','{"name":"old"}',JSON.stringify(submission({...draft,source:'different old code'},catalogue,'old-key')),JSON.stringify(submission(draft,catalogue,'matching-key'))]){
    const data=storage();data.set(legacyKey,raw);data.set(attemptKey,'corrupt');globalThis.fetch=acceptCurrent;
    const result=await submitCurrent(draft,catalogue);
    assert.equal(result.request.source,draft.source);
    assert.equal(result.request.idempotency_key==='matching-key',raw.includes('matching-key'));
    assert.equal(data.has(legacyKey),false);assert.equal(data.has(attemptKey),false);
  }
});

test('storage refusal never sends an untracked write, and does not overwrite draft storage',async()=>{
  const data=storage();data.set('quantweb-strategy-drafts-v1','user draft');let sent=false;
  globalThis.localStorage.setItem=()=>{throw Error('quota');};globalThis.fetch=async()=>{sent=true;};
  await assert.rejects(submitCurrent(draft,catalogue),/quota/);assert.equal(sent,false);
  assert.equal(data.get('quantweb-strategy-drafts-v1'),'user draft');
});

test('acknowledged acceptance does not stick to an old task if storage removal alone fails',async()=>{
  storage();globalThis.localStorage.removeItem=()=>{throw Error('remove blocked');};globalThis.fetch=acceptCurrent;
  const first=await submitCurrent(draft,catalogue),second=await submitCurrent(draft,catalogue);
  assert.notEqual(first.request.idempotency_key,second.request.idempotency_key);
});
