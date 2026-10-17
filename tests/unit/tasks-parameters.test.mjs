import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decimal, normalizeParameters, createRequest } from '../../src/features/tasks/parameters.ts';
const schema = JSON.parse(readFileSync(new URL('../../contracts/tasks.openapi.json', import.meta.url)));
const properties = schema.components.schemas.JobCatalogue.properties;
const limits = properties.parameter_limits.default, defaults = properties.parameters.default;
test('decimal inputs preserve cents and reject implicit conversion', () => {
  for (const [input, expected] of [['3000.00','3000'],['12.50','12.5'],['0.01','0.01']]) assert.equal(decimal(input), expected);
  for (const value of [' 3000','3000\n','3000.000','03000','-0','1e3','NaN','Infinity','.5','1.',3000,true,null]) assert.throws(() => decimal(value));
});
test('daily limits allow catalogue range, not only old example values', () => {
  for (const initial_cash of ['0.01','1000000','999999999999']) for (const target_shares of [100,200,300,5000]) {
    assert.equal(normalizeParameters({...defaults, initial_cash, target_shares}, limits).initial_cash, initial_cash);
  }
  for (const initial_cash of ['0','1000000000000']) assert.throws(() => normalizeParameters({...defaults,initial_cash},limits));
  for (const target_shares of [0,101,Number.MAX_SAFE_INTEGER+1,'100',null]) assert.throws(() => normalizeParameters({...defaults,target_shares},limits));
  for (const [enter_below,exit_above] of [['0','1'],['12.50','12.5'],['12.6','12.5']]) assert.throws(() => normalizeParameters({...defaults,enter_below,exit_above},limits));
});
test('registered strategies bind a version and preserve JSON parameter values', () => {
  const input = {...defaults,template:'registered_python.v1',strategy_version_id:'a'.repeat(64),strategy_parameters:{window:3,price:'12.50'}};
  const result = normalizeParameters(input,limits);
  assert.deepEqual(result.strategy_parameters,input.strategy_parameters);
  assert.equal(result.enter_below,undefined);
  input.strategy_parameters.window=9;assert.equal(result.strategy_parameters.window,3);
  assert.throws(() => normalizeParameters({...input,strategy_version_id:'latest'},limits));
  assert.throws(() => normalizeParameters({...input,strategy_parameters:[]},limits));
});
test('creation binds the current catalogue and rejects changed dates, missing consent or unavailable execution', () => {
  const catalogue={configured:true,native_ready:true,data_binding_sha256:'b'.repeat(64),parameter_limits:limits,windows:[{scope:{window_id:'w1',trading_dates:['2020-01-03','2020-01-06']},assumption_ack_sha256:'c'.repeat(64)}]};
  const input={window_id:'w1',end_date:'2020-01-03',name:'fixture task',acknowledged:true,parameters:defaults};
  const request=createRequest(catalogue,input,'fixture-key');
  assert.equal(request.data_binding_sha256,catalogue.data_binding_sha256);
  assert.equal(request.assumption_ack_sha256,catalogue.windows[0].assumption_ack_sha256);
  assert.equal(request.idempotency_key,'fixture-key');
  for(const patch of [{window_id:'other'},{end_date:'2020-01-04'},{acknowledged:false},{name:'bad\nname'}]) assert.throws(() => createRequest(catalogue,{...input,...patch},'fixture-key'));
  for(const patch of [{configured:false},{native_ready:false},{data_binding_sha256:null}]) assert.throws(() => createRequest({...catalogue,...patch},input,'fixture-key'));
});
