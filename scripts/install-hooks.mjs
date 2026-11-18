import { spawnSync } from 'node:child_process';
const repository = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' });
if (repository.status === 0 && process.env.CI !== 'true' && process.env.VERCEL !== '1') {
  const result = spawnSync('git', ['config', '--local', 'core.hooksPath', '.githooks'], {
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
} else console.log('Git hooks: skipped in CI or outside a Git checkout.');
