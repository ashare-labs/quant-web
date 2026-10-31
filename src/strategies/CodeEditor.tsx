import { lazy, Suspense } from 'react';
import './editor.css';
export interface CodeEditorProps {
  value: string;
  onChange: (source: string) => void;
  readOnly?: boolean;
  path?: string;
}
const Editor = lazy(() => import('./AceCodeEditor').then(module => ({ default: module.AceCodeEditor })));
export function CodeEditor(props: CodeEditorProps) {
  return <Suspense fallback={<div className="python-code-editor editor-loading" role="status">正在载入编辑器…</div>}>
    <Editor {...props} />
  </Suspense>;
}
