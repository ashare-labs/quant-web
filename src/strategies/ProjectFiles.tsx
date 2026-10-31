import { useEffect, useMemo, useState } from 'react';
import './editor.css';
export interface ProjectFilesProps {
  files: Record<string, string>;
  entrypoint: string;
  active: string;
  onSelect: (path: string) => void;
  onCreate: () => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
  onEntry?: (path: string) => void;
  readOnly?: boolean;
  projectName: string;
  collapsed: boolean;
  onToggle: () => void;
}
interface FileNode {
  name: string;
  path: string;
  children?: Map<string, FileNode>;
}
function fileTree(paths: string[]) {
  const root = new Map<string, FileNode>();
  for (const path of paths) {
    const parts = path.split('/');
    let level = root;
    parts.forEach((name, index) => {
      let node = level.get(name);
      if (!node) {
        node = { name, path: parts.slice(0, index + 1).join('/') };
        if (index < parts.length - 1)
          node.children = new Map();
        level.set(name, node);
      }
      if (node.children)
        level = node.children;
    });
  }
  return root;
}
const icon = (name: string) => <i className={`fa fa-${name}`} aria-hidden="true" />;
export function ProjectFiles({
  files, entrypoint, active, onSelect, onCreate, onRename, onDelete,
  onEntry, readOnly = false, projectName, collapsed, onToggle,
}: ProjectFilesProps) {
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const tree = useMemo(() => fileTree(Object.keys(files).filter(path => path !== 'aquant.toml')), [files]);
  const selectedFile = active !== 'aquant.toml' && Object.hasOwn(files, active);
  useEffect(() => {
    setClosed(previous => {
      const next = new Set(previous);
      for (const path of previous) {
        if (active.startsWith(`${path}/`))
          next.delete(path);
      }
      return next.size === previous.size ? previous : next;
    });
  }, [active]);
  function toggleDirectory(path: string) {
    setClosed(previous => {
      const next = new Set(previous);
      if (next.has(path))
        next.delete(path);
      else
        next.add(path);
      return next;
    });
  }
  function renderTree(nodes: Map<string, FileNode>, depth = 0) {
    return <ul className="project-files-list">
      {[...nodes.values()].sort((a, b) => Number(Boolean(b.children)) - Number(Boolean(a.children))
        || a.name.localeCompare(b.name)).map(node => {
          const isDirectory = Boolean(node.children);
          const expanded = !closed.has(node.path);
          return <li key={node.path}>
            {isDirectory ? <>
              <button
                type="button"
                className="project-file-row project-directory-row"
                style={{ paddingLeft: 12 + depth * 14 }}
                onClick={() => toggleDirectory(node.path)}
                aria-expanded={expanded}
                title={node.path}
              >
                {icon(expanded ? 'angle-down' : 'angle-right')}
                {icon(expanded ? 'folder-open-o' : 'folder-o')}
                <span className="project-file-name">{node.name}</span>
              </button>
              {expanded && node.children && renderTree(node.children, depth + 1)}
            </> : <button type="button" className={`project-file-row${active === node.path
              ? ' is-active'
              : ''}`} style={{ paddingLeft: 26 + depth * 14 }} onClick={() => onSelect(node.path)} aria-current={active === node.path
                ? 'page'
                : undefined} title={node.path}>
              {icon('file-code-o')}
              <span className="project-file-name">{node.name}</span>
              {entrypoint === node.path && <span className="project-entry-tag">入口</span>}
            </button>}
          </li>;
        })}
    </ul>;
  }
  return <nav className={`project-files${collapsed ? ' is-collapsed' : ''}`} aria-label="项目文件">
    <div className="project-files-heading">
      {!collapsed && <span className="project-files-title" title={projectName}>
        {icon('cube')}
        <span>
          {projectName}
        </span>
      </span>}
      <button type="button" className="project-tree-button" onClick={onToggle} aria-label={collapsed
        ? '展开文件树'
        : '收起文件树'} title={collapsed
          ? '展开文件树'
          : '收起文件树'} aria-expanded={!collapsed}>
        {icon(collapsed ? 'angle-double-right' : 'angle-double-left')}
      </button>
    </div>
    {!collapsed && <>
      <div className="project-files-scroll">
        {renderTree(tree)}
        <button type="button" className={`project-file-row project-system-file${active === 'aquant.toml'
          ? ' is-active'
          : ''}`} onClick={() => onSelect('aquant.toml')} aria-current={active === 'aquant.toml'
            ? 'page'
            : undefined} title="系统生成的项目描述，只读">
          {icon('lock')}
          <span className="project-file-name">aquant.toml</span>
          <span className="project-system-tag">只读</span>
        </button>
      </div>
      {!readOnly && <div className="project-file-actions">
        <button type="button" className="project-tree-button" onClick={onCreate} title="新建文件" aria-label="新建文件">
          {icon('plus')}
        </button>
        <button type="button" className="project-tree-button" onClick={() => onRename(active)} disabled={!selectedFile} title="文件改名或移动" aria-label="文件改名或移动">
          {icon('pencil')}
        </button>
        {onEntry
          && <button type="button" className="project-tree-button" onClick={() => onEntry(active)} disabled={!selectedFile
            || active === entrypoint} title="设为入口" aria-label="设为入口">
            {icon('sign-in')}
          </button>}
        <button type="button" className="project-tree-button" onClick={() => onDelete(active)} disabled={!selectedFile
          || active === entrypoint} title={active === entrypoint
            ? '请先将其他文件设为入口'
            : '删除文件'} aria-label="删除文件">
          {icon('trash-o')}
        </button>
      </div>}
    </>}
  </nav>;
}
