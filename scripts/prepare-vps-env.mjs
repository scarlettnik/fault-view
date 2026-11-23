import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const [domain, ...extra] = process.argv.slice(2);
if (
  extra.length ||
  !domain ||
  (domain !== 'localhost' &&
    (domain.length > 253 ||
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(
        domain,
      )))
) {
  console.error('Usage: node scripts/prepare-vps-env.mjs localhost|faultview.example.org');
  process.exitCode = 1;
} else {
  const destination = new URL('../.env', import.meta.url);
  const random = (bytes) => randomBytes(bytes).toString('hex');
  try {
    await writeFile(
      destination,
      [
        `FAULTVIEW_PUBLIC_HOST=${domain.toLowerCase()}`,
        `FAULTVIEW_POSTGRES_PASSWORD=${random(32)}`,
        `FAULTVIEW_POSTGRES_ADMIN_PASSWORD=${random(32)}`,
        `AWS_ACCESS_KEY_ID=${random(16)}`,
        `AWS_SECRET_ACCESS_KEY=${random(32)}`,
        '',
      ].join('\n'),
      { mode: 0o600, flag: 'wx' },
    );
    console.log('Создан .env.');
  } catch (error) {
    if (error?.code === 'EEXIST') {
      console.error('.env уже существует. Сохраните текущие ключи и пароль томов.');
      process.exitCode = 1;
    } else throw error;
  }
}
