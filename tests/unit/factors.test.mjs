import test from 'node:test';
import assert from 'node:assert/strict';
import { compatible, containsRequest, emptyDraft, factorHref, sampleDraft, submission } from '../../src/features/factors/model.ts';
import { evaluation, percent } from '../../src/features/factors/evaluation.ts';
import { resolveRoute } from '../../src/app/routes.ts';
const factor = {id:'alpha191:alpha146',name:'Alpha146',definition:'gtja191.explicit.v1',library:'alpha191',parameters:[{name:'alpha146_m',label:'m',kind:'integer',minimum:1,maximum:60}]};
const source = {id:'cmes',ready:true,capabilities:['alpha191'],securities:['600000.XSHG'],first:'1990-01-01',last:'2024-08-30'};
const draft={...emptyDraft,...sampleDraft(source),parameters:{alpha146_m:'6'}};
test('factor routes and explicit numerical parameters',()=>{
 const value=submission(draft,factor,'a'.repeat(64),'same-key');
 assert.equal(value.parameters.alpha146_m,6);assert.equal(value.idempotency_key,'same-key');
 assert.equal(value.source_id,'cmes');assert.equal(value.evaluation,null);
 assert.equal(resolveRoute(factorHref(factor.id)+'/jobs/m2job-abc').feature,'factors');
});
test('bad dates, duplicate securities and missing seed never become requests',()=>{
 for(const patch of [{source:''},{history:'2025-01-01'},{parameters:{}},{parameters:{alpha146_m:'0'}},{parameters:{alpha146_m:'1.2'}},{securities:'600000.XSHG,600000.XSHG'}]) assert.throws(()=>submission({...draft,...patch},factor,'a'.repeat(64),'key'));
});
test('raw CMES is usable for Alpha and does not impersonate the JQ input contract',()=>{
 assert.equal(compatible(source,factor),true);
 assert.equal(compatible(source,{...factor,library:'joinquant',entrypoint:'ashare_data.factors.joinquant.compute_panel'}),false);
 assert.equal(compatible({...source,ready:false},factor),false);
 assert.ok(draft.history < draft.start);assert.equal(draft.end,'2024-08-30');
});

test('evaluation preserves explicit signal lag, label buffer, direction and costs',()=>{
 const value=submission({...draft,evaluate:true,quantiles:'2',minAssets:'2',direction:'-1',labelEnd:'2024-09-20'},factor,'a'.repeat(64),'eval');
 assert.deepEqual(value.evaluation,{horizons:[1,5,10],quantiles:2,lag:1,direction:-1,min_assets:2,cost_bps:[0,5,10,20],rolling_window:20});
 assert.equal(value.label_end,'2024-09-20');assert.equal(value.end_date,'2024-08-30');
 for(const patch of [{horizons:'1,1'},{labelEnd:'2024-08-29'},{lag:'0'},{costs:'Infinity'},{quantiles:'1'},{end:'2024-02-30'}]) assert.throws(()=>submission({...draft,evaluate:true,...patch},factor,'a'.repeat(64),'eval'));
});

test('restored results must match the whole request, including securities and label dates',()=>{
 const request=submission(draft,factor,'a'.repeat(64),'identity');
 assert.equal(containsRequest({...request,extra:'server default'},request),true);
 for(const change of [{securities:['000001.XSHE']},{end_date:'2024-08-29'},{label_end:'2024-09-01'},{parameters:{alpha146_m:5}},{environment_id:'b'.repeat(64)}]) assert.equal(containsRequest({...request,...change},request),false);
});

test('evaluation projection distinguishes null, zero and invalid data',()=>{
 const value={schema:'ad.factor-evaluation.v1',config:{horizons:[1],quantiles:2,lag:1,direction:1,min_assets:2,rolling_window:2,price_basis:'adjusted:fixture',universe_label:'fixed fixture'},engine:{library:'alphalens-reloaded',version:'0.5.0'},summary:[],ic:[{date:'2024-01-02',horizon:1,value:null}],rank_ic:[{date:'2024-01-02',horizon:1,value:0}],spread:[],quantile_returns:[],turnover:[],stability:[],cost_sensitivity:[],warnings:[],coverage:{input_cells:2,finite_factor_cells:2,quantized_cells:0,by_horizon:[{horizon:1,eligible:2,paired:0,excluded:{insufficient_label_buffer:2}}],rejected_quantile_dates:[]}};
 assert.equal(evaluation(value).ic[0].value,null);assert.equal(evaluation(value).rank_ic[0].value,0);
 assert.equal(percent(null),'—');assert.equal(percent(0),'0.00%');
 assert.throws(()=>evaluation({...value,schema:'unknown'}));
 assert.throws(()=>evaluation({...value,ic:[{date:'2024-01-02',horizon:1,value:Infinity}]}));
 assert.throws(()=>evaluation({...value,coverage:{}}));
});
