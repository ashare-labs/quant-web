import type { components } from '../../generated/api';
import { requestJson } from '../../shared/http';
export type Job = components['schemas']['PythonJobView'];
export type Submission = components['schemas']['PythonCreate'];
export type Result = components['schemas']['PythonResult'];
export type Logs = components['schemas']['JobLogs'];
export interface Catalogue { environment_id: string; example: string; parameters: Record<string, unknown>; frequency: string; max_securities: number; max_sessions: number; max_stock_minutes: number }
export function api<T>(path: string, body?: unknown, signal?: AbortSignal) {
  return requestJson<T>('/execution-api', '/python' + path, body, signal);
}
export const active = (job?: Job | null) => !!job && ['queued', 'running', 'cancelling'].includes(job.status);
export const phaseText: Record<string, string> = { queued: '等待运行', running: '启动中', preparing: '准备真实行情与参考数据', executing: '运行 Python 策略', cancelling: '正在取消', cancelled: '已取消', succeeded: '回测完成', failed: '运行失败' };
