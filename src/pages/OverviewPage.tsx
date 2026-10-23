import { useResource } from '../shared/ui';
export function OverviewPage() {
  const service = useResource<{backend_version: string}>('/health');
  return <main><h1>量化研究工作区</h1><p className="scope">编写策略、查看回测，探索真实数据中的因子。</p>
    <div className="tablewrap"><table className="overview-table"><tbody>
      <tr><td><a href="strategies.html">策略回测 <i className="fa fa-long-arrow-right" aria-hidden="true"/></a></td><td>策略列表、Python 代码编辑、回测配置与历史结果</td></tr>
      <tr><td><a href="simulations.html">模拟交易 <i className="fa fa-long-arrow-right" aria-hidden="true"/></a></td><td>查看既有模拟会话、运行状态与历史报告</td></tr>
      <tr><td><a href="factors.html">因子看板 <i className="fa fa-long-arrow-right" aria-hidden="true"/></a></td><td>查询因子定义，使用真实数据计算与评价</td></tr>
    </tbody></table></div>
    <p className="scope" role="status">{service.loading ? '正在连接研究服务…' : service.error ? '研究服务暂未连接。本地策略编辑与保存仍可使用。' : service.data ? '研究服务已连接' : ''}</p>
  </main>;
}
