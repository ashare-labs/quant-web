import { api } from '../execution/api';
import { canonical } from '../../shared/format.mjs';
import { usePoll } from '../../shared/usePoll';
import { useOnline } from '../../shared/useOnline';
import { MarketBrowser } from './MarketBrowser';
import contract from '../../../contracts/api.openapi.json';

const readSchema = async () => canonical(await api('/openapi.json')) === canonical(contract);
export function MarketPage() {
  const online = useOnline();
  const schema = usePoll(readSchema, 30000);
  return <main><header><h1>行情快照浏览</h1><p>读取已配置的数据存储，身份与限制由当前后端返回。</p></header>
    {schema.error && <p role="alert">{schema.error}</p>}
    {schema.data === false && <p role="alert">服务契约不匹配，查询已禁用。</p>}
    <MarketBrowser enabled={online && !schema.error && schema.data === true}/>
  </main>;
}
