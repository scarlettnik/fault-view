import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const platform = 'linux/amd64';
const output = join(root, 'dist');

function read(command, args, cwd = root) {
  return execFileSync(command, args, { cwd, encoding: 'utf8' }).trim();
}

function run(command, args, cwd = root) {
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}

const revision = read('git', ['rev-parse', 'HEAD']);
const tag = revision.slice(0, 12);
const release = 'faultview-linux-amd64-' + tag;
const archive = join(output, release + '.tar.gz');
mkdirSync(output, { recursive: true });
const staging = mkdtempSync(join(output, '.docker-bundle-'));
try {
  const source = join(staging, 'source');
  const bundle = join(staging, release);
  mkdirSync(source);
  mkdirSync(bundle);
  const snapshot = join(staging, 'source.tar');
  run('git', ['archive', '--format=tar', '-o', snapshot, revision]);
  run('tar', ['-xf', snapshot, '-C', source]);

  const spec = JSON.parse(
    read(
      'docker',
      [
        'compose',
        '-f',
        'compose.yaml',
        'config',
        '--no-interpolate',
        '--no-normalize',
        '--no-path-resolution',
        '--no-env-resolution',
        '--format',
        'json',
      ],
      source,
    ),
  );
  const images = [];
  for (const [name, service] of Object.entries(spec.services)) {
    const image = 'faultview/' + name + ':' + tag;
    if (service.build) {
      run(
        'docker',
        [
          'build',
          '--platform',
          platform,
          '--target',
          service.build.target,
          '--tag',
          image,
          '--label',
          'org.opencontainers.image.revision=' + revision,
          service.build.context,
        ],
        source,
      );
    } else {
      let existing;
      try {
        existing = read('docker', [
          'image',
          'inspect',
          '--format',
          '{{.Os}}/{{.Architecture}}',
          service.image,
        ]);
      } catch {
        // Fetch a base image if a suitable local image is unavailable.
      }
      if (existing !== platform) run('docker', ['pull', '--platform', platform, service.image]);
      run('docker', ['image', 'tag', service.image, image]);
    }
    delete service.build;
    service.image = image;
    service.platform = platform;
    service.pull_policy = 'never';
    images.push(image);
  }

  for (const file of [
    'deploy/playwright-seccomp.json',
    'deploy/postgres-init.sh',
    'scripts/prepare-vps-env.mjs',
  ]) {
    mkdirSync(join(bundle, file.split('/')[0]), { recursive: true });
    copyFileSync(join(source, file), join(bundle, file));
  }
  writeFileSync(join(bundle, 'compose.json'), JSON.stringify(spec, null, 2) + '\n');
  writeFileSync(join(bundle, 'VERSION'), revision + '\n' + platform + '\n');
  writeFileSync(
    join(bundle, 'README.md'),
    [
      '# FaultView — готовый Docker-комплект',
      '',
      'Сборка ' +
        revision +
        ' для Linux x86-64. Нужны Docker Engine с Compose, домен с DNS на IP VPS и свободные TCP-порты 80/443.',
      '',
      'Выполните команды в распакованном каталоге. Замените faultview.example.org на свой домен.',
      '',
      '    docker load -i images.tar',
      '    docker run --rm --network none --pull never --user "$(id -u):$(id -g)" \\',
      '      -v "$PWD:/bundle" -w /bundle --entrypoint node ' + spec.services.app.image + ' \\',
      '      scripts/prepare-vps-env.mjs faultview.example.org',
      '    docker compose -f compose.json --env-file .env.production up --no-build --pull never --wait',
      '',
      'Лендинг открывается на https://ваш-домен/, SPA — на https://ваш-домен/app/, проверка готовности — на https://ваш-домен/health.',
      '',
      'Для проверки войдите в SPA, откройте демопроект, постройте граф и запустите проверку.',
      '',
      'Для обновления загрузите образы нового комплекта и используйте Compose-файл из него с сохранённым .env.production и теми же именованными томами. Перед обновлением сделайте резервную копию PostgreSQL и S3. Сохраните предыдущий комплект на случай отката.',
      '',
    ].join('\n'),
  );

  run('docker', [
    'image',
    'save',
    '--platform',
    platform,
    '-o',
    join(bundle, 'images.tar'),
    ...images,
  ]);
  const temporaryArchive = join(staging, 'release.tar.gz');
  run('tar', ['-C', staging, '-czf', temporaryArchive, release]);
  renameSync(temporaryArchive, archive);
  console.log(archive);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
