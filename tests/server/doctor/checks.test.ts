import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../../server/config';
import { runChecks, summarize, type CheckId, type CheckResult, type Probes } from '../../../server/doctor/checks';
import { fakeProbes } from './helpers';

const KEYS = {
  TYPESAFE_API_KEY: 'ts-SECRET', ANTHROPIC_API_KEY: 'an-SECRET',
  GOOGLE_CLIENT_ID: 'x.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'gs-SECRET',
};
type Env = Record<string, string | undefined>;

async function run(over: Partial<Probes> = {}, env: Env = KEYS, demo = false) {
  const results = await runChecks({ config: loadConfig(env), tokenPath: 'tok.json', dbPath: 'db.sqlite', demo, probes: fakeProbes(over) });
  const get = (id: CheckId): CheckResult => results.find(r => r.id === id)!;
  return { results, get, sum: summarize(results) };
}

describe('runChecks', () => {
  it('all pass', async () => {
    const { results, get, sum } = await run();
    expect(results.map(r => r.id)).toEqual(['node', 'deps', 'env_file', 'typesafe', 'anthropic', 'google_client', 'redirect_uri', 'gmail', 'folders']);
    expect(sum).toEqual({ ok: true, exitCode: 0 });
    expect(get('redirect_uri').detail).toBe('http://localhost:8787/api/auth/google/callback');
    expect(get('redirect_uri').status).toBe('info');
  });

  it('compares node versions numerically', async () => {
    const bad = await run({ nodeVersion: () => '22.11.0' });
    expect(bad.get('node').status).toBe('fail');
    expect(bad.sum.exitCode).toBe(1);
    expect((await run({ nodeVersion: () => '22.12.0' })).get('node').status).toBe('pass');
    expect((await run({ nodeVersion: () => '24.0.0' })).get('node').status).toBe('pass');
  });

  it('no typesafe key', async () => {
    const typesafe = vi.fn(async () => {});
    const { get, sum } = await run({ typesafe }, { ...KEYS, TYPESAFE_API_KEY: undefined });
    expect(get('typesafe').status).toBe('fail');
    expect(get('typesafe').hint).toContain('TYPESAFE_API_KEY');
    expect(typesafe).not.toHaveBeenCalled();
    expect(sum).toEqual({ ok: false, exitCode: 1 });
  });

  it('anthropic missing is only a warning', async () => {
    const { get, sum } = await run({}, { ...KEYS, ANTHROPIC_API_KEY: undefined });
    expect(get('anthropic').status).toBe('warn');
    expect(get('anthropic').required).toBe(false);
    expect(sum).toEqual({ ok: true, exitCode: 2 });
  });

  it('optional probe failure goes through classify', async () => {
    const anthropic = async () => { throw { message: 'fetch failed', cause: { cause: { code: 'ENOTFOUND' } } }; };
    const r = (await run({ anthropic })).get('anthropic');
    expect(r.status).toBe('warn');
    expect(r.errorCode).toBe('network');
  });

  it('google id must look right', async () => {
    expect((await run({}, { ...KEYS, GOOGLE_CLIENT_ID: 'nope' })).get('google_client').status).toBe('fail');
  });

  it('google_client failing skips gmail but keeps redirect_uri', async () => {
    const { get, sum } = await run({}, { ...KEYS, GOOGLE_CLIENT_ID: 'nope' });
    expect(get('gmail').status).toBe('skip');
    expect(get('redirect_uri').status).toBe('info');
    expect(sum.exitCode).toBe(1);
  });

  it('failing deps skips the network checks', async () => {
    const { get, sum } = await run({ depsInstalled: () => false });
    expect(get('typesafe').status).toBe('skip');
    expect(get('gmail').status).toBe('skip');
    expect(sum.exitCode).toBe(1);
  });

  it('gmail probe returns null', async () => {
    const r = (await run({ gmailProfile: async () => null })).get('gmail');
    expect(r.status).toBe('fail');
    expect(r.hint).toContain('Connect Gmail');
  });

  it('gmail probe throws invalid_grant', async () => {
    const r = (await run({ gmailProfile: async () => { throw { response: { data: { error: 'invalid_grant' } } }; } })).get('gmail');
    expect(r.status).toBe('fail');
    expect(r.errorCode).toBe('gmail_token_expired');
  });

  it('gmail passes with the address', async () => {
    expect((await run()).get('gmail').detail).toBe('me@gmail.com');
  });

  it('folders', async () => {
    const nul = (await run({ enabledFolderCount: () => null })).get('folders');
    expect(nul.status).toBe('fail');
    expect(nul.hint).toContain('choose folders');
    expect((await run({ enabledFolderCount: () => 0 })).get('folders').status).toBe('fail');
    expect((await run({ enabledFolderCount: () => 2 })).get('folders').status).toBe('pass');
  });

  it('env_file must exist and be ignored', async () => {
    expect((await run({ envFile: () => ({ exists: false, ignored: null }) })).get('env_file').status).toBe('fail');
    expect((await run({ envFile: () => ({ exists: true, ignored: false }) })).get('env_file').status).toBe('fail');
    expect((await run({ envFile: () => ({ exists: true, ignored: null }) })).get('env_file').status).toBe('pass');
  });

  const fakeCases: [string, Env, boolean][] = [['demo', {}, true], ['config.fake', { INBOX_SWEEP_FAKE: '1' }, false]];
  it.each(fakeCases)('fake mode (%s) skips what the fake inbox does not need', async (_n, env, demo) => {
    const { get, sum } = await run({}, env, demo);
    for (const id of ['typesafe', 'anthropic', 'google_client', 'gmail', 'folders'] as const) {
      expect(get(id).status).toBe('skip');
      expect(get(id).hint).toBe('not needed for the fake inbox');
    }
    expect(sum).toEqual({ ok: true, exitCode: 0 });
  });

  it('fake mode with env_file missing only warns', async () => {
    const { get, sum } = await run({ envFile: () => ({ exists: false, ignored: null }) }, {}, true);
    expect(get('env_file').status).toBe('warn');
    expect(sum.exitCode).toBe(0);
  });

  it('never leaks secrets', async () => {
    const boom = async () => { throw new Error('bad key ts-SECRET an-SECRET gs-SECRET'); };
    const { results } = await run({ typesafe: boom, anthropic: boom, gmailProfile: boom });
    const json = JSON.stringify(results);
    for (const s of ['ts-SECRET', 'an-SECRET', 'gs-SECRET']) expect(json).not.toContain(s);
  });
});

describe('summarize', () => {
  it('a skipped required check fails', () => {
    expect(summarize([{ id: 'gmail', status: 'skip', required: true }])).toEqual({ ok: false, exitCode: 1 });
  });
});
