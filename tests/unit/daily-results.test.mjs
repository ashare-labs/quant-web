import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { importSource } from '../helpers/import-source.mjs';
import { dailyResult } from '../fixtures/daily-tasks.mjs';

const components = await importSource('src/features/tasks/DailyTaskResults.tsx');
const render = (name, result) => renderToStaticMarkup(createElement(components[name], { result }));

test('a completed no-signal result shows its decision and no-order reason without JSON', () => {
  const result = dailyResult();
  const html = render('DailyDecisions', result);
  for (const text of ['no_change / inside_band', 'signal_no_change', '2020-01-03', '12.34001230', 'not_read_no_order', '未提供 / 未提供']) assert.ok(html.includes(text), text);
  assert.ok(!html.includes('<details'));
  assert.match(render('DailySummary', result), /无成交也可正常完成/);
  assert.match(html, /没有原生拒单记录/);
});

test('a native rejection without an order remains visible in overview and fills diagnostics', () => {
  const result = dailyResult('rejected');
  for (const component of ['DailyDecisions', 'DailyDiagnostics']) {
    const html = render(component, result);
    for (const text of ['native_rejected', 'SYNTHETIC_INSUFFICIENT_CASH: requested 100 shares', 'ORDER_CREATION_REJECT / SUBMIT_MATCH', '1 / 2 / 7']) assert.ok(html.includes(text), text);
    assert.ok(!html.includes('<details'));
  }
  assert.match(render('DailyOrders', result), /没有订单记录/);
});

test('partial fills preserve requested, filled and remaining shares, original status and decimal text', () => {
  const result = dailyResult('partial'), before = structuredClone(result);
  const orders = render('DailyOrders', result);
  for (const text of ['200 / 100 / 100', 'partially_filled', 'SYNTHETIC_REMAINING_ORDER', 'fill-1']) assert.ok(orders.includes(text), text);
  const decisions = render('DailyDecisions', result);
  assert.ok(decisions.includes('200 / 0')); assert.ok(decisions.includes('12.34001230'));
  assert.ok(decisions.includes('5.00000000 / 5.00000000'));
  const summary = render('DailySummary', result);
  for (const text of ['-5.00000000', '5.00000000 / 0.00000000']) assert.ok(summary.includes(text), text);
  assert.deepEqual(result, before);
});

test('historical price read evidence preserves the observed operation and authorization boundary', () => {
  const html = render('DailyEvidence', dailyResult());
  for (const text of ['valuation_bar', 'committed_historical_integrity_only', 'false', '恢复与发布证据', '最终原生账户']) assert.ok(html.includes(text), text);
});
