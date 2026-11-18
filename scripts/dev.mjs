import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const frontendPort = process.env.FAULTVIEW_FRONTEND_PORT ?? '5173';
const landingPort = Number(process.env.FAULTVIEW_LANDING_PORT ?? 4173);
const landing = serve(fileURLToPath(new URL('../apps/landing/', import.meta.url)), landingPort, {
  appOrigin: `http://127.0.0.1:${frontendPort}/`,
});
const frontend = spawn(
  'npm',
  ['--prefix', 'apps/frontend', 'run', 'dev', '--', '--port', frontendPort],
  { cwd: root, stdio: 'inherit', detached: true },
);
console.log(`Landing: http://127.0.0.1:${landingPort} | App: http://127.0.0.1:${frontendPort}`);
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  landing.close();
  try {
    process.kill(-frontend.pid, 'SIGTERM');
  } catch {
    /* Process already stopped. */
  }
  process.exitCode = code;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
frontend.on('error', (error) => {
  console.error(error.message);
  stop(1);
});
frontend.on('exit', (code) => stop(stopping ? 0 : (code ?? 1)));
landing.on('error', () => stop(1));
