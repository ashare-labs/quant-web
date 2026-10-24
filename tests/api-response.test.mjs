import test, {afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {api, ApiError} from '../src/shared/api.ts';
import {submission, submit, readPending, pendingKey} from '../src/backtests/submission.ts';

const originalFetch=globalThis.fetch, originalStorage=globalThis.localStorage;
afterEach(()=>{globalThis.fetch=originalFetch;if(originalStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=originalStorage;});

test('empty gateway responses retain HTTP evidence and do not imply a rejected write',async()=>{
  for (const body of [undefined,{}]) {
    globalThis.fetch=async()=>new Response('',{status:502,headers:{'X-QuantWeb-Request-Id':'trace-id'}});
    await assert.rejects(api('/python/jobs',body),e=>e instanceof ApiError && e.status===502 && e.code==='HTTP_502' && e.uncertain===(body!==undefined) && e.requestId==='trace-id' && /HTTP 502；空响应/.test(e.message));
  }
});

test('HTML and malformed JSON responses expose status without displaying untrusted response bodies',async()=>{
  for (const [status,body,type] of [[403,'<h1>denied-private-value</h1>','text/html'],[200,'broken-private-value','application/json']]) {
    globalThis.fetch=async()=>new Response(body,{status,headers:{'Content-Type':type}});
    await assert.rejects(api('/python/jobs',{}),e=>e.status===status && e.contentType===type && e.uncertain && !e.message.includes('private-value'));
  }
});

test('validation errors preserve useful field details without echoing source or other input',async()=>{
  globalThis.fetch=async()=>new Response(JSON.stringify({detail:[{loc:['body','initial_cash'],msg:'Must be positive',input:'private-input'}]}),{status:422});
  await assert.rejects(api('/python/jobs',{}),e=>e.status===422 && !e.uncertain && e.message.includes('initial_cash') && !e.message.includes('private-input'));
});

test('a 502 empty response survives refresh and repeated recovery retains one exact request',async()=>{
  const data=new Map();globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  const request=submission({name:'隔离回测',source:'def initialize(context): pass',start:'2024-03-04',end:'2024-03-08',capital:'100000',frequency:'1d'},
    {environment_id:'a'.repeat(64),external_securities_required:false,universe:'strategy_subscription'},'original-key');
  const calls=[];
  globalThis.fetch=async(_url,options)=>{calls.push(JSON.parse(options.body));return new Response('',{status:502});};
  await assert.rejects(submit(request),e=>e.uncertain);
  assert.equal(data.has(pendingKey),true);
  const afterRefresh=readPending();assert.deepEqual(afterRefresh,request);
  globalThis.fetch=async(_url,options)=>{calls.push(JSON.parse(options.body));return new Response(JSON.stringify({contract_version:'python-minute-jobs.v1',job_id:'m2job-'+'b'.repeat(32),request:{...request,securities:[],warmup_sessions:20}}),{status:201});};
  const [first,second]=await Promise.all([submit(afterRefresh),submit(afterRefresh)]);
  assert.equal(first.job_id,second.job_id);
  assert.ok(calls.every(body=>JSON.stringify(body)===JSON.stringify(request)));
  assert.equal(readPending(),null);
});

test('chunked results larger than 64 MiB are decoded fully including the final fields',async()=>{
  const encoder=new TextEncoder(),chunk=new Uint8Array(1024*1024).fill(120),size=65*chunk.length;
  globalThis.fetch=async()=>{
    let part=-1;
    return new Response(new ReadableStream({pull(controller){
      if(part===-1)controller.enqueue(encoder.encode('{"logs":"'));
      else if(part<65)controller.enqueue(chunk);
      else{controller.enqueue(encoder.encode('","summary":{"net_return":0},"last":"complete"}'));controller.close();}
      part++;
    }}),{headers:{'Content-Type':'application/json'}});
  };
  const result=await api('/history/jobs/synthetic/result');
  assert.equal(result.logs.length,size);
  assert.equal(result.logs.at(-1),'x');
  assert.equal(result.summary.net_return,0);
  assert.equal(result.last,'complete');
});

test('changed service defaults do not require equality with the initial database policy',async()=>{
  const status={policy:{execution_seconds:180},policy_sha256:'b'.repeat(64),initial_policy_sha256:'a'.repeat(64),execution_policy_scope:'frozen_per_task'};
  globalThis.fetch=async()=>new Response(JSON.stringify(status),{headers:{'Content-Type':'application/json'}});
  assert.deepEqual(await api('/tasks/service'),status);
});
