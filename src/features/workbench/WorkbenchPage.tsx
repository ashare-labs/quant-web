import { useEffect, useState } from 'react';
import { StrategyEditor } from '../strategies/StrategyEditor';
import { active, phaseText } from './api';
import { download } from './draft';
import { PythonResults } from './PythonResults';
import { useWorkbench } from './useWorkbench';
import './workbench.css';

export function WorkbenchPage({ route }: { route: string }) {
  const w = useWorkbench(route), [accepted, setAccepted] = useState(false);
  const locked = !w.catalogue || w.busy || active(w.job) || !!w.pending;
  useEffect(() => {
    if (w.job?.job_id) document.getElementById('python-progress')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [w.job?.job_id]);
  return <main className="wb"><div className="wb-heading"><div><p className="wb-eyebrow">A宽 · 策略研究</p><h1>Python 策略工作台</h1><p>写下策略，配置股票池和日期，系统准备真实数据并运行回测。</p></div>
    <a href="#/portfolio">日频内置示例 →</a></div>
    <div className="wb-capability"><strong>自定义 Python · 分钟回测</strong><span>在本次股票池内动态选股、查询已可见分钟线、提交模拟委托。</span><details><summary>支持范围与 API</summary>
      <p>initialize(context)、before_trading_start、handle_data、after_trading_end、run_daily；可用 history、attribute_history、get_price、get_bars、get_current_data、order_target / order_value、record、log。通过 context.parameters 读取参数，通过 context.securities 读取本次股票池。</p>
      <p>当前网页每次最多 8 股、23 个交易日及 20,000 根分钟线；需要已知时段和必要参考数据。确认坏 bar 的时刻保留为 NaN，策略需显式处理；来源未知缺口会报出具体位置。股票池在提交时固定，暂不支持全市场扫描、财务选股或任意频率。历史价格接口请显式传入 fq=None（原价）。模型要求策略在结束日收盘前自行平仓，T+1 仍有效。日频内置策略使用另一个现有入口；受限日频 Python 属于固定窗口功能。</p>
      <p>数据按来源分钟标签作收盘可见模型，下一分钟开盘撮合；日级状态回放、5%/10% 限价模型、来源范围公司行动并非完整历史 PIT。只运行你信任的本机代码；独立进程有网络及资源限制，但不是恶意代码沙箱。</p>
    </details></div>
    {w.error && <div className="error" role="alert"><strong>操作未完成</strong><p>{w.error}</p>{w.detail != null && <details><summary>具体缺口 / 错误位置</summary><pre>{JSON.stringify(w.detail, null, 2)}</pre></details>}</div>}
    {w.pending && <div className="attempt"><p>上次提交尚未确认。草稿已保留，先确认原请求可避免重复运行。</p><button disabled={w.busy} onClick={() => void w.run(true)}>确认原请求</button></div>}
    <div className="wb-layout"><section className="panel wb-code"><div className="wb-toolbar"><h2>1 · 编写策略</h2><div className="wb-actions"><button disabled={!w.catalogue} onClick={w.restoreExample}>载入 Python 示例</button><label className="wb-file">导入 .py<input aria-label="导入 Python 文件" type="file" accept=".py" onChange={e => { void w.importFile(e.target.files?.[0]); e.target.value = ''; }}/></label><button disabled={!w.draft.source} onClick={() => download(w.draft.name + '.py', w.draft.source)}>下载代码</button></div></div>
      <label>策略名称<input value={w.draft.name} onChange={e => w.edit({ name: e.target.value })} maxLength={80}/></label>
      {!w.draft.source && <p className="wb-hint">从示例开始，或直接在下面编写 / 导入已有 Python 文件。</p>}
      <StrategyEditor value={w.draft.source} onChange={source => w.edit({ source })} onSave={() => download(w.draft.name + '.py', w.draft.source)}/><small role="status">{w.saved} · 已提交运行始终使用提交时的代码</small>
    </section>
    <section className="panel wb-settings"><h2>2 · 配置回测</h2><label>股票池<input value={w.draft.securities} onChange={e => w.edit({ securities: e.target.value })}/></label><small>使用交易所后缀，例如 000001.XSHE；多股用逗号分隔。</small>
      <div className="wb-dates"><label>开始日期<input type="date" value={w.draft.start} onChange={e => w.edit({ start: e.target.value })}/></label><label>结束日期<input type="date" value={w.draft.end} onChange={e => w.edit({ end: e.target.value })}/></label></div>
      <label>初始资金（元）<input type="number" min="1" value={w.draft.cash} onChange={e => w.edit({ cash: e.target.value })}/></label>
      <label>策略参数（JSON）<textarea rows={5} value={w.draft.parameters} onChange={e => w.edit({ parameters: e.target.value })} spellCheck={false}/></label>
      <p className="wb-hint">系统自动冻结当前正式发布、检查分钟覆盖和参考数据。缺口会显示具体证券、日期或字段，无需先手动发布数据。</p>
      <p className="wb-hint">研究模型：分钟标签按收盘解释、日状态回放、下一分钟撮合。策略需在结束前自行平仓；不保证完整历史可见性。</p>
      <label className="wb-check"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)}/><span>我信任这份本机 Python 代码，并接受上述回溯研究模型。</span></label>
      <button className="primary wide" disabled={locked || !accepted || !w.draft.source} onClick={() => void w.run()}>{w.busy ? "正在提交…" : active(w.job) ? (phaseText[w.job?.phase || "running"] || "运行中") : "准备数据并回测"}</button>
      {w.job && <button className="wide" onClick={() => document.getElementById("python-progress")?.scrollIntoView({ behavior: "smooth" })}>查看本次进度与结果</button>}
      <p className="wb-hint">每次使用新模拟资金，不连接你的账户。开始后可以离开页面，返回查看同一任务。</p>
    </section></div>
    {w.job && <section id="python-progress" className="panel wb-progress" aria-label="运行状态"><div className="wb-toolbar"><div><h2>3 · {phaseText[w.job.phase] || w.job.phase}</h2><p>{w.job.request.name} · {w.job.request.start_date} 至 {w.job.request.end_date}</p></div>{active(w.job) && <button disabled={w.busy || w.job.status === 'cancelling'} onClick={() => void w.cancel()}>取消运行</button>}</div>
      <ol className="wb-steps"><li>提交代码和配置</li><li className={w.job.phase === 'preparing' ? 'current' : ''}>准备数据</li><li className={w.job.phase === 'executing' ? 'current' : ''}>运行策略</li><li>生成结果</li></ol>
      {w.job.error && <div role="alert" className="error"><p>{String(w.job.error.message || '运行未完成')}</p><p>修改策略或缩小日期 / 股票池后，可明确发起一次新回测。失败运行不会作为成功结果展示。</p><details><summary>错误详情与定位</summary><pre>{JSON.stringify(w.job.error, null, 2)}</pre></details></div>}
      {w.job.status === 'cancelled' && <p>本次计算已停止。代码与配置仍保留；不会自动重跑。</p>}
      <details><summary>本次已提交的代码与参数</summary><p>这是已冻结的运行输入，与上方当前草稿分开保存。</p><pre>{w.job.request.source}</pre><pre>{JSON.stringify({ parameters: w.job.request.parameters, securities: w.job.request.securities, initial_cash: w.job.request.initial_cash }, null, 2)}</pre><button onClick={() => download(w.job!.request.name + '-submitted.py', w.job!.request.source)}>下载本次源码</button></details>
      <details><summary>任务日志</summary><pre>{JSON.stringify(w.logs?.items || [], null, 2)}</pre></details>
    </section>}
    {w.result && <PythonResults result={w.result}/>}
    <section className="panel"><h2>最近的 Python 回测</h2>{w.jobs.length ? <div className="wb-history">{w.jobs.map(j => <a key={j.job_id} href={'#/workbench/' + j.job_id}><strong>{j.request.name}</strong><span>{j.request.start_date} — {j.request.end_date}</span><span>{phaseText[j.status] || j.status}</span></a>)}</div> : <p>还没有运行记录。载入示例、检查参数，然后开始第一次回测。</p>}</section>
  </main>;
}
