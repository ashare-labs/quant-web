import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setImmediate} from 'node:timers/promises';
import ts from 'typescript';
import * as apiModule from '../src/shared/api.ts';
import * as model from '../src/results/model.ts';
import {backtestsHref} from '../src/backtests/history-model.ts';
import {requestStrategy} from '../src/backtests/history-api.ts';
import {readResponse} from '../src/shared/response-read.ts';

const originalFetch=globalThis.fetch,originalLocation=globalThis.location;
afterEach(()=>{globalThis.fetch=originalFetch;if(originalLocation===undefined)delete globalThis.location;else globalThis.location=originalLocation;});
const compile=path=>ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
function hooks(){
 const r={slots:[],effects:[],cleanup:[],dirty:false};let index=0;
 r.react={useState(value){const i=index++;if(!(i in r.slots))r.slots[i]=value;return[r.slots[i],v=>{r.slots[i]=typeof v==='function'?v(r.slots[i]):v;r.dirty=true;}];},useRef(value){return r.slots[index++]??={current:value};},useEffect(effect,deps){const i=index++,before=r.slots[i];if(!before||deps.some((d,n)=>!Object.is(d,before[n]))){r.slots[i]=deps;r.effects.push(()=>{r.cleanup[i]?.();r.cleanup[i]=effect();});}}};
 r.renderWith=fn=>{index=0;r.dirty=false;r.value=fn();while(r.effects.length)r.effects.shift()();};
 r.flush=async()=>{await setImmediate();for(let n=0;r.dirty&&n<10;n++)r.render();};
 r.close=()=>r.cleanup.forEach(fn=>fn?.());return r;
}
function resource(){
 const r=hooks();r.path='/history/jobs/synthetic/result';r.timers=new Map();r.events=new Map();let next=0;
 const module={exports:{}};
 new Function('require','module','exports','setTimeout','clearTimeout','globalThis',compile('../src/shared/ui.tsx'))(
  name=>name==='react'?r.react:name==='./api'?apiModule:{},module,module.exports,
  (fn,ms)=>{const id=++next;r.timers.set(id,{fn,ms});return id;},id=>r.timers.delete(id),
  {addEventListener:(name,fn)=>r.events.set(name,fn),removeEventListener:(name)=>r.events.delete(name)});
 r.render=()=>r.renderWith(()=>module.exports.useResource(r.path,0,false,{timeoutMs:60000,trackRead:true}));
 r.expire=async()=>{const [id,timer]=[...r.timers].find(([,t])=>t.ms===60000);r.timers.delete(id);timer.fn();await r.flush();};
 return r;
}
function stalledBody(){
 const r={cancelled:0,signal:null};
 globalThis.fetch=async(_url,init)=>{r.signal=init.signal;return new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{"items":'));},cancel(){r.cancelled++;}}),{headers:{'Content-Type':'application/json'}});};
 return r;
}
test('actual body reads report received bytes and preserve multibyte JSON without fabricated compressed totals',async()=>{
 const data=new TextEncoder().encode('{"value":"中文🙂"}');
 for(const encoding of [null,'gzip']){
  const chunks=[data.slice(0,11),data.slice(11,13),data.slice(13)],events=[];
  const response=new Response(new ReadableStream({pull(c){const next=chunks.shift();if(next)c.enqueue(next);else c.close();}}),{headers:{'Content-Length':String(data.length),...(encoding?{'Content-Encoding':encoding}:{})}});
  assert.equal(JSON.parse(await readResponse(response,undefined,p=>events.push(p))).value,'中文🙂');
  assert.equal(events.at(-1).receivedBytes,data.length);assert.equal(events.at(-1).phase,'processing');
  assert.equal(events.at(-1).totalBytes,encoding?null:data.length);
 }
});
test('a response whose headers arrive but body hangs times out, aborts transport and remains retryable',async()=>{
 const body=stalledBody(),r=resource();try{
  r.render();await r.flush();assert.equal(r.value.loading,true);assert.equal(r.value.readProgress.phase,'receiving');
  await r.expire();assert.equal(body.signal.aborted,true);assert.equal(body.cancelled,1);assert.equal(r.value.loading,false);assert.match(r.value.error,/60 秒/);assert.equal(r.timers.size,0);
  globalThis.fetch=async()=>Response.json({job_id:'complete'});r.value.refresh();await r.flush();await r.flush();
  assert.equal(r.value.data.job_id,'complete');assert.equal(r.value.error,'');assert.equal(r.value.loading,false);assert.equal(r.timers.size,0);
 }finally{r.close();}
});
test('cancelling while connecting ends the spinner and a late reply cannot resurrect it',async()=>{
 let resolve,signal;globalThis.fetch=(_url,init)=>{signal=init.signal;return new Promise(r=>resolve=r);};
 const r=resource();try{
  r.render();await r.flush();assert.equal(r.value.readProgress.phase,'connecting');r.value.cancel();await r.flush();
  assert(signal.aborted);assert.match(r.value.error,/已取消本次读取/);assert.equal(r.value.loading,false);
  resolve(Response.json({job_id:'late'}));await r.flush();assert.equal(r.value.data,null);assert.match(r.value.error,/已取消/);assert.equal(r.timers.size,0);
 }finally{r.close();}
});
test('unmount cancels a hanging result body and an independent list read proceeds immediately',async()=>{
 const body=stalledBody(),r=resource();r.render();await r.flush();r.close();await r.flush();
 assert(body.signal.aborted);assert.equal(body.cancelled,1);assert.equal(r.timers.size,0);assert.equal(r.events.size,0);
 globalThis.fetch=async()=>Response.json({items:[{name:'saved.py'}]});
 assert.equal((await apiModule.api('/python/directories')).items[0].name,'saved.py');
});
test('switching detail views aborts the old body; browser back-forward cache re-entry restarts a cancelled read',async()=>{
 const body=stalledBody(),r=resource();try{
  r.render();await r.flush();r.path=null;r.render();await r.flush();assert(body.signal.aborted);assert.equal(body.cancelled,1);assert.equal(r.value.loading,false);
  r.path='/history/jobs/synthetic/result';r.render();await r.flush();const oldSignal=body.signal;
  r.events.get('pagehide')();assert(oldSignal.aborted);
  globalThis.fetch=async()=>Response.json({job_id:'returned'});r.events.get('pageshow')({persisted:true});await r.flush();await r.flush();
  assert.equal(r.value.data.job_id,'returned');assert.equal(r.value.loading,false);assert.equal(r.timers.size,0);
 }finally{r.close();}
});

// Execute the real page's hook wiring and event handlers; synthetic fixtures only.
const id='m2job-'+ '1'.repeat(32),strategy='aqproj-'+ '2'.repeat(32),path='/history/jobs/'+id;
const fixture=JSON.parse(readFileSync(new URL('./fixtures/result-analysis.json',import.meta.url)))[0];
const analysis=structuredClone(fixture.analysis);
Object.assign(analysis,{job_id:id,calculation_version:'returns-v2',analysis_id:'c'.repeat(64),excess_drawdowns:[],comparison:{selection:'frozen',source:'frozen',options:[{value:'frozen',label:'原始基准'}]}});
analysis.policy.excess_return='relative_nav_return';for(const point of analysis.series){point.relative_nav=null;point.return_difference=null;}
function page(job={job_id:id,status:'succeeded',request:{name:'Test',strategy_id:strategy},result:{snapshot_sha256:analysis.source_sha256}}){
 const r=hooks();r.requests=[];r.data=new Map([[path,job],[path+'/result/analysis?analysis_version=returns-v2&benchmark=frozen',analysis]]);
 const jsx=(type,props)=>({type,props});r.overview=()=>null;r.table=()=>null;r.status=()=>null;
 const ui={useResource(p,_poll,_paper,options){r.requests.push({path:p,options});return {data:r.data.get(p)||null,error:'',loading:!!p&&!r.data.has(p),readProgress:null,cancel(){},refresh(){}};}};
 const module={exports:{}};
 new Function('require','module','exports',compile('../src/pages/ResultsPage.tsx'))(name=>{
  if(name==='react')return r.react;if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'fragment'};
  if(name==='../shared/api')return apiModule;if(name==='../shared/ui')return ui;
  if(name==='../backtests/history-model')return {backtestsHref};if(name==='../backtests/history-api')return {requestStrategy};
  if(name==='../strategies/project-model')return {strategyEditorHref:id=>'strategy-editor.html?project='+id};
  if(name==='../results/model')return model;if(name==='../results/ResultOverview')return {ResultOverview:r.overview};
  if(name==='../shared/DataTable')return {DataTable:r.table};if(name==='../results/ReadStatus')return {ReadStatus:r.status};
  return {};
 },module,module.exports);
 globalThis.location={search:'?job='+id+'&history=1&strategy='+strategy};
 r.render=()=>{r.requests=[];r.renderWith(()=>module.exports.ResultsPage());};r.render();return r;
}
function nodes(node){if(Array.isArray(node))return node.flatMap(nodes);return node&&typeof node==='object'&&'props' in node?[node,...nodes(node.props?.children)]:[];}
function click(r,text){const button=nodes(r.value).find(n=>n.type==='button'&&n.props.children===text);assert(button,text);button.props.onClick();r.render();}
test('overview reads analysis directly from the published identity, without fetching frozen details first',()=>{
 const r=page();try{
  assert(r.requests.some(r=>r.path===path+'/result/analysis?analysis_version=returns-v2&benchmark=frozen'));
  assert(!r.requests.some(r=>r.path===path+'/result'));
  const overview=nodes(r.value).find(n=>n.type===r.overview);assert.equal(overview.props.analysis,analysis);assert.equal(overview.props.result.name,'Test');
  const back=nodes(r.value).find(n=>n.type==='a');assert.equal(back.props.href,backtestsHref({strategy}));
 }finally{r.close();}
});
test('trades/holdings request frozen detail on demand; returning to overview releases that request path',()=>{
 const r=page();try{
  for(const view of ['交易详情','每日持仓与收益']){click(r,view);assert(r.requests.some(r=>r.path===path+'/result'));assert(!nodes(r.value).some(n=>n.type===r.table));click(r,'收益概述');assert(!r.requests.some(r=>r.path===path+'/result'));}
  click(r,'运行日志');assert(r.requests.some(r=>r.path===path+'/logs'));assert(!r.requests.some(r=>r.path===path+'/result'));assert(!r.requests.some(r=>r.path?.includes('/analysis')));
  const logs=nodes(r.value).find(n=>n.type==='details'&&nodes(n).some(c=>c.type==='summary'&&c.props.children==='策略日志'));
  logs.props.onToggle({currentTarget:{open:true}});r.render();assert(r.requests.some(r=>r.path===path+'/result'));
 }finally{r.close();}
});
test('unpublished and factor jobs do not request analysis or frozen Python details; unassociated history stays job-scoped',()=>{
 const r=page({job_id:id,status:'failed',request:{name:'old'},result:null});try{
  assert(!r.requests.some(r=>r.path?.includes('/result')));assert.equal(nodes(r.value).find(n=>n.type==='a').props.href,backtestsHref({job:id}));
  globalThis.location.search+='&family=factors';r.data.set(path,{job_id:id,status:'succeeded',request:{factor_id:'test'},result:{snapshot_sha256:analysis.source_sha256}});r.render();
  assert(!r.requests.some(r=>r.path?.includes('/result')));
 }finally{r.close();}
});
test('wrong result identity is not rendered and full result failure cannot hide valid overview metrics',()=>{
 const r=page();try{
  r.data.set(path+'/result',{job_id:'other',native:{accounts:[{total_value:999}]}});click(r,'每日持仓与收益');assert(!nodes(r.value).some(n=>n.type===r.table));
  click(r,'收益概述');assert.equal(nodes(r.value).find(n=>n.type===r.overview).props.analysis,analysis);
 }finally{r.close();}
});
