import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

// Bundle the actual TS/TSX product module with the same compiler as production.
// No server is started; React remains external so the test uses one React instance.
export async function importSource(entry) {
  await mkdir('.local', { recursive: true });
  const directory = await mkdtemp(resolve('.local/test-module-'));
  try {
    const bundle = await build({ configFile: false, logLevel: 'silent', build: {
      ssr: resolve(entry), write: false, minify: false,
      rollupOptions: { output: { entryFileNames: 'entry.mjs' } },
    } });
    const outputs = Array.isArray(bundle) ? bundle.flatMap(b => b.output) : bundle.output;
    for (const output of outputs) {
      const path = join(directory, output.fileName);
      await writeFile(path, output.type === 'chunk' ? output.code : output.source);
    }
    return await import(pathToFileURL(join(directory, 'entry.mjs')).href);
  } finally { await rm(directory, { recursive: true, force: true }); }
}
