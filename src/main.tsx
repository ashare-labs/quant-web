import { StrictMode, Component, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { OverviewPage } from './pages/OverviewPage';
import { StrategiesPage } from './pages/StrategiesPage';
import { EditorPage } from './pages/EditorPage';
import { ResultsPage } from './pages/ResultsPage';
import { BacktestsPage } from './pages/BacktestsPage';
import { SimulationsPage } from './pages/SimulationsPage';
import { FactorsPage } from './pages/FactorsPage';
import { AccountControls, AccountGate } from './auth/AccountGate';
import { accountMode } from './auth/session';
import { navigate } from './shared/navigation';
import 'font-awesome/css/font-awesome.min.css';
import './design.css';
import './style.css';
import './backtests/history.css';
const pages: Record<string, [
  string,
  () => ReactNode
]> = {
  'index.html': ['量化研究工作区', OverviewPage], 'strategies.html': ['策略列表', StrategiesPage],
  'strategy-editor.html': ['策略编辑', EditorPage], 'backtest-results.html': ['回测结果', ResultsPage],
  'backtests.html': ['回测列表', BacktestsPage],
  'simulations.html': ['模拟策略列表', SimulationsPage], 'factors.html': ['因子看板', FactorsPage],
};
class Boundary extends Component<{
  children: ReactNode;
}, {
  failed: boolean;
}> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <main>
      <h1>页面暂时无法显示</h1>
      <p role="alert">数据格式与页面不兼容。原始草稿与服务记录未被修改。</p>
      <button onClick={() => location.reload()}>重新加载</button>
    </main> : this.props.children;
  }
}
function App() {
  const [address, setAddress] = useState(location.pathname + location.search);
  const route = address.split('?')[0].split('/').pop() || 'index.html';
  const [title, Page] = pages[route] || ['页面未找到', () => <main>
    <h1>页面未找到</h1>
    <p>
      <a href="index.html">返回研究工作区</a>
    </p>
  </main>];
  useEffect(() => {
    document.title = `${title} · QuantWeb`;
    document.body.className = route === 'factors.html' ? 'factorpage' : '';
  }, [route, title]);
  useEffect(() => {
    if (!accountMode)
      return;
    const pop = () => setAddress(location.pathname + location.search);
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented
        || event.button !== 0
        || event.ctrlKey
        || event.metaKey
        || event.shiftKey
        || event.altKey)
        return;
      const link = event.target instanceof Element ? event.target.closest('a') : null;
      if (!link || link.download || link.target && link.target !== '_self')
        return;
      const url = new URL(link.href, location.href);
      const page = url.pathname.split('/').pop() || 'index.html';
      if (url.origin !== location.origin || !Object.hasOwn(pages, page) || url.hash)
        return;
      event.preventDefault();
      navigate(url.href);
    };
    window.addEventListener('popstate', pop);
    document.addEventListener('click', click);
    return () => {
      window.removeEventListener('popstate', pop);
      document.removeEventListener('click', click);
    };
  }, []);
  return <>
    <a className="skip-link" href="#content">跳至内容</a>
    <header>
      <a className="brand" href="index.html" aria-label="QuantWeb 首页">
        <img src="/brand.jpg" alt="" />
        <span>QuantWeb</span>
      </a>
      <div className="header-actions">
        <nav aria-label="主导航">
          {[
            [
              'strategies.html',
              '策略回测'
            ],
            [
              'simulations.html',
              '模拟交易'
            ],
            [
              'factors.html',
              '因子看板'
            ]
          ].map(([href, label]) => {
            const current = route === href
              || (href === 'strategies.html'
                && [
                  'strategy-editor.html',
                  'backtest-results.html',
                  'backtests.html'
                ].includes(route));
            return <a key={href} href={href} className={current
              ? 'active'
              : ''} aria-current={current
                ? 'page'
                : undefined}>
              {label}
            </a>;
          })}
        </nav>
        <AccountControls />
      </div>
    </header><div id="content">
      <AccountGate>
        <Boundary key={address}>
          <Page />
        </Boundary>
      </AccountGate>
    </div>
  </>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
