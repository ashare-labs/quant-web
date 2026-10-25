// Cookie-only Web credentials. This module never reads or persists a token.
declare const __QUANT_ACCOUNT_MODE__: boolean;
export const accountMode = typeof __QUANT_ACCOUNT_MODE__ !== 'undefined' && __QUANT_ACCOUNT_MODE__;
export interface Session {
  deployment_id: string;
  user: {id: string; email: string; display_name: string};
  session: {id: string; idle_expires_at: string; absolute_expires_at: string};
  capabilities: {manage_accounts: boolean; execute_python: boolean};
}
export interface SessionState {status: 'disabled'|'checking'|'anonymous'|'ready'|'offline'|'unavailable'; session: Session|null; epoch: number; error: string}
export class SessionError extends Error {status?:number; constructor(message:string,status?:number){super(message);this.status=status;}}
function sessionValue(value:unknown):Session {
  const data=value as Session;
  if(!data || !/^[a-f0-9]{32}$/.test(data.deployment_id) || !/^[a-f0-9-]{36}$/.test(data.user?.id)
    || typeof data.user.email!=='string' || typeof data.user.display_name!=='string'
    || typeof data.session?.id!=='string' || !Number.isFinite(Date.parse(data.session.idle_expires_at))
    || !Number.isFinite(Date.parse(data.session.absolute_expires_at)) || typeof data.capabilities?.execute_python!=='boolean') {
    throw new SessionError('服务未返回有效的账号会话，请检查连接。');
  }
  return data;
}
const identity = (value:Session|null) => value ? [value.deployment_id,value.user.id,value.session.id].join(':') : '';
export class SessionManager {
  enabled:boolean;
  private fetcher:typeof fetch;
  private listeners=new Set<()=>void>();
  private pending:Promise<SessionState>|null=null;
  private generation=0;
  private state:SessionState;
  constructor(enabled:boolean,fetcher:typeof fetch=(...args)=>fetch(...args)) {
    this.enabled=enabled;this.fetcher=fetcher;
    this.state={status:enabled?'checking':'disabled',session:null,epoch:0,error:''};
  }
  snapshot=()=>this.state;
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  private update(patch:Partial<SessionState>){this.state={...this.state,...patch};for(const listener of this.listeners)listener();}
  clear(status:SessionState['status']='anonymous') {
    this.generation++;this.pending=null;
    this.update({status,session:null,epoch:this.state.epoch+1,error:''});
  }
  rejectUnauthorized(epoch:number){if(epoch===this.state.epoch)this.clear();}
  unavailable(epoch:number){if(epoch===this.state.epoch&&this.state.session)this.update({status:'offline',error:'连接暂不可用，已保留当前页面。恢复后会重新验证会话。'});}
  headers():Record<string,string>{return {'X-Requested-With':'quant-web',...(this.state.session?{'X-Quant-User':this.state.session.user.id}:{})};}
  requireCurrent(){if(this.enabled&&!this.state.session)throw new SessionError('请先登录。',401);return this.state;}
  assertCurrent(epoch:number){if(this.state.epoch!==epoch)throw new SessionError('账号会话已变化，旧请求的响应已丢弃。',409);}
  async refresh(renew=false):Promise<SessionState> {
    if(!this.enabled)return this.state;
    if(this.pending)return this.pending;
    const generation=this.generation;
    const operation=(async()=>{
      try{
        const response=await this.fetcher('/api/v1/auth/session'+(renew?'/renew':''),{
          method:renew?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:this.headers(),
        });
        if(generation!==this.generation)return this.state;
        if(response.status===401){this.clear();return this.state;}
        if(response.status===409&&renew)return this.synchronize();
        if(!response.ok)throw new SessionError('暂时无法确认会话，请恢复连接后重试。',response.status);
        const session=sessionValue(await response.json());
        if(generation!==this.generation)return this.state;
        this.update({status:'ready',session,error:'',epoch:this.state.epoch+(identity(session)!==identity(this.state.session)?1:0)});
      }catch(error){
        if(generation===this.generation)this.update({status:this.state.session?'offline':'unavailable',
          error:error instanceof Error?error.message:'无法连接账号服务。'});
      }
      return this.state;
    })();
    this.pending=operation;
    try{return await operation;}finally{if(this.pending===operation)this.pending=null;}
  }
  async synchronize(){this.clear('checking');return this.refresh();}
  async login(email:string,password:string){
    this.clear('checking');const generation=this.generation;
    try{
      const response=await this.fetcher('/api/v1/auth/web/login',{
        method:'POST',credentials:'same-origin',cache:'no-store',headers:{'X-Requested-With':'quant-web'},
        body:new URLSearchParams({username:email,password}),
      });
      if(generation!==this.generation)return;
      if(!response.ok)throw new SessionError(response.status===401?'邮箱或密码不正确。':response.status===429?'尝试次数较多，请稍后重试。':'登录暂时不可用，请稍后重试。',response.status);
      await this.refresh();
    }catch(error){if(generation===this.generation)this.update({status:'anonymous',error:error instanceof Error?error.message:'登录失败。'});throw error;}
  }
  async logout(){
    const epoch=this.state.epoch;
    const response=await this.fetcher('/api/v1/auth/logout',{method:'POST',credentials:'same-origin',cache:'no-store',headers:this.headers()});
    if(this.state.epoch!==epoch)return;
    if(response.status===409){await this.synchronize();throw new SessionError('账号已在其他页面切换，请确认当前账号后再退出。',409);}
    if(!response.ok)throw new SessionError('尚未确认退出成功，请恢复连接后重试。',response.status);
    this.clear();
  }
}
export const accountSession=new SessionManager(accountMode);

// A captured storage scope remains tied to the initiating owner across awaits.
// Legacy keys are left untouched and are never auto-imported by a new account.
export function scopedStorage(storage:Storage, state:SessionState=accountSession.requireCurrent()) {
  const prefix=state.status==='disabled'?'':state.session
    ? 'quantweb-account-v1:'+state.session.deployment_id+':'+state.session.user.id+':'
    : (()=>{throw new SessionError('账号未确认，不能读取私人草稿。',401);})();
  return {getItem:(key:string)=>storage.getItem(prefix+key),setItem:(key:string,value:string)=>storage.setItem(prefix+key,value),
    removeItem:(key:string)=>storage.removeItem(prefix+key)};
}
export const accountStorage=()=>scopedStorage(localStorage);
