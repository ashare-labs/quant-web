import test from 'node:test';
import assert from 'node:assert/strict';
import { importSource } from '../helpers/import-source.mjs';

const api = await importSource('src/features/product/api.ts');
const configClient = await importSource('src/shared/product-config.ts');
const { draftFromRelease, validSelection } = await importSource('src/features/product/selection.ts');
const { freshDraft, restoreDraft, draftEnvironmentError, draftPublication } = await importSource('src/features/portfolio/draft.ts');
const { requestIdentity } = await importSource('src/features/portfolio/api.ts');
const config = { profile: 'product', kind: 'product', configured: true, configuration_id: 'a'.repeat(64), default_dataset_id: null,
  assets: [{ role: 'market', kind: 'local_daily', path: 'market', read_only: true }], capabilities: { catalogue: true, prices: true, publish: true }, limitations: ['price_only_no_limits'] };
const selection = { securities: ['600036.XSHG', '000002.XSHE', '600519.XSHG'], start: '2024-01-06', end: '2024-01-10', source: 'auto' };
const dataset = { dataset_id: 'released', securities: selection.securities, trading_dates: ['2023-12-29', '2024-01-08', '2024-01-09', '2024-01-10', '2024-01-11'] };

test('product requests preserve non-example multi-security windows and real-source receipts', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push([url, options.method, options.body]);
    let value = config;
    if (url.includes('/catalogue?')) value = { securities: selection.securities.map(security => ({ security, name: '', sources: [] })), total: 3 };
    if (url.endsWith('/prices')) value = { rows: [{ security: '600036.XSHG', date: '2024-01-08', close: '25.1200', volume: '8300', source: 'existing-source' }], gaps: [], receipt: { rows_sha256: 'verified-by-ad' }, coverage: [] };
    if (url.endsWith('/releases')) value = { release: { dataset_id: 'store-release' }, dataset };
    return new Response(JSON.stringify(value));
  });
  await api.readCatalogue(config, '600036 招商', 50);
  const prices = await api.readPrices(config, selection);
  assert.equal(prices.rows[0].close, '25.1200');
  assert.equal(prices.rows[0].source, 'existing-source');
  assert.equal((await api.publishSelection(config, selection)).dataset.dataset_id, 'released');
  await api.readPrices(config, { ...selection, start: '2024-02-01', end: '2024-02-28' });
  assert.ok(calls.some(([url]) => url.includes('query=600036+%E6%8B%9B%E5%95%86&limit=50&offset=50')));
  assert.deepEqual(calls.filter(([, method]) => method === 'POST').map(([, , body]) => JSON.parse(body)), [selection, selection, { ...selection, start: '2024-02-01', end: '2024-02-28' }]);
});

test('unconfigured product and state-environment switches fail without querying or publishing', async t => {
  let posts = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (options.method === 'POST') posts++;
    return new Response(JSON.stringify({ ...config, configuration_id: 'b'.repeat(64) }));
  });
  await assert.rejects(api.publishSelection(config, selection), /PRODUCT_ENVIRONMENT_CHANGED|运行环境或状态库/);
  assert.equal(posts, 0);
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ ...config, configured: false, error: { code: 'PRODUCT_NOT_CONFIGURED', message: '没有正式主库' } })));
  await assert.rejects(api.readPrices(config, selection), /没有正式主库/);
  assert.equal(posts, 0);
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ ...config, configured: false, kind: null, configuration_id: null, error: { code: 'DEPLOYMENT_REQUIRED', message: '请配置部署清单' } })));
  const unavailable = await configClient.readProductConfig();
  assert.equal(unavailable.error.code, 'DEPLOYMENT_REQUIRED');
  assert.throws(() => configClient.requireProduct(unavailable), /请配置部署清单/);
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ ...config, configuration_id: undefined })));
  await assert.rejects(configClient.readProductConfig(), /配置响应无效/);
});

test('missing data and publish refusals keep the backend gap and never produce a sample release', async t => {
  const gap = { code: 'MISSING_WARMUP', security: '600519.XSHG', detail: 'Need 120 sessions' };
  t.mock.method(globalThis, 'fetch', async url => url.endsWith('/config') ? new Response(JSON.stringify(config)) :
    new Response(JSON.stringify({ error: { code: 'PRODUCT_DATA_GAP', message: '缺少预热', details: [gap], origin: 'ashare-data' } }), { status: 422 }));
  await assert.rejects(api.publishSelection(config, selection), error => error.code === 'PRODUCT_DATA_GAP' && error.origin === 'ashare-data' && assert.deepEqual(error.details, [gap]) === undefined);
});

test('release transfer needs explicit diagnostic consent and selects only actual requested trading days', () => {
  const manifest = { selected_sources: { '600036.XSHG': 'source-a' }, source_selection_scope: { start: selection.start, end: selection.end }, receipt: { receipt_sha256: 'f'.repeat(64) } };
  const release = { release: { dataset_id: 'store', manifest }, dataset };
  assert.equal(validSelection(selection), true);
  assert.throws(() => draftFromRelease(config, release, selection, false), /确认价格诊断/);
  const previous = { ...freshDraft(), name: '保留策略', code: '{"algorithm":"momentum"}', cash: '10000.001', ack: 'old', retrospective: true };
  const next = draftFromRelease(config, release, selection, true, previous);
  assert.equal(next.environment, config.configuration_id);
  assert.equal(next.dataset, 'released');
  assert.deepEqual(next.securities, [...selection.securities].sort());
  assert.equal(next.start, '2024-01-08'); assert.equal(next.end, '2024-01-10');
  assert.equal(next.mode, 'price_only_no_limits'); assert.equal(next.ack, ''); assert.equal(next.retrospective, false);
  assert.equal(next.code, previous.code); assert.equal(next.cash, previous.cash);
  assert.deepEqual(draftPublication(next), manifest);
  assert.equal(draftPublication({ ...next, dataset: 'different' }), null);
  assert.throws(() => draftFromRelease(config, release, { ...selection, start: '1990-01-01', end: '1990-01-10' }, true), /没有可用交易日/);
});

test('old or mismatched drafts stay explicit, without automatic dataset fallback', () => {
  const old = { ...freshDraft(), dataset: 'legacy', environment: '' };
  assert.match(draftEnvironmentError(restoreDraft(JSON.stringify(old)), config, true), /未记录运行环境/);
  assert.match(draftEnvironmentError({ ...old, environment: 'other' }, config, true), /另一运行环境/);
  assert.match(draftEnvironmentError({ ...old, environment: config.configuration_id }, config, false), /不在当前状态库/);
  assert.equal(draftEnvironmentError(freshDraft(), config, false), '');
  const index = { catalogue: { service_identity: { source_sha256: 's'.repeat(64) } }, configuration: config };
  assert.notEqual(requestIdentity(index), requestIdentity({ ...index, configuration: { ...config, configuration_id: 'b'.repeat(64) } }));
});
