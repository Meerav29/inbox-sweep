import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { expect, test, vi } from 'vitest';
import { loadConfig } from '../../../server/config';
import { oauthRoutes } from '../../../server/mail/oauth';

// After a sign-in the running app has to pick up the new token, or it keeps using the old one until it is restarted.
// `onSignedIn` is how the routes say so, whatever WEB_ORIGIN the callback redirects to.
function setup(env: Record<string, string> = {}, getToken?: () => Promise<unknown>) {
  const cfg = loadConfig({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'sec', INBOX_SWEEP_PORT: '9999', ...env });
  const tokenPath = join(mkdtempSync(join(tmpdir(), 'inbox-sweep-signed-in-')), 'google-token.json');
  const client = Object.assign(new EventEmitter(), {
    generateAuthUrl: vi.fn((o: { state: string }) => `https://accounts.example.com/auth?state=${o.state}`),
    getToken: vi.fn(getToken ?? (async () => ({ tokens: { access_token: 'a', refresh_token: 'r' } }))),
    setCredentials: vi.fn(),
  });
  const tokenWhenCalled: boolean[] = [];
  const onSignedIn = vi.fn(() => { tokenWhenCalled.push(existsSync(tokenPath)); });
  const app = oauthRoutes(cfg, tokenPath, client as never, onSignedIn);
  const callback = async (query: (state: string) => string) => {
    const start = await app.request('/api/auth/google');
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!;
    return app.request(`/api/auth/google/callback?${query(state)}`);
  };
  const signIn = () => callback((state) => `code=c&state=${state}`);
  return { app, callback, signIn, onSignedIn, tokenWhenCalled };
}

test('a finished sign-in tells the app once, after the token is on disk', async () => {
  const { signIn, onSignedIn, tokenWhenCalled } = setup();
  const res = await signIn();
  expect(res.headers.get('location')).toBe('http://localhost:5173/');
  expect(onSignedIn).toHaveBeenCalledTimes(1);
  expect(tokenWhenCalled).toEqual([true]);
});

test.each([
  ['a custom origin', 'http://127.0.0.1:4000', 'http://127.0.0.1:4000/'],
  ['an origin with a path', 'http://localhost:5173/app', 'http://localhost:5173/app/'],
])('a finished sign-in tells the app with %s', async (_name, origin, redirect) => {
  const { signIn, onSignedIn } = setup({ WEB_ORIGIN: origin });
  expect((await signIn()).headers.get('location')).toBe(redirect);
  expect(onSignedIn).toHaveBeenCalledTimes(1);
});

test('a declined sign-in does not tell the app', async () => {
  const { app, onSignedIn } = setup();
  const res = await app.request('/api/auth/google/callback?error=access_denied');
  expect(res.headers.get('location')).toBe('http://localhost:5173/?auth=error');
  expect(onSignedIn).not.toHaveBeenCalled();
});

test('a callback with a wrong state does not tell the app', async () => {
  const { app, onSignedIn } = setup();
  expect((await app.request('/api/auth/google/callback?code=c&state=nope')).status).toBe(400);
  expect(onSignedIn).not.toHaveBeenCalled();
});

test('a failed token exchange does not tell the app', async () => {
  const { signIn, onSignedIn } = setup({}, async () => { throw new Error('invalid_grant'); });
  expect((await signIn()).headers.get('location')).toBe('http://localhost:5173/?auth=error');
  expect(onSignedIn).not.toHaveBeenCalled();
});
