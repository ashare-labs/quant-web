import { useEffect, useRef, useState } from 'react';
import { ApiError, errorText } from '../../shared/http';
import { api, type Catalogue, type Job, type Logs, type Result, type Submission } from './api';
import { draftKey, pendingKey, readDraft, submission, type Draft } from './draft';

export function useWorkbench(route: string) {
  const [draft, setDraft] = useState(readDraft), [saved, setSaved] = useState('草稿保存在此浏览器');
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null), [jobs, setJobs] = useState<Job[]>([]);
  const [job, setJob] = useState<Job | null>(null), [result, setResult] = useState<Result | null>(null);
  const [logs, setLogs] = useState<Logs | null>(null), [error, setError] = useState(''), [detail, setDetail] = useState<unknown>();
  const [busy, setBusy] = useState(false), guard = useRef(false);
  const [pending, setPending] = useState<Submission | null>(() => {
    try { return JSON.parse(localStorage.getItem(pendingKey) || 'null') as Submission | null; } catch { return null; }
  });
  const jobId = route.split('/')[2] || '';
  const completed = useRef('');
  function fail(e: unknown) { setError(errorText(e)); setDetail(e instanceof ApiError ? e.details : undefined); }
  function edit(patch: Partial<Draft>) {
    const next = { ...draft, ...patch }; setDraft(next);
    try { localStorage.setItem(draftKey, JSON.stringify(next)); setSaved('草稿已自动保存'); }
    catch { setSaved('浏览器存储不可用，请下载策略保存'); }
  }
  useEffect(() => {
    const controller = new AbortController();
    api<Catalogue>('/catalogue', undefined, controller.signal).then(setCatalogue).catch(e => { if (!controller.signal.aborted) fail(e); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    setJob(null); setResult(null); setLogs(null); completed.current = '';
    async function poll() {
      try {
        const list = await api<{items: Job[]}>('/jobs', undefined, controller.signal);
        if (controller.signal.aborted) return;
        setJobs(list.items);
        if (jobId) {
          const current = await api<Job>('/jobs/' + jobId, undefined, controller.signal);
          if (controller.signal.aborted) return;
          setJob(current);
          const history = await api<Logs>('/jobs/' + jobId + '/logs', undefined, controller.signal);
          if (!controller.signal.aborted) setLogs(history);
          if (current.status === 'succeeded' && completed.current !== jobId) {
            const value = await api<Result>('/jobs/' + jobId + '/result', undefined, controller.signal);
            if (!controller.signal.aborted) { setResult(value); completed.current = jobId; }
          }
        }
      } catch (e) { if (!controller.signal.aborted) fail(e); }
      if (!controller.signal.aborted) timer = setTimeout(poll, 1500);
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [jobId]);
  async function run(retry = false) {
    if (guard.current) return;
    guard.current = true; setBusy(true); setError(''); setDetail(undefined);
    try {
      if (!catalogue) throw new Error("后端配置尚未就绪，请重新加载页面。");
      const request = retry && pending ? pending : submission(draft, crypto.randomUUID(), catalogue.environment_id);
      // Store before mutation. A network failure can only retry this exact request.
      localStorage.setItem(pendingKey, JSON.stringify(request)); setPending(request);
      const accepted = await api<Job>('/jobs', request);
      localStorage.removeItem(pendingKey); setPending(null);
      location.hash = '#/workbench/' + accepted.job_id;
      setJob(accepted);
    } catch (e) {
      if (e instanceof ApiError && !e.uncertain) { localStorage.removeItem(pendingKey); setPending(null); }
      fail(e);
    } finally { guard.current = false; setBusy(false); }
  }
  async function cancel() {
    if (!job || guard.current) return;
    guard.current = true; setBusy(true); setError('');
    try { setJob(await api<Job>('/jobs/' + job.job_id + '/cancel', {})); }
    catch (e) { fail(e); }
    finally { guard.current = false; setBusy(false); }
  }
  function restoreExample() {
    if (catalogue && (!draft.source || confirm('用示例替换编辑器中的草稿？已提交的运行不受影响。'))) edit({ source: catalogue.example, parameters: JSON.stringify(catalogue.parameters, null, 2) });
  }
  async function importFile(file?: File) {
    if (!file) return;
    if (!file.name.endsWith('.py') || file.size > 262144) { setError('请选择不超过 256 KiB 的 .py 文件。'); return; }
    if (draft.source && !confirm('导入文件将替换编辑器草稿，是否继续？')) return;
    edit({ source: await file.text(), name: file.name.replace(/\.py$/, '') });
  }
  return { draft, edit, saved, catalogue, jobs, job, result, logs, error, detail, busy, pending, run, cancel, restoreExample, importFile };
}
