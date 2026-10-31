import { useEffect, useRef, useState } from 'react';
import type { PythonJob } from '../shared/api';
type Progress = NonNullable<PythonJob['progress']>;
type Anchor = {
  key: string;
  seconds: number;
  at: number;
  advancing: boolean;
};
// Display only: never write back a browser estimate or advance trading-day/RSS data.
export function useElapsedTime(progress: Progress | null, advancing: boolean) {
  const seconds = typeof progress?.elapsed_seconds === 'number'
    && Number.isFinite(progress.elapsed_seconds)
    && progress.elapsed_seconds >= 0
    ? progress.elapsed_seconds
    : null;
  const key = progress ? progress.job_id + ':' + progress.attempt : '';
  const ticking = advancing && !!progress && !progress.terminal && seconds !== null;
  const anchor = useRef<Anchor | null>(null);
  const [reading, setReading] = useState<{
    key: string;
    seconds: number;
  } | null>(null);
  useEffect(() => {
    if (seconds === null) {
      anchor.current = null;
      setReading(null);
      return;
    }
    const now = performance.now();
    const previous = anchor.current;
    // Sample delivery can lag by different amounts. While the same attempt is
    // running, keep its clock monotonic; terminal/disconnected views use the
    // exact last server sample instead of extending an uncertain task lifetime.
    const base = ticking && previous?.advancing && previous.key === key
      ? Math.max(seconds, previous.seconds + Math.max(0, now - previous.at) / 1000) : seconds;
    anchor.current = { key, seconds: base, at: now, advancing: ticking };
    const update = () => setReading({
      key,
      seconds: base + (ticking
        ? Math.max(0, performance.now() - now) / 1000
        : 0)
    });
    update();
    if (!ticking)
      return;
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [key, progress?.sequence, progress?.sampled_at, seconds, ticking]);
  if (!ticking || seconds === null)
    return seconds;
  return reading?.key === key ? Math.max(seconds, reading.seconds) : seconds;
}
