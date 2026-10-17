import { useEffect, useRef, useState } from 'react';
import { api, ApiError, errorText, type Model } from '../execution/api';
import './market.css';
import { money, time } from '../../shared/format.mjs';

type Query = Model<'ResearchQuery'>;
type Description = Model<'ResearchDescription'>;
type Read = Model<'ResearchRead'>;
type Coverage = Model<'ResearchCoverage'>;
type Security = Query['securities'][number];
type Field = NonNullable<Query['fields']>[number];
const securities: Security[] = ['600000.XSHG', '000001.XSHE'];
const fields: Field[] = ['open', 'high', 'low', 'close', 'volume', 'money'];
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
function Json({ value }: { value: unknown }) { return <pre>{JSON.stringify(value, null, 2)}</pre>; }
function Raw({ title, value, open = false }: { title: string; value: unknown; open?: boolean }) { return <details open={open}><summary>{title} · 后端原文</summary><Json value={value}/></details>; }
function Values({ value }: { value: Record<string, unknown> }) { return <dl className="pairs">{Object.entries(value).map(([key, val]) => <div key={key}><dt>{key}</dt><dd>{typeof val === 'object' ? JSON.stringify(val) : String(val)}</dd></div>)}</dl>; }
function ReadError({ error }: { error?: unknown }) {
  return error ? <div role="alert" className="error"><strong>{errorText(error)}</strong>{error instanceof ApiError && <Values value={{ origin: error.origin ?? '未提供', details: error.details ?? null }}/>}<p>本次读取未成功；拒绝不等于没有数据，前端不补零、不降低要求。</p></div> : null;
}

export function MarketBrowser({ enabled }: { enabled: boolean }) {
  const [aliases, setAliases] = useState<string[]>();
  const [aliasError, setAliasError] = useState<unknown>();
  const [aliasesRevision, setAliasesRevision] = useState(0);
  const [alias, setAlias] = useState('');
  const [dataset, setDataset] = useState('');
  const [selected, setSelected] = useState<Security[]>(securities);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [mode, setMode] = useState<'range' | 'count'>('range');
  const [count, setCount] = useState('2');
  const [wanted, setWanted] = useState<Field[]>(fields);
  const [visibility, setVisibility] = useState<NonNullable<Query['visibility']>>('snapshot');
  const [asOf, setAsOf] = useState('');
  const [adjustment, setAdjustment] = useState<NonNullable<Query['adjustment']>>('none');
  const [requirements, setRequirements] = useState({ require_complete: false, require_fresh: false, require_final: false, require_tradable: false });
  const [description, setDescription] = useState<Description>();
  const [read, setRead] = useState<Read>();
  const [coverage, setCoverage] = useState<Coverage>();
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('rows');
  const generation = useRef(0);
  const requestLock = useRef(false);

  useEffect(() => {
    let live = true;
    setAliasError(undefined); setAliases(undefined);
    api<string[]>('/market/stores').then(value => { if (live) { setAliases(value); setAlias(previous => value.includes(previous) ? previous : value[0] || ''); } }).catch(e => { if (live) setAliasError(e); });
    return () => { live = false; };
  }, [aliasesRevision]);
  useEffect(() => { generation.current++; setDescription(undefined); setRead(undefined); setCoverage(undefined); setError(undefined); setBusy(false); requestLock.current = false; }, [alias, dataset]);
  useEffect(() => () => { generation.current++; }, []);
  function query(): Query {
    return { securities: selected, ...(mode === 'count' ? { count: Number(count) } : { start, end }), fields: wanted, visibility, ...(visibility !== 'snapshot' ? { as_of: asOf } : {}), adjustment, ...requirements };
  }
  async function load(kind: 'description' | 'prices' | 'coverage') {
    if (requestLock.current || !enabled) return;
    requestLock.current = true; setBusy(true); setError(undefined); setRead(undefined); setCoverage(undefined);
    const token = ++generation.current;
    const path = `/market/${encodeURIComponent(alias)}/${encodeURIComponent(dataset)}`;
    try {
      const result = kind === 'description' ? await api<Description>(path) : kind === 'prices' ? await api<Read>(`${path}/prices`, query(), true) : await api<Coverage>(`${path}/coverage`, { securities: selected, start, end }, true);
      if (token !== generation.current) return;
      setDescription(result);
      if (kind === 'prices') { setRead(result as Read); setTab('rows'); }
      if (kind === 'coverage') { setCoverage(result as Coverage); setTab('coverage'); }
    } catch (e) { if (token === generation.current) setError(e); }
    finally { if (token === generation.current) { requestLock.current = false; setBusy(false); } }
  }
  const validIdentity = aliases?.includes(alias) && /^[a-f0-9]{64}$/.test(dataset);
  const priceValid = selected.length > 0 && wanted.length > 0 && (mode === 'count' ? Number.isInteger(Number(count)) && Number(count) >= 1 && Number(count) <= 1000 : !!start && !!end) && (visibility === 'snapshot' || !!asOf);
  const source = record(description?.descriptor).source;
  const blocked = !enabled || busy || !validIdentity;

  return <div className="research-workspace">
    <section className="panel research-query"><div className="section-head"><div><span className="kicker">01 / 只读查询</span><h2>来源日线快照</h2></div><span className="tag">READ ONLY</span></div>
      <p className="notice">公开 API 读取已保存样本。此页不采集、不写入、不补数，也不提交策略运行。</p>
      <ReadError error={aliasError}/>
      {!aliases && !aliasError && <p role="status">正在读取可用 store 别名…</p>}
      {aliases?.length === 0 && <div className="empty">后端未配置研究 store。请按本机启动指引配置已有 store 别名；不需要在浏览器填写文件路径。</div>}
      <button onClick={() => setAliasesRevision(x => x + 1)} disabled={busy}>刷新可用别名</button>
      <fieldset disabled={busy}>
        <label>公开 store 别名<select value={alias} onChange={e => setAlias(e.target.value)}><option value="">请选择已配置别名</option>{aliases?.map(a => <option key={a} value={a}>{a}</option>)}</select></label>
        <label>固定 dataset ID<input value={dataset} maxLength={64} pattern="[a-f0-9]{64}" onChange={e => { setDataset(e.target.value); }}/><small>完整64位ID，不接受 latest 或文件路径。来源身份以 API 响应为准。</small></label>
      </fieldset>
      <button className="wide" onClick={() => void load('description')} disabled={blocked}>读取快照身份</button>
      <fieldset disabled={busy}>
        <div className="checks" role="group" aria-label="证券"><h3>证券</h3>{securities.map(s => <label key={s}><input type="checkbox" checked={selected.includes(s)} onChange={e => setSelected(previous => e.target.checked ? [...previous, s] : previous.filter(x => x !== s))}/>{s}</label>)}</div>
        <label>价格查询范围<select value={mode} onChange={e => setMode(e.target.value as 'range' | 'count')}><option value="range">开始 / 结束日期</option><option value="count">最近 count 行</option></select></label>
        <div className="query-dates"><label>开始日期<input type="date" value={start} onChange={e => setStart(e.target.value)}/></label><label>结束日期<input type="date" value={end} onChange={e => setEnd(e.target.value)}/></label></div>
        {mode === 'count' && <><label>count<input type="number" min={1} max={1000} value={count} onChange={e => setCount(e.target.value)}/></label><small>价格请求只发送 count；上方日期仅用于独立的 coverage 查询。</small></>}
        <div className="checks" role="group" aria-label="请求字段"><h3>请求字段</h3>{fields.map(f => <label key={f}><input type="checkbox" checked={wanted.includes(f)} onChange={e => setWanted(previous => e.target.checked ? [...previous, f] : previous.filter(x => x !== f))}/>{f}</label>)}</div>
        <label>可见性 visibility<select value={visibility} onChange={e => setVisibility(e.target.value as NonNullable<Query['visibility']>)}><option value="snapshot">snapshot · 无历史时钟</option><option value="assumed">assumed · 假定可见</option><option value="received">received · 接收记录</option><option value="verified">verified · 严格PIT要求（当前拒绝）</option></select></label>
        {visibility !== 'snapshot' && <label>as_of（必须含时区）<input value={asOf} onChange={e => setAsOf(e.target.value)} placeholder="2020-01-08T00:00:00+08:00"/><small>原样交给后端；不把 assumed 转成 verified。</small></label>}
        <details><summary>质量 / 复权要求 · 缺失保证时后端将拒绝</summary>
          <label>复权 adjustment<select value={adjustment} onChange={e => setAdjustment(e.target.value as NonNullable<Query['adjustment']>)}><option value="none">none</option><option value="pre">pre（当前拒绝）</option><option value="post">post（当前拒绝）</option></select></label>
          <div className="checks">{(Object.keys(requirements) as (keyof typeof requirements)[]).map(key => <label key={key}><input type="checkbox" checked={requirements[key]} onChange={e => setRequirements(previous => ({ ...previous, [key]: e.target.checked }))}/>{key}</label>)}</div>
        </details>
      </fieldset>
      <div className="toolbar"><button className="primary" onClick={() => void load('prices')} disabled={blocked || !priceValid}>{busy ? '正在读取…' : '读取日线'}</button><button onClick={() => void load('coverage')} disabled={blocked || !selected.length || !start || !end}>读取覆盖报告</button></div>
      {!enabled && <small>本机 API 已连接且固定契约匹配后可读取。</small>}
    </section>
    <section className="panel research-result"><div className="section-head"><div><span className="kicker">02 / API 原始结果</span><h2>行情快照与查询范围</h2></div><span className="tag">execution=false</span></div>
      <div className="notice"><strong>只读查询</strong><br/>来源、覆盖范围与限制以本次后端响应为准。查询成功不代表行情真值、PIT、最终性或可交易性已验证。</div>
      <ReadError error={error}/>
      {busy && <p className="empty" role="status">正在通过后端公开 API 读取；不访问浏览器文件系统或私有数据。</p>}
      {!description && !busy && !error && <div className="empty">选择已保存快照，读取身份、日线或覆盖报告。这里不会显示预填行情。</div>}
      {description && <>
        <Values value={{ dataset_id: description.dataset_id, source: source ?? '后端未提供', scope: description.scope, admission: description.data_owner?.admission ?? '未提供', backend_execution_permission: description.backend_execution_permission, source_range: record(description.descriptor).scope ?? '后端未提供' }}/>
        <div className="tabs" role="tablist" aria-label="数据响应">{[['rows','日线行'],['quality','质量与来源'],['coverage','覆盖报告'],['identity','身份 / 描述符']].map(([value,label]) => <button role="tab" aria-selected={tab === value} key={value} onClick={() => setTab(value)}>{label}</button>)}</div>
        <div role="tabpanel">
          {tab === 'rows' && (read ? <>
            <p className="notice">{read.rows.length} 行 · 读取完成 {time(read.read_completed_at)}。源标签时区 {read.source_timezone}；source_label_at 不是经认证的 bar_end 或历史发布时间。金额原样显示；null 为“未请求 / 未提供”，不补零。</p>
            <Raw title="本次实际查询" value={read.query}/>
            {read.rows.length ? <div className="table-scroll"><table aria-label="来源日线"><thead><tr>{['证券','源日期','源标签 +08:00','open CNY','high CNY','low CNY','close CNY','volume 股','money CNY'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{read.rows.map((row,i) => <tr key={`${row.security}-${row.source_date}-${i}`}><td>{row.security}</td><td>{row.source_date}</td><td>{row.source_label_at}</td>{(['open','high','low','close'] as const).map(f => <td key={f}>{row[f] == null ? '—' : money(row[f])}</td>)}<td>{row.volume ?? '—'}</td><td>{row.money == null ? '—' : money(row.money)}</td></tr>)}</tbody></table></div> : <div className="empty">本次公开查询返回 0 行；不据此推导质量或完整性。</div>}
            <Raw title="完整读取响应（含 report）" value={read}/>
          </> : <div className="empty">本次操作尚未返回日线行。点击“读取日线”取得真实 API 结果。</div>)}
          {tab === 'quality' && <><p className="notice">保留来源的事实、未知项与拒绝。前端不生成质量评分或认证结论。</p><Raw title="quality" value={description.quality} open/><Raw title="lineage" value={description.lineage}/>{read && <Raw title="report" value={read.report}/>}</>}
          {tab === 'coverage' && (coverage ? <><Raw title="实际覆盖查询" value={coverage.query} open/><Raw title="按证券 coverage" value={coverage.coverage} open/></> : <div className="empty">尚无本次 coverage 结果。覆盖查询独立发送证券和开始/结束日期。</div>)}
          {tab === 'identity' && <><Raw title="data_owner" value={description.data_owner} open/><Raw title="descriptor" value={description.descriptor} open/><Raw title="完整身份响应" value={description}/></>}
        </div>
      </>}
    </section>
  </div>;
}
