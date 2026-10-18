import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { importSource } from '../helpers/import-source.mjs';

const api = await importSource('src/features/product/api.ts');
const configClient = await importSource('src/shared/product-config.ts');
const { draftFromRelease, validSelection, selectedReference, validateCoverage, publicationReady } = await importSource('src/features/product/selection.ts');
const { freshDraft, restoreDraft, draftEnvironmentError, draftPublication } = await importSource('src/features/portfolio/draft.ts');
const { requestIdentity } = await importSource('src/features/portfolio/api.ts');
const { declaredMode, datasetModeError } = await importSource('src/features/portfolio/dataset-mode.ts');
const { ProductCoverage } = await importSource('src/features/product/ProductCoverage.tsx');
const reference = { name: 'reference-a', kind: 'historical_market', source_bindings: { market: { kind: 'historical_market', binding_sha256: 'b'.repeat(64) }, corporate: { kind: 'corporate_history', binding_sha256: 'c'.repeat(64) } } };
const config = { profile: 'product', kind: 'product', configured: true, configuration_id: 'a'.repeat(64), default_dataset_id: null, default_reference_set: reference.name, reference_sets: [reference],
  assets: [{ role: 'market', kind: 'local_daily', path: 'market', read_only: true }], capabilities: { catalogue: true, prices: true, publish: true }, limitations: ['source-scoped research'] };
const selection = { securities: ['600036.XSHG', '000002.XSHE', '600519.XSHG'], start: '2024-01-06', end: '2024-01-10', source: 'auto' };
const dataset = { dataset_id: 'released', mode: 'covered_research', diagnostic_allowed: false, securities: selection.securities, trading_dates: ['2023-12-29', '2024-01-08', '2024-01-09', '2024-01-10', '2024-01-11'] };

const coverageSelection = { ...selection, reference_set: reference.name };
const ordinary = { ...coverageSelection, mode: 'covered_research' };
const diagnostic = { ...selection, reference_set: null, mode: 'price_only_no_limits' };
const coverage = { schema: 'ad-local-daily-coverage.v1', scope: selection, ready: true, gaps: [], assumptions: [{ text: 'gross_cash_no_tax' }], limitations: ['Source-scoped, no historical PIT certification.'], reference_set: { name: reference.name, kind: reference.kind }, source_bindings: reference.source_bindings, coverage_sha256: 'd'.repeat(64) };
const released = { dataset, release: { dataset_id: 'store-release', mode: 'covered_research', reference_set: coverage.reference_set, source_bindings: reference.source_bindings, coverage_sha256: coverage.coverage_sha256, corporate_schedule_path: 'corporate-schedule.json', manifest: { selected_sources: { '600036.XSHG': 'source-a' } } } };

test('product requests preserve non-example multi-security windows and real-source receipts', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push([url, options.method, options.body]);
    let value = config;
    if (url.includes('/catalogue?')) value = { securities: selection.securities.map(security => ({ security, name: '', sources: [] })), total: 3 };
    if (url.endsWith('/prices')) value = { rows: [{ security: '600036.XSHG', date: '2024-01-08', close: '25.1200', volume: '8300', source: 'existing-source' }], gaps: [], receipt: { rows_sha256: 'verified-by-ad' }, coverage: [] };
    if (url.endsWith('/coverage')) value = coverage;
    if (url.endsWith('/releases')) value = released;
    return new Response(JSON.stringify(value));
  });
  await api.readCatalogue(config, '600036 招商', 50);
  const prices = await api.readPrices(config, selection);
  assert.equal(prices.rows[0].close, '25.1200');
  assert.equal(prices.rows[0].source, 'existing-source');
  assert.equal((await api.readCoverage(config, coverageSelection)).ready, true);
  assert.equal((await api.publishSelection(config, ordinary)).dataset.mode, 'covered_research');
  await api.readPrices(config, { ...selection, start: '2024-02-01', end: '2024-02-28' });
  assert.ok(calls.some(([url]) => url.includes('query=600036+%E6%8B%9B%E5%95%86&limit=50&offset=50')));
  assert.deepEqual(calls.filter(([, method]) => method === 'POST').map(([, , body]) => JSON.parse(body)), [selection, coverageSelection, ordinary, { ...selection, start: '2024-02-01', end: '2024-02-28' }]);
});

test('unconfigured product and state-environment switches fail without querying or publishing', async t => {
  let posts = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (options.method === 'POST') posts++;
    return new Response(JSON.stringify({ ...config, configuration_id: 'b'.repeat(64) }));
  });
  await assert.rejects(api.publishSelection(config, ordinary), /PRODUCT_ENVIRONMENT_CHANGED|运行环境或状态库/);
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
  await assert.rejects(api.publishSelection(config, ordinary), error => error.code === 'PRODUCT_DATA_GAP' && error.origin === 'ashare-data' && assert.deepEqual(error.details, [gap]) === undefined);
});

test('release transfer needs explicit diagnostic consent and selects only actual requested trading days', () => {
  const manifest = { selected_sources: { '600036.XSHG': 'source-a' }, source_selection_scope: { start: selection.start, end: selection.end }, receipt: { receipt_sha256: 'f'.repeat(64) } };
  const release = { release: { dataset_id: 'store', manifest, mode: 'price_only_no_limits', reference_set: null }, dataset: { ...dataset, mode: 'price_only_no_limits', diagnostic_allowed: true } };
  assert.equal(validSelection(selection), true);
  assert.throws(() => draftFromRelease(config, release, diagnostic, false), /确认价格诊断/);
  const previous = { ...freshDraft(), name: '保留策略', code: '{"algorithm":"momentum"}', cash: '10000.001', ack: 'old', retrospective: true };
  const next = draftFromRelease(config, release, diagnostic, true, previous);
  assert.equal(next.environment, config.configuration_id);
  assert.equal(next.dataset, 'released');
  assert.deepEqual(next.securities, [...selection.securities].sort());
  assert.equal(next.start, '2024-01-08'); assert.equal(next.end, '2024-01-10');
  assert.equal(next.mode, 'price_only_no_limits'); assert.equal(next.ack, ''); assert.equal(next.retrospective, false);
  assert.equal(next.code, previous.code); assert.equal(next.cash, previous.cash);
  assert.deepEqual(draftPublication(next), manifest);
  assert.equal(draftPublication({ ...next, dataset: 'different' }), null);
  assert.throws(() => draftFromRelease(config, release, { ...diagnostic, start: '1990-01-01', end: '1990-01-10' }, true), /没有可用交易日/);
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

test('ordinary publication requires the checked exact window and bound reference group, never a first-group fallback', () => {
  assert.equal(publicationReady(config, ordinary, null, null, true), false);
  assert.equal(publicationReady(config, ordinary, coverage, null, false), true);
  assert.equal(publicationReady(config, { ...ordinary, end: '2024-01-11' }, coverage, null, false), false);
  assert.equal(publicationReady(config, { ...ordinary, securities: ['600519.XSHG'] }, coverage, null, false), false);
  assert.equal(publicationReady(config, { ...ordinary, reference_set: 'another' }, coverage, null, false), false);
  assert.equal(selectedReference({ ...config, default_reference_set: null }, null), null);
  assert.equal(selectedReference({ ...config, default_reference_set: 'missing' }, null), null);
  assert.equal(publicationReady({ ...config, default_reference_set: null }, { ...ordinary, reference_set: null }, coverage, null, false), false);
  assert.throws(() => validateCoverage(config, coverageSelection, { ...coverage, source_bindings: { ...coverage.source_bindings, corporate: { kind: 'corporate_history', binding_sha256: 'e'.repeat(64) } } }), /覆盖检查响应/);
  assert.throws(() => validateCoverage(config, coverageSelection, { ...coverage, ready: true, gaps: [{ code: 'UNKNOWN_STATE' }] }), /覆盖检查响应/);
  assert.throws(() => validateCoverage(config, coverageSelection, { ...coverage, reference_set: null }), /覆盖检查响应/);
});

test('open JSON reference groups are narrowed before labels, values and source identities are used', async t => {
  for (const reference_sets of [undefined, [{ ...reference, name: 42 }], [{ ...reference, kind: null }],
    [{ ...reference, source_bindings: { market: reference.source_bindings.market } }],
    [{ ...reference, source_bindings: { ...reference.source_bindings, corporate: { kind: 'corporate_history', binding_sha256: 'invalid' } } }],
    [reference, reference]]) {
    t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ ...config, reference_sets })));
    await assert.rejects(configClient.readProductConfig(), /配置响应无效/);
  }
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(config)));
  assert.deepEqual((await configClient.readProductConfig()).reference_sets, [reference]);
});

test('ordinary source gaps stay actionable and do not enable publication from raw-price success', async t => {
  const gap = { code: 'STATE_UNKNOWN', security: '600519.XSHG', date: '2024-01-09', field: 'upper_limit', detail: '来源未覆盖该日涨停价', owner_issue: { historical_pit_verified: false } };
  const blocked = { ...coverage, ready: false, gaps: [gap] };
  t.mock.method(globalThis, 'fetch', async url => new Response(JSON.stringify(url.endsWith('/config') ? config : blocked)));
  assert.deepEqual((await api.readCoverage(config, coverageSelection)).gaps, [gap]);
  const prices = { rows: [{ close: '99.50' }], gaps: [], receipt: {} };
  assert.equal(publicationReady(config, ordinary, blocked, prices, true), false);
  assert.equal(publicationReady(config, diagnostic, null, prices, false), false);
  assert.equal(publicationReady(config, diagnostic, null, prices, true), true);
  assert.equal(publicationReady(config, diagnostic, null, { ...prices, gaps: [gap] }, true), false);
  const html = renderToStaticMarkup(createElement(ProductCoverage, { coverage: blocked }));
  for (const text of ['600519.XSHG', '2024-01-09', 'upper_limit', 'STATE_UNKNOWN', '来源未覆盖该日涨停价', 'gross_cash_no_tax', '不会自动改为价格诊断', '参考来源绑定']) assert.ok(html.includes(text), text);
});

test('coverage assumptions show Chinese meaning while preserving raw known and unknown IDs', () => {
  const labels = [
    ['dated_name_history_status', '日期名称状态延续'],
    ['gross_cash_zero_withholding', '税前现金、零预扣'],
    ['retrospective_daily_status', '回溯日状态'],
    ['scoped_action_absence', '来源范围内无行动'],
    ['shared_market_calendar', '共同市场日历'],
    ['standard_mainboard_limits', '普通主板派生限幅'],
  ];
  const assumptions = [...labels.map(([id]) => id), 'future_model_assumption'];
  const html = renderToStaticMarkup(createElement(ProductCoverage, { coverage: { ...coverage, assumptions } }));
  const visible = html.slice(0, html.indexOf('<details>'));
  for (const [id, label] of labels) {
    assert.ok(visible.includes(`<span title="${id}">${label}：`), id);
    assert.ok(html.slice(html.indexOf('<details>')).includes(id), `raw receipt: ${id}`);
  }
  assert.ok(visible.includes('<span>future_model_assumption</span>'));
  assert.deepEqual(assumptions, [...labels.map(([id]) => id), 'future_model_assumption']);
});

test('ordinary release transfers its declared mode and preserves corporate evidence; it cannot be converted to diagnosis', () => {
  const next = draftFromRelease(config, released, ordinary, false);
  assert.equal(next.mode, 'covered_research');
  assert.equal(next.ack, '');
  assert.equal(next.retrospective, false);
  assert.equal(declaredMode(dataset), 'covered_research');
  assert.equal(datasetModeError(dataset, 'covered_research'), '');
  assert.match(datasetModeError(dataset, 'price_only_no_limits'), /公司行动日程及来源不能剥离/);
  assert.throws(() => draftFromRelease(config, released, diagnostic, true), /发布响应/);
  assert.throws(() => draftFromRelease(config, { ...released, release: { ...released.release, corporate_schedule_path: null } }, ordinary, false), /发布响应/);
  assert.throws(() => draftFromRelease(config, { ...released, release: { ...released.release, reference_set: { name: 'other', kind: reference.kind } } }, ordinary, false), /发布响应/);
  assert.match(datasetModeError({ ...dataset, mode: undefined }, 'covered_research'), /未声明研究模式/);
  assert.match(datasetModeError({ ...dataset, mode: 'price_only_no_limits', diagnostic_allowed: true }, 'covered_research'), /模式与数据集声明不一致/);
});
