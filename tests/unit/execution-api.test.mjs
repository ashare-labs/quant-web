import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createProxy } from '../../scripts/proxy-config.mjs';
import { importSource } from '../helpers/import-source.mjs';

const client = await importSource('src/features/execution/api.ts');
const contract = JSON.parse(readFileSync('contracts/api.openapi.json', 'utf8'));
const proxy = createProxy({})['/execution-api/'];

test('run detail, cancel, event pagination and receipt use declared API operations', async t => {
  const calls = [];
  const id = 'regression:run';
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const backend = new URL(proxy.rewrite(url), 'http://localhost');
    const template = backend.pathname.replace(`/${encodeURIComponent(id)}/`, '/{run_id}/');
    assert.ok(contract.paths[template]?.[options.method.toLowerCase()], `${options.method} ${backend.pathname} is not in the contract`);
    calls.push({ path: backend.pathname, query: backend.search, method: options.method, body: options.body });
    return new Response(JSON.stringify({ operation: backend.pathname.split('/').at(-1) }));
  });
  const detail = await client.readRunDetail(id);
  assert.deepEqual(detail, { state: { operation: 'state' }, manifest: { operation: 'manifest' }, logs: { operation: 'logs' }, execution: { operation: 'execution' } });
  assert.deepEqual(await client.cancelRun(id), { operation: 'cancel' });
  await client.readRunEvents(id, 0); await client.readRunEvents(id, 25);
  assert.deepEqual(await client.readRunReceipt(id), { operation: 'receipt' });
  assert.deepEqual(calls.map(c => [c.path, c.query, c.method]), [
    ['state', '', 'GET'], ['manifest', '', 'GET'], ['logs', '?after=0', 'GET'], ['execution', '', 'GET'],
    ['cancel', '', 'POST'], ['events', '?after=0&limit=25', 'GET'], ['events', '?after=25&limit=25', 'GET'], ['receipt', '', 'GET'],
  ].map(([path, query, method]) => [`/api/v1/runs/${encodeURIComponent(id)}/${path}`, query, method]));
  assert.equal(calls.filter(c => c.method === 'POST').length, 1);
  assert.equal(calls.find(c => c.method === 'POST').body, '{}');
});

test('receipt-not-ready and failed detail requests remain failures, not empty success', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: { code: 'RECEIPT_NOT_READY', message: 'Still running' } }), { status: 409 }));
  await assert.rejects(client.readRunReceipt('one'), e => e instanceof client.ApiError && e.code === 'RECEIPT_NOT_READY');
  t.mock.method(globalThis, 'fetch', async url => new Response(JSON.stringify(url.endsWith('/manifest') ? { detail: 'Missing manifest' } : {}), { status: url.endsWith('/manifest') ? 404 : 200 }));
  await assert.rejects(client.readRunDetail('one'), e => e.code === 'HTTP_404');
});
