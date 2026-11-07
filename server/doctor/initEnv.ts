import { constants, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** Copies .env.example to .env. Never overwrites an existing .env. */
export function initEnv(cwd: string): 'created' | 'exists' | 'no-example' {
  const src = join(cwd, '.env.example');
  if (!existsSync(src)) return 'no-example';
  try {
    copyFileSync(src, join(cwd, '.env'), constants.COPYFILE_EXCL);
    return 'created';
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return 'exists';
    throw err;
  }
}
