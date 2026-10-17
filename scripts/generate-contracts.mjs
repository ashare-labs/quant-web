import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const all = ['api', 'tasks', 'portfolio', 'paper'];
const args = process.argv.slice(2), check = args.includes('--check');
const domains = args.filter(arg => arg !== '--check');
if (domains.some(domain => !all.includes(domain))) throw new Error(`Choose domains: ${all.join(', ')}.`);
if (check) {
  const identity = JSON.parse(readFileSync('contracts/api.identity.json', 'utf8'));
  for (const domain of all) {
    const name = `${domain}.openapi.json`;
    if (createHash('sha256').update(readFileSync(`contracts/${name}`)).digest('hex') !== identity.contracts[name]) throw new Error(`${name} differs from the imported AQ identity.`);
  }
  for (const domain of ['tasks', 'paper']) {
    const pin = JSON.parse(readFileSync(`contracts/${domain}.identity.json`, 'utf8'));
    if (pin.source_sha256 !== identity.source_sha256 || pin.version !== identity.backend_version) throw new Error(`${domain} identity differs from the imported AQ identity.`);
  }
}
const temporary = check ? mkdtempSync(join(tmpdir(), 'quant-web-contracts-')) : null;
try {
  for (const domain of domains.length ? domains : all) {
    const target = `src/generated/${domain}.d.ts`;
    const generated = temporary ? join(temporary, `${domain}.d.ts`) : target;
    execFileSync(process.execPath, ['node_modules/openapi-typescript/bin/cli.js', `contracts/${domain}.openapi.json`, '-o', generated], { stdio: 'pipe' });
    if (check && !readFileSync(target).equals(readFileSync(generated))) throw new Error(`${target} is stale; run npm run contracts:generate.`);
    console.log(`${domain}: ${check ? 'generated types match' : 'types generated'}`);
  }
} finally { if (temporary) rmSync(temporary, { recursive: true, force: true }); }
