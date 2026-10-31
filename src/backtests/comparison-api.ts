import { api, errorText, object, type Row } from '../shared/api.ts';
import { selectedAnalysis, analysisPath, type Analysis } from '../results/model.ts';
import type { BacktestRecord } from './history-model.ts';
import { frozenSource } from '../strategies/project-model.ts';
export interface ComparisonColumn {
  result: Row | null;
  analysis: Analysis | null;
  resultError: string | null;
  analysisError: string | null;
}
const emptyColumn = (): ComparisonColumn => ({
  result: null,
  analysis: null,
  resultError: null,
  analysisError: null
});
async function readResult(record: BacktestRecord, signal?: AbortSignal): Promise<ComparisonColumn> {
  const column = emptyColumn();
  if (!record.hasResult)
    return column;
  const path = '/history/jobs/' + encodeURIComponent(record.id);
  try {
    const result = await api<Row>(path + '/result', undefined, signal);
    if (result.job_id !== record.id)
      throw new Error('返回的结果与所选回测不一致，已停止显示此列。');
    column.result = result;
  }
  catch (e) {
    if (signal?.aborted)
      throw e;
    column.resultError = errorText(e);
    return column;
  }
  if (!record.sourceSha256) {
    column.analysisError = '缺少冻结结果摘要，无法核对分析来源。';
    return column;
  }
  const inline = selectedAnalysis(column.result.analysis, record.id, record.sourceSha256);
  const derivedPath = analysisPath(path, column.result, inline, 'python', 'frozen');
  if (inline) {
    column.analysis = inline;
    return column;
  }
  try {
    const raw = await api<Row>(derivedPath!, undefined, signal);
    column.analysis = selectedAnalysis(raw, record.id, record.sourceSha256);
    if (!column.analysis)
      column.analysisError = '派生分析与本次结果的身份或格式不一致。';
  }
  catch (e) {
    if (signal?.aborted)
      throw e;
    column.analysisError = errorText(e);
  }
  return column;
}
export async function readComparison(records: BacktestRecord[], mode: 'results' | 'source', signal?: AbortSignal) {
  return Promise.all(records.map(async (record) => {
    if (mode === 'results')
      return readResult(record, signal);
    const result = await api<Row>('/history/jobs/' + encodeURIComponent(record.id) + '/manifest', undefined, signal);
    if (result.job_id !== record.id)
      throw new Error('返回的记录与所选回测不一致，已停止对比。');
    frozenSource(result.request);
    return { ...emptyColumn(), result };
  }));
}
// Experiment inputs (execution frequency, capital, dates, source, benchmark and
// dataset identity) are not compatibility gates. Explain actual metric policies.
export function comparisonNotes(columns: ComparisonColumn[]): string[] {
  const analyses = columns.flatMap(column => column.analysis ? [column.analysis] : []);
  if (analyses.length < 2)
    return [];
  const notes: string[] = [];
  if (new Set(analyses.map(a => a.policy.annualization)).size > 1)
    notes.push('年化因子不同，年化指标不可直接比较。');
  if (new Set(analyses.map(a => a.policy.risk_free_annual)).size > 1)
    notes.push('无风险利率不同，夏普、索提诺和阿尔法需按各自口径解读。');
  if (new Set(analyses.map(a => a.calculation_version)).size > 1)
    notes.push('计算版本不同，超额收益需按各自口径解读。');
  return notes;
}
