import { newDraft, readDrafts, saveDraft, saveDraftUpdates, type Draft } from './drafts.ts';
import { displayName, parentDirectory } from './strategy-files.ts';

// The existing draft is the one editable working copy. A pending request and a
// historical manifest are immutable run records, never editor restore sources.
export function findEditorDraft(path: string | null, id: string | null) {
  return readDrafts().find(draft => path ? draft.filePath === path : draft.id === id);
}

export function openFileDraft(path: string, source: string, stored?: Draft): Draft {
  if (stored?.filePath && stored.filePath !== path) throw new Error('草稿与策略文件不一致，原内容已保留。');
  if (stored?.workingCopy) return {...stored, filePath:path};
  return {...(stored || newDraft()), name:displayName(path), folder:parentDirectory(path), source, filePath:path, workingCopy:false};
}

export function editedDraft(draft: Draft, patch: Partial<Draft>): Draft {
  return {...draft, ...patch, workingCopy:true, updated:new Date().toISOString()};
}

export function retainEditorDraft(draft: Draft) {
  // Incomplete dates, empty amounts and in-progress source must survive too.
  // Validation belongs to Save/Run, not to retaining the working copy.
  saveDraft(draft);
}

export function savedEditorDraft(draft: Draft): Draft {
  return {...draft, workingCopy:false, updated:new Date().toISOString()};
}

export function commitEditorSave(previous: Draft, saved: Draft, originalFileSource: string | null) {
  const updates:Draft[]=[];
  if(previous.filePath&&previous.filePath!==saved.filePath&&originalFileSource!==null){
    // Save As creates a different file. The original file must not reopen with
    // the renamed working copy after that copy has been saved at its new path.
    updates.push(savedEditorDraft({...previous,name:displayName(previous.filePath),source:originalFileSource}));
  }
  updates.push(saved);
  saveDraftUpdates(updates);
}
