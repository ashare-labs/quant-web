import { useState } from 'react';
import { num, object, rows, type Row } from '../shared/api';
import { DataTable } from '../shared/DataTable';
import { Empty, ErrorNotice, JsonDetails, Modal, Tabs, useResource } from '../shared/ui';
export function SimulationsPage() {
  const [tab, setTab] = useState('全部');
  const [selected, setSelected] = useState<string | null>(null);
  const list = useResource<{
    sessions: Row[];
  }>('/sessions', 0, true);
  const cap = useResource<Row>('/capabilities', 0, true);
  const view = useResource<Row>(selected
    ? '/sessions/' + encodeURIComponent(selected) + '/view'
    : null, 0, true);
  const sessions = (list.data?.sessions
    || []).filter(s => tab === '全部'
      || (tab === '已暂停'
        ? Boolean(s.paused)
        : !s.paused));
  return <main>
    <div className="titlebar">
      <h1>模拟策略列表</h1>
      <button className="primary" disabled title="当前服务仅提供历史会话读取">新建模拟策略</button>
    </div>
    <Tabs values={['全部', '未暂停记录', '已暂停']} selected={tab} onChange={setTab} />
    <div className="notice">模拟会话当前仅支持历史查看，创建、推进、暂停和恢复暂不可用。未暂停记录不代表正在运行。</div>
    <ErrorNotice message={list.error || cap.error} retry={() => {
      list.refresh();
      cap.refresh();
    }} />
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th>名称 / 账户</th>
            <th>历史状态</th>
            <th>最后交易日</th>
            <th>初始资金</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map(s => <tr key={String(s.id)}>
            <td>
              {String(object(s.config).name || s.account_id || s.id)}
            </td>
            <td>
              <span className="badge">
                {s.paused ? '已暂停 · 只读' : '未暂停 · 只读'}
              </span>
            </td>
            <td>
              {String(s.last_day || '—')}
            </td>
            <td>
              {num(object(s.config).initial_cash)}
            </td>
            <td>
              <button onClick={() => setSelected(String(s.id))}>查看记录</button>
            </td>
          </tr>)}
        </tbody>
      </table>
    </div>
    {list.loading
      ? <Empty>正在读取模拟会话…</Empty>
      : !list.error
      && !sessions.length
      && <Empty>没有匹配的模拟会话。</Empty>}
    <div className="pagination">
      <span className="note">当前 {sessions.length} 项</span>
      <button onClick={list.refresh}>刷新</button>
    </div>
    {selected && <Modal title="模拟历史记录" close={() => setSelected(null)} wide>
      <ErrorNotice message={view.error} retry={view.refresh} />
      {view.loading ? <Empty>正在读取历史记录…</Empty> : view.data && <>
        <p>最后交易日：{String(view.data.last_day || '—')}</p>
        <DataTable name="每日状态" data={rows(view.data.days)} columns={[
          {
            key: 'day',
            label: '日期'
          },
          {
            key: 'status',
            label: '状态'
          },
          {
            key: 'error',
            label: '原因'
          }
        ]} />
        <JsonDetails title="账户与历史报告" value={view.data} />
      </>}
    </Modal>}
  </main>;
}
