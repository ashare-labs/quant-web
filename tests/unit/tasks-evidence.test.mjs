import test from 'node:test';
import assert from 'node:assert/strict';
import { paperRevision, requireSamePaperRevision, validatePaperDay, curveGeometry, pendingMatches, validateTaskEvidence } from '../../src/features/tasks/evidence.ts';

const view = { session_id: 'one', identity: 'same', head: 'head', config: { data_mode: 'historical_research', cash_dividend_policy: 'gross_zero_withholding_0900' }, days: [{ day: '2022-03-01', status: 'committed', checkpoint_sha: 'check', intent_id: 'intent' }], selected_day: '2022-03-01', decision: {}, report: {} };
const report = { session_id: 'one', schema: 'paper-report.v1', day: '2022-03-01', data_mode: 'historical_research', checkpoint_sha256: 'check', intent_id: 'intent', native: { reconciliation: { status: 'passed' }, opening_reconciliation: { status: 'passed' } } };

test('multi-day evidence rejects changed heads, day receipts, configuration and pause state', () => {
  for (const patch of [{ head: 'other' }, { days: [] }, { paused: true }, { config: { ...view.config, data_mode: 'synthetic_fixture' } }]) {
    assert.throws(() => requireSamePaperRevision(view, { ...view, ...patch }), /TASKS_SNAPSHOT_CHANGED/);
  }
  assert.equal(paperRevision(view), paperRevision({ ...view, selected_day: '2022-03-02', report: { day: '2022-03-02' }, decision: { other: true } }));
});

test('a report cannot be substituted across session, day, intent, checkpoint or reconciliation', () => {
  validatePaperDay(view, report, '2022-03-01');
  for (const patch of [{ session_id: 'two' }, { day: '2022-03-02' }, { intent_id: 'other' }, { checkpoint_sha256: 'other' }, { data_mode: 'synthetic_fixture' }, { native: { reconciliation: { status: 'passed' } } }]) {
    assert.throws(() => validatePaperDay(view, { ...report, ...patch }, '2022-03-01'), /TASKS_REPORT_CONFLICT/);
  }
  assert.throws(() => validatePaperDay({ ...view, days: [{ ...view.days[0], status: 'running' }] }, report, '2022-03-01'), /TASKS_REPORT_CONFLICT/);
});

test('curve geometry never fills unknown money or mutates exact source decimal text', () => {
  for (const value of [null, '', 'NaN', 'Infinity', '1e3', 0]) assert.equal(curveGeometry([{ equity: value }]), null);
  assert.equal(curveGeometry([]), null);
  const points = [{ equity: '10000.123456789012345' }, { equity: '9990.00100' }];
  const before = JSON.stringify(points), geometry = curveGeometry(points);
  assert.equal(JSON.stringify(points), before);
  assert.equal(geometry.highIndex, 0); assert.equal(geometry.lowIndex, 1);
  assert.ok(geometry.coordinates.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
  assert.equal(curveGeometry([{ equity: '0' }]).coordinates[0].y, 101);
});

test('uncertain actions only retry the original source, object and pinned service', () => {
  const pending = { source: 'paper', id: 'one', pin: 'pinned', action: 'pause', body: { expected_parent: 'head' } };
  assert.equal(pendingMatches(pending, 'paper', 'one', 'pinned'), true);
  assert.equal(pendingMatches(pending, 'jobs', 'one', 'pinned'), false);
  assert.equal(pendingMatches(pending, 'paper', 'two', 'pinned'), false);
  assert.equal(pendingMatches(pending, 'paper', 'one', 'new-version'), false);
  assert.equal(pendingMatches({ ...pending, body: null }, 'paper', 'one', 'pinned'), false);
});

// Minimal boundary fixtures; these are not execution results or market data.
test('v6 evidence cannot mix task, request, strategy, data binding, execution dates or logs', () => {
  const request = { data_binding_sha256: 'binding', end_date: '2020-01-06' };
  const data = { data_binding_sha256: 'binding', dataset_id: 'dataset' };
  const job = { contract_version: 'm2-jobs.v6', job_id: 'one', request, session_sha256: 'session', manifest_sha256: 'manifest' };
  const manifest = { schema_version: 'm2-job-manifest.v6', job_id: 'one', request, session_sha256: 'session', data_binding_sha256: 'binding', approved_window: { data_identity: data }, strategy: { version_id: 'strategy' }, execution_scope: { end_date: '2020-01-06' } };
  const logs = { job_id: 'one', items: [] };
  const result = { contract_version: 'm2-job-result.v6', job_id: 'one', manifest_sha256: 'manifest', request, execution_identity: { session_sha256: 'session' }, strategy: manifest.strategy, execution_scope: manifest.execution_scope, data_identity: data };
  validateTaskEvidence('one', job, manifest, logs);
  validateTaskEvidence('one', job, manifest, logs, result);
  for (const patch of [{ job_id: 'two' }, { contract_version: 'm2-jobs.v1' }, { session_sha256: 'new' }, { request: { ...request, end_date: '2020-01-16' } }]) {
    assert.throws(() => validateTaskEvidence('one', { ...job, ...patch }, manifest, logs, result), /TASKS_JOB_CONFLICT/);
  }
  assert.throws(() => validateTaskEvidence('one', job, manifest, { ...logs, job_id: 'two' }), /TASKS_JOB_CONFLICT/);
  assert.throws(() => validateTaskEvidence('one', job, { ...manifest, data_binding_sha256: 'new' }, logs), /TASKS_JOB_CONFLICT/);
  for (const patch of [{ contract_version: 'm2-job-result.v1' }, { manifest_sha256: 'new' }, { strategy: { version_id: 'new' } }, { execution_scope: { end_date: '2020-01-16' } }, { data_identity: { ...data, dataset_id: 'new' } }, { execution_identity: { session_sha256: 'new' } }]) {
    assert.throws(() => validateTaskEvidence('one', job, manifest, logs, { ...result, ...patch }), /TASKS_RESULT_CONFLICT/);
  }
  const pending = { source: 'tasks', id: 'one', pin: 'v6-pin', action: 'resume', body: {} };
  assert.equal(pendingMatches(pending, 'jobs', 'one', 'v6-pin'), false);
  assert.equal(pendingMatches(pending, 'tasks', 'one', 'v1-pin'), false);
});
