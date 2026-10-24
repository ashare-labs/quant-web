import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {newDraft,readDrafts,saveDraft} from '../src/shared/drafts.ts';
import {commitEditorSave,editedDraft,findEditorDraft,openFileDraft,retainEditorDraft,savedEditorDraft} from '../src/shared/editor-state.ts';
import {submission,submit,submitCurrent} from '../src/backtests/submission.ts';

const originalStorage=globalThis.localStorage,originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;if(originalStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=originalStorage;});
const key='quantweb-strategy-drafts-v1',path='研究/Audit.py';
const base={...newDraft('Audit','研究'),id:'original',filePath:path,source:'def initialize(context): pass # SAVED_VERSION',start:'2024-01-29',end:'2024-01-30',capital:'100000',frequency:'1d',updated:'2026-10-24T00:00:00Z'};
const patch={source:'def initialize(context): pass # SUBMITTED_EDIT',start:'2024-02-01',end:'2024-02-02',capital:'200,000',frequency:'1m'};
const catalogue={environment_id:'a'.repeat(64),external_securities_required:false,universe:'strategy_subscription'};
const response=(body,status=200)=>new Response(JSON.stringify(body),{status});
const accepted=request=>({contract_version:'python-minute-jobs.v1',job_id:'m2job-'+'a'.repeat(32),request,status:'succeeded'});
function storage(initial=[base]){const map=new Map([[key,JSON.stringify(initial)]]);globalThis.localStorage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};return map;}
function edit(current,changes){const next=editedDraft(current,changes);retainEditorDraft(next);return next;}
function reopen(file=path,source=base.source){return openFileDraft(file,source,findEditorDraft(file,null));}

test('F2: saved A → unsaved B → accepted run → file return/refresh retains B and every parameter',async()=>{
  storage();const working=edit(reopen(),patch),request=submission(working,catalogue,'run-B');
  globalThis.fetch=async()=>response(accepted(request),201);await submit(request);

  for(let refresh=0;refresh<3;refresh++)assert.deepEqual(reopen(),working);
  assert.equal(readDrafts().length,1);assert.equal(reopen().source,patch.source);
});

test('confirmed submit rejection retains source and invalid/in-progress editor values across refresh',async()=>{
  storage();const working=edit(reopen(),patch),request=submission(working,catalogue,'rejected');
  globalThis.fetch=async()=>response({error:{code:'PYTHON_SYNTAX_ERROR',message:'syntax'}},422);
  await assert.rejects(submit(request));assert.deepEqual(reopen(),working);
  const incomplete=edit(working,{source:'def ',start:'',capital:'',name:'尚未保存名称'});
  assert.throws(()=>submission(incomplete,catalogue,'invalid'));assert.deepEqual(reopen(),incomplete);
});

test('after an uncertain B submission, Start submits current C and returning retains C',async()=>{
  storage();const b=edit(reopen(),patch),sent=[];
  globalThis.fetch=async(_url,options)=>{sent.push(JSON.parse(options.body));throw Error('lost');};
  await assert.rejects(submitCurrent(b,catalogue));
  const c=edit(b,{source:'def initialize(context): pass # NEWER_EDIT',capital:'300000',frequency:'1d'});
  globalThis.fetch=async(_url,options)=>{const body=JSON.parse(options.body);sent.push(body);return response(accepted(body),201);};
  await submitCurrent(c,catalogue);assert.deepEqual(reopen(),c);
  assert.equal(sent[1].source,c.source);assert.equal(sent[1].initial_cash,300000);
  assert.equal(sent[1].frequency,'1d');assert.notEqual(sent[0].idempotency_key,sent[1].idempotency_key);
});

test('same-name different files preserve independent working source, names and configuration',()=>{
  const other={...base,id:'other',filePath:'另一个目录/Audit.py',folder:'另一个目录',source:'other'};storage([base,other]);
  const a=edit(reopen(),patch),b=edit(reopen(other.filePath,other.source),{source:'other edit',capital:'9876.50',frequency:'1d'});
  assert.deepEqual(reopen(),a);assert.deepEqual(reopen(other.filePath,other.source),b);assert.equal(readDrafts().length,2);
});

test('legacy clean records use current disk source and retain their saved parameters without migration writes',()=>{
  const map=storage(),before=map.get(key);const opened=reopen(path,'newer disk source');
  assert.equal(opened.source,'newer disk source');assert.equal(opened.capital,base.capital);assert.equal(opened.frequency,'1d');
  assert.equal(opened.workingCopy,false);assert.equal(map.get(key),before);
});

test('explicit Save marks only the current file clean; later disk changes do not resurrect the working source',()=>{
  storage();const b=edit(reopen(),patch),saved=savedEditorDraft(b);commitEditorSave(b,saved,base.source);
  assert.equal(findEditorDraft(path,null).workingCopy,false);
  assert.equal(reopen(path,'external newer source').source,'external newer source');assert.equal(reopen().capital,patch.capital);
});

test('Save As commits both local file slots atomically without putting renamed edits back into the original',()=>{
  const map=storage();const b=edit(reopen(),{...patch,name:'New'}),next=savedEditorDraft({...b,id:'new-file',filePath:'研究/New.py'});
  const before=map.get(key);globalThis.localStorage.setItem=()=>{throw Error('quota');};
  assert.throws(()=>commitEditorSave(b,next,base.source),/quota/);assert.equal(map.get(key),before);
  globalThis.localStorage.setItem=(k,v)=>map.set(k,v);commitEditorSave(b,next,base.source);
  assert.equal(reopen().name,'Audit');assert.equal(reopen().source,base.source);
  assert.equal(findEditorDraft(next.filePath,null).source,patch.source);assert.equal(readDrafts().length,2);
});

test('retention failure never overwrites the prior recoverable draft',()=>{
  const map=storage();const b=edit(reopen(),patch),before=map.get(key);
  globalThis.localStorage.setItem=()=>{throw Error('quota');};
  assert.throws(()=>retainEditorDraft(editedDraft(b,{source:'current memory'})),/quota/);
  assert.equal(map.get(key),before);assert.deepEqual(reopen(),b);
});

test('pure browser drafts preserve incomplete work and stay distinct from file-backed drafts',()=>{
  storage();const draft={...newDraft('未保存'),id:'local-only'};const working=edit(draft,{source:'work in progress',capital:'',start:''});
  assert.deepEqual(findEditorDraft(null,'local-only'),working);assert.equal(findEditorDraft(path,null).source,base.source);
  assert.equal('filePath' in working,false);assert.equal(readDrafts().length,2);
});

test('invalid retained metadata leaves old storage untouched; a draft for another file is never restored',()=>{
  const map=storage([{...base,workingCopy:'yes'}]),before=map.get(key);
  assert.throws(readDrafts,/原始内容已保留/);assert.equal(map.get(key),before);
  assert.throws(()=>openFileDraft('other.py','remote',base),/不一致/);
});
