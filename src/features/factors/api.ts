import type { components } from '../../generated/api';
import { requestJson } from '../../shared/http';

export type Submission = components['schemas']['FactorCreate'];
export type Job = components['schemas']['FactorJobView'];
export type Result = components['schemas']['FactorResult'];
export interface Parameter { name: string; label: string; kind: 'number' | 'integer'; required: boolean; minimum?: number; maximum?: number }
export interface Factor { id: string; library: string; field: string; name: string; category: string; definition: string; expression: string | null; description: string; inputs: string[]; warmup_rows: number | null; recursive_history: boolean; cross_section_rank: boolean; availability: string; note: string; parameters: Parameter[]; entrypoint: string; definition_versions: string[]; limitations: string[] }
export interface Catalogue { environment_id: string; items: Factor[]; evaluation_available: boolean; limits: { max_securities: number; max_security_sessions: number } }
export interface Source { id: string; label: string; kind: string; ready: boolean; securities: string[]; total_securities: number; first: string | null; last: string | null; capabilities: string[]; fields: string[]; identity: unknown; error: string | null; evaluation_basis?: string | null }
export const api = <T>(path: string, body?: unknown, signal?: AbortSignal) => requestJson<T>('/execution-api', '/factors' + path, body, signal);
export const active = (job: Job | null) => !!job && ['queued', 'running', 'cancelling'].includes(job.status);
export const statusText: Record<string, string> = { queued: '等待计算', running: '计算中', cancelling: '正在取消', cancelled: '已取消', failed: '计算失败', succeeded: '已完成' };
