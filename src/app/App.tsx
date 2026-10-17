import { lazy, Suspense } from 'react';
import { useHashRoute } from './useHashRoute';

const PortfolioPage = lazy(() => import('../features/portfolio/PortfolioPage').then(m => ({ default: m.PortfolioPage })));
const TasksPage = lazy(() => import('../features/tasks/TasksPage').then(m => ({ default: m.TasksPage })));
const PaperPage = lazy(() => import('../features/paper/PaperPage').then(m => ({ default: m.PaperPage })));
const ExecutionPage = lazy(() => import('../features/execution/ExecutionPage').then(m => ({ default: m.ExecutionPage })));
const MarketPage = lazy(() => import('../features/market/MarketPage').then(m => ({ default: m.MarketPage })));

export function App() {
  const { route, feature } = useHashRoute();
  return <>
    <nav aria-label="功能导航" className="app-nav">
      <a href="#/portfolio">组合回测与策略</a><a href="#/tasks">任务与结果</a><a href="#/paper">连续模拟</a>
      <a href="#/market">行情浏览</a><a href="#/execution/runs">执行演练</a>
    </nav>
    <Suspense fallback={<p role="status">正在加载功能…</p>}>
      {feature === 'portfolio' ? <PortfolioPage route={route}/> :
       feature === 'tasks' ? <TasksPage route={route}/> :
       feature === 'paper' ? <PaperPage/> :
       feature === 'execution' ? <ExecutionPage route={route}/> :
       feature === 'market' ? <MarketPage/> :
       <main><h1>页面不存在</h1><a href="#/portfolio">打开组合回测工作台</a></main>}
    </Suspense>
    <footer>quant-web 0.2 · 新版前端待独立联验；结果中的历史身份与审阅结论保持原值。</footer>
  </>;
}
