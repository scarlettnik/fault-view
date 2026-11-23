import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('../../', import.meta.url)));
import { cp, readFile, writeFile, mkdir, symlink, access, readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';

const workspace = process.argv.includes('--workspace');
const prefix = (workspace ? '/' : (process.env.SITE_BASE_PATH ?? '/')).replace(/\/?$/, '/');
if (!/^[/a-zA-Z0-9_.-]+$/.test(prefix) || !prefix.startsWith('/'))
  throw new Error('Invalid SITE_BASE_PATH');
const source = resolve('examples/open-source/sources');
const staging = resolve('examples/open-source/.runtime', workspace ? 'workspace-build' : 'pages');
const output = resolve('examples/open-source/.runtime', workspace ? 'workspace' : 'dist');
const run = (command, args, cwd, env = {}) => {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed`);
};
run(process.execPath, ['examples/tooling/setup.mjs'], process.cwd());
await mkdir(staging, { recursive: true });
await mkdir(output, { recursive: true });
const base = (id) => `${prefix}examples/${id}/`;
async function copy(root) {
  const dest = resolve(staging, root);
  await rm(dest, { recursive: true, force: true });
  await cp(resolve(source, root), dest, {
    recursive: true,
    filter: (path) =>
      !path
        .split('/')
        .some((part) => ['node_modules', '.git', '.angular', 'dist', 'build'].includes(part)),
  });
  await symlink(resolve(source, root, 'node_modules'), resolve(dest, 'node_modules'), 'dir');
  return dest;
}
async function edit(path, transform) {
  await writeFile(path, transform(await readFile(path, 'utf8')));
}
async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await files(path)));
    else result.push(path);
  }
  return result;
}
async function publish(id, from) {
  const dest = resolve(output, id);
  await rm(dest, { recursive: true, force: true });
  await cp(from, dest, { recursive: true });
  if (id === 'conduit' || id === 'robot-shop') {
    // Mirror the original external fonts and icon CSS so demos do not depend on a CDN at runtime.
    let html = await readFile(resolve(dest, 'index.html'), 'utf8');
    const expressions =
      id === 'conduit'
        ? [...html.matchAll(/href="(\/\/(?:fonts.googleapis.com|code.ionicframework.com)[^"]+)"/g)]
        : [...html.matchAll(/url\('(https:\/\/fonts.googleapis.com[^']+)'\)/g)];
    for (const match of expressions) {
      const remote = match[1].startsWith('//') ? `https:${match[1]}` : match[1];
      const local = await mirrorStyle(remote, dest, base(id));
      html = html.replaceAll(match[1], local);
    }
    await writeFile(resolve(dest, 'index.html'), html);
  }
  // The private workspace has an HTTP API. Pages must start its service worker first.
  if (!workspace)
    await edit(resolve(dest, 'index.html'), (html) => {
      const delayed = html.replace(
        /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
        (tag, attrs, body) => {
          const type = attrs.match(/\btype=["']([^"']+)["']/i)?.[1] ?? '';
          if (type && !['module', 'text/javascript', 'application/javascript'].includes(type))
            return tag;
          return `<script type="application/x-faultview" data-original-type="${type}"${attrs.replace(/\btype=["'][^"']*["']/i, '').replace(/\bsrc=/i, 'data-original-src=')}>${body}</script>`;
        },
      );
      return delayed.replace(
        '</body>',
        `<script type="module" src="${prefix}examples/runtime/bootstrap.js"></script></body>`,
      );
    });
  console.log(`Original ${id}: ${dest}`);
}

async function downloadAsset(url) {
  const digest = createHash('sha256').update(url).digest('hex').slice(0, 20);
  const cached = resolve('examples/open-source/.runtime/vendor', digest);
  try {
    return { digest, bytes: await readFile(cached) };
  } catch {
    /* First build downloads the original CDN asset. */
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Original asset ${url}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await mkdir(resolve('examples/open-source/.runtime/vendor'), { recursive: true });
  await writeFile(cached, bytes);
  return { digest, bytes };
}
async function mirrorStyle(url, directory, publicBase) {
  const { digest, bytes } = await downloadAsset(url);
  let css = bytes.toString('utf8');
  await mkdir(resolve(directory, 'vendor'), { recursive: true });
  for (const match of [...css.matchAll(/url\(["']?([^\s)'";]+)["']?\)/g)]) {
    if (match[1].startsWith('data:')) continue;
    const remote = new URL(match[1], url).href;
    const resource = await downloadAsset(remote);
    const name = resource.digest + (extname(new URL(remote).pathname) || '.woff2');
    await writeFile(resolve(directory, 'vendor', name), resource.bytes);
    css = css.replaceAll(match[1], `${publicBase}vendor/${name}`);
  }
  await writeFile(resolve(directory, 'vendor', `${digest}.css`), css);
  return `${publicBase}vendor/${digest}.css`;
}

const petclinic = await copy('petclinic-frontend');
await edit(resolve(petclinic, 'src/app/app-routing.module.ts'), (s) =>
  s.replace('bindToComponentInputs: true', 'bindToComponentInputs: true, useHash: true'),
);
for (const name of ['environment.ts', 'environment.prod.ts'])
  await edit(resolve(petclinic, 'src/environments', name), (s) =>
    s.replace('http://localhost:9966/petclinic/api/', `${base('petclinic')}api/`),
  );
run(
  'npm',
  ['run', 'build', '--', '--configuration', 'production', '--base-href', base('petclinic')],
  petclinic,
);
await publish('petclinic', resolve(petclinic, 'dist/browser'));

const conduit = await copy('conduit');
if (workspace)
  await edit(resolve(conduit, 'frontend/src/services/getTags.js'), (s) =>
    s.replace('"/api/tags"', `"${base('conduit')}api/tags"`),
  );
try {
  await access(resolve(source, 'conduit/frontend/node_modules'));
  await symlink(
    resolve(source, 'conduit/frontend/node_modules'),
    resolve(conduit, 'frontend/node_modules'),
    'dir',
  );
} catch {
  /* Dependencies may be hoisted. */
}
run('npm', ['run', 'build', '--', '--base', base('conduit')], resolve(conduit, 'frontend'));
await publish('conduit', resolve(conduit, 'frontend/dist'));

for (const [id, root] of [
  ['todo', 'todo/client'],
  ['react-express-mongodb', 'docker-compose-samples/react-express-mongodb/frontend'],
]) {
  const app = await copy(root);
  if (id === 'todo') {
    for (const path of await files(resolve(app, 'src')))
      if (/\.[jt]sx?$/.test(path))
        await edit(path, (s) =>
          s.replaceAll('http://localhost:8000/api/tutorials', `${base(id)}api/tutorials`),
        );
    await mkdir(resolve(app, 'public/vendor'), { recursive: true });
    await cp(
      resolve(source, root, 'node_modules/bootstrap/dist/js/bootstrap.bundle.min.js'),
      resolve(app, 'public/vendor/bootstrap.bundle.min.js'),
    );
    await edit(resolve(app, 'public/index.html'), (s) =>
      s
        .replace(
          /https:\/\/cdn.jsdelivr.net\/[^"']+/,
          '%PUBLIC_URL%/vendor/bootstrap.bundle.min.js',
        )
        .replace(/\s+integrity="[^"]*"/, '')
        .replace(/\s+crossorigin="[^"]*"/, ''),
    );
  } else if (workspace)
    await edit(resolve(app, 'src/App.js'), (s) => s.replaceAll('"/api', `"${base(id)}api`));
  run('npm', ['run', 'build'], app, {
    PUBLIC_URL: base(id).replace(/\/$/, ''),
    CI: 'false',
    GENERATE_SOURCEMAP: 'false',
    DISABLE_ESLINT_PLUGIN: 'true',
  });
  await publish(id, resolve(app, 'build'));
}

const robot = resolve(staging, 'robot-shop');
await rm(robot, { recursive: true, force: true });
await cp(resolve(source, 'robot-shop/web/static'), robot, { recursive: true });
if (!workspace)
  await edit(resolve(robot, 'index.html'), (s) =>
    s.replace('ng-app="robotshop"', 'data-upstream-app="robotshop"'),
  );
for (const path of await files(robot))
  if (['.html', '.css', '.js'].includes(extname(path)))
    await edit(path, (s) =>
      s
        .replace(/(['"])\/api\//g, `$1${workspace ? base('robot-shop') : '/'}api/`)
        .replaceAll(
          '$locationProvider.html5Mode(true)',
          "$locationProvider.html5Mode(false).hashPrefix('')",
        )
        .replace(/((?:src|href)=["']|url\(['"]?)\/(?!\/)/g, `$1${base('robot-shop')}`)
        .replace(/href="(login|cart|shipping|payment|product\/[^"']*)"/g, 'href="#/$1"')
        .replace(/<script type="text\/javascript">[\s\S]*?angular\.element[\s\S]*?<\/script>/, '')
        .replace(
          '<head>',
          `<head><base href="${base('robot-shop')}"><meta name="viewport" content="width=device-width, initial-scale=1">`,
        ),
    );
await mkdir(resolve(robot, 'vendor'), { recursive: true });
for (const name of ['angular', 'angular-route']) {
  const cached = resolve('examples/open-source/.runtime', `${name}-1.6.7.js`);
  try {
    await access(cached);
  } catch {
    const response = await fetch(
      `https://ajax.googleapis.com/ajax/libs/angularjs/1.6.7/${name}.js`,
    );
    if (!response.ok) throw new Error(`Cannot download original ${name}: ${response.status}`);
    await writeFile(cached, await response.text());
  }
  await cp(cached, resolve(robot, 'vendor', `${name}.js`));
  await edit(resolve(robot, 'index.html'), (s) =>
    s.replace(
      `https://ajax.googleapis.com/ajax/libs/angularjs/1.6.7/${name}.js`,
      `${base('robot-shop')}vendor/${name}.js`,
    ),
  );
}
await publish('robot-shop', robot);

// Export the original Storefront template and client; only its hosting paths change.
const storefront = resolve(staging, 'storefront');
await mkdir(storefront, { recursive: true });
const server = await readFile('examples/storefront/server.mjs', 'utf8');
const template = server.match(/res\.end\(`([\s\S]*?)`\);/)?.[1];
if (!template) throw new Error('Original Storefront HTML template not found');
await writeFile(
  resolve(storefront, 'index.html'),
  template
    .replaceAll('href="/', `href="${base('storefront')}#/`)
    .replace('src="/storefront.js"', `src="${base('storefront')}storefront.js"`),
);
const client = await readFile('examples/storefront/storefront.js', 'utf8');
await writeFile(
  resolve(storefront, 'storefront.js'),
  client.replace('window.location.pathname', "window.location.hash.slice(1) || '/products'") +
    "\nwindow.addEventListener('hashchange', () => { content.dataset.faultviewState = 'loading'; render().catch(() => { content.dataset.faultviewState = 'error'; }); });\n",
);
await cp('examples/storefront/openapi.json', resolve(storefront, 'openapi.json'));
await publish('storefront', storefront);

const runtime = resolve(output, 'runtime');
await mkdir(runtime, { recursive: true });
await cp('examples/pages', runtime, { recursive: true });
await cp('examples/pages/sw.js', resolve(output, 'sw.js'));
const catalogue = await readFile(resolve(source, 'robot-shop/mongo/catalogue.js'), 'utf8');
const rawProducts = catalogue.match(/insertMany\((\[[\s\S]*?\])\);/)?.[1];
if (!rawProducts) throw new Error('Original Robot Shop seed data not found');
// Convert the upstream JS object literal to JSON in an isolated build-time VM.
const { runInNewContext } = await import('node:vm');
await writeFile(
  resolve(runtime, 'robot-products.json'),
  JSON.stringify(runInNewContext(`(${rawProducts})`, Object.create(null), { timeout: 1000 })),
);
const sql = await readFile(
  resolve(source, 'petclinic-backend/src/main/resources/db/hsqldb/data.sql'),
  'utf8',
);
const table = (name) =>
  [...sql.matchAll(new RegExp(`INSERT INTO ${name} VALUES \\(([^;]+)\\);`, 'g'))].map((row) =>
    [...row[1].matchAll(/'([^']*)'|(\d+)/g)].map((value) => value[1] ?? Number(value[2])),
  );
const types = table('types').map(([id, name]) => ({ id, name }));
const specialties = table('specialties').map(([id, name]) => ({ id, name }));
const vetLinks = table('vet_specialties');
const visits = table('visits').map(([id, petId, date, description]) => ({
  id,
  petId,
  date,
  description,
}));
const pets = table('pets').map(([id, name, birthDate, typeId, ownerId]) => ({
  id,
  name,
  birthDate,
  ownerId,
  type: types.find((type) => type.id === typeId),
  visits: visits.filter((visit) => visit.petId === id),
}));
const owners = table('owners').map(([id, firstName, lastName, address, city, telephone]) => ({
  id,
  firstName,
  lastName,
  address,
  city,
  telephone: String(telephone),
  pets: pets.filter((pet) => pet.ownerId === id),
}));
const vets = table('vets').map(([id, firstName, lastName]) => ({
  id,
  firstName,
  lastName,
  specialties: vetLinks
    .filter(([vetId]) => vetId === id)
    .map(([, specialtyId]) => specialties.find((specialty) => specialty.id === specialtyId)),
}));
const productsLiteral = server.match(/const products = (\[[\s\S]*?\]);/)?.[1];
const dataLiteral = server.match(/const data = (\{[\s\S]*?\n\});/)?.[1];
if (!productsLiteral || !dataLiteral) throw new Error('Original Storefront data not found');
const storefrontData = runInNewContext(
  `const products = ${productsLiteral}; (${dataLiteral})`,
  Object.create(null),
  { timeout: 1000 },
);
await writeFile(
  resolve(runtime, 'fixtures.json'),
  JSON.stringify({
    petclinic: { owners, vets, types, specialties, pets },
    storefront: storefrontData,
  }),
);
const projects = JSON.parse(await readFile('examples/projects.json', 'utf8'));
const provenance = JSON.parse(await readFile('examples/open-source/manifest.json', 'utf8'));
await writeFile(resolve(output, 'source-provenance.json'), JSON.stringify(provenance, null, 2));
for (const example of provenance.examples) {
  const notices = [];
  for (const id of example.components) {
    const component = provenance.components.find((item) => item.id === id);
    notices.push(
      `${component.repo}\n${component.url}\nCommit: ${component.revision}\nLicense: ${component.license}\n`,
    );
    for (const name of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'license']) {
      try {
        notices.push(await readFile(resolve(source, id, name), 'utf8'));
        break;
      } catch {
        /* The manifest records upstream licensing when no root license file exists. */
      }
    }
  }
  await writeFile(resolve(output, example.id, 'THIRD_PARTY_NOTICES.txt'), notices.join('\n\n'));
}
await writeFile(
  resolve(output, 'index.html'),
  `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Оригинальные проекты · FaultView</title><link rel="stylesheet" href="runtime/catalog.css"></head><body><main><a href="${prefix}app/">← FaultView</a><h1>Шесть исходных проектов</h1><p>Те же frontend-исходники и версии, которые использовались для проверки. На Pages серверные ответы заменены локальным адаптером; внешний вид и компоненты взяты из оригиналов.</p><div class="catalog">${projects.map((p) => `<article><h2>${p.name}</h2><a href="${p.id}/">Открыть приложение ↗</a>${p.source ? `<a href="${p.source}">Исходный репозиторий</a>` : '<span>Исходный учебный Storefront</span>'}</article>`).join('')}</div></main></body></html>`,
);
await writeFile(resolve(output, 'projects.json'), JSON.stringify(projects));
console.log(`All six original frontends built for ${prefix}examples/`);
