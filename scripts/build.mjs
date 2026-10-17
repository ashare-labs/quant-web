import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
for (const args of [
  ['node_modules/typescript/bin/tsc', '--noEmit', '--incremental', 'false'],
  ['node_modules/vite/bin/vite.js', 'build'],
]) execFileSync(process.execPath, args, { stdio: 'inherit' });
const files = ['package.json', 'package-lock.json', 'README.md', 'CONTRIBUTING.md', 'index.html', 'tsconfig.json', 'vite.config.ts', '.gitignore'];
for (const directory of ['src', 'contracts', 'scripts', 'tests', 'docs']) {
  for (const entry of readdirSync(directory, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) files.push(join(entry.parentPath, entry.name));
  }
}
const source = createHash('sha256');
for (const file of files.sort()) source.update(file).update('\0').update(readFileSync(file)).update('\0');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const backend = JSON.parse(readFileSync('contracts/api.identity.json', 'utf8'));
writeFileSync('dist/release.json', JSON.stringify({ frontend_version: pkg.version,
  frontend_source_sha256: source.digest('hex'), aq_version: backend.backend_version,
  aq_source_sha256: backend.source_sha256, independent_review_status: 'not_reviewed' }, null, 2) + '\n');
execFileSync(process.execPath, ['scripts/check-dist.mjs'], { stdio: 'inherit' });
