import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join, normalize } from 'node:path';

const excluded = new Set(['.git', '.local', 'node_modules', 'dist', 'output', '.playwright-cli']);
const files = [];
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const file = join(directory, entry.name);
    if (entry.isDirectory()) { if (!excluded.has(entry.name)) walk(file); }
    else files.push(file.replace(/^\.\//, ''));
  }
}
walk('.');
const failures = [];
const domains = ['api', 'tasks', 'portfolio', 'paper'];
for (const file of files) {
  const name = basename(file);
  if (file.startsWith('src/') && /\.(?:[cm]?js|jsx)$/.test(name)) failures.push(`${file}: business modules must be TypeScript and pass strict type checking`);
  if (file.startsWith('contracts/') && ![...domains.map(domain => `${domain}.openapi.json`), 'api.identity.json', 'tasks.identity.json', 'paper.identity.json'].includes(name)) failures.push(`${file}: unexpected contract or historical identity`);
  if (file.startsWith('src/generated/') && !domains.some(domain => name === `${domain}.d.ts`)) failures.push(`${file}: no corresponding functional contract`);
  if (/^(?:src|scripts|tests|docs)\//.test(file) && dirname(file).split('/').some(part => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(part))) failures.push(`${file}: directory must use kebab-case`);
  if (/(?:^|\/)(?:archives?|evidence)(?:\/|$)/.test(file)) failures.push(`${file}: historical archive in release sources`);
  if (/^(?:\.env(?:\..*)?|\.npmrc)$|\.(?:db|sqlite3?|pem|key)$/.test(name)) { failures.push(`${file}: private file in source tree`); continue; }
  if (file.startsWith('src/') && name.endsWith('.tsx') && name !== 'main.tsx' && !/^[A-Z][A-Za-z0-9]*\.tsx$/.test(name)) failures.push(`${file}: component must use PascalCase`);
  if (file.startsWith('src/') && name.endsWith('.ts') && !name.endsWith('.d.ts') && !/^use[A-Z][A-Za-z0-9]*\.ts$/.test(name) && !/^[a-z0-9]+(?:-[a-z0-9]+)*\.ts$/.test(name)) failures.push(`${file}: module must use kebab-case`);
  if (name.endsWith('.py') && !/^[a-z0-9_]+\.py$/.test(name)) failures.push(`${file}: Python must use snake_case`);
  if (/^(?:scripts|docs)\//.test(file) && !/^[a-z0-9]+(?:[-.][a-z0-9]+)*$/.test(name)) failures.push(`${file}: script/document must use kebab-case`);
  if (!/\.(?:md|mjs|ts|tsx|json|html|css)$/.test(file) || name === 'package-lock.json') continue;
  const content = readFileSync(file, 'utf8');
  if (/\/Users\/|\/home\/[^/]+\/|\/private\/tmp\/|Documents\/Codex/.test(content)) failures.push(`${file}: personal local path`);
  if (file.startsWith('contracts/') && /"(?:default_path|bundle_path)"\s*:/.test(content)) failures.push(`${file}: machine configuration mixed into contract`);
  if (file.startsWith('src/') && /(?:from\s*|import\s*\()\s*['"][^'"]*\/(?:tests|scripts|output|docs|\.local)\//.test(content)) failures.push(`${file}: product imports development material`);
  if (name.endsWith('.md')) for (const [, link] of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    if (/^(?:https?:|mailto:|#)/.test(link)) continue;
    const target = decodeURIComponent(link.split('#')[0].replace(/^<|>$/g, ''));
    if (target.startsWith('/') || !existsSync(normalize(join(dirname(file), target)))) failures.push(`${file}: invalid local link ${link}`);
  }
}
if (existsSync('output')) failures.push('output/: generated or historical material must stay outside the current release tree');
if (failures.length) throw new Error(failures.join('\n'));
console.log(`Structure and local documentation links verified: ${files.length} files.`);
