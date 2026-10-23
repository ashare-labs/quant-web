const shanghaiDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function todayInShanghai(now = new Date()): string {
  const parts = shanghaiDate.formatToParts(now);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-');
}

export const validDate = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && day > '0000-12-31'
  && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;

export function validateDateRange(
  {start, end}: {start: string; end: string},
  {today = todayInShanghai(), allowIncomplete = false}: {today?: string; allowIncomplete?: boolean} = {},
) {
  if ([start, end].some(day => day ? !validDate(day) : !allowIncomplete)) throw new Error('请选择有效的开始和结束日期。');
  if (start > today || end > today) throw new Error(`开始和结束日期不能晚于今天（上海时间 ${today}）。`);
  if (start && end && end < start) throw new Error('结束日期不能早于开始日期。');
}
