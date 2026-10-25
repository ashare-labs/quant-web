import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {comparisonNotes,readComparison} from '../src/backtests/comparison-api.ts';
import {normalizeBacktest} from '../src/backtests/history-api.ts';
import {optionalValue} from '../src/backtests/history-model.ts';
import {metricDefinitions,metricText,resultMetrics} from '../src/results/model.ts';

// Reuse constructed protocol fixtures; no user results or strategy executions.
const cases=JSON.parse(readFileSync(new URL('./fixtures/result-analysis.json',import.meta.url)));
const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});
const strategy='研究/比较测试.py',clone=value=>structuredClone(value);
const item=(fixture=cases[0],overrides={})=>({
  job_id:fixture.job.job_id,strategy_id:strategy,name:'比较测试',created_at:'2025-04-10T00:00:00Z',
  start_date:'2025-01-02',end_date:'2025-04-09',frequency:'1m',initial_cash:100000,
  stored_status:'succeeded',display_status:'succeeded',execution_state:'current_runtime',
  result_available:true,result:fixture.job.result,summary:fixture.result.summary,
  error:null,result_error:null,analysis_error:null,...overrides,
});
const record=(fixture=cases[0],overrides={})=>normalizeBacktest(item(fixture,overrides),strategy);
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
function serve(fixtures=cases){
  const calls=[];
  globalThis.fetch=async(url,options)=>{
    calls.push({url,options});
    const fixture=fixtures.find(f=>url.includes(f.job.job_id));assert.ok(fixture);
    if(url.endsWith('/result'))return json(fixture.result);
    if(url.endsWith('/result/analysis?analysis_version=returns-v2&benchmark=frozen'))return json(fixture.analysis);
    throw Error('Unexpected request '+url);
  };
  return calls;
}

test('comparison reads the same twenty analysis metrics as the result page using GET and the frozen hash',async()=>{
  const fixtures=clone(cases),calls=serve(fixtures),controller=new AbortController();
  fixtures[0].result.summary.benchmark_return=99; // Frozen summary must not win over analysis.
  const columns=await readComparison([record(fixtures[0]),record(fixtures[1])],'results',controller.signal);
  assert.equal(calls.length,4);
  for(const call of calls){assert.equal(call.options.method,'GET');assert.equal(call.options.signal,controller.signal);assert.match(call.url,/^\/api\/v1\/history\/jobs\/m2job-[a-f0-9]{32}\/result(\/analysis\?analysis_version=returns-v2&benchmark=frozen)?$/);}
  columns.forEach((column,index)=>{
    assert.equal(column.resultError,null);assert.equal(column.analysisError,null);
    const shown=resultMetrics(column.result.summary,column.analysis);
    for(const [key] of metricDefinitions)assert.deepEqual(shown[key],fixtures[index].analysis.metrics[key]);
  });
  assert.equal(metricText(columns[1].analysis.metrics.benchmark_return),'—');
  assert.equal(columns[1].analysis.metrics.benchmark_return.reason,'missing_benchmark');
});

test('list normalization keeps source identity, analysis errors and real zero separately',()=>{
  const r=record(cases[0],{summary:{benchmark_return:0,sharpe:0,excess_return:null},analysis_error:{code:'RESULT_ANALYSIS_UNAVAILABLE',message:'Analysis unavailable'}});
  assert.equal(r.sourceSha256,cases[0].analysis.source_sha256);assert.equal(r.hasResult,true);
  assert.equal(r.error,null);assert.equal(r.analysisError,'Analysis unavailable');
  assert.equal(optionalValue(r,'sharpe'),'0');assert.equal(optionalValue(r,'excess_return'),'—');
  assert.equal(metricText({value:r.summary.benchmark_return,unit:'percent'}),'0.00%');
  assert.equal(record(cases[0],{result:{snapshot_sha256:'bad'}}).sourceSha256,null);
});

test('a missing or failed result does not request analysis or borrow projected list metrics',async()=>{
  const calls=serve();
  for(const status of ['queued','failed']){
    const r=record(cases[0],{stored_status:status,display_status:status,result_available:false,summary:{net_return:1}});
    const [column]=await readComparison([r],'results');
    assert.equal(column.result,null);assert.equal(column.analysis,null);
    assert.equal(resultMetrics({},column.analysis).net_return.value,null);
  }
  assert.equal(calls.length,0);
});

test('source comparison reads only manifests even for records without results',async()=>{
  const calls=[];
  globalThis.fetch=async(url,options)=>{
    calls.push({url,options});const id=url.split('/').at(-2);
    return json({job_id:id,request:{source:'def initialize(context): pass'}});
  };
  const values=await readComparison([record(cases[0],{result_available:false}),record(cases[1])],'source');
  assert.equal(calls.length,2);assert.ok(calls.every(c=>c.url.endsWith('/manifest')&&c.options.method==='GET'));
  assert.equal(values[0].analysis,null);assert.match(values[0].result.request.source,/initialize/);
});

test('wrong task result is withheld without discarding another valid comparison column',async()=>{
  const fixtures=clone(cases);fixtures[0].result.job_id=cases[1].job.job_id;
  const calls=serve(fixtures),columns=await readComparison([record(),record(cases[1])],'results');
  assert.equal(columns[0].result,null);assert.match(columns[0].resultError,/不一致/);
  assert.ok(columns[1].analysis);assert.equal(calls.filter(c=>c.url.includes(cases[0].job.job_id)).length,1);
});

test('analysis identity, version and policy validation retain only original basic results on failure',async()=>{
  for(const mutate of [a=>a.source_sha256='f'.repeat(64),a=>a.job_id='another',a=>a.calculation_version='different',a=>a.calculation_version='returns-v1',a=>a.policy.evaluation_frequency='1m']){
    const fixtures=clone(cases);mutate(fixtures[0].analysis);serve(fixtures);
    const [column]=await readComparison([record()],'results');
    assert.equal(column.analysis,null);assert.match(column.analysisError,/身份或格式/);
    assert.equal(column.resultError,null);assert.equal(column.result.job_id,cases[0].job.job_id);
    assert.equal(resultMetrics(column.result.summary,null).net_return.value,cases[0].result.summary.net_return);
    assert.equal(resultMetrics(column.result.summary,null).benchmark_return.value,null);
  }
});

test('analysis service errors keep published zero values and do not mark the result unreadable',async()=>{
  globalThis.fetch=async url=>url.endsWith('/result')?json({...cases[0].result,summary:{net_return:0,max_drawdown:0}}):json({error:{code:'RESULT_ANALYSIS_UNAVAILABLE',message:'Analysis unavailable'}},409);
  const [column]=await readComparison([record()],'results');
  assert.equal(column.resultError,null);assert.equal(column.analysisError,'Analysis unavailable');
  const metrics=resultMetrics(column.result.summary,column.analysis);
  assert.equal(metricText(metrics.net_return),'0.00%');assert.equal(metricText(metrics.sharpe),'—');
});

test('missing frozen identity prevents an unbound analysis request; valid inline analysis avoids a duplicate request',async()=>{
  let calls=serve();let [column]=await readComparison([record(cases[0],{result:{}})],'results');
  assert.equal(calls.length,1);assert.equal(column.analysis,null);assert.match(column.analysisError,/冻结结果摘要/);
  const fixtures=clone(cases);fixtures[0].result.analysis=fixtures[0].analysis;calls=serve(fixtures);
  [column]=await readComparison([record()],'results');assert.ok(column.analysis);assert.equal(calls.length,1);
});

test('abort and source identity errors cannot become a completed comparison',async()=>{
  const controller=new AbortController();
  globalThis.fetch=async()=>{controller.abort();throw new DOMException('Aborted','AbortError');};
  await assert.rejects(readComparison([record()],'results',controller.signal),{name:'AbortError'});
  globalThis.fetch=async()=>json({job_id:'another',request:{source:'text'}});
  await assert.rejects(readComparison([record()],'source'),/不一致/);
});

test('experiment differences stay comparable; real calculation policy differences receive a precise note',async()=>{
  const fixtures=clone(cases);serve(fixtures);
  const columns=await readComparison([record(),record(cases[1],{frequency:'1d',initial_cash:200000,start_date:'2025-02-01'})],'results');
  assert.deepEqual(comparisonNotes(columns),[]); // Different benchmark selection is an experiment input.
  columns[1].analysis.policy.annualization=250;
  assert.deepEqual(comparisonNotes(columns),['年化因子不同，年化指标不可直接比较。']);
  columns[1].analysis.policy.risk_free_annual=0.02;
  assert.equal(comparisonNotes(columns).length,2);
  assert.ok(columns.every(c=>c.analysis));
});
