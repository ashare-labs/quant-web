import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, errorText, statusLabels, shownStatus, object } from './api';
import { accountMode, accountSession } from '../auth/session';
import type { ReadProgress } from './response-read';
export function useResource<T>(path: string | null, poll = 0, paper = false, options: {
  retainOnError?: boolean;
  stopWhen?: (value: T) => boolean;
  timeoutMs?: number;
  trackRead?: boolean;
} = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(0);
  const [readProgress, setReadProgress] = useState<ReadProgress | null>(null);
  const operation = useRef<{
    cancel: () => void;
  } | null>(null);
  const previousPath = useRef<string | null>(null);
  const retain = accountMode || !!options.retainOnError;
  const stopWhen = options.stopWhen;
  const timeoutMs = options.timeoutMs ?? 0;
  const trackRead = !!options.trackRead;
  useEffect(() => {
    if (!accountMode)
      return;
    let previous = accountSession.snapshot().status;
    return accountSession.subscribe(() => {
      const current = accountSession.snapshot().status;
      if (previous === 'offline' && current === 'ready')
        setVersion(value => value + 1);
      previous = current;
    });
  }, []);
  useEffect(() => {
    let controller: AbortController | undefined;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      controller?.abort();
      clearTimeout(timer);
      clearTimeout(deadline);
    };
    const cancel = (message: string) => {
      stop();
      if (!disposed) {
        setLoading(false);
        setReadProgress(null);
        setError(message);
      }
    };
    const current = { cancel: () => cancel('已取消本次读取。可以重试；回测与已保存结果不变。') };
    operation.current = current;
    const leave = () => {
      disposed = true;
      stop();
    };
    const returnToPage = (event: PageTransitionEvent) => {
      if (event.persisted)
        setVersion(value => value + 1);
    };
    globalThis.addEventListener?.('pagehide', leave);
    globalThis.addEventListener?.('pageshow', returnToPage);
    if (!retain || previousPath.current !== path)
      setData(null);
    previousPath.current = path;
    setError('');
    setLoading(!!path);
    setReadProgress(null);
    async function read() {
      if (!path || disposed)
        return;
      controller = new AbortController();
      const signal = controller.signal;
      if (trackRead)
        setReadProgress({
          phase: 'connecting',
          receivedBytes: 0,
          totalBytes: null
        });
      if (timeoutMs > 0)
        deadline = setTimeout(() => cancel(`读取超过 ${timeoutMs / 1000} 秒，已取消本次读取。可以重试或返回回测列表。`), timeoutMs);
      let done = false;
      try {
        const value = await api<T>(path, undefined, signal, paper, undefined, trackRead ? progress => {
          if (!disposed && !signal.aborted)
            setReadProgress(progress);
        } : undefined);
        if (!disposed && !signal.aborted) {
          setData(value);
          setError('');
          done = !!stopWhen?.(value);
        }
      }
      catch (e) {
        if (!disposed && !signal.aborted) {
          if (!retain)
            setData(null);
          setError(errorText(e));
        }
      }
      finally {
        clearTimeout(deadline);
        if (!disposed && !signal.aborted) {
          setLoading(false);
          setReadProgress(null);
          if (poll && !done)
            timer = setTimeout(read, poll);
        }
      }
    }
    void read();
    return () => {
      leave();
      globalThis.removeEventListener?.('pagehide', leave);
      globalThis.removeEventListener?.('pageshow', returnToPage);
      if (operation.current === current)
        operation.current = null;
    };
  }, [path, poll, paper, version, retain, stopWhen, timeoutMs, trackRead]);
  return {
    data,
    error,
    loading,
    readProgress,
    cancel: () => operation.current?.cancel(),
    refresh: () => setVersion(v => v + 1)
  };
}
export function ErrorNotice({ message, retry }: {
  message: string;
  retry?: () => void;
}) {
  return message ? <div className="notice error" role="alert">
    <span>
      {message}
    </span>
    {retry && <button onClick={retry}>重试</button>}
  </div> : null;
}
export function Empty({ children }: {
  children: ReactNode;
}) { return <div className="empty" role="status">{children}</div>; }
export function Status({ job }: {
  job: {
    status: string;
    display_status?: string | null;
  };
}) {
  const status = shownStatus(job);
  return <span className={'status status-' + status}>
    {statusLabels[status] || status}
  </span>;
}
export function Modal({ title, children, close, wide = false }: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} className={wide ? 'wide-dialog' : ''} onCancel={close} onClick={e => {
    if (e.target === e.currentTarget)
      close();
  }} aria-label={title}>
    <div className="dialog-heading">
      <h2>
        {title}
      </h2>
      <button className="icon-button" onClick={close} aria-label="关闭">
        <i className="fa fa-times" aria-hidden="true" />
      </button>
    </div>
    {children}
  </dialog>;
}
export function Tabs({ values, selected, onChange }: {
  values: string[];
  selected: string;
  onChange: (s: string) => void;
}) {
  return <div className="tabs" role="group" aria-label="视图选择">
    {values.map(value => <button key={value} className={value === selected
      ? 'active'
      : ''} aria-pressed={value === selected} onClick={() => onChange(value)}>
      {value}
    </button>)}
  </div>;
}
export function JsonDetails({ value, title = '诊断信息' }: {
  value: unknown;
  title?: string;
}) {
  return <details className="diagnostics">
    <summary>
      {title}
    </summary>
    <pre>
      {JSON.stringify(value, null, 2)}
    </pre>
  </details>;
}
export function Reason({ value }: {
  value: unknown;
}) {
  const reason = object(value);
  return reason.message ? <div className="notice">
    {String(reason.message)}
  </div> : null;
}
