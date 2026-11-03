import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The SQLite file name inside the data dir. New installs use inbox-sweep.db; an install from before the rename keeps
 * its jev-sweep.db (never renamed or copied) until an inbox-sweep.db exists.
 */
export function dbFileName(dataDir: string, fake: boolean, exists: (path: string) => boolean = existsSync): string {
  if (fake) return 'fake.db';
  if (!exists(join(dataDir, 'inbox-sweep.db')) && exists(join(dataDir, 'jev-sweep.db'))) return 'jev-sweep.db';
  return 'inbox-sweep.db';
}
