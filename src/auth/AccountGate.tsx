import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
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
  const [open,setOpen]=useState(false),menuId=useId();
  const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),exit=useRef<HTMLButtonElement>(null);
  const focusOnOpen=useRef(false),pointerType=useRef('mouse');
  useEffect(()=>{if(open&&focusOnOpen.current){exit.current?.focus();focusOnOpen.current=false;}},[open]);
  useEffect(()=>{setOpen(false);setError('');},[state.session?.user.id]);
  useEffect(()=>{
    if(!open)return;
    const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!root.current?.contains(event.target))setOpen(false);};
    document.addEventListener('pointerdown',outside);
    return()=>document.removeEventListener('pointerdown',outside);
  },[open]);
  if(!accountMode||!state.session)return null;
  function focusMenu(){if(open)exit.current?.focus();else{focusOnOpen.current=true;setOpen(true);}}
  async function logout(){
    if(busy)return;
    setBusy(true);setError('');
    try{await accountSession.logout();setOpen(false);changed();}
    catch(error){setOpen(true);setError(error instanceof Error?error.message:'尚未确认退出成功，请重试。');}
    finally{setBusy(false);}
  }
  return <div className="account-controls" ref={root}
    onPointerEnter={event=>{if(event.pointerType==='mouse')setOpen(true);}}
    onPointerLeave={event=>{if(event.pointerType==='mouse'&&!busy&&!root.current?.contains(document.activeElement))setOpen(false);}}
    onBlur={event=>{if(!busy&&!event.currentTarget.contains(event.relatedTarget))setOpen(false);}}
    onKeyDown={event=>{
      if(event.key==='Escape'){event.preventDefault();setOpen(false);trigger.current?.focus();}
      else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();focusMenu();}
    }}>
    <button className="account-avatar" ref={trigger} type="button" aria-label="用户菜单"
      aria-haspopup="menu" aria-expanded={open} aria-controls={menuId}
      onPointerDown={event=>{pointerType.current=event.pointerType;}}
      onClick={event=>{if(event.detail===0)focusMenu();else if(pointerType.current==='touch')setOpen(value=>!value);else setOpen(true);}}>
      <span className="account-avatar-circle"><i className="fa fa-user" aria-hidden="true"/></span>
    </button>
    <div className="account-popover" hidden={!open}>
      <p className="account-menu-name">{state.session.user.display_name||state.session.user.email}</p>
      <div id={menuId} role="menu" aria-label="用户菜单">
        <button ref={exit} className="account-logout" type="button" role="menuitem" disabled={busy} onClick={()=>void logout()}>
          <i className="fa fa-sign-out" aria-hidden="true"/>{busy?'正在退出…':'退出'}
        </button>
      </div>
      {error&&<p className="account-menu-error" role="alert">{error}</p>}
    </div>
  </div>;
}
