import { useEffect, useState } from 'react';
import { errorText } from '../../shared/http';
import { useOnline } from '../../shared/useOnline';
import { AccountDetails } from './AccountDetails';
import { readAccount, readAccounts } from './api';
import type { AccountSummary, AccountView } from './api';
import './accounts.css';

export function AccountsPage() {
  const online = useOnline();
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [selected, setSelected] = useState('');
  const [view, setView] = useState<AccountView | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setView(null); setError(''); setAccounts([]);
    if (!online) { setLoading(false); return () => controller.abort(); }
    setLoading(true);
    void (async () => {
      try {
        const listed = await readAccounts(controller.signal);
        const choice = listed.find(item => item.account_id === selected) ?? (selected ? null : listed[0]);
        if (selected && !choice) throw new Error('所选账户已不在登记表中，请重新选择。');
        const result = choice ? await readAccount(choice, controller.signal) : null;
        if (!controller.signal.aborted) { setAccounts(listed); setView(result); }
      } catch (failure) { if (!controller.signal.aborted) setError(errorText(failure)); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [selected, tick, online]);
  return <main className="accounts-page">
    <header><div><h1>模拟账户</h1><p>已登记账户的真实观测、模拟成交与结算记录</p></div><a href="#/paper">研究模拟会话</a></header>
    <section className="accounts-controls">
      <label>账户<select aria-label="已登记模拟账户" value={view?.account_id ?? selected} disabled={loading || !online} onChange={event => { setView(null); setSelected(event.target.value); }}>
        <option value="">选择账户</option>{accounts.map(item => <option value={item.account_id} key={item.account_id}>{item.label}</option>)}
      </select></label>
      <button disabled={loading || !online} onClick={() => { setView(null); setTick(value => value + 1); }}>重新核验</button>
      <span role="status">{!online ? '浏览器离线' : loading ? '正在核验账本…' : view ? '结算与运行时已核验 · 只读' : '等待登记账户'}</span>
    </section>
    {!online && <p role="alert">浏览器离线，账户结果已隐藏。</p>}
    {error && <p role="alert">{error}</p>}
    {online && !loading && !error && !view && <p>尚无已登记账户。</p>}
    {online && view && !error && <AccountDetails view={view}/>}
  </main>;
}
