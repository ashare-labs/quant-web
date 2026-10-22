import { useEffect, useRef, useState } from 'react';
import { ApiError, errorText } from '../../shared/http';
import { api, type Catalogue, type Factor, type Job, type Result, type Source, type Submission } from './api';
import { containsRequest, draftKey, factorHref, pendingKey, readDraft, submission, type Draft } from './model';

export function useFactors(route: string) {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null), [sources, setSources] = useState<Source[]>([]);
  const [version, setVersion] = useState('gtja191.explicit.v1');
  const [draft, setDraft] = useState(readDraft), [jobs, setJobs] = useState<Job[]>([]);
  const [job, setJob] = useState<Job | null>(null), [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState(''), [readError, setReadError] = useState(''), [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Submission | null>(() => { try { return JSON.parse(localStorage.getItem(pendingKey) || 'null'); } catch { return null; } });
  const guard = useRef(false), completed = useRef('');
  const parts = route.split('/');
  let factorId = ''; try { factorId = decodeURIComponent(parts[2] || ''); } catch { /* Unknown route is rendered as missing. */ }
  const jobId = parts[3] === 'jobs' ? parts[4] || '' : '';
  const factor = catalogue?.items.find(f => f.id === factorId) ?? null;
  function edit(patch: Partial<Draft>) {
    setDraft(previous => { const next = { ...previous, ...patch }; try { localStorage.setItem(draftKey, JSON.stringify(next)); } catch { setError('浏览器无法保存草稿；请检查本地存储。'); } return next; });
  }
  useEffect(() => {
    const controller = new AbortController();
    setCatalogue(null);
    Promise.all([api<Catalogue>('/catalogue?version=' + encodeURIComponent(version), undefined, controller.signal), api<{items: Source[]; environment_id: string}>('/sources', undefined, controller.signal)]).then(([c,s]) => {
      if (controller.signal.aborted) return;
      if (c.environment_id !== s.environment_id) throw new Error('读取期间环境发生变化，请重新加载。');
      setCatalogue(c); setSources(s.items); setError('');
    }).catch(e => { if (!controller.signal.aborted) setError(errorText(e)); });
    return () => controller.abort();
  }, [version]);
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    setJob(null); setResult(null); setReadError(''); completed.current = '';
    async function poll() {
      let delay = 15000;
      try {
        const list = await api<{items: Job[]}>('/jobs', undefined, controller.signal);
        if (controller.signal.aborted) return;
        setJobs(list.items);
        if (list.items.some(item=>['queued','running','cancelling'].includes(item.status))) delay = 2000;
        if (jobId) {
          const current = await api<Job>('/jobs/' + encodeURIComponent(jobId), undefined, controller.signal);
          if (controller.signal.aborted) return;
          if (current.request.factor_id !== factorId) throw new Error('运行中的因子与当前页面不一致，请从运行记录打开。');
          setJob(current);
          if (current.status === 'succeeded' && completed.current !== jobId) {
            const value = await api<Result>('/jobs/' + jobId + '/result', undefined, controller.signal);
            if (controller.signal.aborted) return;
            if (value.job_id !== jobId || !containsRequest(value.request,current.request)) throw new Error('返回结果与当前运行身份不一致。');
            setResult(value); completed.current = jobId;
          }
        }
        setReadError('');
      } catch (e) { if (!controller.signal.aborted) { setReadError(errorText(e)); setResult(null); completed.current = ''; } }
      if (!controller.signal.aborted) timer = setTimeout(poll, delay);
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [jobId, factorId]);
  async function run(selected: Factor, retry = false) {
    if (guard.current || (!retry && pending)) return;
    guard.current = true; setBusy(true); setError('');
    try {
      if (!catalogue) throw new Error('请等待因子目录加载。');
      const request = retry && pending ? pending : submission(draft, selected, catalogue.environment_id, crypto.randomUUID());
      localStorage.setItem(pendingKey, JSON.stringify(request)); setPending(request);
      const accepted = await api<Job>('/jobs', request);
      if (accepted.contract_version !== 'factor-jobs.v1' || !/^m2job-[a-f0-9]{32}$/.test(accepted.job_id) || !containsRequest(accepted.request,request)) throw new Error('返回任务与原请求不一致，原请求已保留，请确认后端状态。');
      localStorage.removeItem(pendingKey); setPending(null);
      location.hash = factorHref(accepted.request.factor_id) + '/jobs/' + accepted.job_id;
      setJob(accepted);
    } catch (e) {
      if (e instanceof ApiError && !e.uncertain) { localStorage.removeItem(pendingKey); setPending(null); }
      setError(errorText(e));
    } finally { guard.current = false; setBusy(false); }
  }
  async function cancel() {
    if (!job || guard.current) return;
    guard.current = true; setBusy(true);
    try { setJob(await api<Job>('/jobs/' + job.job_id + '/cancel', {})); }
    catch (e) { setError(errorText(e)); }
    finally { guard.current = false; setBusy(false); }
  }
  return { catalogue, sources, version, setVersion, draft, edit, jobs, job, result, factor, factorId, error: error || readError, busy, pending, run, cancel };
}
