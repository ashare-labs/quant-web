// Exercise the actual TSX event handlers with isolated hooks, storage and HTTP.
// Child views are shallow stubs: these tests do not claim DOM or browser QA.
import test, {afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setImmediate as nextTurn} from 'node:timers/promises';
import ts from 'typescript';
import {editProjectDraft, openProjectDraft, readProjectDraft} from '../src/strategies/project-state.ts';
import {readProject} from '../src/strategies/project-api.ts';

const modules = {};
for (const [name, path] of Object.entries({
  '../shared/api': 'shared/api', '../shared/drafts': 'shared/drafts', '../shared/dates': 'shared/dates',
  '../shared/strategy-files': 'shared/strategy-files', '../shared/strategy-path': 'shared/strategy-path',
  '../backtests/history-model': 'backtests/history-model', '../backtests/submission': 'backtests/submission',
  './project-api': 'strategies/project-api', './project-model': 'strategies/project-model', './project-state': 'strategies/project-state',
})) modules[name] = await import(new URL('../src/' + path + '.ts', import.meta.url));
const stub = name => ({[name]: Object.defineProperty(() => null, 'name', {value: name})});
Object.assign(modules, {'../shared/CapitalInput': stub('CapitalInput'), './CodeEditor': stub('CodeEditor'), './ProjectFiles': stub('ProjectFiles')});
const catalogue = {environment_id: 'c'.repeat(64), external_securities_required: false, universe: 'strategy_subscription'};
modules['../shared/ui'] = {...stub('Modal'), ...stub('ErrorNotice'), useResource: () => ({data: catalogue, error: '', refresh() {}})};

let runtime;
const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
modules.react = {
  useState(initial) {
    const r = runtime, i = r.index++;
    if (!(i in r.slots)) r.slots[i] = typeof initial === 'function' ? initial() : initial;
    return [r.slots[i], value => {r.slots[i] = typeof value === 'function' ? value(r.slots[i]) : value; r.dirty = true;}];
  },
  useRef(initial) {const r = runtime, i = r.index++; return r.slots[i] ??= {current: initial};},
  useEffect(effect, deps) {
    const r = runtime, i = r.index++;
    if (!same(r.slots[i], deps)) {r.slots[i] = deps; r.effects.push(() => {r.cleanup[i]?.(); r.cleanup[i] = effect();});}
  },
};
const jsx = (type, props, key) => ({type, props, key});
modules['react/jsx-runtime'] = {jsx, jsxs: jsx, Fragment: 'fragment'};
const compiled = ts.transpileModule(readFileSync(new URL('../src/strategies/ProjectEditor.tsx', import.meta.url), 'utf8'), {
  compilerOptions: {jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText;
const product = {exports: {}};
new Function('require', 'module', 'exports', compiled)(name => {assert(name in modules, name); return modules[name];}, product, product.exports);
const {ProjectEditor} = product.exports;

const original = new Map(['window', 'history', 'location', 'localStorage', 'fetch', 'setInterval', 'clearInterval'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const mounted = new Set();
function unmount(r) {for (const cleanup of r.cleanup) cleanup?.(); mounted.delete(r);}
afterEach(() => {
  for (const r of mounted) unmount(r);
  for (const [key, descriptor] of original) {if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];}
});

const id = 'aqproj-' + 'a'.repeat(32), key = 'quantweb-project-draft-v1:' + id;
const r0 = '0'.repeat(64), r1 = '1'.repeat(64), r2 = '2'.repeat(64);
const baseline = {path: '分类/项目', strategy_id: id, entrypoint: 'main.py', revision: r0,
  files: {'main.py': 'def initialize(context): pass\n', 'helper.py': 'VALUE = 0\n', 'signals/weight.py': 'WEIGHT = 1\n'}};
const local = editProjectDraft(openProjectDraft(baseline).draft, {files: {...baseline.files, 'helper.py': 'VALUE = 10 # local\n'}});
const external = {...baseline, revision: r1, files: {...baseline.files, 'helper.py': 'VALUE = 20 # other editor\n'}};
const clone = value => structuredClone(value);

function setup({remote = baseline, stored} = {}) {
  let current = clone(remote), quota = false;
  const records = new Map(stored ? [[key, JSON.stringify(stored)]] : []), calls = [], listeners = new Map();
  const s = {records, calls, putMode: 'success', moveMode: 'success', afterSave() {},
    current: () => clone(current), replaceRemote: value => {current = clone(value);},
    failStorage: () => {quota = true;}, recoverStorage: () => {quota = false;},
    beforeUnload() {
      const event = {prevented: false, preventDefault() {this.prevented = true;}};
      for (const listener of listeners.get('beforeunload') || []) listener(event);
      return event.prevented;
    },
  };
  globalThis.window = {addEventListener(name, callback) {if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback);}, removeEventListener(name, callback) {listeners.get(name)?.delete(callback);}};
  globalThis.history = {replaceState() {}};
  globalThis.location = {assign() {assert.fail('Unexpected navigation');}};
  globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
  globalThis.localStorage = {getItem: name => records.get(name) ?? null, setItem(name, value) {if (quota) throw new DOMException('test storage full', 'QuotaExceededError'); records.set(name, value);}, removeItem: name => records.delete(name)};
  globalThis.fetch = async (url, options) => {
    const body = options.body && JSON.parse(options.body);
    calls.push({url, method: options.method, body});
    if (options.method === 'GET') return Response.json(current);
    if (body.expected_revision !== current.revision) return Response.json({error: {code: 'STRATEGY_PROJECT_REVISION_CONFLICT', message: '服务版本已变化'}}, {status: 409});
    if (url.endsWith('/move')) {
      current = {...current, path: body.destination};
      if (s.moveMode === 'lost') throw Error('response lost after move');
      return Response.json(current);
    }
    assert.equal(options.method, 'PUT');
    if (s.putMode === 'network') throw Error('offline before write');
    current = {...current, entrypoint: body.entrypoint, files: body.files, revision: r2};
    s.afterSave();
    if (s.putMode === 'lost') throw Error('response lost after write');
    return Response.json(current);
  };
  return s;
}
function mount() {const r = {slots: [], effects: [], cleanup: [], index: 0, tree: null, dirty: true}; mounted.add(r); return r;}
async function settle(r) {
  for (let i = 0; i < 8; i++) {
    if (r.dirty) {runtime = r; r.index = 0; r.dirty = false; r.tree = ProjectEditor({identity: id}); for (const effect of r.effects.splice(0)) effect();}
    await nextTurn();
  }
  assert.equal(r.dirty, false, 'component did not settle');
}
function nodes(value, out = []) {
  if (Array.isArray(value)) value.forEach(item => nodes(item, out));
  else if (value && typeof value === 'object' && value.props) {out.push(value); nodes(value.props.children, out);}
  return out;
}
function text(value) {return typeof value === 'string' ? value : Array.isArray(value) ? value.map(text).join('') : value?.props ? text(value.props.children) : '';}
function node(r, predicate) {const found = nodes(r.tree).find(predicate); assert(found, 'Required component node missing'); return found;}
const button = (r, label) => node(r, n => n.type === 'button' && text(n) === label);
const view = (r, name) => node(r, n => n.type?.name === name);
const status = r => text(node(r, n => n.props.className === 'note' && n.props.role === 'status'));
const notice = r => nodes(r.tree).filter(n => n.type?.name === 'ErrorNotice').map(n => n.props.message).join(' ');
const writes = s => s.calls.filter(call => call.method === 'PUT');
async function click(r, label) {button(r, label).props.onClick(); await settle(r);}
async function edit(r, path, value) {view(r, 'ProjectFiles').props.onSelect(path); await settle(r); view(r, 'CodeEditor').props.onChange(value); await settle(r);}
async function editAll(r) {
  const files = {...baseline.files, 'main.py': 'from .helper import VALUE\n', 'helper.py': 'VALUE = 99\n', 'signals/weight.py': 'WEIGHT = 7\n'};
  for (const [path, value] of Object.entries(files)) await edit(r, path, value);
  view(r, 'ProjectFiles').props.onEntry('signals/weight.py');
  view(r, 'CapitalInput').props.onChange('250000');
  await settle(r);
  return {files, entrypoint: 'signals/weight.py'};
}
async function move(r) {
  const control = node(r, n => n.props['aria-label'] === '改名或移动策略项目');
  assert.equal(control.props.disabled, false); control.props.onClick(); await settle(r);
  node(r, n => n.type === 'input' && n.props.placeholder === '分类/项目名称').props.onChange({target: {value: '分类/新名'}}); await settle(r);
  node(r, n => n.type === 'form').props.onSubmit({preventDefault() {}}); await settle(r);
}
async function refresh(r) {unmount(r); const reopened = mount(); await settle(reopened); return reopened;}

test('component saves every edited file and entry, independent of incomplete run dates', async () => {
  const s = setup(), r = mount(); await settle(r); const edited = await editAll(r);
  await click(r, '保存');
  assert.equal(writes(s).length, 1); assert.deepEqual(writes(s)[0].body.files, edited.files);
  assert.equal(writes(s)[0].body.entrypoint, edited.entrypoint);
  assert.deepEqual((await readProject(id)).files, edited.files);
  assert.equal(readProjectDraft(id).workingCopy, false); assert.equal(s.beforeUnload(), false);
});

for (const outcome of ['success', 'lost']) test(`unresolved source conflict survives ${outcome} move and refresh until explicit acceptance`, async () => {
  const s = setup({remote: external, stored: local}); s.moveMode = outcome;
  let r = mount(); await settle(r);
  assert.equal(button(r, '保存').props.disabled, true);
  await move(r);
  assert.equal(readProjectDraft(id).path, '分类/新名');
  assert.equal(readProjectDraft(id).revision, r0);
  assert.equal(readProjectDraft(id).files['helper.py'], local.files['helper.py']);
  r = await refresh(r);
  assert.equal(button(r, '保存').props.disabled, true);
  await click(r, '保存'); // Guard the handler as well as the disabled button.
  assert.equal(writes(s).length, 0); assert.deepEqual(s.current().files, external.files);
  await click(r, '核对服务版本'); await click(r, '保留当前编辑，允许覆盖差异');
  assert.equal(button(r, '保存').props.disabled, false);
  await click(r, '保存');
  assert.equal(writes(s)[0].body.expected_revision, r1);
  assert.equal(writes(s)[0].body.path, '分类/新名'); assert.deepEqual(s.current().files, local.files);
});

test('ordinary move preserves the unsaved source baseline and remains saveable after refresh', async () => {
  const s = setup({stored: local}); let r = mount(); await settle(r); await move(r);
  assert.equal(readProjectDraft(id).revision, r0); r = await refresh(r);
  assert.equal(button(r, '保存').props.disabled, false); await click(r, '保存');
  assert.equal(writes(s)[0].body.path, '分类/新名'); assert.deepEqual(s.current().files, local.files);
});

for (const failure of ['quota', 'corrupt']) {
  test(`${failure} browser storage cannot block explicit complete-project disk save`, async () => {
    const s = setup({stored: openProjectDraft(baseline).draft});
    if (failure === 'corrupt') s.records.set(key, '{broken draft');
    const originalRecord = s.records.get(key), r = mount(); await settle(r); if (failure === 'quota') s.failStorage();
    const edited = await editAll(r); assert.equal(s.beforeUnload(), true);
    await click(r, '保存');
    assert.equal(writes(s).length, 1);
    const saved = await readProject(id); assert.deepEqual(saved.files, edited.files); assert.equal(saved.entrypoint, edited.entrypoint);
    assert.equal(s.records.get(key), originalRecord); assert.equal(s.beforeUnload(), true);
    assert.equal(view(r, 'CapitalInput').props.value, '250000'); assert.doesNotMatch(status(r), /未保存/);
    assert.match(notice(r), /源码已保存到服务/); assert.match(notice(r), /浏览器未能保留.*回测参数/);
  });

  for (const failureMode of ['network', 'conflict']) test(`${failure} storage plus ${failureMode} save failure preserves memory and the old record; explicit retry works`, async () => {
    const s = setup({stored: openProjectDraft(baseline).draft});
    if (failure === 'corrupt') s.records.set(key, '{broken draft');
    const originalRecord = s.records.get(key), r = mount(); await settle(r); if (failure === 'quota') s.failStorage();
    const edited = await editAll(r);
    if (failureMode === 'network') s.putMode = 'network'; else s.replaceRemote(external);
    await click(r, '保存');
    assert.equal(writes(s).length, 1); assert.deepEqual(view(r, 'ProjectFiles').props.files, edited.files);
    assert.deepEqual(s.current().files, failureMode === 'network' ? baseline.files : external.files);
    assert.equal(s.records.get(key), originalRecord); assert.equal(s.beforeUnload(), true);
    assert.match(status(r), /未保存/); assert.doesNotMatch(notice(r), /源码已保存到服务/);
    assert.match(notice(r), failureMode === 'network' ? /尚未确认/ : /服务版本已变化/);
    if (failureMode === 'network') s.putMode = 'success';
    else {
      assert.equal(button(r, '保存').props.disabled, true);
      await click(r, '核对服务版本'); await click(r, '保留当前编辑，允许覆盖差异');
      assert.equal(button(r, '保存').props.disabled, false);
    }
    await click(r, '保存');
    assert.equal(writes(s).length, 2); assert.deepEqual((await readProject(id)).files, edited.files);
    assert.equal(s.records.get(key), originalRecord); assert.match(notice(r), /源码已保存到服务/);
    assert.equal(s.beforeUnload(), true);
  });
}

test('browser failure after server acknowledgment reports saved source and retains the prior recoverable record', async () => {
  const s = setup(), r = mount(); await settle(r); const edited = await editAll(r);
  s.afterSave = s.failStorage; await click(r, '保存');
  const oldRecord = s.records.get(key);
  assert.equal(writes(s).length, 1); assert.deepEqual((await readProject(id)).files, edited.files);
  assert.equal(readProjectDraft(id).workingCopy, true); assert.doesNotMatch(status(r), /未保存/);
  assert.match(notice(r), /源码已保存到服务/); assert.equal(s.beforeUnload(), true);
  s.recoverStorage(); s.afterSave = () => {}; await click(r, '保存');
  assert.notEqual(s.records.get(key), oldRecord); assert.equal(readProjectDraft(id).workingCopy, false);
  assert.equal(readProjectDraft(id).capital, '250000'); assert.equal(notice(r), ''); assert.equal(s.beforeUnload(), false);
});

test('lost save response with full browser storage keeps uncertainty and permits an explicit retry after readback', async () => {
  const s = setup({stored: openProjectDraft(baseline).draft}), originalRecord = s.records.get(key), r = mount();
  await settle(r); s.failStorage(); const edited = await editAll(r); s.putMode = 'lost';
  await click(r, '保存');
  assert.equal(writes(s).length, 1); assert.deepEqual(s.current().files, edited.files);
  assert.equal(s.calls.filter(call => call.method === 'GET').length, 2);
  assert.deepEqual(view(r, 'ProjectFiles').props.files, edited.files); assert.match(status(r), /未保存/);
  assert.match(notice(r), /保存结果尚未确认/); assert.doesNotMatch(notice(r), /源码已保存到服务/);
  assert.equal(s.records.get(key), originalRecord); assert.equal(s.beforeUnload(), true);
  s.putMode = 'success'; await click(r, '保存');
  assert.equal(writes(s)[1].body.expected_revision, r2); assert.match(notice(r), /源码已保存到服务/);
});

test('explicitly adopting the service version works in memory when browser retention fails', async () => {
  const s = setup({remote: external, stored: local}), originalRecord = s.records.get(key), r = mount();
  await settle(r); s.failStorage(); await click(r, '核对服务版本'); await click(r, '载入服务版本');
  assert.deepEqual(view(r, 'ProjectFiles').props.files, external.files);
  assert.equal(button(r, '保存').props.disabled, false); assert.equal(s.beforeUnload(), true);
  assert.equal(s.records.get(key), originalRecord);
  await edit(r, 'main.py', '# edit based on accepted service version\n'); await click(r, '保存');
  assert.equal(writes(s)[0].body.expected_revision, r1);
  assert.equal(s.current().files['helper.py'], external.files['helper.py']);
});

test('retention failure still prevents navigation into an untracked backtest', async () => {
  const s = setup(), r = mount(); await settle(r); s.failStorage(); await editAll(r);
  await click(r, '开始回测');
  assert.equal(s.calls.filter(call => call.method !== 'GET').length, 0);
  assert.equal(s.beforeUnload(), true); assert.match(notice(r), /浏览器未能保留/);
});
