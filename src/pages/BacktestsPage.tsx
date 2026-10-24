import { useEffect, useState } from 'react';
import { errorText } from '../shared/api';
import { BacktestList } from '../backtests/BacktestList';
import { isStrategyId, readStrategyBacktests, resolveStrategy, strategyIdentity } from '../backtests/history-api';
import type { StrategyBacktests, StrategyIdentity } from '../backtests/history-model';

export function BacktestsPage() {
  const [params]=useState(()=>new URLSearchParams(location.search));
  const initial=params.get('strategy')||params.get('file');
  const [identity,setIdentity]=useState<StrategyIdentity>(()=>isStrategyId(initial)?strategyIdentity(initial):{id:'',name:'回测列表',path:null});
  const [data,setData]=useState<StrategyBacktests|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
    setLoading(true);setError('');
    async function read(){
      try {
        const resolved=await resolveStrategy(params,controller.signal);
        if(controller.signal.aborted)return;
        setIdentity(resolved);
        const value=await readStrategyBacktests(resolved,controller.signal);
        if(controller.signal.aborted)return;
        setData(value);setError('');
        if(value.records.some(record=>record.executionState==='current_runtime'&&['queued','running','cancelling'].includes(record.status)))timer=setTimeout(read,5000);
      }catch(e){if(!controller.signal.aborted){setData(null);setError(errorText(e));}}
      finally{if(!controller.signal.aborted)setLoading(false);}
    }
    void read();return()=>{controller.abort();clearTimeout(timer);};
  },[params,revision]);
  return <BacktestList identity={identity} data={data} loading={loading} error={error} refresh={()=>setRevision(n=>n+1)}/>;
}
