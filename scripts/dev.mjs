import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const all = process.argv.includes('--all');
const fullstack = process.argv.includes('--fullstack') || !!process.env.DATABASE_URL;
if (fullstack && (!process.env.DATABASE_URL || !process.env.FAULTVIEW_S3_BUCKET)) {
  throw new Error('Set DATABASE_URL and FAULTVIEW_S3_BUCKET before starting FaultView full stack.');
}
const demoPort = Number(process.env.FAULTVIEW_DEMO_PORT ?? 4400);
const frontendPort = process.env.FAULTVIEW_FRONTEND_PORT ?? '5173';
const landingPort = Number(process.env.FAULTVIEW_LANDING_PORT ?? 4173);
const runnerPort = process.env.FAULTVIEW_RUNNER_PORT ?? '3001';
const clientOrigins = [
  ...new Set([
    `http://127.0.0.1:${frontendPort}`,
    `http://localhost:${frontendPort}`,
    `http://127.0.0.1:${landingPort}`,
    `http://localhost:${landingPort}`,
  ]),
].join(',');
const env = {
  ...process.env,
  ...(fullstack
    ? {
        VITE_API_URL: process.env.VITE_API_URL ?? `http://127.0.0.1:${runnerPort}/api/v1`,
        FAULTVIEW_DEMO_URL: process.env.FAULTVIEW_DEMO_URL ?? `http://127.0.0.1:${demoPort}/`,
      }
    : {}),
  VITE_RUNNER_URL: process.env.VITE_RUNNER_URL ?? `http://127.0.0.1:${runnerPort}`,
  VITE_EXAMPLES_ORIGIN: `http://127.0.0.1:${landingPort}`,
  FAULTVIEW_CLIENT_ORIGINS: process.env.FAULTVIEW_CLIENT_ORIGINS ?? clientOrigins,
  FAULTVIEW_TARGET_ORIGINS: process.env.FAULTVIEW_TARGET_ORIGINS ?? clientOrigins,
};
if (all) {
  const build = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', env });
  if (build.status !== 0) process.exit(build.status ?? 1);
}
const children = [];
let stopping = false;
let landing;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  landing?.close();
  for (const child of children) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      /* Process already stopped. */
    }
  }
  process.exitCode = code;
}
function start(args) {
  const child = spawn('npm', args, { cwd: root, stdio: 'inherit', env, detached: true });
  children.push(child);
  child.on('error', (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on('exit', (code) => stop(stopping ? 0 : (code ?? 1)));
}
if (fullstack && !process.env.FAULTVIEW_DEMO_URL)
  start(['--prefix', 'examples/storefront', 'run', 'dev']);
start(['--prefix', 'apps/backend', 'run', 'start']);
if (all) {
  landing = serve(fileURLToPath(new URL('../site-dist/', import.meta.url)), landingPort);
} else {
  landing = serve(fileURLToPath(new URL('../apps/landing/', import.meta.url)), landingPort, {
    appOrigin: `http://127.0.0.1:${frontendPort}/`,
    examplesDirectory: fileURLToPath(
      new URL('../examples/open-source/.runtime/dist/', import.meta.url),
    ),
  });
  start(['--prefix', 'apps/frontend', 'run', 'dev', '--', '--port', frontendPort]);
}
console.log(
  `Landing: http://127.0.0.1:${landingPort} | App: http://127.0.0.1:${all ? landingPort + '/app/' : frontendPort} | Playwright: ${env.VITE_RUNNER_URL}`,
);
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
landing.on('error', () => stop(1));
