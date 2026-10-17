import { useEffect, useRef } from "react";
import ace from "ace-builds";
import "ace-builds/src-noconflict/mode-python";
import "ace-builds/src-noconflict/mode-json";
import "ace-builds/src-noconflict/theme-monokai";
import "ace-builds/src-noconflict/ext-searchbox";

export function StrategyEditor({
  value,
  onChange,
  language = "python",
  readOnly = false,
  onSave,
}: {
  value: string;
  onChange?: (s: string) => void;
  language?: string;
  readOnly?: boolean;
  onSave?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    instance = useRef<ace.Ace.Editor | null>(null);
  const change = useRef(onChange),
    save = useRef(onSave);
  change.current = onChange;
  save.current = onSave;
  useEffect(() => {
    const editor = ace.edit(host.current!);
    instance.current = editor;
    editor.setTheme("ace/theme/monokai");
    editor.session.setUseWorker(false);
    editor.setOptions({
      fontFamily: 'Monaco, "Lucida Console", "Courier New", monospace',
      fontSize: 14,
      showPrintMargin: false,
      tabSize: 4,
      wrap: false,
      highlightActiveLine: true,
    });
    editor.on("change", () => change.current?.(editor.getValue()));
    editor.commands.addCommand({
      name: "saveDraft",
      bindKey: { win: "Ctrl-S", mac: "Command-S" },
      exec: () => save.current?.(),
    });
    editor.textInput.getElement().setAttribute("aria-label", "策略代码编辑器");
    const observer = new ResizeObserver(() => editor.resize());
    observer.observe(host.current!);
    return () => {
      observer.disconnect();
      editor.destroy();
      instance.current = null;
    };
  }, []);
  useEffect(() => {
    const editor = instance.current!;
    if (editor.getValue() !== value) editor.setValue(value, -1);
  }, [value]);
  useEffect(() => {
    instance.current!.session.setMode(`ace/mode/${language}`);
    instance.current!.setReadOnly(readOnly);
  }, [language, readOnly]);
  return (
    <div
      className="qw-editor"
      role="group"
      aria-label="策略代码编辑器"
      ref={host}
      data-testid="strategy-editor"
    />
  );
}
