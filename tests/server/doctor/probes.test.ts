import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { enabledFolderCount, envFileStatus } from '../../../server/doctor/probes';

const tmp = () => mkdtempSync(join(tmpdir(), 'doctor-probe-'));

function makeDb(value?: string): string {
  const path = join(tmp(), 'x.db');
  const db = new Database(path);
  if (value !== undefined) {
    db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    db.prepare(`INSERT INTO settings (key, value) VALUES ('settings', ?)`).run(value);
  }
  db.close();
  return path;
}

describe('enabledFolderCount', () => {
  it('is null for a missing file and does not create it', () => {
    const p = join(tmp(), 'nope.db');
    expect(enabledFolderCount(p)).toBeNull();
    expect(existsSync(p)).toBe(false);
  });
  it('counts enabled folders', () => {
    expect(enabledFolderCount(makeDb(JSON.stringify({ folders: [{ name: 'A', enabled: true }, { name: 'B', enabled: false }] })))).toBe(1);
  });
  it('is null without a settings table', () => {
    expect(enabledFolderCount(makeDb())).toBeNull();
  });
  it('is null for invalid JSON', () => {
    expect(enabledFolderCount(makeDb('{nope'))).toBeNull();
  });
});

describe('envFileStatus', () => {
  it('reports no .env', () => {
    expect(envFileStatus(tmp(), () => 0)).toEqual({ exists: false, ignored: null });
  });
  it('reads git check-ignore', () => {
    const d = tmp();
    writeFileSync(join(d, '.env'), '');
    expect(envFileStatus(d, () => 0)).toEqual({ exists: true, ignored: true });
    expect(envFileStatus(d, () => 1)).toEqual({ exists: true, ignored: false });
  });
  it('is null when git is missing', () => {
    const d = tmp();
    writeFileSync(join(d, '.env'), '');
    expect(envFileStatus(d, () => { throw Object.assign(new Error('spawn git'), { code: 'ENOENT' }); })).toEqual({ exists: true, ignored: null });
  });
});
