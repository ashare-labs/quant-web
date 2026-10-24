import { DEFAULT_CAPITAL } from '../shared/capital.ts';
import { DEFAULT_FREQUENCY, resolveFrequency, type Frequency } from '../shared/drafts.ts';
import { object } from '../shared/api.ts';
import { projectResponse, sameProjectSource, type StrategyProject } from './project-model.ts';

export interface ProjectDraft extends StrategyProject {start:string;end:string;capital:string;frequency:Frequency;active:string;workingCopy:boolean;updated:string}
const keyPrefix='quantweb-project-draft-v1:';
export function readProjectDraft(id:string):ProjectDraft|undefined{
  const raw=localStorage.getItem(keyPrefix+id);if(!raw)return;
  const data=object(JSON.parse(raw)),project=projectResponse(data);
  if(project.strategy_id!==id||!['start','end','capital','active','updated'].every(key=>typeof data[key]==='string')||typeof data.workingCopy!=='boolean')throw new Error('项目浏览器草稿无法读取，原内容已保留。');
  return {...project,start:data.start as string,end:data.end as string,capital:data.capital as string,frequency:resolveFrequency(data.frequency),active:data.active as string,updated:data.updated as string,workingCopy:data.workingCopy};
}
export function retainProjectDraft(draft:ProjectDraft){
  // Refuse to erase a corrupt existing record while preserving the current input in memory.
  readProjectDraft(draft.strategy_id);
  localStorage.setItem(keyPrefix+draft.strategy_id,JSON.stringify(draft));
}
export function openProjectDraft(project:StrategyProject,stored?:ProjectDraft):{draft:ProjectDraft;conflict:boolean}{
  if(stored&&stored.strategy_id!==project.strategy_id)throw new Error('浏览器草稿不属于当前策略项目。');
  const changed=!!stored?.workingCopy&&!sameProjectSource(stored,project);
  const draft:ProjectDraft={...project,start:stored?.start??'',end:stored?.end??'',capital:stored?.capital??DEFAULT_CAPITAL,frequency:stored?.frequency??DEFAULT_FREQUENCY,active:stored?.active??project.entrypoint,workingCopy:false,updated:stored?.updated??''};
  if(changed&&stored){draft.files=stored.files;draft.entrypoint=stored.entrypoint;draft.revision=stored.revision;draft.workingCopy=true;}
  if(draft.active!=='aquant.toml'&&!Object.hasOwn(draft.files,draft.active))draft.active=draft.entrypoint;
  return {draft,conflict:changed&&stored?.revision!==project.revision};
}
export function editProjectDraft(draft:ProjectDraft,patch:Partial<ProjectDraft>):ProjectDraft{
  const next={...draft,...patch,updated:new Date().toISOString()};
  next.workingCopy=draft.workingCopy||!sameProjectSource(draft,next);
  return next;
}
export function savedProjectDraft(draft:ProjectDraft,saved:StrategyProject):ProjectDraft{
  const active=draft.active==='aquant.toml'||Object.hasOwn(saved.files,draft.active)?draft.active:saved.entrypoint;
  return {...draft,...saved,active,workingCopy:false,updated:new Date().toISOString()};
}
export function relocatedProjectDraft(draft:ProjectDraft,current:StrategyProject){
  if(draft.strategy_id!==current.strategy_id)throw new Error('移动后的项目身份不一致。');
  // A location change cannot accept a new source baseline, including a conflict
  // already present before the move. Only save or explicit review can do that.
  const conflict=draft.revision!==current.revision&&!sameProjectSource(draft,current);
  return {draft:{...draft,path:current.path},conflict};
}
