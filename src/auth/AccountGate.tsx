import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { accountMode, accountSession } from './session';

let channel:BroadcastChannel|undefined;
const changed=()=>channel?.postMessage('changed');
export function useAccountSession(){return useSyncExternalStore(accountSession.subscribe,accountSession.snapshot);}

export function AccountGate({children}:{children:ReactNode}){
  const state=useAccountSession();
  useEffect(()=>{
    if(!accountMode)return;
    void accountSession.refresh();
    const renew=()=>{if(document.visibilityState==='visible')void accountSession.refresh(!!accountSession.snapshot().session);};
    const visible=()=>{if(document.visibilityState==='visible')void accountSession.refresh();};
    const timer=setInterval(renew,5*60*1000);
    window.addEventListener('online',visible);document.addEventListener('visibilitychange',visible);
    if(typeof BroadcastChannel!=='undefined'){
      channel=new BroadcastChannel('quantweb-account-events');
      channel.onmessage=event=>{if(event.data==='changed')void accountSession.synchronize();};
    }
    return()=>{clearInterval(timer);window.removeEventListener('online',visible);document.removeEventListener('visibilitychange',visible);channel?.close();channel=undefined;};
  },[]);
  if(!accountMode)return <>{children}</>;
  if(state.status==='checking')return <main className="account-gate" aria-busy="true"><p role="status">正在恢复会话…</p></main>;
  if(state.status==='unavailable')return <main className="account-gate"><p role="alert">{state.error}</p><button onClick={()=>void accountSession.refresh()}>重试连接</button></main>;
  if(state.status==='anonymous')return <Login/>;
  return <>{state.status==='offline'&&<p className="notice" role="status">连接暂不可用，当前页面已保留。恢复后会重新验证会话。 <button onClick={()=>void accountSession.refresh(true)}>重试连接</button></p>}<div key={state.epoch}>{children}</div></>;
}

function Login(){
  const state=useAccountSession(),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false);
  async function submit(){setBusy(true);try{await accountSession.login(email,password);changed();}catch{/* The session state carries the safe error. */}finally{setPassword('');setBusy(false);}}
  return <main className="account-gate"><h1>登录研究工作区</h1><form onSubmit={event=>{event.preventDefault();void submit();}}>
    <label>邮箱<input type="email" autoComplete="username" value={email} onChange={event=>setEmail(event.target.value)} required/></label>
    <label>密码<input type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} required/></label>
    {state.error&&<p role="alert">{state.error}</p>}<button className="primary" disabled={busy}>{busy?'正在登录…':'登录'}</button>
    <p className="note">此设备会记住登录状态。账号由管理员创建。</p>
  </form></main>;
}

export function AccountControls(){
  const state=useAccountSession(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  if(!accountMode||!state.session)return null;
  async function logout(){setBusy(true);setError('');try{await accountSession.logout();changed();}catch(error){setError(error instanceof Error?error.message:'尚未确认退出成功，请重试。');}finally{setBusy(false);}}
  return <div className="account-controls"><span title={state.session.user.email}>{state.session.user.display_name||state.session.user.email}</span><button disabled={busy} onClick={()=>void logout()}>退出</button>{error&&<span role="alert">{error}</span>}</div>;
}
