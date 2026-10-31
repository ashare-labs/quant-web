import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { submission, emptyDraft } from '../src/factors/model.ts';
import { pythonBacktestConfig, validateDraftConfig } from '../src/shared/drafts.ts';

const factor = {
  id: 'qlib_alpha158:MA5',
  name: 'MA5',
  definition: 'qlib.alpha158.v0.9.7',
  parameters: []
};
const securities = count => Array.from({ length: count }, (_, i) => `${String(600000 + i).padStart(6, '0')}.XSHG`);
const base = {
  ...emptyDraft,
  source: 'synthetic',
  securities: securities(2).join(','),
  history: '2013-01-02',
  start: '2013-01-02',
  end: '2024-01-02',
  labelEnd: '2024-02-01'
};
const request = draft => submission(draft, factor, 'a'.repeat(64), 'synthetic-key');

test('101, 300 and 5000 securities survive request serialization without truncation', () => {
  for (const count of [101, 300, 5000]) {
    const selected = securities(count);
    const draft = {
      ...base,
      securities: selected.join('，\n'),
      end: '2013-01-15',
      evaluate: true,
      minAssets: String(count)
    };
    const sent = JSON.parse(JSON.stringify(request(draft)));
    assert.deepEqual(sent.securities, selected);
    assert.equal(sent.evaluation.min_assets, count);
    assert.equal(sent.source_id, 'synthetic');
  }
});

test('long factor and Python intervals retain exact dates instead of clipping to ten years', () => {
  const sent = request({ ...base, evaluate: true });
  assert.deepEqual([
    sent.history_start,
    sent.start_date,
    sent.end_date,
    sent.label_end
  ], [
    '2013-01-02',
    '2013-01-02',
    '2024-01-02',
    '2024-02-01'
  ]);
  for (const frequency of ['1d', '1m']) {
    const config = { start: '1990-12-19', end: '2024-01-02', capital: '10,000,000,000', frequency };
    validateDraftConfig(config, new Date('2026-10-24T00:00:00Z'));
    assert.deepEqual(pythonBacktestConfig(config, new Date('2026-10-24T00:00:00Z')), {
      start_date: config.start,
      end_date: config.end,
      initial_cash: 10_000_000_000,
      frequency
    });
  }
});

test('empty, duplicate and malformed securities remain invalid at any pool size', () => {
  const large = securities(300);
  for (const selected of [
    '',
    ', ，\n',
    large.concat(large[0]).join(','),
    large.concat('bad.XSHG').join(','),
    '600000',
    '600000.XNAS',
    '../600000.XSHG'
  ]) {
    assert.throws(() => request({ ...base, securities: selected }), /证券/);
  }
  assert.deepEqual(request({
    ...base,
    securities: '600000.XSHG 000001.XSHE BJ.830001'
  }).securities, [
    '600000.XSHG',
    '000001.XSHE',
    'BJ.830001'
  ]);
  assert.throws(() => request({ ...base, source: '' }), /数据来源/);
});

test('min_assets has no upper bound while retaining finite integers of at least two', () => {
  for (const minAssets of [
    '2',
    '101',
    '300',
    '5000',
    '100000'
  ]) assert.equal(request({
    ...base,
    evaluate: true,
    minAssets
  }).evaluation.min_assets, Number(minAssets));
  for (const minAssets of [
    '',
    ' ',
    '0',
    '-1',
    '1',
    '2.5',
    'NaN',
    'Infinity',
    '1e309',
    'true'
  ]) assert.throws(() => request({
    ...base,
    evaluate: true,
    minAssets
  }), /至少 2 的整数/);
});

test('calendar validity and history, signal and label ordering still reject malformed intervals', () => {
  for (const change of [
    { history: '2014-01-01' }, { start: '2025-01-01' }, { end: '2012-01-01' },
    { history: '0000-01-01' }, { start: '2024-02-30' }, { end: 'not-a-date' },
    { evaluate: true, labelEnd: '2024-01-01' }, { evaluate: true, labelEnd: '2024-02-30' },
  ]) assert.throws(() => request({ ...base, ...change }), /日期/);
  assert.equal(request({
    ...base,
    start: '2024-02-29',
    end: '2024-02-29',
    labelEnd: '2024-02-29',
    evaluate: true
  }).end_date, '2024-02-29');
});

test('generated API contract removes retired gates and keeps per-task resource identities', () => {
  const { components: { schemas } } = JSON.parse(readFileSync(new URL('../contracts/api.openapi.json', import.meta.url)));
  assert.equal(schemas.PythonCreate.properties.initial_cash.maximum, 10_000_000_000);
  assert.equal(schemas.PythonCreate.properties.initial_cash.exclusiveMinimum, 0);
  assert.equal(schemas.FactorCreate.properties.securities.minItems, 1);
  assert.equal('maxItems' in schemas.FactorCreate.properties.securities, false);
  assert.equal(schemas.EvaluationOptions.properties.min_assets.minimum, 2);
  assert.equal('maximum' in schemas.EvaluationOptions.properties.min_assets, false);
  for (const key of [
    'module_load_seconds',
    'callback_seconds'
  ]) assert.equal(key in schemas.ServicePolicy.properties, false);
  assert.ok(schemas.ServiceStatus.required.includes('initial_policy_sha256'));
  assert.equal(schemas.ServiceStatus.properties.execution_policy_scope.const, 'frozen_per_task');
  assert.equal(schemas.ServicePolicy.properties.artifact_bytes.default, 536870912);
  assert.equal(schemas.ServicePolicy.properties.retained_artifact_bytes.default, 512000000000);
});
