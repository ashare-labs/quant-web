import test from "node:test";
import assert from "node:assert/strict";
import { selectionOf, validatePreflight, validatePortfolioEvidence } from "../../src/features/portfolio/evidence.mjs";
import { validPortfolioCash, validVolumeRatio } from "../../src/features/portfolio/state.mjs";

import { evidence } from '../fixtures/portfolio.mjs';
const validate = e => validatePortfolioEvidence(e.id,e.job,e.manifest,e.logs,e.result);
test("portfolio response coherence rejects cross-task/version/scope/account/result substitutions",()=>{
  validate(evidence());
  for (const mutate of [
    e=>e.job.contract_version="m2-jobs.v6", e=>e.manifest.job_id="other",
    e=>e.logs.job_id="other", e=>e.job.session_sha256="other",
    e=>e.job.account_id="other", e=>e.manifest.strategy={version_id:"other"},
    e=>e.manifest.data_identity={dataset_id:"other"}, e=>e.result.request={...e.result.request,initial_cash:"2"},
    e=>e.result.scope={...e.result.scope,securities:["000001.XSHE"]},
    e=>e.result.receipt.identity="other", e=>e.result.audit.passed=false,
    e=>e.result.recovery.final_cursor=2, e=>e.result.days=[],
    e=>e.result.days[0].equity="2000", e=>e.result.decisions=[{date:"2020-02-04"}],
    e=>e.result.trades=[{security:"601318.XSHG"}], e=>e.result.account={cash:"0",equity:"1000",positions:{}},
    e=>e.result.economic_scope="full_tradable_return", e=>e.result.summary.metric_scope="total_return",
  ]) { const e=structuredClone(evidence());mutate(e);assert.throws(()=>validate(e)); }
});
test("diagnostic mode cannot inherit covered preflight or conceal the non-total-return scope",()=>{
  const e=evidence("price_only_no_limits");validate(e);
  const other=structuredClone(e);other.manifest.preflight.economic_scope="source_covered_conditional_research";
  assert.throws(()=>validate(other));
  assert.throws(()=>validatePreflight({...e.job.request,end_date:"2020-02-04"},e.manifest.preflight));
  assert.throws(()=>validatePreflight({...e.job.request,securities:["000001.XSHE"]},e.manifest.preflight));
  assert.deepEqual(selectionOf({...e.job.request,securities:[...e.job.request.securities].reverse()}),e.manifest.preflight.selection);
});
test("unpublished jobs remain distinct from completed zero-trade cash results",()=>{
  const e=evidence();validate(e);e.result=null;assert.throws(()=>validate(e));
  e.job.status="failed";e.job.result=null;validate(e);
});
test("corporate positions must match native receipts exactly; API-only zero defaults remain a conflict",()=>{
  const e=evidence();
  const position={quantity:0,sellable:0,price:"8",value:"0",average_price:"7",dividend_receivable:"260",restricted_shares:0,pending_shares:400,pending_share_value:"3200"};
  for(const account of [e.result.account,e.result.receipt.final_account,e.result.days[0],e.result.receipt.accounts[0]])
    account.positions={"000001.XSHE":structuredClone(position)};
  validate(e);
  for(const key of ["restricted_shares","pending_shares","pending_share_value"]) {
    const changed=structuredClone(e);delete changed.result.receipt.final_account.positions["000001.XSHE"][key];
    assert.throws(()=>validate(changed),/PORTFOLIO_RESULT_CONFLICT/);
  }
  const legacy=structuredClone(e);
  for(const account of [legacy.result.account,legacy.result.receipt.final_account,legacy.result.days[0],legacy.result.receipt.accounts[0]])
    for(const key of ["restricted_shares","pending_shares","pending_share_value"]) delete account.positions["000001.XSHE"][key];
  validate(legacy);
  Object.assign(legacy.result.account.positions["000001.XSHE"],{restricted_shares:0,pending_shares:0,pending_share_value:"0"});
  assert.throws(()=>validate(legacy),/PORTFOLIO_RESULT_CONFLICT/);
});
test("portfolio amount and participation validation preserve supported exact text",()=>{
  for(const value of ["0.00000001","1000000.00","999999999999999999999999999999.12345678"]) assert.equal(validPortfolioCash(value),true);
  for(const value of ["0","01","1e6","-1","1.000000001","9".repeat(41)]) assert.equal(validPortfolioCash(value),false);
  for(const value of ["","0.0001","1","1.00"]) assert.equal(validVolumeRatio(value),true);
  for(const value of ["0","0.00","1.01",".5","1e-2","-0.1"]) assert.equal(validVolumeRatio(value),false);
});
