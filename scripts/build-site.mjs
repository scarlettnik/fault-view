import { spawnSync } from 'node:child_process';
import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';

const prefix = (process.env.SITE_BASE_PATH ?? '/').replace(/\/?$/, '/');
if (!prefix.startsWith('/') || !/^[/a-zA-Z0-9_.-]+$/.test(prefix))
  throw new Error('SITE_BASE_PATH must be an absolute URL path');
const appBase = `${prefix}app/`;
const examples = spawnSync('npm', ['run', 'build:examples'], { stdio: 'inherit' });
if (examples.status !== 0) process.exit(examples.status ?? 1);
for (const application of ['landing', 'frontend']) {
  const result = spawnSync('npm', ['--prefix', `apps/${application}`, 'run', 'build'], {
    stdio: 'inherit',
    env: { ...process.env, VITE_BASE_PATH: appBase },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const storybook = spawnSync('npm', ['run', 'build:storybook'], { stdio: 'inherit' });
if (storybook.status !== 0) process.exit(storybook.status ?? 1);
await rm('site-dist', { recursive: true, force: true });
await mkdir('site-dist', { recursive: true });
await cp('apps/landing/dist', 'site-dist', { recursive: true });
await cp('apps/frontend/dist', 'site-dist/app', { recursive: true });
await cp('apps/frontend/storybook-static', 'site-dist/storybook', { recursive: true });
await cp('examples/open-source/.runtime/dist', 'site-dist/examples', { recursive: true });
const landing = await readFile('site-dist/index.html', 'utf8');
await writeFile('site-dist/index.html', landing.replaceAll('href="app/"', `href="${appBase}"`));
await writeFile('site-dist/.nojekyll', '');
console.log(`Combined site: site-dist (SPA base ${appBase})`);
