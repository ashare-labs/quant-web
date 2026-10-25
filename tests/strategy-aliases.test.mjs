import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readStrategyFile,saveStrategyFile,strategyDirectory} from '../src/shared/strategy-files.ts';
import {newDraft,readDrafts,saveDraft,editorHref} from '../src/shared/drafts.ts';
import {findEditorDraft,openResolvedFileDraft,editedDraft,retainEditorDraft,savedEditorDraft,commitEditorSave} from '../src/shared/editor-state.ts';
import {resolveStrategy,readStrategyBacktests} from '../src/backtests/history-api.ts';
import {submission,submit} from '../src/backtests/submission.ts';

const previousFetch=globalThis.fetch,previousStorage=globalThis.localStorage;
afterEach(()=>{globalThis.fetch=previousFetch;if(previousStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=previousStorage;});
const json=value=>new Response(JSON.stringify(value));
const canonical='Research/Case.py',alias='research/case.py',draftKey='quantweb-strategy-drafts-v1';
const file=(path=canonical,source='disk')=>({path,strategy_id:path,source});
const draft=(path,id=path)=>({...newDraft(path.split('/').at(-1).slice(0,-3),path.split('/').slice(0,-1).join('/')),id,filePath:path,source:'current '+path,start:'2024-03-18',end:'2024-03-22',capital:'250000',frequency:'1d',workingCopy:true});
const catalogue={environment_id:'a'.repeat(64),external_securities_required:false,universe:'strategy_subscription'};
const job=request=>({contract_version:'python-minute-jobs.v1',job_id:'m2job-'+'c'.repeat(32),request});
const manifest=(request,original=alias)=>({schema_version:'python-demand-job.v2',job_id:job(request).job_id,request,session:{submitted_strategy_id:original}});
function storage(initial=[]){const data=new Map([[draftKey,JSON.stringify(initial)]]);globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};return data;}

test('file reads and saves adopt the service canonical path without lowercasing or changing the request',async()=>{
  const calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,...options});return json(file());};
  assert.deepEqual(await readStrategyFile(alias),file());
  assert.equal((await saveStrategyFile(alias,'unsaved',true)).path,canonical);
  assert.equal(new URLSearchParams(calls[0].url.split('?')[1]).get('path'),alias);
  assert.deepEqual(JSON.parse(calls[1].body),{path:alias,source:'unsaved',overwrite:true});
});

test('canonical responses still require safe relative Python paths and matching strategy_id',async()=>{
  for(const response of [{path:canonical,source:'x'},file('../Case.py'),file('/Case.py'),file('x//Case.py'),file('x/../Case.py'),file('x\\Case.py'),file('C:Case.py'),file('x/Case.PY'),file('x\n/Case.py'),file('x/'.repeat(600)+'Case.py'),{...file(),strategy_id:'Other/Case.py'},{...file(),source:4}]){
    globalThis.fetch=async()=>json(response);await assert.rejects(readStrategyFile(alias));
  }
  let called=false;globalThis.fetch=async()=>{called=true;};
  await assert.rejects(readStrategyFile('../Case.py'));await assert.rejects(saveStrategyFile('/Case.py','x',true));assert.equal(called,false);
});

test('canonical directory entries must be direct children and file identities cannot cross directories',()=>{
  const value={root:'/fixture',path:'Research',entries:[{name:'Case.py',kind:'file',path:canonical,strategy_id:canonical}]};
  assert.equal(strategyDirectory(value).path,'Research');
  for(const change of [{path:'Other/Case.py',strategy_id:'Other/Case.py'},{strategy_id:'Other/Case.py'},{name:'case.py'},{path:'../Case.py',strategy_id:'../Case.py'}])assert.throws(()=>strategyDirectory({...value,entries:[{...value.entries[0],...change}]}));
  assert.throws(()=>strategyDirectory({...value,entries:[value.entries[0],value.entries[0]]}));
});

test('an alias entry restores the existing canonical working copy without writing or creating a competing draft',()=>{
  const current=draft(canonical),data=storage([current]),before=data.get(draftKey);
  assert.deepEqual(openResolvedFileDraft(alias,file()).draft,current);assert.equal(data.get(draftKey),before);
});

test('an old alias working copy is preserved with provenance and becomes one canonical editable state',()=>{
  const old=draft(alias,'alias-draft');storage([old]);
  const {draft:current,backup}=openResolvedFileDraft(alias,file(),old);
  assert.equal(current.filePath,canonical);assert.equal(current.source,old.source);assert.equal(current.capital,old.capital);assert.equal(current.name,'Case');assert.notEqual(current.id,old.id);
  assert.equal(backup.id,old.id);assert.equal(backup.filePath,undefined);assert.equal(backup.aliasSourcePath,alias);assert.equal(backup.source,old.source);assert.equal(backup.name,old.name);
  assert.equal(backup.folder,'Research'); // Remains reachable in the canonical directory after the notice is gone.
  const edited=editedDraft(current,{source:'new edit',capital:'300000'});retainEditorDraft(edited);
  assert.deepEqual(openResolvedFileDraft(alias,file()).draft,edited);assert.deepEqual(findEditorDraft(null,old.id),backup);
  const saved=savedEditorDraft(edited);commitEditorSave(edited,saved,'disk');assert.equal(findEditorDraft(canonical,null).workingCopy,false);
  assert.equal(new URLSearchParams(editorHref(backup.id).split('?')[1]).get('draft'),old.id);assert.equal(readDrafts().length,2);
});

test('coexisting alias and canonical drafts retain both contents without overwriting canonical edits',()=>{
  const a=draft(alias,'alias-draft'),c={...draft(canonical,'canonical-draft'),source:'canonical work',capital:'999000'};storage([a,c]);
  const opened=openResolvedFileDraft(alias,file(),a);assert.deepEqual(opened.draft,c);assert.deepEqual(findEditorDraft(canonical,null),c);
  assert.equal(findEditorDraft(null,a.id).source,a.source);assert.equal(findEditorDraft(null,a.id).capital,a.capital);assert.equal(findEditorDraft(null,a.id).aliasSourcePath,alias);
  assert.deepEqual(openResolvedFileDraft(alias,file()).draft,c);assert.equal(readDrafts().length,2);
});

test('failed alias preservation is atomic and leaves both original records untouched',()=>{
  const a=draft(alias),c=draft(canonical),data=storage([a,c]),before=data.get(draftKey);globalThis.localStorage.setItem=()=>{throw Error('quota');};
  assert.throws(()=>openResolvedFileDraft(alias,file(),a),/quota/);assert.equal(data.get(draftKey),before);
});

test('case-sensitive and different-directory entities stay separate; no client alias guessing',()=>{
  const paths=[canonical,'Research/case.py','Other/Case.py'];const originals=paths.map(p=>draft(p));storage(originals);
  for(const [i,path] of paths.entries())assert.deepEqual(openResolvedFileDraft(path,file(path),originals[i]).draft,originals[i]);
  assert.equal(readDrafts().length,3);assert.throws(()=>openResolvedFileDraft(alias,file(),originals[2]),/不一致/);
});

test('Unicode equivalents only converge when the service actually resolves the requested spelling',async()=>{
  const composed='Research/Café.py',decomposed='Research/Cafe\u0301.py';storage();
  globalThis.fetch=async()=>json(file(composed));assert.equal(openResolvedFileDraft(decomposed,await readStrategyFile(decomposed)).draft.filePath,composed);
  globalThis.fetch=async()=>json(file(decomposed));assert.equal(openResolvedFileDraft(decomposed,await readStrategyFile(decomposed)).draft.filePath,decomposed);
});

test('current file list resolves aliases but explicit frozen history remains exact, including after deletion',async()=>{
  const calls=[];globalThis.fetch=async(url)=>{calls.push(url);if(url.includes('/files?'))return json(file());return json({strategy_id:canonical,identity_model:'saved_relative_path',analysis_version:'returns-v2',total:0,unassigned_count:10,offset:0,limit:100,items:[]});};
  const resolved=await resolveStrategy(new URLSearchParams({file:alias}));assert.equal(resolved.id,canonical);await readStrategyBacktests(resolved);
  assert.equal(new URLSearchParams(calls[1].split('?')[1]).get('strategy_id'),canonical);
  globalThis.fetch=async()=>{throw Error('file deleted');};assert.equal((await resolveStrategy(new URLSearchParams({strategy:alias}))).id,alias);
});

test('canonicalized acceptance requires the frozen original alias and every other request field',async()=>{
  storage();const original=submission(draft(alias),catalogue,'alias-key'),accepted={...original,strategy_id:canonical},calls=[];
  globalThis.fetch=async(url,options)=>{calls.push({url,body:options.body});return json(options.method==='POST'?job(accepted):manifest(accepted));};
  const result=await submit(original);assert.equal(result.request.strategy_id,canonical);
  assert.deepEqual(JSON.parse(calls[0].body),original);assert.equal(calls[1].url,'/api/v1/history/jobs/'+result.job_id+'/manifest');assert.equal(calls.some(c=>c.url.includes('/files')),false);
});

test('unproven or mismatched identity receipts are not acknowledged as acceptance',async()=>{
  const original=submission(draft(alias),catalogue,'alias-key'),accepted={...original,strategy_id:canonical};
  for(const frozen of [manifest(accepted,'Other/Case.py'),{...manifest(accepted),job_id:'m2job-'+'d'.repeat(32)},manifest({...accepted,source:'different'}),manifest({...accepted,strategy_id:'Other/Case.py'}),{...manifest(accepted),session:{}},null]){
    storage();globalThis.fetch=async(_url,options)=>json(options.method==='POST'?job(accepted):frozen);
    await assert.rejects(submit(original),e=>e.uncertain);
  }
});

test('explicit transport retry verifies alias evidence without changing editable work',async()=>{
  storage();const original=submission(draft(alias),catalogue,'lost-alias'),accepted={...original,strategy_id:canonical},sent=[];let count=0;
  globalThis.fetch=async(_url,options)=>{if(options.method==='POST'){sent.push(JSON.parse(options.body));if(!count++)throw Error('lost');return json(job(accepted));}return json(manifest(accepted));};
  await assert.rejects(submit(original));const current={...draft(canonical),source:'newer work'};saveDraft(current);
  await submit(original);assert.deepEqual(sent,[original,original]);assert.deepEqual(findEditorDraft(canonical,null),current);
});
