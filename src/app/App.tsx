import { lazy, Suspense } from 'react';
import { useHashRoute } from './useHashRoute';
import { version } from '../../package.json';

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
      <a href="#/portfolio">组合回测与策略</a><a href="#/tasks">任务与结果</a><a href="#/accounts">模拟账户</a><a href="#/paper">连续模拟</a>
      <a href="#/market">固定样本行情</a><a href="#/execution/runs">执行演练</a>
      <a href="#/data">数据准备与检查</a>
    </nav>
    <Suspense fallback={<p role="status">正在加载功能…</p>}>
      {feature === 'product' ? <ProductPage/> :
       feature === 'portfolio' ? <PortfolioPage route={route}/> :
       feature === 'tasks' ? <TasksPage route={route}/> :
       feature === 'paper' ? <PaperPage/> :
       feature === 'accounts' ? <AccountsPage/> :
       feature === 'execution' ? <ExecutionPage route={route}/> :
       feature === 'market' ? <MarketPage/> :
       <main><h1>页面不存在</h1><a href="#/portfolio">打开组合回测与策略</a></main>}
    </Suspense>
    <footer>quant-web {version} · 研究与模拟；历史身份与审阅结论保留原值。</footer>
  </>;
}
