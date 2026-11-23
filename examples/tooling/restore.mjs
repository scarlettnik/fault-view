import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('../../', import.meta.url)));
import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const manifest = JSON.parse(await readFile('examples/open-source/manifest.json', 'utf8'));
for (const component of manifest.components) {
  const directory = `examples/open-source/sources/${component.id}`;
  const marker = join(directory, '.upstream-revision');
  const restoredRevision = await readFile(marker, 'utf8').catch(() => '');
  if (restoredRevision.trim() === component.revision) {
    console.log(`${component.id}: ${component.revision.slice(0, 12)} already restored`);
    continue;
  }
  await mkdir(directory, { recursive: true });
  const archive = `/tmp/faultview-upstream-${component.id}-${component.revision}.tar.gz`;
  try {
    await access(archive);
  } catch {
    console.log(`Downloading original ${component.repo}@${component.revision.slice(0, 12)}`);
    const response = await fetch(
      `https://codeload.github.com/${component.repo}/tar.gz/${component.revision}`,
      { signal: AbortSignal.timeout(120_000) },
    );
    if (!response.ok) throw new Error(`${component.id}: HTTP ${response.status}`);
    await writeFile(archive, new Uint8Array(await response.arrayBuffer()));
  }
  const result = spawnSync('tar', ['-xzf', archive, '--strip-components=1', '-C', directory], {
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error(`Cannot restore ${component.id}`);
  await writeFile(marker, `${component.revision}\n`);
  console.log(`Restored original ${component.id} @ ${component.revision.slice(0, 12)}`);
}
