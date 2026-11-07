import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatHuman, main, parseArgs } from '../../../server/doctor/cli';
import type { CheckResult } from '../../../server/doctor/checks';
import { fakeProbes } from './helpers';

const tmp = () => mkdtempSync(join(tmpdir(), 'doctor-cli-'));
const SECRET = 'sk-fixture-secret-123';

// main() loads <cwd>/.env into process.env; keep the tests independent of the machine's own keys.
function withEnv<T>(vars: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) saved[k] = process.env[k];
  Object.assign(process.env, vars);
  return fn().finally(() => { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
}
const env = { TYPESAFE_API_KEY: SECRET, ANTHROPIC_API_KEY: SECRET, GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: SECRET };

describe('parseArgs', () => {
  it('reads flags', () => {
    expect(parseArgs(['--json', '--demo'])).toEqual({ json: true, demo: true, initEnv: false });
    expect(parseArgs(['--init-env'])).toEqual({ json: false, demo: false, initEnv: true });
  });
});

describe('main', () => {
  it('prints parseable JSON with exit 0', async () => {
    const d = tmp();
    const r = await withEnv(env, () => main(['--json'], d, fakeProbes()));
    expect(r.exitCode).toBe(0);
    const parsed = JSON.parse(r.output);
    expect(parsed.ok).toBe(true);
    expect(Array.isArray(parsed.checks)).toBe(true);
    expect(r.output).not.toContain(SECRET);
  });
  it('--init-env creates .env and still runs the checks', async () => {
    const d = tmp();
    writeFileSync(join(d, '.env.example'), 'X=1\n');
    const r = await main(['--init-env', '--demo'], d, fakeProbes({ envFile: () => ({ exists: true, ignored: true }) }));
    expect(existsSync(join(d, '.env'))).toBe(true);
    expect(r.output).toContain('node');
  });
  it('never creates data/', async () => {
    const d = tmp();
    await withEnv(env, () => main([], d, fakeProbes()));
    expect(existsSync(join(d, 'data'))).toBe(false);
  });
});

describe('formatHuman', () => {
  it('has a line per check and the redirect URI', () => {
    const results: CheckResult[] = [
      { id: 'node', status: 'pass', required: true, detail: '22.12.0' },
      { id: 'deps', status: 'fail', required: true, hint: 'Run npm install.' },
      { id: 'redirect_uri', status: 'info', required: false, detail: 'http://localhost:8787/api/auth/google/callback' },
    ];
    const out = formatHuman(results);
    expect(out.trim().split('\n').filter(l => /node|deps|redirect_uri/.test(l))).toHaveLength(3);
    expect(out).toContain('http://localhost:8787/api/auth/google/callback');
  });
});
