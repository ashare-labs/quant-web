import { useEffect, useState } from 'react';
import { errorText } from './http';

export function usePoll<T>(fetcher: () => Promise<T>, interval = 3000, enabled = true) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [at, setAt] = useState<string>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if(!enabled){setData(undefined);setError(undefined);setLoading(false);return;}
    let live = true, timer: ReturnType<typeof setTimeout>;
    setData(undefined); setError(undefined); setLoading(true);
    async function tick() {
      try {
        const result = await fetcher();
        if (live) { setData(result); setError(undefined); setAt(new Date().toISOString()); }
      } catch (e) { if (live) { setData(undefined); setAt(undefined); setError(errorText(e)); } }
      finally { if (live) { setLoading(false); timer = setTimeout(tick, interval); } }
    }
    void tick();
    return () => { live = false; clearTimeout(timer); };
  }, [fetcher, interval, revision, enabled]);
  return { data, error, loading, at, refresh: () => setRevision(x => x + 1) };
}
