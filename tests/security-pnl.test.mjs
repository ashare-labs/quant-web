import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as apiModule from '../src/shared/api.ts';
import * as model from '../src/results/model.ts';
import * as secModule from '../src/results/security-pnl.ts';
import { backtestsHref, unassignedHistoryHref } from '../src/backtests/history-model.ts';
import { resultTarget } from '../src/results/routing.ts';
import { requestStrategy } from '../src/backtests/history-api.ts';

const originalLocation = globalThis.location;
afterEach(() => {
  if (originalLocation === undefined) delete globalThis.location;
  else globalThis.location = originalLocation;
});

const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ES2022
  }
}).outputText;

function createRenderer() {
  const states = new Map();
  let currentKey = 'root';
  let index = 0;
  const r = { cleanup: [] };
  const stateFor = () => {
    if (!states.has(currentKey))
      states.set(currentKey, { slots: [], effects: [], cleanup: [] });
    return states.get(currentKey);
  };
  r.react = {
    Fragment: 'fragment',
    useState(value) {
      const s = stateFor();
      const i = index++;
      if (!(i in s.slots)) s.slots[i] = value;
      return [
        s.slots[i],
        v => {
          s.slots[i] = typeof v === 'function' ? v(s.slots[i]) : v;
        }
      ];
    },
    useRef(value) {
      const s = stateFor();
      return s.slots[index++] ??= { current: value };
    },
    useEffect(effect, deps) {
      const s = stateFor();
      const i = index++;
      const before = s.slots[i];
      if (!before || deps.some((d, n) => !Object.is(d, before[n]))) {
        s.slots[i] = deps;
        s.effects.push(() => {
          s.cleanup[i]?.();
          s.cleanup[i] = effect();
        });
      }
    }
  };
  r.jsxRuntime = {
    jsx: (type, props, key) => ({ type, props, key }),
    jsxs: (type, props, key) => ({ type, props, key }),
    Fragment: 'fragment'
  };
  function expand(node, pathKey = 'root') {
    if (Array.isArray(node)) return node.map((item, idx) => expand(item, `${pathKey}.${idx}`));
    if (!node || typeof node !== 'object') return node;
    if (typeof node.type === 'function') {
      const prevKey = currentKey;
      const prevIndex = index;
      currentKey = `${pathKey}:${node.type.name || 'anon'}`;
      index = 0;
      const rendered = node.type(node.props || {});
      currentKey = prevKey;
      index = prevIndex;
      return expand(rendered, `${pathKey}/${node.type.name || 'anon'}`);
    }
    if (node.props?.children !== undefined)
      return { ...node, props: { ...node.props, children: expand(node.props.children, `${pathKey}>`) } };
    return node;
  }
  r.renderWith = fn => {
    const activeKeys = new Set();
    const prevExpand = expand;
    currentKey = 'root';
    index = 0;
    r.value = prevExpand(fn(), 'root');
    for (const s of states.values())
      while (s.effects.length) s.effects.shift()();
    void activeKeys;
    return r.value;
  };
  r.close = () => {
    for (const s of states.values())
      s.cleanup.forEach(fn => fn?.());
  };
  return r;
}

function flatten(node) {
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (!node || typeof node !== 'object') return [];
  return [node, ...flatten(node.props?.children)];
}

function textContent(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join('');
  if (typeof node === 'object')
    return textContent(node.props?.children);
  return '';
}

function loadSecurityComponent(r) {
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', compile('../src/results/ResultSecurityPnl.tsx'))(name => {
    if (name === 'react') return r.react;
    if (name === 'react/jsx-runtime') return r.jsxRuntime;
    if (name === '../shared/api') return apiModule;
    if (name === './security-pnl') return secModule;
    return {};
  }, mod, mod.exports);
  return mod.exports.ResultSecurityPnl;
}

test('single-security acceptance case (长江电力 600900.XSHG) formats signed/unsigned values without 1-row ranking or %', () => {
  const sec = {
    status: 'ok',
    reason: null,
    contribution_status: 'ok',
    contribution_reason: null,
    initial_equity: 100000,
    final_equity: 101300.19,
    external_cash_flow: 0,
    total_pnl: 1300.19,
    total_contribution_pp: 1.30019,
    security_count: 1,
    win_count: 1,
    loss_count: 0,
    flat_count: 0,
    securities_pnl: 1300.19,
    securities_contribution_pp: 1.30019,
    items: [{
      security: '600900.XSHG',
      name: '长江电力',
      position_status: 'closed',
      ending_quantity: 0,
      pending_shares: 0,
      ending_value: 0,
      trade_count: 2,
      buy_amount: 28500,
      sell_amount: 29370,
      net_pnl: 1300.19,
      contribution_pp: 1.30019,
      breakdown_status: 'ok',
      breakdown_reason: null,
      realized_spread: 870,
      unrealized_spread: 0,
      dividend_cash: 443.16,
      fees: 12.97,
    }],
    account_items: [],
  };
  assert.ok(secModule.acceptedSecurityPnl(sec));

  const r = createRenderer();
  const ResultSecurityPnl = loadSecurityComponent(r);
  const jumped = [];
  try {
    const tree = r.renderWith(() => ResultSecurityPnl({
      resultName: '验收回测',
      jobId: 'm2job-' + '1'.repeat(32),
      securities: sec,
      loading: false,
      error: '',
      onViewTrades: s => jumped.push(s),
    }));
    const all = flatten(tree);
    const fullText = textContent(tree);

    // No single-row ranking table in single-security mode
    assert.equal(all.some(n => n.type === 'table'), false);
    assert.match(fullText, /长江电力/);
    assert.match(fullText, /600900\.XSHG/);
    assert.match(fullText, /已清仓/);

    // Exact signed vs unsigned formatting
    assert.match(fullText, /\+1,300\.19/);
    assert.match(fullText, /\+1\.30/);
    assert.ok(!fullText.includes('+1.30%'));
    assert.match(fullText, /\+870\.00/);
    assert.match(fullText, /0\.00/);
    assert.ok(!fullText.includes('+0.00') && !fullText.includes('-0.00'));
    assert.match(fullText, /443\.16/);
    assert.ok(!fullText.includes('+443.16'));
    assert.match(fullText, /12\.97/);
    assert.ok(!fullText.includes('-12.97'));
    assert.match(fullText, /28,500\.00/);

    // Zero-axis bar rendered cleanly alongside number
    const barFill = all.find(n => n.type === 'b' && String(n.props?.className || '').includes('security-contrib-fill'));
    assert.ok(barFill);
    assert.match(barFill.props.className, /is-positive/);
    assert.equal(barFill.props.style.width, '50%');

    // View trades entry triggers callback
    const jumpBtn = all.find(n => n.type === 'button' && textContent(n) === '查看成交记录');
    assert.ok(jumpBtn);
    jumpBtn.props.onClick();
    assert.deepEqual(jumped, ['600900.XSHG']);
  } finally {
    r.close();
  }
});

test('empty backtest shows empty state while preserving cash interest account-level closure', () => {
  const sec = {
    status: 'ok',
    reason: null,
    contribution_status: 'ok',
    contribution_reason: null,
    initial_equity: 100000,
    final_equity: 100088.5,
    external_cash_flow: 0,
    total_pnl: 88.5,
    total_contribution_pp: 0.0885,
    security_count: 0,
    win_count: 0,
    loss_count: 0,
    flat_count: 0,
    securities_pnl: 0,
    securities_contribution_pp: 0,
    items: [],
    account_items: [{
      key: 'cash_interest',
      label: '现金利息',
      pnl: 88.5,
      contribution_pp: 0.0885,
    }],
  };
  const r = createRenderer();
  const ResultSecurityPnl = loadSecurityComponent(r);
  try {
    const tree = r.renderWith(() => ResultSecurityPnl({
      resultName: '空仓生息',
      jobId: 'm2job-' + '2'.repeat(32),
      securities: sec,
      loading: false,
      error: '',
      onViewTrades: () => {},
    }));
    const fullText = textContent(tree);
    assert.match(fullText, /回测全程无成交且无持仓记录/);
    assert.match(fullText, /现金利息/);
    assert.match(fullText, /\+88\.50/);
    assert.match(fullText, /\+0\.09/);
  } finally {
    r.close();
  }
});

test('multi-security ranking supports quick toggles, header sort, search filter, pagination, expansion, bonus-share dashes, and account items', () => {
  const makeItem = (i, overrides = {}) => ({
    security: String(600000 + i).padStart(6, '0') + '.XSHG',
    name: '测试标的' + i,
    position_status: i === 2 ? 'holding' : 'closed',
    ending_quantity: i === 2 ? 500 : 0,
    pending_shares: 0,
    ending_value: i === 2 ? 5000 : 0,
    trade_count: i * 2,
    buy_amount: i * 1000,
    sell_amount: i * 1000,
    net_pnl: (12 - i) * 100,
    contribution_pp: (12 - i) * 0.1,
    breakdown_status: 'ok',
    breakdown_reason: null,
    realized_spread: (12 - i) * 100,
    unrealized_spread: 0,
    dividend_cash: 0,
    fees: 0,
    ...overrides,
  });

  // 25 items -> paginated (> 20), including 1 bonus-share item
  const items = Array.from({ length: 25 }, (_, idx) => makeItem(idx + 1, idx === 0 ? {
    name: '送转龙头',
    breakdown_status: 'unavailable',
    breakdown_reason: 'corporate_share_adjustment',
    realized_spread: null,
    unrealized_spread: null,
    dividend_cash: 120,
    fees: 15,
  } : {}));
  const sumSec = items.reduce((s, x) => s + x.net_pnl, 0);
  const sec = {
    status: 'ok',
    reason: null,
    contribution_status: 'ok',
    contribution_reason: null,
    initial_equity: 100000,
    final_equity: 100000 + sumSec + 60,
    external_cash_flow: 0,
    total_pnl: sumSec + 60,
    total_contribution_pp: (sumSec + 60) / 1000,
    security_count: 25,
    win_count: 11,
    loss_count: 13,
    flat_count: 1,
    securities_pnl: sumSec,
    securities_contribution_pp: sumSec / 1000,
    items,
    account_items: [{
      key: 'ex_unpaid_dividend',
      label: '期末已除息未到账分红',
      pnl: 60,
      contribution_pp: 0.06,
    }],
  };
  assert.ok(secModule.acceptedSecurityPnl(sec));

  const r = createRenderer();
  const ResultSecurityPnl = loadSecurityComponent(r);
  const render = () => r.renderWith(() => ResultSecurityPnl({
    resultName: '多标的测试',
    jobId: 'm2job-' + '3'.repeat(32),
    securities: sec,
    loading: false,
    error: '',
    onViewTrades: () => {},
  }));
  try {
    let tree = render();
    let all = flatten(tree);

    // Default: descending by contribution_pp, paginated at 20 rows
    const rows = () => flatten(tree).filter(n => n.type === 'tr' && String(n.props?.className || '').includes('security-row'));
    assert.equal(rows().length, 20);
    assert.match(textContent(rows()[0]), /送转龙头/);
    assert.match(textContent(rows()[1]), /持仓中/);
    assert.match(textContent(tree), /期末已除息未到账分红/);

    // Expand bonus-share row: spreads must show '—' with reason, NEVER '0.00'
    rows()[0].props.onClick();
    tree = render();
    const detail = flatten(tree).find(n => n.type === 'tr' && n.props?.className === 'security-detail-row');
    assert.ok(detail);
    const detailText = textContent(detail);
    assert.match(detailText, /已平仓价差（元）—/);
    assert.match(detailText, /期末持仓价差（元）—/);
    assert.match(detailText, /现金分红（元）120\.00/);
    assert.match(detailText, /交易税费（元）15\.00/);
    assert.match(detailText, /含送转股等份额变动/);

    // Switch quick sort to 亏损最多 (ascending)
    const lossBtn = flatten(tree).find(n => n.type === 'button' && textContent(n) === '亏损最多');
    lossBtn.props.onClick();
    tree = render();
    assert.match(textContent(rows()[0]), /600025\.XSHG/);

    // Sort by 成交笔数 header button
    const tradeCountBtn = flatten(tree).find(n => n.type === 'button' && textContent(n).includes('成交笔数'));
    const tradeCountTh = flatten(tree).find(n => n.type === 'th' && flatten(n).includes(tradeCountBtn));
    assert.equal(tradeCountTh.props['aria-sort'], undefined);
    tradeCountBtn.props.onClick();
    tree = render();
    const sortedTh = flatten(tree).find(n => n.type === 'th' && textContent(n).includes('成交笔数'));
    assert.equal(sortedTh.props['aria-sort'], 'descending');
    assert.match(textContent(rows()[0]), /600025\.XSHG/);

    // Filter down to <= 20 items hides pagination controls
    const search = flatten(tree).find(n => n.type === 'input' && n.props?.type === 'search');
    search.props.onChange({ target: { value: '送转龙头' } });
    tree = render();
    assert.equal(rows().length, 1);
    assert.equal(flatten(tree).some(n => n.type === 'div' && n.props?.className === 'pagination'), false);
  } finally {
    r.close();
  }
});

test('external cash flows leave contribution cells blank with reason, and ledger mismatch alerts without 待核对差额', () => {
  const r = createRenderer();
  const ResultSecurityPnl = loadSecurityComponent(r);
  try {
    const withCashFlow = {
      status: 'ok',
      reason: null,
      contribution_status: 'unavailable',
      contribution_reason: 'external_cash_flows',
      initial_equity: 100000,
      final_equity: 150995,
      external_cash_flow: 50000,
      total_pnl: 995,
      total_contribution_pp: null,
      security_count: 2,
      win_count: 2,
      loss_count: 0,
      flat_count: 0,
      securities_pnl: 995,
      securities_contribution_pp: null,
      items: [
        {
          security: '600900.XSHG',
          name: '长江电力',
          position_status: 'holding',
          ending_quantity: 1000,
          pending_shares: 0,
          ending_value: 20500,
          trade_count: 1,
          buy_amount: 20000,
          sell_amount: 0,
          net_pnl: 495,
          contribution_pp: null,
          breakdown_status: 'ok',
          breakdown_reason: null,
          realized_spread: 0,
          unrealized_spread: 500,
          dividend_cash: 0,
          fees: 5,
        },
        {
          security: '000001.XSHE',
          name: '平安银行',
          position_status: 'closed',
          ending_quantity: 0,
          pending_shares: 0,
          ending_value: 0,
          trade_count: 2,
          buy_amount: 10000,
          sell_amount: 10510,
          net_pnl: 500,
          contribution_pp: null,
          breakdown_status: 'ok',
          breakdown_reason: null,
          realized_spread: 510,
          unrealized_spread: 0,
          dividend_cash: 0,
          fees: 10,
        },
      ],
      account_items: [],
    };
    const cfTree = r.renderWith(() => ResultSecurityPnl({
      resultName: '出入金测试',
      jobId: 'm2job-' + '4'.repeat(32),
      securities: withCashFlow,
      loading: false,
      error: '',
      onViewTrades: () => {},
    }));
    const cfText = textContent(cfTree);
    assert.match(cfText, /存在出入金，无法按单一初始资金闭合/);
    assert.match(cfText, /\+500\.00/);
    assert.match(cfText, /\+495\.00/);
    const blanks = flatten(cfTree).filter(n => n.type === 'span' && n.props?.className === 'security-contrib-blank');
    assert.equal(blanks.length, 2);

    const mismatch = {
      status: 'reconciliation_error',
      reason: 'equity_reconciliation_mismatch',
      contribution_status: 'unavailable',
      contribution_reason: 'equity_reconciliation_mismatch',
      initial_equity: 100000,
      final_equity: 105000,
      external_cash_flow: 0,
      total_pnl: 5000,
      total_contribution_pp: null,
      security_count: 0,
      win_count: 0,
      loss_count: 0,
      flat_count: 0,
      securities_pnl: null,
      securities_contribution_pp: null,
      items: [],
      account_items: [],
    };
    const errTree = r.renderWith(() => ResultSecurityPnl({
      resultName: '对账异常',
      jobId: 'm2job-' + '5'.repeat(32),
      securities: mismatch,
      loading: false,
      error: '',
      onViewTrades: () => {},
    }));
    const errText = textContent(errTree);
    assert.match(errText, /归因对账异常/);
    assert.ok(!errText.includes('待核对差额'));

    // Defense-in-depth: even if a payload had status='ok' on a 10B account with +0.05 drift, UI rejects unclosed cents
    const unclosed10B = {
      status: 'ok',
      reason: null,
      contribution_status: 'ok',
      contribution_reason: null,
      initial_equity: 10000000000,
      final_equity: 10000000000.05,
      external_cash_flow: 0,
      total_pnl: 0.05,
      total_contribution_pp: 0.0000005,
      security_count: 0,
      win_count: 0,
      loss_count: 0,
      flat_count: 0,
      securities_pnl: 0,
      securities_contribution_pp: 0,
      items: [],
      account_items: [],
    };
    const driftTree = r.renderWith(() => ResultSecurityPnl({
      resultName: '百亿差额测试',
      jobId: 'm2job-' + '7'.repeat(32),
      securities: unclosed10B,
      loading: false,
      error: '',
      onViewTrades: () => {},
    }));
    const driftText = textContent(driftTree);
    assert.match(driftText, /归因对账异常/);
    assert.ok(!driftText.includes('+0.05'));
    assert.ok(!driftText.includes('待核对差额'));
  } finally {
    r.close();
  }
});

test('clicking 查看成交记录 jumps to 交易详情, auto-fills security filter, highlights banner, and resets with 全部标的', () => {
  const id = 'm2job-' + '6'.repeat(32);
  const path = '/history/jobs/' + id;
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/result-analysis.json', import.meta.url)))[0];
  const analysis = structuredClone(fixture.analysis);
  analysis.job_id = id;
  analysis.securities = {
    status: 'ok',
    reason: null,
    contribution_status: 'ok',
    contribution_reason: null,
    initial_equity: 100000,
    final_equity: 101300.19,
    external_cash_flow: 0,
    total_pnl: 1300.19,
    total_contribution_pp: 1.30019,
    security_count: 2,
    win_count: 2,
    loss_count: 0,
    flat_count: 0,
    securities_pnl: 1300.19,
    securities_contribution_pp: 1.30019,
    items: [
      {
        security: '600900.XSHG',
        name: '长江电力',
        position_status: 'closed',
        ending_quantity: 0,
        pending_shares: 0,
        ending_value: 0,
        trade_count: 2,
        buy_amount: 28500,
        sell_amount: 29370,
        net_pnl: 1000.19,
        contribution_pp: 1.00019,
        breakdown_status: 'ok',
        breakdown_reason: null,
        realized_spread: 870,
        unrealized_spread: 0,
        dividend_cash: 143.16,
        fees: 12.97,
      },
      {
        security: '000001.XSHE',
        name: '平安银行',
        position_status: 'closed',
        ending_quantity: 0,
        pending_shares: 0,
        ending_value: 0,
        trade_count: 1,
        buy_amount: 10000,
        sell_amount: 10310,
        net_pnl: 300,
        contribution_pp: 0.3,
        breakdown_status: 'ok',
        breakdown_reason: null,
        realized_spread: 310,
        unrealized_spread: 0,
        dividend_cash: 0,
        fees: 10,
      },
    ],
    account_items: [],
  };
  const resultData = {
    job_id: id,
    name: '联动回测',
    native: {
      orders: [
        { order_id: '1', add_time: '2025-03-03T09:30:00', order_type: 'MARKET' },
        { order_id: '2', add_time: '2025-03-06T14:49:00', order_type: 'LIMIT' },
        { order_id: '3', add_time: '2025-03-07T10:00:00', order_type: 'MARKET' },
      ],
      trades: [
        { trade_id: '1', order_id: '1', security: '600900.XSHG', at: '2025-03-03T09:35:00+08:00', side: 'BUY', amount: 1000, price: 28.5, commission: 5, tax: 0 },
        { trade_id: '2', order_id: '2', security: '600900.XSHG', at: '2025-03-06T14:50:00+08:00', side: 'SELL', amount: 1000, price: 29.37, commission: 5, tax: 2.97 },
        { trade_id: '3', order_id: '3', security: '000001.XSHE', at: '2025-03-07T10:01:00+08:00', side: 'BUY', amount: 1000, price: 10, commission: 5, tax: 0 },
      ],
      accounts: [],
    }
  };

  const r = createRenderer();
  const ResultSecurityPnl = loadSecurityComponent(r);
  const capturedTables = [];
  const dataMap = new Map([
    [path, {
      job_id: id,
      family: 'python',
      read_only: true,
      execution_state: 'runtime_unavailable',
      status: 'succeeded',
      request: { name: '联动回测', strategy_id: 'research/a.py', frequency: '1d', initial_cash: 100000 },
      result: { snapshot_sha256: analysis.source_sha256 },
    }],
    [path + '/result/analysis?analysis_version=returns-v2&benchmark=frozen', analysis],
    [path + '/result', resultData],
  ]);

  const pageMod = { exports: {} };
  new Function('require', 'module', 'exports', compile('../src/pages/ResultsPage.tsx'))(name => {
    if (name === 'react') return r.react;
    if (name === 'react/jsx-runtime') return r.jsxRuntime;
    if (name === '../shared/api') return apiModule;
    if (name === '../shared/ui') return {
      useResource: p => ({ data: dataMap.get(p) || null, error: '', loading: false, readProgress: null, cancel() {}, refresh() {} }),
      Empty: ({ children }) => ({ type: 'div', props: { children } }),
      ErrorNotice: () => null,
      JsonDetails: () => null,
      Reason: () => null,
      Status: () => null,
    };
    if (name === '../backtests/history-model') return { backtestsHref, unassignedHistoryHref };
    if (name === '../backtests/history-api') return { requestStrategy };
    if (name === '../strategies/project-model') return { strategyEditorHref: s => s };
    if (name === '../results/model') return model;
    if (name === '../results/security-pnl') return secModule;
    if (name === '../results/routing') return { resultTarget };
    if (name === '../results/ResultOverview') return { ResultOverview: () => null };
    if (name === '../results/ResultSecurityPnl') return { ResultSecurityPnl };
    if (name === '../shared/DataTable') return {
      DataTable: props => {
        capturedTables.push(props);
        return { type: 'div', props: { className: 'mock-table', children: `rows:${props.data.length}` } };
      }
    };
    if (name === '../results/ReadStatus') return { ReadStatus: () => null };
    return {};
  }, pageMod, pageMod.exports);

  globalThis.location = { search: '?job=' + id + '&history=1' };
  const render = () => {
    capturedTables.length = 0;
    return r.renderWith(() => pageMod.exports.ResultsPage());
  };

  try {
    let tree = render();
    // Switch to 标的盈亏
    flatten(tree).find(n => n.type === 'button' && textContent(n) === '标的盈亏').props.onClick();
    tree = render();
    // Expand first row (长江电力) and click 查看成交记录
    const firstRow = flatten(tree).find(n => n.type === 'tr' && String(n.props?.className || '').includes('security-row'));
    firstRow.props.onClick();
    tree = render();
    flatten(tree).find(n => n.type === 'button' && textContent(n) === '查看成交记录').props.onClick();
    tree = render();

    // Now on 交易详情 with active filter for 长江电力（600900.XSHG）
    assert.equal(textContent(flatten(tree).find(n => n.type === 'h1')), '交易详情');
    const banner = flatten(tree).find(n => n.type === 'div' && n.props?.className === 'result-trade-filter-banner');
    assert.ok(banner);
    assert.match(textContent(banner), /当前筛选：长江电力（600900\.XSHG）/);
    assert.match(textContent(banner), /显示 2 \/ 3 笔成交/);
    assert.equal(capturedTables[0].data.length, 2);

    // Filter directly by name '平安银行'
    const filterInput = flatten(tree).find(n => n.type === 'input' && n.props?.type === 'search');
    assert.equal(filterInput.props.value, '600900.XSHG');
    filterInput.props.onChange({ target: { value: '平安银行' } });
    tree = render();
    assert.equal(capturedTables[0].data.length, 1);
    assert.equal(capturedTables[0].data[0].security, '平安银行（000001.XSHE）');

    // One-click reset 全部标的
    flatten(tree).find(n => n.type === 'button' && textContent(n) === '全部标的').props.onClick();
    tree = render();
    assert.equal(capturedTables[0].data.length, 3);
    assert.equal(flatten(tree).some(n => n.type === 'div' && n.props?.className === 'result-trade-filter-banner'), false);
  } finally {
    r.close();
  }
});
