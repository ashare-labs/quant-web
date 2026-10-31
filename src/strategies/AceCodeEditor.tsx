import { useEffect, useRef } from 'react';
import * as ace from 'ace-builds';
import type { Ace } from 'ace-builds';
import 'ace-builds/src-noconflict/mode-python';
import 'ace-builds/src-noconflict/mode-toml';
import 'ace-builds/src-noconflict/theme-monokai';
import './editor.css';
import type { CodeEditorProps } from './CodeEditor';
/** One session per file keeps cursor, scroll and undo history when switching files. */
export function AceCodeEditor({ value, onChange, readOnly = false, path = 'strategy.py' }: CodeEditorProps) {
  const container = useRef<HTMLDivElement>(null);
  const editor = useRef<Ace.Editor | null>(null);
  const sessions = useRef(new Map<string, Ace.EditSession>());
  const current = useRef({ value, onChange, readOnly, path });
  const syncing = useRef(false);
  current.current = { value, onChange, readOnly, path };
  useEffect(() => {
    if (!container.current)
      return;
    const instance = ace.edit(container.current);
    editor.current = instance;
    instance.setTheme('ace/theme/monokai');
    instance.setOptions({
      fontFamily: 'Menlo, Consolas, monospace',
      fontSize: 13,
      showPrintMargin: false,
      showGutter: true,
      showLineNumbers: true,
      highlightActiveLine: true,
      displayIndentGuides: true,
      useSoftTabs: true,
      tabSize: 4,
      useWorker: false,
      enableKeyboardAccessibility: true,
      scrollPastEnd: 0.25,
    });
    instance.renderer.setPadding(16);
    instance.renderer.setScrollMargin(16, 16, 0, 0);
    const handleChange = () => {
      if (!syncing.current && !current.current.readOnly) {
        current.current.onChange(instance.getValue());
      }
    };
    instance.on('change', handleChange);
    const resize = new ResizeObserver(() => instance.resize());
    resize.observe(container.current);
    return () => {
      resize.disconnect();
      instance.off('change', handleChange);
      const activeSession = instance.getSession();
      instance.destroy();
      for (const session of sessions.current.values()) {
        if (session !== activeSession)
          session.destroy();
      }
      sessions.current.clear();
      editor.current = null;
    };
  }, []);
  useEffect(() => {
    const instance = editor.current;
    if (!instance)
      return;
    syncing.current = true;
    try {
      let session = sessions.current.get(path);
      if (!session) {
        session = ace.createEditSession(value);
        session.setOptions({
          mode: path.endsWith('.toml') ? 'ace/mode/toml' : 'ace/mode/python',
          useWorker: false,
          useSoftTabs: true,
          tabSize: 4,
          wrap: false,
        });
        sessions.current.set(path, session);
      }
      else if (session.getValue() !== value) {
        // External replacement (for example loading another revision) is deliberate.
        session.setValue(value);
      }
      if (instance.getSession() !== session) {
        const previous = instance.getSession();
        instance.setSession(session);
        if (![...sessions.current.values()].includes(previous))
          previous.destroy();
      }
      instance.setReadOnly(readOnly);
      instance.setOption('textInputAriaLabel', `${path} ${readOnly ? '只读代码' : '代码编辑器'}`);
      const input = instance.textInput.getElement();
      input.setAttribute('aria-label', `${path} ${readOnly ? '只读代码' : '代码编辑器'}`);
      input.setAttribute('aria-readonly', String(readOnly));
      input.setAttribute('spellcheck', 'false');
      instance.resize();
    }
    finally {
      syncing.current = false;
    }
  }, [path, readOnly, value]);
  return <div ref={container} className="code-editor python-code-editor" role="group" aria-label={`${path} 编辑区`} />;
}
