import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
const root = resolve(process.argv[2] || 'dist');
const index = readFileSync(join(root, 'index.html'), 'utf8');
for (const [, asset] of index.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)) {
  if (!existsSync(join(root, asset))) throw new Error(`Missing built asset: ${asset}`);
}
const files = readdirSync(root, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile());
for (const file of files) {
  if (!/\.(?:js|css|html|json)$/.test(file.name)) continue;
  if (/\/Users\/|\/home\/[^/]+\/|\/private\/tmp\/|Documents\/Codex/.test(readFileSync(join(file.parentPath, file.name), 'utf8'))) {
    throw new Error(`Personal local path in built asset: ${file.name}`);
  }
}
console.log(`Built assets verified: ${files.length} files; no personal paths.`);
