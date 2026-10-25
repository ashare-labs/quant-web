import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {ApiError} from '../src/shared/api.ts';
import {isProjectId,isStrategyId,isStrategyFilePath} from '../src/shared/strategy-path.ts';
import {strategyDirectory,readStrategyFile} from '../src/shared/strategy-files.ts';
import {projectSource,projectResponse,projectFilePath,projectHref,strategyEditorHref,renameProjectFile,deleteProjectFile,frozenSource,sameProjectSource,sourceChanges,sourceFiles,projectDescriptor} from '../src/strategies/project-model.ts';
import {readProject,createProject,saveProject,moveProject,ProjectWriteError} from '../src/strategies/project-api.ts';
import {openProjectDraft,editProjectDraft,retainProjectDraft,readProjectDraft,relocatedProjectDraft,savedProjectDraft} from '../src/strategies/project-state.ts';
import {checkSourceBudget,projectSubmission,submission,submitCurrent,submitProjectCurrent,matchesRequest} from '../src/backtests/submission.ts';
import {readStrategyBacktests,resolveStrategy,strategyIdentity} from '../src/backtests/history-api.ts';
import {readComparison} from '../src/backtests/comparison-api.ts';

const originalFetch=globalThis.fetch,originalStorage=globalThis.localStorage;
afterEach(()=>{globalThis.fetch=originalFetch;if(originalStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=originalStorage;});
const id='aqproj-'+'a'.repeat(32),otherId='aqproj-'+'b'.repeat(32),revision='1'.repeat(64),newRevision='2'.repeat(64);
const files={'main.py':'from .signals import weight\nfrom aquant import *\ndef initialize(context): pass\n','signals.py':'weight = 0.5\n'};
const project=(patch={})=>({path:'研究/策略',strategy_id:id,entrypoint:'main.py',files:{...files},revision,...patch});
const draft=(patch={})=>({...openProjectDraft(project()).draft,start:'2024-03-01',end:'2024-03-08',capital:'100000',frequency:'1d',...patch});
const catalogue={environment_id:'c'.repeat(64),external_securities_required:false,universe:'strategy_subscription'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const accepted=request=>({contract_version:'python-minute-jobs.v1',job_id:'m2job-'+'d'.repeat(32),request});
function storage(){const map=new Map();globalThis.localStorage={getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};return map;}

test('stable project IDs are identities, never legacy Python file paths',async()=>{
  assert.equal(isProjectId(id),true);assert.equal(isStrategyId(id),true);assert.equal(isStrategyFilePath(id),false);
  assert.equal(strategyEditorHref(id),projectHref(id));assert.equal(strategyEditorHref('中文/a.py'),'strategy-editor.html?file='+encodeURIComponent('中文/a.py'));
  let called=false;globalThis.fetch=async()=>{called=true;};await assert.rejects(readStrategyFile(id),/路径无效/);assert.equal(called,false);
});
test('classification folders and project rows retain separate identity semantics',()=>{
  const directory={path:'研究',root:'test',entries:[{path:'研究/分类',name:'分类',kind:'directory'},{path:'研究/策略',name:'策略',kind:'project',strategy_id:id},{path:'研究/旧.py',name:'旧.py',kind:'file',strategy_id:'研究/旧.py'}]};
  assert.equal(strategyDirectory(directory).entries.length,3);
  assert.throws(()=>strategyDirectory({...directory,entries:[{...directory.entries[1],strategy_id:'研究/策略'}]}));
  assert.throws(()=>strategyDirectory({...directory,entries:[{...directory.entries[0],strategy_id:id}]}));
});
test('project paths reject traversal, reserved syntax, ambiguous files and module/package collisions',()=>{
  for(const path of ['../main.py','/main.py','a//b.py','a-b.py','class.py','a/__pycache__/x.py','x.txt','K.py','a\\b.py'])assert.throws(()=>projectFilePath(path),path);
  assert.equal(projectFilePath('signals/动量.py'),'signals/动量.py');
  for(const value of [{'main.py':'','Main.py':''},{'signals.py':'','signals/run.py':''},{'Signals/a.py':'','signals/b.py':''}])assert.throws(()=>sourceFiles(value));
  assert.throws(()=>projectSource({project_id:id,entrypoint:'missing.py',files}));
  assert.throws(()=>projectResponse({...project(),revision:'unknown'}));
});
test('renaming the entry updates its path while helper removal keeps the complete remaining project',()=>{
  const renamed=renameProjectFile(project(),'main.py','strategy/run.py');assert.equal(renamed.entrypoint,'strategy/run.py');assert.equal(renamed.files['strategy/run.py'],files['main.py']);assert.equal(renamed.files['signals.py'],files['signals.py']);
  assert.throws(()=>renameProjectFile(project(),'main.py','signals.py'),/同名/);
  assert.throws(()=>deleteProjectFile(project(),'main.py'),/入口/);
  assert.deepEqual(deleteProjectFile(project(),'signals.py').files,{'main.py':files['main.py']});
  assert.match(projectDescriptor(project()),/format_version = 1/);assert.equal(projectDescriptor(project()).includes('initial_cash'),false);
});
test('refresh, back navigation and project relocation retain all unsaved files and run settings',()=>{
  storage();const original=draft(),edited=editProjectDraft(original,{files:{...original.files,'signals.py':'weight = 0.9\n','utils/math.py':'factor = 2\n'},active:'utils/math.py',capital:'250000'});retainProjectDraft(edited);
  const reopened=openProjectDraft(project({path:'新分类/改名'}),readProjectDraft(id));
  assert.equal(reopened.draft.path,'新分类/改名');assert.equal(reopened.draft.strategy_id,id);assert.equal(reopened.draft.active,'utils/math.py');assert.equal(reopened.draft.files['signals.py'],'weight = 0.9\n');assert.equal(reopened.draft.capital,'250000');assert.equal(reopened.draft.workingCopy,true);assert.equal(reopened.conflict,false);
});
test('external edits keep the old save baseline and show a conflict, rather than overwriting either copy',()=>{
  const edited=editProjectDraft(draft(),{files:{...files,'signals.py':'local'}});
  const remote=project({revision:newRevision,files:{...files,'signals.py':'external'}});
  const opened=openProjectDraft(remote,edited);assert.equal(opened.conflict,true);assert.equal(opened.draft.revision,revision);assert.equal(opened.draft.files['signals.py'],'local');assert.equal(remote.files['signals.py'],'external');
  const clean=openProjectDraft(remote,draft());assert.equal(clean.conflict,false);assert.equal(clean.draft.files['signals.py'],'external');
});
test('same source readback recovers accepted save state and a saved draft keeps configuration',()=>{
  const saved=project({revision:newRevision}),edited=draft({workingCopy:true,capital:'',active:'signals.py'});
  const reopened=openProjectDraft(saved,edited);assert.equal(reopened.conflict,false);assert.equal(reopened.draft.workingCopy,false);assert.equal(reopened.draft.capital,'');
  const committed=savedProjectDraft(edited,saved);assert.equal(committed.revision,newRevision);assert.equal(committed.active,'signals.py');assert.equal(committed.capital,'');
});
test('adopting a remote version selects its entry when the active helper was removed',()=>{
  const current=draft({active:'signals.py'}),remote=project({files:{'main.py':files['main.py']},revision:newRevision});
  assert.equal(savedProjectDraft(current,remote).active,'main.py');
  assert.equal(savedProjectDraft({...current,active:'aquant.toml'},remote).active,'aquant.toml');
});
test('an uncertain move never silently adopts a revision with external source edits',()=>{
  const current=editProjectDraft(draft(),{files:{...files,'signals.py':'local'}}),external=project({path:'新分类/改名',revision:newRevision,files:{...files,'signals.py':'remote edit'}});
  const recovered=relocatedProjectDraft(current,external);assert.equal(recovered.conflict,true);assert.equal(recovered.draft.path,'新分类/改名');assert.equal(recovered.draft.revision,revision);assert.equal(recovered.draft.files['signals.py'],'local');
  const justMoved=relocatedProjectDraft(current,project({path:'新分类/改名'}));assert.equal(justMoved.conflict,false);assert.equal(justMoved.draft.revision,revision);
});
test('corrupt and quota-failed project storage preserves original records',()=>{
  const map=storage(),key='quantweb-project-draft-v1:'+id;map.set(key,'{broken');
  assert.throws(()=>retainProjectDraft(draft()));assert.equal(map.get(key),'{broken');map.delete(key);retainProjectDraft(draft());const original=map.get(key);
  localStorage.setItem=()=>{throw Error('quota');};assert.throws(()=>retainProjectDraft(editProjectDraft(draft(),{capital:'200000'})),/quota/);assert.equal(map.get(key),original);
});
test('project APIs use stable lookup and complete optimistic save without exposing helper files as strategies',async()=>{
  const calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,options,body:options.body&&JSON.parse(options.body)});return json(project({revision:newRevision}));};
  await readProject(id);assert.match(calls[0].url,/strategy_id=aqproj-/);
  await readProject('研究/策略');assert.match(calls[1].url,/path=/);
  await createProject('研究/策略');assert.deepEqual(calls[2].body,{path:'研究/策略',entrypoint:'main.py'});
  await saveProject(project());assert.equal(calls[3].options.method,'PUT');assert.deepEqual(calls[3].body,{path:'研究/策略',strategy_id:id,entrypoint:'main.py',files,expected_revision:revision});
});
test('wrong identity reads and confirmed save conflicts never become successful writes',async()=>{
  globalThis.fetch=async()=>json(project({strategy_id:otherId}));await assert.rejects(readProject(id),/不一致/);
  let count=0;globalThis.fetch=async()=>{count++;return json({error:{code:'STRATEGY_PROJECT_REVISION_CONFLICT',message:'版本冲突'}},409);};
  const input=project();await assert.rejects(saveProject(input),error=>error instanceof ApiError&&error.code==='STRATEGY_PROJECT_REVISION_CONFLICT');assert.equal(count,1);assert.deepEqual(input,project());
});
test('uncertain save reads back once, retains the new revision for explicit retry, and does not claim durability',async()=>{
  let count=0;globalThis.fetch=async()=>++count===1?json({error:{code:'STRATEGY_SAVE_UNCERTAIN',message:'未确认'}},503):json(project({revision:newRevision}));
  await assert.rejects(saveProject(project()),error=>error instanceof ProjectWriteError&&error.current?.revision===newRevision&&/尚未确认/.test(error.message));assert.equal(count,2);
});
test('project moves preserve stable identity and recover by ID after a lost response',async()=>{
  const moved=project({path:'分类/改名',revision:newRevision});let count=0;
  globalThis.fetch=async(url,options)=>{count++;if(count===1){assert.deepEqual(JSON.parse(options.body),{path:'研究/策略',destination:'分类/改名',strategy_id:id,expected_revision:revision});return json(moved);}return json(moved);};
  assert.equal((await moveProject(project(),'分类/改名')).strategy_id,id);
  globalThis.fetch=async(url,options)=>{if(options.method==='POST')throw Error('lost');assert.match(url,/strategy_id=aqproj-/);return json(moved);};
  await assert.rejects(moveProject(project(),'分类/改名'),error=>error instanceof ProjectWriteError&&error.current?.path==='分类/改名');
});
test('both daily and minute submission include every current file and entry, with no legacy source or external universe',()=>{
  for(const frequency of ['1d','1m']){const request=projectSubmission(draft({frequency,files:{...files,'signals.py':'unsaved'}}),catalogue,'key');assert.equal(request.frequency,frequency);assert.equal(request.strategy_id,id);assert.equal(request.project.project_id,id);assert.equal(request.project.files['signals.py'],'unsaved');assert.equal(request.project.entrypoint,'main.py');for(const key of ['source','securities','warmup_sessions'])assert.equal(key in request,false);}
});
test('long project directory names stay intact while the run label fits the existing contract',()=>{
  const path='分类/'+'quant'.repeat(20),current=draft({path}),request=projectSubmission(current,catalogue,'key');
  assert.equal(Array.from(request.name).length,80);assert.equal(request.name.endsWith('…'),true);assert.equal(current.path,path);assert.equal(request.strategy_id,id);assert.equal(request.project.project_id,id);assert.deepEqual(request.project.files,files);
});
test('project source save is independent of incomplete or invalid run configuration',async()=>{
  globalThis.fetch=async(_,options)=>{const body=JSON.parse(options.body);assert.equal('start' in body,false);assert.equal('capital' in body,false);return json(project({revision:newRevision}));};
  assert.equal((await saveProject(draft({start:'not-yet',end:'',capital:''}))).revision,newRevision);
});
test('all project files affect retry identity; property order does not; explicit acceptance enables a fresh run',async()=>{
  storage();const calls=[];let succeed=false;globalThis.fetch=async(_,options)=>{const request=JSON.parse(options.body);calls.push(request);if(!succeed)throw Error('lost');return json(accepted({...request,project:{...request.project,files:Object.fromEntries(Object.entries(request.project.files).reverse())}}));};
  const current=draft();await assert.rejects(submitProjectCurrent(current,catalogue));await assert.rejects(submitProjectCurrent({...current,files:Object.fromEntries(Object.entries(files).reverse())},catalogue));assert.equal(calls[0].idempotency_key,calls[1].idempotency_key);
  const edited={...current,files:{...files,'signals.py':'changed'}};await assert.rejects(submitProjectCurrent(edited,catalogue));assert.notEqual(calls[1].idempotency_key,calls[2].idempotency_key);
  succeed=true;await submitProjectCurrent(edited,catalogue);assert.equal(calls[2].idempotency_key,calls[3].idempotency_key);await submitProjectCurrent(edited,catalogue);assert.notEqual(calls[3].idempotency_key,calls[4].idempotency_key);
});
test('upgrading the editor keeps the existing single-file pending attempt signature',async()=>{
  const map=storage(),single={id:'legacy-draft',name:'旧策略',source:'def initialize(context): pass',start:'2024-03-01',end:'2024-03-08',capital:'100000',frequency:'1d'};
  const request=submission(single,catalogue,'old-attempt');
  const signature=JSON.stringify(Object.entries(request).filter(([key])=>key!=='idempotency_key').sort(([a],[b])=>a.localeCompare(b)));
  map.set('quantweb-python-idempotency-v1:'+single.id,JSON.stringify({signature,key:'old-attempt'}));
  globalThis.fetch=async(_,options)=>{const body=JSON.parse(options.body);assert.equal(body.idempotency_key,'old-attempt');return json(accepted(body));};
  await submitCurrent(single,catalogue);
});
test('projects with same helper names remain isolated in stored work and pending requests',async()=>{
  storage();const first=draft(),second=draft({strategy_id:otherId,path:'另一分类/策略'});retainProjectDraft(first);retainProjectDraft(second);assert.equal(readProjectDraft(id).strategy_id,id);assert.equal(readProjectDraft(otherId).strategy_id,otherId);
  const calls=[];globalThis.fetch=async(_,options)=>{calls.push(JSON.parse(options.body));throw Error('lost');};await assert.rejects(submitProjectCurrent(first,catalogue));await assert.rejects(submitProjectCurrent(second,catalogue));assert.notEqual(calls[0].idempotency_key,calls[1].idempotency_key);
});
test('quota failure prevents an untracked project run and mismatched auxiliary files invalidate acceptance',async()=>{
  storage();localStorage.setItem=()=>{throw Error('quota');};let calls=0;globalThis.fetch=async()=>{calls++;};await assert.rejects(submitProjectCurrent(draft(),catalogue),/quota/);assert.equal(calls,0);
  const request=projectSubmission(draft(),catalogue,'key');assert.equal(matchesRequest(accepted({...request,project:{...request.project,files:{...files,'signals.py':'other'}}}),request),false);
});
test('source budgets use service limits, with no arbitrary 256 KiB project or single-file ceiling',()=>{
  const source='# '+ 'x'.repeat(300000);assert.doesNotThrow(()=>projectSubmission(draft({files:{'main.py':source}}),catalogue,'key'));
  assert.doesNotThrow(()=>submission({name:'single',source,start:'2024-03-01',end:'2024-03-08',capital:'100000',frequency:'1d'},catalogue,'key'));
  assert.doesNotThrow(()=>checkSourceBudget({'main.py':'1234'},{resource_budget:{file_bytes:3}}));
  assert.throws(()=>checkSourceBudget({'main.py':'123','a.py':'456'},{resource_budget:{artifact_bytes:5}}),/资源预算/);
});
test('project history resolves moved display name by ID but remains readable after project deletion',async()=>{
  globalThis.fetch=async()=>json(project({path:'新分类/新名'}));assert.deepEqual(await resolveStrategy(new URLSearchParams({strategy:id})),{id,path:'新分类/新名',name:'新名'});
  globalThis.fetch=async()=>json({error:{message:'missing'}},404);assert.deepEqual(await resolveStrategy(new URLSearchParams({strategy:id})),strategyIdentity(id));
  globalThis.fetch=async()=>json({strategy_id:id,identity_model:'stable_project_id',analysis_version:'returns-v2',total:0,unassigned_count:0,offset:0,limit:100,items:[]});assert.equal((await readStrategyBacktests(strategyIdentity(id))).records.length,0);
});
test('frozen source comparison includes helper changes, file additions/deletions and entry changes; old source stays intact',async()=>{
  const first=frozenSource({project:{project_id:id,entrypoint:'main.py',files}}),second=frozenSource({project:{project_id:id,entrypoint:'other.py',files:{'main.py':files['main.py'],'other.py':'pass'}}});
  assert.equal(sameProjectSource(first,second),false);assert.deepEqual(sourceChanges(first,second).map(({path,status})=>[path,status]),[['main.py','unchanged'],['other.py','added'],['signals.py','removed']]);
  const old={source:'from jqdata import *\n# frozen old source'};assert.equal(frozenSource(old).files['strategy.py'],old.source);assert.deepEqual(old,{source:'from jqdata import *\n# frozen old source'});
  const record={id:'m2job-'+'f'.repeat(32)};globalThis.fetch=async(url,options)=>{assert.equal(options.method,'GET');assert.match(url,/manifest$/);return json({job_id:record.id,request:{project:{project_id:id,entrypoint:'main.py',files}}});};assert.equal((await readComparison([record],'source'))[0].result.request.project.files['signals.py'],files['signals.py']);
});
