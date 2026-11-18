import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

export function serve(directory, port, options = {}) {
  const root = resolve(directory);
  const basePath = options.basePath ?? '/';
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.woff2': 'font/woff2',
  };
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      if (options.appOrigin && pathname.startsWith('/app/')) {
        response.writeHead(302, { Location: options.appOrigin }).end();
        return;
      }
      if (!pathname.startsWith(basePath)) {
        response.writeHead(404).end('Not found');
        return;
      }
      const path = resolve(root, `./${decodeURIComponent(pathname.slice(basePath.length))}`);
      if (path !== root && !path.startsWith(root + sep)) {
        response.writeHead(403).end();
        return;
      }
      const file = (await stat(path)).isDirectory() ? resolve(path, 'index.html') : path;
      const contents = await readFile(file);
      response.writeHead(200, {
        'Content-Type': types[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      response.end(contents);
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
  server.listen(port, '127.0.0.1', () =>
    console.log(`Static site: http://127.0.0.1:${port}${basePath}`),
  );
  server.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  return server;
}
if (import.meta.url === pathToFileURL(process.argv[1]).href)
  serve(process.argv[2] ?? 'site-dist', Number(process.argv[3] ?? 4173), {
    basePath: process.argv[4] ?? '/',
  });
