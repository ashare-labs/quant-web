import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { progressView } from '../src/results/progress.ts';
const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ES2022
  }
}).outputText;
const compiled = compile('../src/results/useElapsedTime.ts');
const initial = {
  job_id: 'job-1',
  attempt: 1,
  sequence: 1,
  sampled_at: '2026-10-25T01:00:11Z',
  elapsed_seconds: 11,
  terminal: false
};
function harness(p = initial, running = true) {
  const r = {
    slots: [],
    cleanup: [],
    effects: [],
    timers: new Map(),
    now: 0,
    next: 0,
    dirty: false,
    p,
    running
  };
  let index = 0;
  const react = {
    useRef(value) {
      return r.slots[index++] ??= { current: value };
    },
    useState(value) {
      const i = index++;
      if (!(i in r.slots)) r.slots[i] = value;
      return [
        r.slots[i],
        v => {
          r.slots[i] = v;
          r.dirty = true;
        }
      ];
    },
    useEffect(effect, deps) {
      const i = index++;
      const before = r.slots[i];
      if (!before
        || deps.some((d, n) => !Object.is(d, before[n]))) {
        r.slots[i] = deps;
        r.effects.push(() => {
          r.cleanup[i]?.();
          r.cleanup[i] = effect();
        });
      }
    }
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'performance', 'setInterval', 'clearInterval', compiled)(name => {
    assert.equal(name, 'react');
    return react;
  }, module, module.exports, { now: () => r.now }, (fn, ms) => {
    assert.equal(ms, 1000);
    const id = ++r.next;
    r.timers.set(id, fn);
    return id;
  }, id => r.timers.delete(id));
  r.render = () => {
    index = 0;
    r.dirty = false;
    r.value = module.exports.useElapsedTime(r.p, r.running);
    while (r.effects.length) r.effects.shift()();
  };
  r.flush = () => {
    for (let n = 0; r.dirty && n < 8; n++)r.render();
    assert(!r.dirty);
  };
  r.update = (p, active = r.running) => {
    r.p = p;
    r.running = active;
    r.render();
    r.flush();
  };
  r.tick = ms => {
    r.now += ms;
    for (const fn of r.timers.values()) fn();
    r.flush();
  };
  r.close = () => r.cleanup.forEach(fn => fn?.());
  r.render();
  r.flush();
  return r;
}
test('elapsed advances every second from server seconds, catching up throttled ticks without wall-clock arithmetic', () => {
  const r = harness();
  try {
    assert.equal(r.value, 11);
    assert.equal(r.timers.size, 1);
    r.tick(1000);
    assert.equal(r.value, 12);
    r.tick(8000);
    assert.equal(r.value, 20);
  } finally {
    r.close();
  }
  assert.equal(r.timers.size, 0);
});
test('same snapshot polls and rerenders do not reset the clock or multiply intervals', () => {
  const r = harness();
  try {
    r.tick(4000);
    r.update({ ...initial });
    assert.equal(r.value, 15);
    assert.equal(r.timers.size, 1);
    r.tick(1000);
    assert.equal(r.value, 16);
    r.update({
      ...initial,
      sequence: 2,
      sampled_at: '2026-10-25T01:00:15Z',
      elapsed_seconds: 15
    });
    assert.equal(r.value, 16);
    assert.equal(r.timers.size, 1);
    r.tick(1000);
    assert.equal(r.value, 17);
  } finally { r.close(); }
});
test('disconnect shows the last confirmed sample, reconnect anchors afresh and preserves one interval', () => {
  const r = harness();
  try {
    r.tick(4000);
    r.update(initial, false);
    assert.equal(r.value, 11);
    assert.equal(r.timers.size, 0);
    r.tick(10000);
    assert.equal(r.value, 11);
    r.update({
      ...initial,
      sequence: 3,
      elapsed_seconds: 24
    }, true);
    assert.equal(r.value, 24);
    r.tick(1000);
    assert.equal(r.value, 25);
    assert.equal(r.timers.size, 1);
  } finally { r.close(); }
});
test('success, failure and cancellation freeze exact final seconds even below the display estimate', () => {
  for (const status of ['succeeded', 'failed', 'cancelled']) {
    const r = harness();
    try {
      r.tick(5000);
      const final = {
        ...initial,
        sequence: 2,
        elapsed_seconds: 14.25,
        terminal: true
      };
      const view = progressView({
        job_id: 'job-1',
        status,
        progress: final
      });
      r.update(view.p, view.running);
      assert.equal(r.value, 14.25);
      r.tick(12000);
      assert.equal(r.value, 14.25);
      assert.equal(r.timers.size, 0);
    } finally {
      r.close();
    }
  }
});
test('terminal snapshot or queued/disconnected state never starts an interval', () => {
  for (const [p, active] of [
    [
      {
        ...initial,
        terminal: true
      },
      true
    ],
    [
      initial,
      false
    ],
    [
      null,
      true
    ],
    [
      {
        ...initial,
        elapsed_seconds: NaN
      },
      true
    ],
    [
      {
        ...initial,
        elapsed_seconds: -1
      },
      true
    ]
  ]) {
    const r = harness(p, active);
    try { assert.equal(r.timers.size, 0); } finally { r.close(); }
  }
});
test('refresh, different job and new attempt use their own server baseline', () => {
  const old = harness();
  old.tick(6000);
  old.close();
  const r = harness({
    ...initial,
    sequence: 2,
    elapsed_seconds: 18
  });
  try {
    assert.equal(r.value, 18);
    r.update({
      ...initial,
      job_id: 'job-2',
      elapsed_seconds: 2
    });
    assert.equal(r.value, 2);
    r.tick(2000);
    assert.equal(r.value, 4);
    r.update({
      ...initial,
      job_id: 'job-2',
      attempt: 2,
      elapsed_seconds: 0
    });
    assert.equal(r.value, 0);
    assert.equal(r.timers.size, 1);
  } finally { r.close(); }
});
test('unmount/remount cleanup leaves only the active mount timer', () => {
  const a = harness();
  a.close();
  assert.equal(a.timers.size, 0);
  const b = harness();
  assert.equal(b.timers.size, 1);
  b.close();
  assert.equal(b.timers.size, 0);
});
const component = compile('../src/results/RunProgress.tsx');
function render(job, disconnected = false) {
  const module = { exports: {} };
  const jsx = (type, props) => ({ type, props });
  const imports = {
    'react/jsx-runtime': {
      jsx,
      jsxs: jsx,
      Fragment: 'fragment'
    },
    '../shared/api': {
      shownStatus: j => j.display_status
        || j.status
    },
    '../backtests/history-model': { duration: seconds => String(seconds) },
    './progress': {
      progressView,
      memoryText: b => String(b)
    },
    './useElapsedTime': { useElapsedTime: p => p.elapsed_seconds }
  };
  new Function('require', 'module', 'exports', component)(name => {
    assert(name in imports, name);
    return imports[name];
  }, module, module.exports);
  return module.exports.RunProgress({
    job,
    disconnected
  });
}
function text(node) {
  if (node == null
    || typeof node === 'boolean') return '';
  if (typeof node !== 'object') return String(node);
  if (Array.isArray(node)) return node.map(text).join(' ');
  return text(node.props?.children);
}
function nodes(node) {
  return node
    && typeof node === 'object'
    ? (Array.isArray(node)
      ? node.flatMap(nodes)
      : [
        node,
        ...nodes(node.props?.children)
      ])
    : [];
}
test('waiting UI removes redundant explanations, keeps concise disconnection and only server progress/RSS', () => {
  const p = {
    ...initial,
    phase: 'executing',
    completed_trading_days: 10,
    total_trading_days: 100,
    current_rss_bytes: 100,
    peak_rss_bytes: 200
  };
  const job = { job_id: 'job-1', status: 'running', progress: p };
  const view = render(job);
  assert(!/更新时间|子进程 RSS/.test(text(view)));
  assert(!/连接中断/.test(text(view)));
  assert.match(text(render(job, true)), /连接中断，显示上次采样/);
  const bar = nodes(view).find(n => n.props?.role === 'progressbar');
  assert.equal(bar.props['aria-valuenow'], 10);
  assert.equal(bar.props['aria-valuemax'], 100);
  const later = render({
    ...job,
    progress: {
      ...p,
      elapsed_seconds: 999
    }
  });
  assert.equal(nodes(later).find(n => n.props?.role === 'progressbar').props['aria-valuenow'], 10);
  assert.equal(progressView({
    ...job,
    progress: {
      ...p,
      elapsed_seconds: 999
    }
  }).memory, 100);
  assert(nodes(view).some(n => n.props?.['aria-live'] === 'off'));
});
test('progress transition is short and disabled by reduced motion, polling frequency stays unchanged', () => {
  const css = readFileSync(new URL('../src/results/results.css', import.meta.url), 'utf8');
  assert.match(css, /transition:width 350ms ease-out/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\).*transition:none/);
  const page = readFileSync(new URL('../src/pages/ResultsPage.tsx', import.meta.url), 'utf8');
  assert.match(page, /useResource<PythonJob\s*\|\s*HistoryJob>\(\s*path,\s*5000/);
});
