import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
for (const args of [
  ['node_modules/typescript/bin/tsc', '--noEmit', '--incremental', 'false'],
  ['scripts/check-structure.mjs'],
  ['scripts/generate-contracts.mjs', '--check'],
  ['--experimental-strip-types', '--test', ...readdirSync('tests/unit').filter(p => p.endsWith('.test.mjs')).sort().map(p => `tests/unit/${p}`)],
]) execFileSync(process.execPath, args, { stdio: 'inherit' });
