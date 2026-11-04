import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { percentAxisFormatter, performanceOption } from '../src/results/chart.ts';

test('small positive and negative return ticks remain distinct and zero has no negative sign', () => {
  for (const sign of [-1, 1]) {
    const ticks = [0, .00005, .0001, .00015, .0002, .00025, .0003].map(v => v * sign);
    const format = percentAxisFormatter(ticks);
    const labels = ticks.map(format);
    assert.equal(new Set(labels).size, ticks.length);
    assert.equal(format(-0), '0.000%');
    assert(!/^\-0(?:\.0+)?%$/.test(format(-1e-18)));
  }
  assert.equal(percentAxisFormatter([0, .2])(.1), '10.0%');
  assert.equal(percentAxisFormatter([0, null])(0), '0.0%');
  const micro = [0, 1e-12, 2e-12, 3e-12];
  assert.equal(new Set(micro.map(percentAxisFormatter(micro))).size, micro.length);
});

test('linear and logarithmic axes preserve the backend return values while adding display precision', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/result-analysis.json', import.meta.url)))[1];
  const analysis = structuredClone(fixture.analysis);
  analysis.series = analysis.series.slice(0, 3);
  for (const [i, row] of analysis.series.entries()) {
    row.cumulative_return = -.0001 * (i + 1);
    row.nav = 1 + row.cumulative_return;
  }
  const before = structuredClone(analysis);
  const visible = { strategy: true, benchmark: false, excess: false };
  for (const log of [false, true]) {
    const option = performanceOption(analysis, [0, analysis.series.length], visible, log, 'none');
    const format = option.yAxis[0].axisLabel.formatter;
    const labels = [0, -.0001, -.0002].map(v => format(log ? Math.log1p(v) : v));
    assert.equal(new Set(labels).size, labels.length);
    assert(!labels.includes('-0.0%'));
  }
  assert.deepEqual(analysis, before);
});
