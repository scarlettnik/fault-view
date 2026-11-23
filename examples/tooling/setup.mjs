import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('../../', import.meta.url)));
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const restore = spawnSync(process.execPath, ['examples/tooling/restore.mjs'], { stdio: 'inherit' });
if (restore.status !== 0) process.exit(restore.status ?? 1);
const roots = [
  ['petclinic-frontend', 'node_modules/@angular/cli/bin/ng.js'],
  ['conduit', 'node_modules/vite/bin/vite.js'],
  ['todo/client', 'node_modules/react-scripts/bin/react-scripts.js'],
  [
    'docker-compose-samples/react-express-mongodb/frontend',
    'node_modules/react-scripts/bin/react-scripts.js',
  ],
];
for (const [root, entry] of roots) {
  const cwd = resolve('examples/open-source/sources', root);
  if (existsSync(resolve(cwd, entry))) continue;
  const result = spawnSync(
    'npm',
    ['ci', '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund'],
    { cwd, stdio: 'inherit' },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const manifest = JSON.parse(await readFile('examples/open-source/manifest.json', 'utf8'));
console.log(`Original examples ready (${manifest.components.length} pinned components).`);
