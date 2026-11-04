import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resultTarget } from '../src/results/routing.ts';
import { backtestQuery, readStrategyBacktests, resolveStrategy, unassignedIdentity } from '../src/backtests/history-api.ts';
import { resultHref, unassignedHistoryHref } from '../src/backtests/history-model.ts';

// Constructed protocol fixtures. These do not add or modify any service records.
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const id = 'm2job-' + '1'.repeat(32);
const history = {
  job_id: id, family: 'python', read_only: true, execution_state: 'runtime_unavailable',
  status: 'succeeded', request: { name: 'A legacy draft' }, result: null
};
const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });

test('a plain historical result URL selects only the verified frozen history route', () => {
  const target = resultTarget(history, id, null, false);
  assert.equal(target.path, '/history/jobs/' + id);
  assert.equal(target.history, true);
  assert.equal(target.job, history);
  for (const state of ['runtime_unavailable', 'retired_family'])
    assert.equal(resultTarget({ ...history, execution_state: state }, id, null, false).history, true);
});

test('current Python and factor runs keep live routes only after their identity has been checked', () => {
  for (const family of ['python', 'factors']) {
    const current = { ...history, family, execution_state: 'current_runtime' };
    assert.equal(resultTarget(current, id, family, false).path, '/' + family + '/jobs/' + id);
    assert.equal(resultTarget(current, id, family, true).path, '/history/jobs/' + id);
  }
});

test('missing metadata, wrong task/family and unsupported execution states never select a result route', () => {
  assert.equal(resultTarget(null, id, null, false).path, null);
  for (const change of [{ job_id: 'other' }, { family: 'unknown' }, { read_only: false },
    { execution_state: undefined }, { execution_state: 'unchecked' }, { request: [] }]) {
    const target = resultTarget({ ...history, ...change }, id, null, false);
    assert.equal(target.path, null);
    assert.equal(target.job, null);
    assert.ok(target.error);
  }
  assert.ok(resultTarget(history, id, 'factors', false).error);
});

test('unassigned history uses an explicit separate scope and never guesses a strategy by its name', async () => {
  assert.deepEqual(await resolveStrategy(new URLSearchParams()), unassignedIdentity());
  assert.deepEqual(await resolveStrategy(new URLSearchParams('unassigned=1')), unassignedIdentity());
  globalThis.fetch = async () => json(history);
  assert.deepEqual(await resolveStrategy(new URLSearchParams({ job: id })), unassignedIdentity());
  await assert.rejects(resolveStrategy(new URLSearchParams({ strategy: 'same-name.py', job: id })), /未记录策略归属/);
  await assert.rejects(resolveStrategy(new URLSearchParams('unassigned=1&strategy=a.py')), /不能同时/);
  await assert.rejects(resolveStrategy(new URLSearchParams('unassigned=0')), /不能同时/);
  await assert.rejects(resolveStrategy(new URLSearchParams('unassigned=1&unassigned=1')), /不明确/);
  assert.throws(() => backtestQuery(''));
  assert.equal(unassignedHistoryHref, 'backtests.html?unassigned=1');
  assert.match(resultHref({ id, executionState: 'read_only_history' }), /history=1/);
});

const item = {
  job_id: id, strategy_id: null, name: 'Same name', created_at: '2026-10-21T16:34:17Z',
  start_date: '2024-03-04', end_date: '2024-03-05', frequency: '1m', initial_cash: 100000,
  stored_status: 'succeeded', display_status: 'succeeded', execution_state: 'runtime_unavailable',
  result_available: true, result: null, summary: { net_return: -.0001 }
};
const listing = { strategy_id: null, analysis_version: 'returns-v2', identity_model: 'saved_relative_path',
  total: 1, offset: 0, limit: 100, unassigned_count: 1, items: [item] };

test('the unassigned list reads real endpoint semantics and rejects assigned or incomplete responses', async () => {
  const requests = [];
  globalThis.fetch = async (url, options) => { requests.push([url, options.method]); return json(listing); };
  const data = await readStrategyBacktests(unassignedIdentity());
  assert.equal(data.records[0].id, id);
  assert.deepEqual(requests, [['/api/v1/python/backtests?limit=100&offset=0&analysis_version=returns-v2', 'GET']]);
  for (const bad of [{ ...listing, strategy_id: 'a.py' },
    { ...listing, items: [{ ...item, strategy_id: 'a.py' }] },
    { ...listing, total: 2 }, { ...listing, items: [item, item], total: 2 }]) {
    globalThis.fetch = async () => json(bad);
    await assert.rejects(readStrategyBacktests(unassignedIdentity()));
  }
});

test('history identity and evidence errors are preserved without trying a different source', async () => {
  for (const code of ['HISTORY_IDENTITY_CONFLICT', 'HISTORY_EVIDENCE_CONFLICT', 'M2_JOB_IDENTITY_CONFLICT']) {
    const calls = [];
    globalThis.fetch = async url => {
      calls.push(url);
      return new Response(JSON.stringify({ error: { code, message: 'Frozen task identity differs' } }), {
        status: 409, headers: { 'Content-Type': 'application/json' }
      });
    };
    await assert.rejects(resolveStrategy(new URLSearchParams({ job: id })), e => e.code === code);
    assert.deepEqual(calls, ['/api/v1/history/jobs/' + id]);
  }
});
