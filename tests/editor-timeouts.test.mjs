import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError } from '../src/shared/api.ts';
import { submitCurrent } from '../src/backtests/submission.ts';

const originalFetch = globalThis.fetch;
const originalTimer = globalThis.setTimeout;
const originalStorage = globalThis.localStorage;
afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalTimer;
  if (originalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalStorage;
});
test('opt-in deadlines bound an unresponsive read and never automatically retry it', async () => {
  let calls = 0;
  let signal;
  globalThis.fetch = (_url, options) => {
    calls++;
    signal = options.signal;
    return new Promise(() => {});
  };
  await assert.rejects(api('/python/catalogue', undefined, undefined, false, undefined, undefined, 10),
    error => error instanceof ApiError && error.code === 'REQUEST_TIMEOUT' && !error.uncertain);
  assert.equal(signal.aborted, true);
  assert.equal(calls, 1);
});
test('a stalled response body is bounded and a write timeout remains uncertain', async () => {
  let signal;
  globalThis.fetch = async (_url, options) => {
    signal = options.signal;
    return { status: 201, text: () => new Promise(() => {}) };
  };
  await assert.rejects(api('/python/jobs', { source: 'pass' }, undefined, false, undefined, undefined, 10),
    error => error instanceof ApiError && error.code === 'REQUEST_TIMEOUT' && error.uncertain);
  assert.equal(signal.aborted, true);
});
test('caller cancellation is distinct from timeout', async () => {
  const controller = new AbortController();
  globalThis.fetch = (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true });
  });
  const request = api('/python/files', undefined, controller.signal, false, undefined, undefined, 1000);
  controller.abort();
  await assert.rejects(request, error => error.name === 'AbortError' && !(error instanceof ApiError));
});
test('timed-out submission is sent once and a deliberate retry reuses its idempotency key', async () => {
  const records = new Map();
  globalThis.localStorage = {
    getItem: key => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value),
    removeItem: key => records.delete(key)
  };
  globalThis.setTimeout = (callback, ms, ...args) => originalTimer(callback, ms === 60000 ? 10 : ms, ...args);
  const sent = [];
  globalThis.fetch = (_url, options) => {
    sent.push(JSON.parse(options.body));
    return new Promise(() => {});
  };
  const draft = { id: 'timeout-draft', name: '超时验证', source: 'def initialize(context): pass', start: '2024-03-04', end: '2024-03-08', capital: '100000', frequency: '1d' };
  const catalogue = { environment_id: 'a'.repeat(64), external_securities_required: false, universe: 'strategy_subscription' };
  await assert.rejects(submitCurrent(draft, catalogue), error => error.uncertain && /不会自动重试/.test(error.message));
  assert.equal(sent.length, 1);
  await assert.rejects(submitCurrent(draft, catalogue));
  assert.equal(sent.length, 2);
  assert.equal(sent[0].idempotency_key, sent[1].idempotency_key);
});
