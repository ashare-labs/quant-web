import type { Draft } from './model';
import { compatible } from './model';
import type { Factor, Source } from './api';
export function FactorForm({ factor, sources, draft, edit, evaluationAvailable }: {
  factor: Factor;
  sources: Source[];
  draft: Draft;
  edit: (d: Partial<Draft>) => void;
  evaluationAvailable: boolean;
}) {
  const source = sources.find(s => s.id === draft.source);
  return <>
    <div className="form-grid">
      <label className="full">真实数据来源<select required value={draft.source} onChange={e => edit({
        source: e.target.value,
        securities: '',
        history: '',
        start: '',
        end: '',
        labelEnd: ''
      })}>
        <option value="">请选择来源</option>
        {sources.map(s => <option key={s.id} value={s.id} disabled={!compatible(s, factor)}>
          {s.label}
          {!s.ready ? ' · 不可用' : !compatible(s, factor) ? ' · 不支持此因子' : ''}
        </option>)}
      </select></label>
      {source && <p className="note full">覆盖 {source.first || '未知'} — {source.last || '未知'} · {source.total_securities} 只证券 · {source.error || source.fields.join('、')}</p>}
      <label className="full">证券范围<textarea required aria-label="因子证券范围" placeholder="填写证券代码，以逗号或空格分隔" value={draft.securities} onChange={e => edit({ securities: e.target.value })} /></label>
      <label>历史起点<input type="date" required value={draft.history} onChange={e => edit({ history: e.target.value })} /></label>
      <label>信号开始<input type="date" required value={draft.start} onChange={e => edit({ start: e.target.value })} /></label>
      <label>信号结束<input type="date" required value={draft.end} onChange={e => edit({ end: e.target.value })} /></label>
      {factor.parameters.map(p => <label key={p.name}>
        {p.label}
        <input type="number" required={p.required} min={p.minimum} max={p.maximum} step={p.kind === 'integer' ? 1 : 'any'} value={draft.parameters[p.name] || ''} onChange={e => edit({ parameters: { ...draft.parameters, [p.name]: e.target.value } })} />
      </label>)}
      <label>截面排名<select value={draft.rank} onChange={e => edit({ rank: e.target.value as Draft['rank'] })}>
        <option value="strict">严格完整截面</option>
        <option value="available">仅可用成员</option>
      </select></label>
    </div>
    <label className="checkbox-label"><input type="checkbox" checked={draft.evaluate} disabled={!evaluationAvailable} onChange={e => edit({ evaluate: e.target.checked })} />同时进行单因子评价{!evaluationAvailable && '（服务未安装评价依赖）'}</label>
    {draft.evaluate && <div className="form-grid">
      <label>标签结束日期<input type="date" required value={draft.labelEnd} onChange={e => edit({ labelEnd: e.target.value })} /></label>
      <label>观察期（交易日）<input value={draft.horizons} onChange={e => edit({ horizons: e.target.value })} /></label>
      <label>分位组数<input type="number" min="2" max="20" value={draft.quantiles} onChange={e => edit({ quantiles: e.target.value })} /></label>
      <label>信号滞后（交易日）<input type="number" min="1" value={draft.lag} onChange={e => edit({ lag: e.target.value })} /></label>
      <label>最少有效股票<input type="number" min="2" value={draft.minAssets} onChange={e => edit({ minAssets: e.target.value })} /></label>
      <label>因子方向<select value={draft.direction} onChange={e => edit({ direction: e.target.value as Draft['direction'] })}>
        <option value="1">正向</option>
        <option value="-1">反向</option>
      </select></label>
      <label>单边成本情景（bp）<input value={draft.costs} onChange={e => edit({ costs: e.target.value })} /></label>
      <label>滚动窗口（交易日）<input type="number" min="2" value={draft.rolling} onChange={e => edit({ rolling: e.target.value })} /></label>
    </div>}
    <p className="note">当前范围由你明确填写。预热不足和缺失输入会保留原因，不补零。</p>
  </>;
}
