import type { components } from '../generated/api';
export type Submission = components['schemas']['FactorCreate'];
export type Job = components['schemas']['FactorJobView'];
export type Result = components['schemas']['FactorResult'];
export interface Parameter {name: string; label: string; kind: 'number'|'integer'; required: boolean; minimum?: number; maximum?: number}
export interface Factor {id: string; library: string; field: string; name: string; category: string; definition: string; expression: string|null; description: string; inputs: string[]; warmup_rows: number|null; recursive_history: boolean; cross_section_rank: boolean; availability: string; note: string; parameters: Parameter[]; entrypoint: string; definition_versions: string[]; limitations: string[]; source?: string|null; license?: string|null}
export interface Catalogue {environment_id: string; items: Factor[]; evaluation_available: boolean; limits: {max_security_sessions: number; max_input_bytes: number}}
export interface Source {id: string; label: string; kind: string; ready: boolean; securities: string[]; total_securities: number; first: string|null; last: string|null; capabilities: string[]; fields: string[]; error: string|null; evaluation_basis?: string|null}
