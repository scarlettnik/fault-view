import { cp, mkdir, rm, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const name of ['index.html', 'styles', 'scripts', 'assets']) {
  await cp(new URL(name, root), new URL(name, output), { recursive: true });
}

await writeFile(new URL('.nojekyll', output), '');
