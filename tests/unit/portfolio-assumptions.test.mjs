import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { importSource } from '../helpers/import-source.mjs';
import { evidence } from '../fixtures/portfolio.mjs';
import { freshDraft } from '../../src/features/portfolio/draft.ts';
import { validatePortfolioEvidence, validatePreflight } from '../../src/features/portfolio/evidence.ts';

const { ResearchAssumptions } = await importSource('src/features/portfolio/PortfolioUi.tsx');
const { PortfolioRunSettings } = await importSource('src/features/portfolio/PortfolioRunSettings.tsx');
const { ProductCoverage } = await importSource('src/features/product/ProductCoverage.tsx');
const event = { security: '000651.XSHE', entitlement_key: 'artificial-event', record_date: '2024-01-04', ex_date: '2024-01-05', payment_date: '2024-01-08', share_credit_date: null, new_shares_tradable_date: null };
const account = { id: 'corporate_initial_entitlements', initial_account: 'cash_only_no_positions_or_entitlements', text: 'Artificial backend account-policy statement.', prior_record_events: [event] };
const render = values => renderToStaticMarkup(createElement(ResearchAssumptions, { values }));

test('cash-only account assumption displays every backend event unchanged, with original evidence retained', () => {
  const value = { ...account, prior_record_events: [event, { ...event, security: '600036.XSHG', entitlement_key: 'artificial-other', record_date: '2024-01-02', share_credit_date: '2024-01-09', new_shares_tradable_date: '2024-01-10' }] };
  const before = structuredClone(value);
  const html = render([value]);
  const visible = html.slice(0, html.indexOf('<details>'));
  for (const text of ['新任务初始仅现金', '无窗口前持仓或待收权益', '预热数据不代表持仓', '不产生本账户权益', '公司行动来源日程仍完整保留', '000651.XSHE', '600036.XSHG', '2024-01-02', '2024-01-04', '2024-01-05', '2024-01-08', '2024-01-09', '2024-01-10', '未提供']) assert.ok(visible.includes(text), text);
  assert.ok(visible.indexOf('000651.XSHE') < visible.indexOf('600036.XSHG'), 'preserves backend order');
  for (const text of [account.id, account.initial_account, account.text, event.entitlement_key]) assert.ok(html.includes(text), text);
  assert.deepEqual(value, before);
});

test('an empty event list retains the account rule and does not claim source action absence', () => {
  const html = render([{ ...account, prior_record_events: [] }]);
  assert.ok(html.includes('新任务初始仅现金'));
  assert.ok(html.includes('未列出窗口前登记事件'));
  assert.ok(html.includes('不表示来源中没有公司行动'));
  assert.ok(!html.includes('<table>'));
});

test('unknown account models and malformed event lists are not presented as verified cash-only rules', () => {
  for (const value of [{ ...account, initial_account: 'future_account_model' }, { ...account, prior_record_events: [null] }, { ...account, prior_record_events: [{ ...event, record_date: 0 }] }]) {
    const html = render([value]);
    assert.ok(html.includes('后端初始账户说明格式无法识别'));
    assert.ok(!html.includes('新任务初始仅现金'));
  }
  const provenance = render([{ ...account, scope: 'source_provenance_only' }]);
  assert.ok(provenance.includes('仅供来源追溯，不作为本次执行规则'));
  assert.ok(!provenance.includes('新任务初始仅现金'));
});

test('coverage shows the public account rule without changing AD assumptions or coverage digest', () => {
  const coverage = Object.freeze({ schema: 'ad-local-daily-coverage.v1', ready: true, scope: { securities: ['000651.XSHE'], start: '2024-01-05', end: '2024-01-12' }, gaps: [], reference_set: { name: 'artificial-reference' }, assumptions: Object.freeze(['scoped_action_absence']), limitations: [], coverage_sha256: 'a'.repeat(64) });
  const before = JSON.stringify(coverage);
  const html = renderToStaticMarkup(createElement(ProductCoverage, { coverage }));
  assert.ok(html.includes('新任务账户规则'));
  assert.ok(html.includes('新任务初始仅现金'));
  assert.ok(html.includes('scoped_action_absence'));
  assert.ok(html.includes(coverage.coverage_sha256));
  assert.ok(!html.includes('corporate_initial_entitlements'));
  assert.equal(JSON.stringify(coverage), before);
});

test('exact preflight highlights the account policy and reuses the existing bound assumption acknowledgement', () => {
  const e = evidence();
  e.manifest.preflight.gaps = [];
  e.manifest.preflight.assumptions = [account, 'other backend assumption'];
  e.result.assumptions = structuredClone(e.manifest.preflight.assumptions);
  validatePortfolioEvidence(e.id, e.job, e.manifest, e.logs, e.result);
  const html = renderToStaticMarkup(createElement(PortfolioRunSettings, { draft: { ...freshDraft(), ack: 'ack' }, currentPreflight: e.manifest.preflight }));
  assert.ok(html.indexOf('aria-label="初始账户与登记日权益"') < html.indexOf('其他研究假设与限制'));
  assert.equal((html.match(/<strong title="corporate_initial_entitlements">/g) || []).length, 1);
  assert.equal((html.match(/type="checkbox"/g) || []).length, 2, 'only retrospective and existing exact assumption confirmations');
  assert.equal((html.match(/checked=""/g) || []).length, 1);
  assert.throws(() => validatePreflight({ ...e.job.request, start_date: '2020-02-04' }, e.manifest.preflight), /WB_PREFLIGHT_CONFLICT/);
  const changed = structuredClone(e);
  changed.result.assumptions[0].prior_record_events[0].record_date = '2024-01-03';
  assert.throws(() => validatePortfolioEvidence(changed.id, changed.job, changed.manifest, changed.logs, changed.result), /PORTFOLIO_RESULT_CONFLICT/);
  e.manifest.preflight.assumption_ack_sha256 = 'new-account-policy-ack';
  assert.throws(() => validatePortfolioEvidence(e.id, e.job, e.manifest, e.logs, e.result), /PORTFOLIO_JOB_CONFLICT/);
});
