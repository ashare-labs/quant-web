import { accountMode } from '../auth/session.ts';

export function navigate(href:string){
  if(!accountMode){location.assign(href);return;}
  const next=new URL(href,location.href);
  if(next.origin!==location.origin){location.assign(href);return;}
  // Existing editors guard unretained working copies through beforeunload.
  // Ask before a client navigation too, so keeping the shell never loses edits.
  const guard=new Event('beforeunload',{cancelable:true});
  if(!window.dispatchEvent(guard)&&!window.confirm('有尚未保存的编辑，确定离开此页面吗？'))return;
  history.pushState(null,'',next.href);window.dispatchEvent(new PopStateEvent('popstate'));
}
