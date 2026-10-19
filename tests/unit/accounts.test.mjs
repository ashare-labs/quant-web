import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { importSource } from '../helpers/import-source.mjs';
const { readAccounts, readAccount, contract } = await importSource('src/features/accounts/api.ts');
const { AccountDetails } = await importSource('src/features/accounts/AccountDetails.tsx');
const summary = { account_id: 'test-account', label: '模拟测试', identity: 'a'.repeat(64), last_day: '2026-01-01', status: 'settled', runtime_compatible: true };
const detail = { ...summary, contract_version: contract, head: 'b'.repeat(64), review_sha256: 'c'.repeat(64), read_only: true, next_day_authorized: false,
  account: { total_cash: '1234.567', nav: '2468.567', frozen_cash: '0', positions: { '600000.XSHG': { quantity: 100, sellable: 0, price: '12.34', market_value: '1234' } } },
  fees: '5.0', cursor: 4, settlement_count: 1, limitations: ['合成界面测试'], orders: [{ id: 1, security: '600000.XSHG', quantity: 100, filled: 100, remaining: 0, status: 'FILLED' }],
  trades: [{ id: 2, order_id: 1, security: '600000.XSHG', side: 'BUY', quantity: 100, price: '12.34', cost: '5.0' }] };

test('registered account requests only read pinned list and selected identity', async t => {
  const calls=[];
  t.mock.method(globalThis,'fetch',async (url,options) => { calls.push([url,options.method,options.body]);return new Response(JSON.stringify(url.endsWith('/test-account')?detail:{contract_version:contract,accounts:[summary]})); });
  const [selected]=await readAccounts();assert.deepEqual(await readAccount(selected),detail);
  assert.deepEqual(calls,[['/execution-api/online-accounts','GET',undefined],['/execution-api/online-accounts/test-account','GET',undefined]]);
});
test('account list rejects wrong contract and duplicate registrations', async t => {
  for(const value of [{contract_version:'other',accounts:[summary]},{contract_version:contract,accounts:[summary,summary]}]) {
    t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify(value)));
    await assert.rejects(readAccounts(),/账户响应/);
  }
});
test('account detail rejects wrong identity, unverified runtime and execution permissions', async t => {
  for(const patch of [{identity:'d'.repeat(64)},{runtime_compatible:false},{read_only:false},{next_day_authorized:true},{account:{...detail.account,nav:'not money'}}]) {
    t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({...detail,...patch})));
    await assert.rejects(readAccount(summary),/账户响应/);
  }
});
test('account errors keep the server refusal without a sample fallback', async t => {
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({error:{code:'ACCOUNT_CONTENT_CHANGED',message:'登记摘要不一致'}}),{status:409}));
  await assert.rejects(readAccount(summary),error=>error.code==='ACCOUNT_CONTENT_CHANGED');
});
test('account projection shows financials, actual holdings, orders and trades without controls',()=>{
  const html=renderToStaticMarkup(createElement(AccountDetails,{view:detail}));
  for(const text of ['1,234.567','2,468.567','收盘持仓','模拟成交','委托记录','当日可卖','600000.XSHG','全部成交','买入']) assert.ok(html.includes(text),text);
  assert.ok(!html.includes('<button')&&!html.includes('<form'));
  const precise=renderToStaticMarkup(createElement(AccountDetails,{view:{...detail,trades:[{...detail.trades[0],cost:'6.4625'}]}}));
  assert.ok(precise.includes('6.4625')&&!precise.includes('6.463'));
});
