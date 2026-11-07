import Anthropic from '@anthropic-ai/sdk';
import Database from 'better-sqlite3';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { google } from 'googleapis';
import type { Email } from '../../shared/types';
import { TypeSafeJev } from '../jev/client';
import { makeClient, readTokens } from '../mail/oauth';
import type { Probes } from './checks';

const PING_EMAIL: Email = {
  threadId: 'doctor', latestMessageId: 'doctor', fromName: 'Doctor', fromAddress: 'doctor@example.com',
  subject: 'inbox-sweep doctor check', date: new Date().toISOString(), labels: [], body: 'This is a connectivity check.', unread: true,
};

/** Read-only; null when there is no DB file, no settings row or the row is unreadable. */
export function enabledFolderCount(dbPath: string): number | null {
  let db: Database.Database | undefined;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    const row = db.prepare(`SELECT value FROM settings WHERE key = 'settings'`).get() as { value: string } | undefined;
    if (!row) return null;
    const folders = (JSON.parse(row.value) as { folders?: { enabled?: boolean }[] }).folders;
    return Array.isArray(folders) ? folders.filter(f => f?.enabled).length : null;
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

const gitCheckIgnore = (cwd: string) => (args: string[]): number => {
  const r = spawnSync('git', args, { cwd });
  if (r.error) throw r.error;
  return r.status ?? 1;
};

export function envFileStatus(cwd: string, git: (args: string[]) => number = gitCheckIgnore(cwd)): { exists: boolean; ignored: boolean | null } {
  if (!existsSync(join(cwd, '.env'))) return { exists: false, ignored: null };
  try {
    const code = git(['check-ignore', '-q', '.env']);
    return { exists: true, ignored: code === 0 ? true : code === 1 ? false : null };
  } catch {
    return { exists: true, ignored: null };
  }
}

export function realProbes(cwd: string = process.cwd()): Probes {
  return {
    nodeVersion: () => process.versions.node,
    depsInstalled: () => existsSync(join(cwd, 'node_modules', '@typesafe-ai', 'sdk')),
    envFile: () => envFileStatus(cwd),
    async typesafe(key, model) { await new TypeSafeJev(key, model).ask(PING_EMAIL, []); },
    async anthropic(key, model) {
      await new Anthropic({ apiKey: key }).messages.create({ model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] });
    },
    async gmailProfile(config, tokenPath) {
      const tokens = readTokens(tokenPath);
      const auth = makeClient(config);
      if (!tokens || !auth) return null;
      // In-memory only: no persistRefreshes, so doctor never writes the token file.
      auth.setCredentials(tokens);
      const { data } = await google.gmail({ version: 'v1', auth }).users.getProfile({ userId: 'me' });
      return data.emailAddress ?? null;
    },
    enabledFolderCount,
  };
}
