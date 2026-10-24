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
