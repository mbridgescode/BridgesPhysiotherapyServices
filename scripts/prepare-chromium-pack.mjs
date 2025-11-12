import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, mkdirSync, rmSync } from 'node:fs';

const filePath = fileURLToPath(import.meta.url);
const scriptsDir = dirname(filePath);
const projectRoot = dirname(scriptsDir);

const resolveChromiumBin = () => {
  const resolved = import.meta.resolve('@sparticuz/chromium');
  const resolvedPath = fileURLToPath(resolved);
  const buildDir = dirname(resolvedPath);
  const packageRoot = dirname(buildDir);
  return join(packageRoot, 'bin');
};

const ensurePublicDir = () => {
  const publicDir = join(projectRoot, 'public');
  if (!existsSync(publicDir)) {
    mkdirSync(publicDir, { recursive: true });
  }
  return publicDir;
};

const createArchive = (binDir, outputPath) => {
  if (existsSync(outputPath)) {
    rmSync(outputPath);
  }

  const result = spawnSync('tar', ['-cf', outputPath, '-C', binDir, '.'], {
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw result.error || new Error('Unable to create Chromium archive');
  }
};

const main = () => {
  try {
    const binDir = resolveChromiumBin();
    const publicDir = ensurePublicDir();
    const outputPath = join(publicDir, 'chromium-pack.tar');

    createArchive(binDir, outputPath);
    console.log(`[chromium-pack] Archived Chromium files to ${outputPath}`);
  } catch (error) {
    console.warn('[chromium-pack] Skipping Chromium archive generation:', error.message);
  }
};

main();
