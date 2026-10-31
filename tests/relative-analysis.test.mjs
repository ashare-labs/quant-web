import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analysisPath, metricCsv, reasonText, resultMetrics, selectedAnalysis } from '../src/results/model.ts';
import { curves, logarithmAvailable, performanceOption, zoomRange } from '../src/results/chart.ts';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/result-analysis.json', import.meta.url)));
const a = fixtures[0].analysis;
const all = { strategy: true, benchmark: true, excess: true };
test('v2 requests and selected payloads keep benchmark identity and old versions separate', () => {
  const fixture = fixtures[0];
  const path = analysisPath('/history/jobs/' + a.job_id, fixture.result, null, 'python', '000300.XSHG');
  const q = new URLSearchParams(path.split('?')[1]);
  assert.equal(q.get('benchmark'), '000300.XSHG');
  assert.equal(q.get('analysis_version'), 'returns-v2');
  assert.ok(selectedAnalysis(a, a.job_id, a.source_sha256, 'frozen'));
  assert.equal(selectedAnalysis(a, a.job_id, a.source_sha256, '000300.XSHG'), null);
  assert.equal(selectedAnalysis(a, a.job_id, undefined, 'frozen'), null);
  const unavailable = resultMetrics({
    net_return: 0,
    max_drawdown: 0,
    excess_return: 99,
    benchmark_return: 88
  }, null);
  assert.equal(unavailable.net_return.value, 0);
  assert.equal(unavailable.excess_return.value, null);
  assert.equal(unavailable.benchmark_return.value, null);
  const old = structuredClone(a);
  old.calculation_version = 'returns-v1';
  assert.equal(selectedAnalysis(old, a.job_id, a.source_sha256), null);
  const wrong = structuredClone(a);
  wrong.policy.excess_return = 'return_difference';
  assert.equal(selectedAnalysis(wrong, a.job_id, a.source_sha256), null);
  const exported = metricCsv(fixture.result.summary, a);
  assert.equal(exported[3][1], a.metrics.excess_return.value);
  assert.equal(exported[3][6], 'returns-v2');
  assert.equal(exported[3][8], a.analysis_id);
});
test('three curves are projections of backend series and share the initial anchor and range', () => {
  const option = performanceOption(a, [5, 25], all, false, 'strategy');
  assert.equal(curves(a).length, 3);
  for (const [key, field] of [
    [
      'strategy',
      'cumulative_return'
    ],
    [
      'benchmark',
      'benchmark_cumulative_return'
    ],
    [
      'excess',
      'excess_return'
    ]
  ]) {
    const line = option.series.find(s => s.id === key);
    assert.deepEqual(line.data, [
      0,
      ...a.series.map(r => r[field])
    ]);
  }
  assert.ok(option.dataZoom.every(z => z.startValue === 5 && z.endValue === 25));
  const tooltip = option.tooltip.formatter([{ dataIndex: a.series.length }]);
  assert.ok(tooltip.includes((a.metrics.excess_return.value * 100).toFixed(2) + '%'));
});
test('legend visibility removes the selected curve and tooltip only, preserving daily panels', () => {
  const option = performanceOption(a, [0, a.series.length], {
    ...all,
    excess: false
  }, false, 'strategy');
  assert.equal(option.series.filter(s => s.id === 'excess').length, 0);
  assert.equal(option.series.filter(s => s.type === 'bar').length, 3);
  assert.ok(!option.tooltip.formatter([{ dataIndex: 1 }]).includes('超额收益'));
});
test('log coordinates use positive NAV, not logarithms of negative returns', () => {
  const copy = structuredClone(a);
  copy.series[0].nav = .9;
  copy.series[0].cumulative_return = -.1;
  assert.ok(logarithmAvailable(copy));
  const option = performanceOption(copy, [0, copy.series.length], all, true, 'none');
  assert.equal(option.yAxis[0].axisLabel.formatter(Math.log(.9)), '-10.0%');
  assert.equal(option.series.find(s => s.id === 'strategy').data[1], Math.log(.9));
  assert.deepEqual(option.series.find(s => s.id === 'excess').data, [
    0,
    ...copy.series.map(r => r.relative_nav === null
      ? null
      : Math.log(r.relative_nav))
  ]);
  copy.series[0].nav = 0;
  assert.equal(logarithmAvailable(copy), false);
  assert.equal(performanceOption(copy, [
    0,
    copy.series.length
  ], all, true, 'none').series.find(s => s.id === 'strategy').data[1], -.1);
});
test('log display gives equal distances to equal NAV ratios without whole-decade bounds', () => {
  const copy = structuredClone(a);
  [
    1,
    1.02,
    1.0404
  ].forEach((nav, i) => {
    copy.series[i].nav = nav;
    copy.series[i].cumulative_return = nav - 1;
  });
  const option = performanceOption(copy, [0, 3], all, true, 'none');
  const [start, next, last] = option.series.find(s => s.id === 'strategy').data.slice(1, 4);
  assert.ok(Math.abs((next - start) - (last - next)) < 1e-14);
  assert.ok(last < .05);
  assert.equal(option.yAxis[0].scale, true);
  assert.equal(option.yAxis[0].axisLabel.formatter(last), '4.0%');
  assert.ok(option.tooltip.formatter([{ dataIndex: 3 }]).includes('4.04%'));
});
test('drawdown highlights use backend peak and trough including an initial-capital peak', () => {
  const copy = structuredClone(a);
  copy.excess_drawdowns = [{
    peak_date: null,
    trough_date: copy.series[3].date
  }];
  const option = performanceOption(copy, [0, copy.series.length], all, false, 'excess');
  assert.deepEqual(option.series.find(s => s.id === 'excess').markArea.data[0].map(p => p.xAxis), [
    '期初',
    copy.series[3].date
  ]);
  assert.equal(option.series.find(s => s.id === 'strategy').markArea, undefined);
  assert.ok(performanceOption(copy, [
    0,
    copy.series.length
  ], all, false, 'none').series.every(s => !s.markArea));
});
test('unavailable benchmarks leave one real strategy curve and specific null reasons', () => {
  assert.equal(curves(fixtures[1].analysis).length, 1);
  for (const reason of [
    'benchmark_disabled',
    'BENCHMARK_BASE_MISSING',
    'BENCHMARK_DAILY_GAP',
    'BENCHMARK_SOURCE_INVALID'
  ]) assert.notEqual(reasonText(reason), '数据不足');
  assert.equal(fixtures[2].analysis.metrics.win_rate.value, null);
  assert.equal(fixtures[2].analysis.metrics.winning_trades.value, 0);
  assert.deepEqual(zoomRange({
    dataZoom: [{
      startValue: 3,
      endValue: 20
    }]
  }), [
    3,
    20
  ]);
  assert.equal(zoomRange({}), null);
});
