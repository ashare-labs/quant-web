import type { ReadProgress } from '../shared/response-read';
const bytes = (value: number) => value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} MiB` : `${(value / 1024).toFixed(1)} KiB`;
export function ReadStatus({ label, progress, cancel }: {
  label: string;
  progress: ReadProgress | null;
  cancel: () => void;
}) {
  const stage = progress?.phase === 'receiving' ? '正在接收' : progress?.phase === 'processing' ? '正在解析' : '正在请求';
  return <div className="notice inline-actions"><span role="status">{stage}{label}…
    {progress?.phase === 'receiving' && progress.receivedBytes > 0 && <> 已接收 {bytes(progress.receivedBytes)}{progress.totalBytes !== null && progress.receivedBytes <= progress.totalBytes ? ` / ${bytes(progress.totalBytes)}` : ''}</>}
  </span><button onClick={cancel}>取消读取</button></div>;
}
