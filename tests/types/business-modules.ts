// These assertions fail compilation if a migrated boundary regresses to untyped JS/any.
import { resolveRoute } from '../../src/app/routes.ts';
import { time } from '../../src/shared/format.ts';
import { normalizeParameters, createRequest } from '../../src/features/tasks/parameters.ts';
import { validatePaperDay } from '../../src/features/tasks/evidence.ts';
import { validatePortfolioEvidence, selectionOf } from '../../src/features/portfolio/evidence.ts';
import { verifyCompatibility } from '../../src/features/portfolio/compatibility.ts';
import { positionRows } from '../../src/features/portfolio/positions.ts';
import { completeOperation, type Operation } from '../../src/features/portfolio/state.ts';
import type { Task } from '../../src/features/tasks/api';
import type { PortfolioModel } from '../../src/features/portfolio/api';

declare const limits: Task<'ParameterLimits'>;
declare const catalogue: Task<'JobCatalogue'>;
declare const job: PortfolioModel<'PortfolioJobView'>;
declare const manifest: PortfolioModel<'PortfolioManifest'>;
declare const logs: PortfolioModel<'JobLogs'>;
declare const operation: Operation;
// @ts-expect-error routes are browser hash strings
resolveRoute(123);
// @ts-expect-error timestamps are text, never numeric epoch guessing
time(123);
// @ts-expect-error raw form target shares must be numeric before normalization
normalizeParameters({ template: 'previous_close_band.v1', security: '600000.XSHG', frequency: '1d', initial_cash: '1000', target_shares: '100' }, limits);
// @ts-expect-error creation cannot omit window acknowledgement and parameters
createRequest(catalogue, { name: 'test' }, 'test');
// @ts-expect-error paper evidence is a typed view, not an arbitrary JSON string
validatePaperDay('{}', {}, '2020-01-01');
// @ts-expect-error job status must use the actual API enum
validatePortfolioEvidence(job.job_id, { ...job, status: 'complete' }, manifest, logs);
// @ts-expect-error selection must carry the full data/security/date/mode scope
selectionOf({ dataset_id: 'test' });
// @ts-expect-error compatibility catalogue must supply actual capabilities
verifyCompatibility({}, {}, {}, {});
// @ts-expect-error positions are named structured holdings, not numeric arrays
positionRows([{ date: '2020-01-01', positions: [1] }]);
// @ts-expect-error operation state cannot silently accept arbitrary strings
completeOperation({ ...operation, state: 'unconfirmed' });
// @ts-expect-error persisted bodies are unknown until validated, never silently trusted as create contracts
const trustedRequest: PortfolioModel<'PortfolioCreate'> = operation.body;
void trustedRequest;
