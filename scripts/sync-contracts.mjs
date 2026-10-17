import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--from') throw new Error('Usage: npm run contracts:sync -- --from <AQ generated contract directory>');
const source = resolve(args[1]);
const identity = JSON.parse(readFileSync(join(source, 'identity.json'), 'utf8'));
if (!/^[a-f0-9]{64}$/.test(identity.source_sha256) || typeof identity.backend_version !== 'string'
    || identity.independent_review_status !== 'not_reviewed') throw new Error('Expected a new unreviewed AQ source identity.');
const documents = ['api', 'tasks', 'portfolio', 'paper'].map(domain => {
  const name = `${domain}.openapi.json`, raw = readFileSync(join(source, name));
  if (createHash('sha256').update(raw).digest('hex') !== identity.contracts[name]) throw new Error(`AQ identity does not match ${name}.`);
  const value = JSON.parse(raw);
  if (value.openapi !== '3.1.0' || !value.paths) throw new Error(`Invalid OpenAPI document: ${name}.`);
  return { name, raw };
});
// Validate the entire supplied set before replacing any committed contract.
for (const { name, raw } of documents) writeFileSync(join('contracts', name), raw);
writeFileSync('contracts/api.identity.json', JSON.stringify(identity, null, 2) + '\n');
for (const [domain, version] of [['tasks', 'm2-jobs.v6'], ['paper', 'paper-api.v2']]) {
  writeFileSync(`contracts/${domain}.identity.json`, JSON.stringify({ version: identity.backend_version,
    source_sha256: identity.source_sha256, contract_version: version,
    independent_review_status: identity.independent_review_status }, null, 2) + '\n');
}
execFileSync(process.execPath, ['scripts/generate-contracts.mjs'], { stdio: 'inherit' });
console.log(`Imported AQ ${identity.backend_version}; review status remains not_reviewed.`);
