// Artificial browser-flow backend. Explicitly started in isolation; never imported by product code.
// node tests/fixtures/product-server.mjs PORT
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const contract = JSON.parse(readFileSync(new URL('../../contracts/portfolio.openapi.json', import.meta.url)));
const at = '2024-01-12T00:00:00Z';
const identity = { backend_version: contract.info.version, source_sha256: 'f'.repeat(64), contract_version: 'portfolio-jobs.v1', independent_review_status: 'not_reviewed' };
const reference = { name: 'fixture-reference', kind: 'historical_market', source_bindings: { market: { kind: 'historical_market', binding_sha256: 'b'.repeat(64) }, corporate: { kind: 'corporate_history', binding_sha256: 'c'.repeat(64) } } };
const config = { profile: 'product-browser-fixture', kind: 'product', configured: true, configuration_id: 'a'.repeat(64), default_dataset_id: null,
  default_reference_set: reference.name, reference_sets: [reference],
  assets: [{ kind: 'artificial_fixture', role: 'evaluation', path: 'in-memory-fixture', read_only: true }], capabilities: { catalogue: true, prices: true, publish: true, covered_research: true, price_only_no_limits: true }, limitations: ['人工浏览器测试；不是市场数据或验收证据。'] };
const all = ['600036.XSHG', '000002.XSHE', '600519.XSHG'].map((security, i) => ({ security, name: `人工证券 ${i + 1}`, first_bar: '2023-01-01', last_bar: '2024-12-31', sources: [{ source: 'fixture-only', rows: 500, first: '2023-01-01', last: '2024-12-31' }] }));
const receipt = { asset: { kind: 'artificial_fixture', root: 'fixture', database: 'in-memory' }, rows_sha256: 'r'.repeat(64), receipt_sha256: 'h'.repeat(64), responses: [{ source: 'fixture-only' }] };
const datasets = [], strategies = [], jobs = [], requests = [], manifests = new Map();
function dates(start, end) {
  const out = [];
  for (let day = new Date(`${start}T00:00:00Z`); day.toISOString().slice(0, 10) <= end; day.setUTCDate(day.getUTCDate() + 1))
    if (![0, 6].includes(day.getUTCDay())) out.push(day.toISOString().slice(0, 10));
  return out;
}
function preflight(body) {
  return { selection: body, scope: { securities: body.securities, start_date: body.start_date, end_date: body.end_date, trading_dates: dates(body.start_date, body.end_date) },
    ready: body.accept_retrospective_state, economic_scope: body.mode === 'price_only_no_limits' ? 'price_only_no_limits_not_total_return' : 'source_covered_conditional_research', historical_pit_verified: false,
    real_market_data: false, input_sha256: 'i'.repeat(64), assumption_ack_sha256: 'c'.repeat(64), assumptions: ['人工测试假设'], limitations: ['非总收益'],
    gaps: body.accept_retrospective_state ? [] : [{ code: 'STATE_ACK_REQUIRED', detail: '请确认回溯状态' }] };
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
    const path = url.pathname;
    requests.push({ path, query: url.search, method: req.method, body });
    let value;
    if (path === '/__test/requests') value = requests;
    else if (path === '/__test/environment') { config.configuration_id = 'b'.repeat(64); value = config; }
    else if (path === '/__test/no-default') { config.default_reference_set = null; config.configuration_id = 'd'.repeat(64); value = config; }
    else if (path === '/api/v1/product/config') value = config;
    else if (path === '/api/v1/product/catalogue') {
      const query = url.searchParams.get('query') || '', offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || 50);
      const matches = all.filter(s => s.security.includes(query) || s.name.includes(query));
      value = { schema: 'local-daily-catalogue.v1', query, limit, offset, total: matches.length, securities: matches.slice(offset, offset + limit), receipt, limitations: [] };
    } else if (path === '/api/v1/product/prices') {
      const missing = body.start < '2023-01-01';
      value = { rows: missing ? [] : body.securities.flatMap(security => dates(body.start, body.end).map(date => ({ security, date, source: 'fixture-only', open: '10.1000', high: '10.5000', low: '10.0000', close: '10.2000', volume: '10000', amount: null }))), gaps: missing ? [{ code: 'MISSING_BARS', detail: '人工缺数据路径' }] : [], coverage: [], receipt };
    } else if (path === '/api/v1/product/coverage') {
      const { securities, start, end, source } = body;
      const missing = start < '2024-01-01' || end > '2024-01-31' || !(body.reference_set || config.default_reference_set);
      value = { schema: 'ad-local-daily-coverage.v1', scope: { securities, start, end, source }, ready: !missing,
        gaps: missing ? [{ code: 'STATE_UNKNOWN', security: securities[0], date: start, field: 'upper_limit', detail: '人工来源未覆盖该日涨停价' }] : [],
        assumptions: [{ text: '人工现金日期模型 gross_cash_no_tax；不是正式证据' }], limitations: ['人工覆盖，不认证历史 PIT'],
        reference_set: { name: reference.name, kind: reference.kind }, source_bindings: reference.source_bindings, coverage_sha256: 'e'.repeat(64) };
    } else if (path === '/api/v1/product/releases') {
      const mode = body.mode || 'covered_research', covered = mode === 'covered_research';
      const dataset = { dataset_id: `fixture-release-${datasets.length + 1}`, input_sha256: 'i'.repeat(64), name: '人工发布窗口', mode, diagnostic_allowed: !covered, securities: body.securities, trading_dates: dates(body.start, body.end), real_market_data: false, state_mode: 'retrospective', action_coverage: { status: covered ? 'source_scoped' : 'uncovered' }, source_refs: [receipt], limitations: ['人工测试数据'] };
      datasets.push(dataset);
      const declarations = { mode, reference_set: covered ? { name: reference.name, kind: reference.kind } : null, source_bindings: covered ? reference.source_bindings : {}, coverage_sha256: covered ? 'e'.repeat(64) : null, corporate_schedule_path: covered ? 'corporate-schedule.json' : null };
      value = { dataset, release: { dataset_id: 'fixture-store', portfolio_input_path: 'fixture-input.json', ...declarations, manifest: { securities: body.securities, start: body.start, end: body.end, warmup_sessions: 120, selected_sources: Object.fromEntries(body.securities.map(s => [s, 'fixture-only'])), source_selection_scope: { start: body.start, end: body.end }, ...declarations, receipt } } };
    } else if (path === '/api/v1/portfolio/openapi.json') value = contract;
    else if (path === '/api/v1/portfolio/catalogue') value = { contract_version: 'portfolio-jobs.v1', account_policy: 'new_isolated_account_per_job', dataset_registration: 'local_cli_only', python_registration: 'not_supported_use_registered_algorithms', instrument_scope: 'main_board_ordinary_a_shares', preflight_required: true, native_ready: true, native_error: null, service_identity: identity, strategy_algorithms: ['equal-weight'], fee_models: [{ id: 'fixed-commission-tax.v1' }], datasets };
    else if (path === '/api/v1/portfolio/service') value = { contract_version: 'm2-job-service.v1', job_contract_version: 'portfolio-jobs.v1', counts: {}, available_pending: 5, recovery_required: 0, policy: {} };
    else if (path === '/api/v1/portfolio/strategies') {
      if (body) { value = { version_id: 'fixture-strategy', created_at: at, definition: body, source_sha256: 's'.repeat(64), parameter_sha256: 'p'.repeat(64) }; strategies.push(value); }
      else value = strategies;
    } else if (path === '/api/v1/portfolio/preflight') value = preflight(body);
    else if (path === '/api/v1/portfolio/jobs') {
      if (!body) value = { items: jobs };
      else {
        const job = { job_id: `m2job-${String(jobs.length + 1).padStart(32, '0')}`, contract_version: 'portfolio-jobs.v1', request: body, session_sha256: 'x'.repeat(64), account_id: 'bt-fixture', status: 'queued', attempt_count: 0, committed_cursor: 0, total_cursors: 3, result: null, can_resume: false, recovery_required: false, created_at: at, updated_at: at };
        const { dataset_id, securities, start_date, end_date, mode, accept_retrospective_state } = body;
        const checked = preflight({ dataset_id, securities, start_date, end_date, mode, accept_retrospective_state });
        manifests.set(job.job_id, { schema_version: 'portfolio-job-manifest.v1', job_id: job.job_id, request: body, session_sha256: job.session_sha256, service_identity: identity, preflight: checked, execution_scope: checked.scope, strategy: strategies[0], data_identity: datasets.find(d => d.dataset_id === body.dataset_id), session: { run_id: 'fixture', native_identity: 'fixture', details: { input_sha256: checked.input_sha256 } } });
        jobs.push(job); value = job;
      }
    } else if (path.startsWith('/api/v1/portfolio/jobs/')) {
      const [, id, tail] = /\/jobs\/([^/]+)(?:\/(.*))?$/.exec(path);
      value = tail === 'manifest' ? manifests.get(id) : tail === 'logs' ? { job_id: id, items: [] } : jobs.find(j => j.job_id === id);
    }
    if (!value) { res.writeHead(404); value = { error: { code: 'FIXTURE_ROUTE_MISSING', message: path } }; }
    else res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(value));
  } catch (error) { res.writeHead(500); res.end(JSON.stringify({ error: { code: 'FIXTURE_ERROR', message: error.message } })); }
});
server.listen(Number(process.argv[2] || 0), '127.0.0.1', () => console.log(`Artificial test backend: http://127.0.0.1:${server.address().port}`));
