import { lazy, Suspense } from 'react';
import { useHashRoute } from './useHashRoute';
import { version } from '../../package.json';

const WorkbenchPage = lazy(() => import('../features/workbench/WorkbenchPage').then(m => ({ default: m.WorkbenchPage })));
const FactorsPage = lazy(() => import('../features/factors/FactorsPage').then(m => ({ default: m.FactorsPage })));
const PortfolioPage = lazy(() => import('../features/portfolio/PortfolioPage').then(m => ({ default: m.PortfolioPage })));
const TasksPage = lazy(() => import('../features/tasks/TasksPage').then(m => ({ default: m.TasksPage })));
const PaperPage = lazy(() => import('../features/paper/PaperPage').then(m => ({ default: m.PaperPage })));
const ExecutionPage = lazy(() => import('../features/execution/ExecutionPage').then(m => ({ default: m.ExecutionPage })));
const MarketPage = lazy(() => import('../features/market/MarketPage').then(m => ({ default: m.MarketPage })));
const ProductPage = lazy(() => import('../features/product/ProductPage').then(m => ({ default: m.ProductPage })));
const AccountsPage = lazy(() => import('../features/accounts/AccountsPage').then(m => ({ default: m.AccountsPage })));

export function App() {
  const { route, feature } = useHashRoute();
  return <>
    <nav aria-label="功能导航" className="app-nav">
      <a href="#/workbench">策略工作台</a><a href="#/factors">因子看板</a><a href="#/portfolio">日频示例</a><a href="#/accounts">模拟账户</a>
      <details className="advanced-nav"><summary>高级工具</summary><div><a href="#/tasks">固定窗口任务</a><a href="#/paper">连续模拟</a><a href="#/data">数据准备与诊断</a><a href="#/market">固定样本行情</a><a href="#/execution/runs">内部执行演练</a></div></details>
    </nav>
    <Suspense fallback={<p role="status">正在加载功能…</p>}>
      {feature === 'workbench' ? <WorkbenchPage route={route}/> :
       feature === 'factors' ? <FactorsPage route={route}/> :
       feature === 'product' ? <ProductPage/> :
       feature === 'portfolio' ? <PortfolioPage route={route}/> :
       feature === 'tasks' ? <TasksPage route={route}/> :
       feature === 'paper' ? <PaperPage/> :
       feature === 'accounts' ? <AccountsPage/> :
       feature === 'execution' ? <ExecutionPage route={route}/> :
       feature === 'market' ? <MarketPage/> :
       <main><h1>页面不存在</h1><a href="#/workbench">打开策略工作台</a></main>}
    </Suspense>
    <footer>quant-web {version} · 研究与模拟；历史身份与审阅结论保留原值。</footer>
  </>;
}
