import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, errorText, statusLabels, shownStatus, object } from './api';
export function useResource<T>(path: string | null, poll = 0, paper = false,
  options: {retainOnError?: boolean; stopWhen?: (value:T)=>boolean} = {}) {
  const [data, setData] = useState<T | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(false), [version, setVersion] = useState(0);
  const previousPath=useRef<string|null>(null),retain=!!options.retainOnError,stopWhen=options.stopWhen;
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    if(!retain||previousPath.current!==path)setData(null);
    previousPath.current=path;setError(''); setLoading(!!path);
    async function read() {
      if (!path) return;
      let done=false;
      try { const value = await api<T>(path, undefined, controller.signal, paper); if (!controller.signal.aborted) { setData(value); setError(''); done=!!stopWhen?.(value); } }
      catch (e) { if (!controller.signal.aborted) { if(!retain)setData(null); setError(errorText(e)); } }
      finally { if (!controller.signal.aborted) { setLoading(false); if (poll&&!done) timer = setTimeout(read, poll); } }
    }
    void read(); return () => { controller.abort(); clearTimeout(timer); };
  }, [path, poll, paper, version,retain,stopWhen]);
  return {data, error, loading, refresh: () => setVersion(v => v + 1)};
}
export function ErrorNotice({message, retry}: {message: string; retry?: () => void}) {
  return message ? <div className="notice error" role="alert"><span>{message}</span>{retry && <button onClick={retry}>重试</button>}</div> : null;
}
export function Empty({children}: {children: ReactNode}) { return <div className="empty" role="status">{children}</div>; }
export function Status({job}: {job: {status: string; display_status?: string | null}}) {
  const status = shownStatus(job); return <span className={'status status-' + status}>{statusLabels[status] || status}</span>;
}
export function Modal({title, children, close, wide = false}: {title: string; children: ReactNode; close: () => void; wide?: boolean}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className={wide ? 'wide-dialog' : ''} onCancel={close} onClick={e => { if (e.target === e.currentTarget) close(); }} aria-label={title}>
    <div className="dialog-heading"><h2>{title}</h2><button className="icon-button" onClick={close} aria-label="关闭"><i className="fa fa-times" aria-hidden="true"/></button></div>{children}
  </dialog>;
}
export function Tabs({values, selected, onChange}: {values: string[]; selected: string; onChange: (s: string) => void}) {
  return <div className="tabs" role="group" aria-label="视图选择">{values.map(value => <button key={value} className={value === selected ? 'active' : ''} aria-pressed={value === selected} onClick={() => onChange(value)}>{value}</button>)}</div>;
}
export function JsonDetails({value, title = '诊断信息'}: {value: unknown; title?: string}) {
  return <details className="diagnostics"><summary>{title}</summary><pre>{JSON.stringify(value, null, 2)}</pre></details>;
}
export function Reason({value}: {value: unknown}) { const reason = object(value); return reason.message ? <div className="notice">{String(reason.message)}</div> : null; }
