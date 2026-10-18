import { api } from '../execution/api';
import { canonical } from '../../shared/format.ts';
import { usePoll } from '../../shared/usePoll';
import { useOnline } from '../../shared/useOnline';
import { MarketBrowser } from './MarketBrowser';
import contract from '../../../contracts/api.openapi.json';

const readSchema = async () => canonical(await api('/openapi.json')) === canonical(contract);
export function MarketPage() {
  const online = useOnline();
  const schema = usePoll(readSchema, 30000);
  return <main><header><div><h1>已发布研究与固定样本行情</h1><p>按快照描述符或完整标识选择证券。正式主库股票从「正式数据与回测」选择并发布。</p></div><a href="#/data">选择正式主库股票</a></header>
    {schema.error && <p role="alert">{schema.error}</p>}
    {schema.data === false && <p role="alert">服务契约不匹配，查询已禁用。</p>}
    <MarketBrowser enabled={online && !schema.error && schema.data === true}/>
  </main>;
}
