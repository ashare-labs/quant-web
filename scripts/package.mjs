import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
execFileSync(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit' });
const destination = resolve('.local/packages');
mkdirSync(destination, { recursive: true });
const [result] = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', destination, '--cache', resolve('.local/npm-cache')], { encoding: 'utf8' }));
const unexpected = result.files.filter(({ path }) => !/^(?:dist\/|docs\/|README\.md$|CONTRIBUTING\.md$|package\.json$)/.test(path));
if (unexpected.length) throw new Error(`Unexpected package content: ${unexpected.map(f => f.path).join(', ')}`);
const check = mkdtempSync(join(destination, 'verify-'));
try {
  execFileSync('tar', ['-xzf', join(destination, result.filename), '-C', check]);
  execFileSync(process.execPath, ['scripts/check-dist.mjs', join(check, 'package/dist')], { stdio: 'inherit' });
} finally { rmSync(check, { recursive: true, force: true }); }
console.log(`Static release verified: .local/packages/${result.filename} (${result.files.length} files)`);
