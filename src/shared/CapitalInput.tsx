import { useLayoutEffect, useRef } from 'react';
import { formatCapital, unformatCapital } from './capital';
export function CapitalInput({ value, readOnly, onChange }: {
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null), selection = useRef<{
    start: number;
    end: number;
  } | null>(null);
  useLayoutEffect(() => {
    const range = selection.current;
    if (range && document.activeElement === ref.current)
      ref.current?.setSelectionRange(range.start, range.end);
    selection.current = null;
  });
  return <input ref={ref} type="text" inputMode="decimal" aria-label="初始资金" value={formatCapital(value)} readOnly={readOnly} placeholder="人民币" onChange={event => {
    const input = event.currentTarget;
    const start = unformatCapital(input.value.slice(0, input.selectionStart ?? input.value.length)).length;
    const end = unformatCapital(input.value.slice(0, input.selectionEnd ?? input.value.length)).length;
    const raw = unformatCapital(input.value), formatted = formatCapital(raw);
    const caret = (digits: number) => {
      let position = 0, count = 0;
      while (position < formatted.length && count < digits) {
        if (formatted[position] !== ',')
          count++;
        position++;
      }
      return position;
    };
    selection.current = { start: caret(start), end: caret(end) };
    onChange(raw);
  }} />;
}
