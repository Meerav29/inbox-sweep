import { expect, test } from 'vitest';
import { loadConfig } from '../../server/config';
import { DEFAULT_SETTINGS } from '../../shared/types';

test('defaults', () => {
  const c = loadConfig({});
  expect(c).toMatchObject({ jevModel: 'jev-1.14.0', claudeModel: 'claude-haiku-5-5', port: 8787, fake: false, concurrency: 6, cardTextTimeoutMs: 4000 });
});
test('fake mode + keys from env', () => {
  const c = loadConfig({ INBOX_SWEEP_FAKE: '1', TYPESAFE_API_KEY: 'k' });
  expect(c.fake).toBe(true); expect(c.keys.typesafe).toBe('k');
});
test('default settings', () => {
  expect(DEFAULT_SETTINGS).toMatchObject({ query: 'in:inbox is:unread -category:promotions -category:social', batchSize: 20, dryRun: false,
    thresholds: { guardNoul: 0.5, importantQueue: 0.7, needsReplyQueue: 0.7, autoArchiveConfidence: 0.85, proposeConfidence: 0.6, recentDays: 7 } });
});
test('webOrigin defaults to the Vite port and trims a trailing slash', () => {
  expect(loadConfig({}).webOrigin).toBe('http://localhost:5173');
  expect(loadConfig({ WEB_ORIGIN: 'http://localhost:3000/' }).webOrigin).toBe('http://localhost:3000');
});

test('the server port comes from INBOX_SWEEP_PORT, never the generic PORT', () => {
  expect(loadConfig({ INBOX_SWEEP_PORT: '9001' }).port).toBe(9001);
  // Tools set PORT for the web dev server; reading it made the API collide with Vite.
  expect(loadConfig({ PORT: '5173' }).port).toBe(8787);
  expect(loadConfig({ INBOX_SWEEP_PORT: '9001', PORT: '5173' }).port).toBe(9001);
});

test('an INBOX_SWEEP_PORT that is not a valid port falls back to 8787', () => {
  for (const v of ['', 'abc', '80x', '1.5', '0', '-1', '65536']) {
    expect(loadConfig({ INBOX_SWEEP_PORT: v }).port).toBe(8787);
  }
  expect(loadConfig({ INBOX_SWEEP_PORT: ' 65535 ' }).port).toBe(65535);
});

test('the old JEV_SWEEP_* names still work as a fallback', () => {
  expect(loadConfig({ JEV_SWEEP_PORT: '9002' }).port).toBe(9002);
  expect(loadConfig({ JEV_SWEEP_FAKE: '1' }).fake).toBe(true);
  expect(loadConfig({ JEV_SWEEP_DATA_DIR: 'old' }).dataDir).toBe('old');
});

test('the new INBOX_SWEEP_* names are read', () => {
  expect(loadConfig({ INBOX_SWEEP_PORT: '9003' }).port).toBe(9003);
  expect(loadConfig({ INBOX_SWEEP_FAKE: '1' }).fake).toBe(true);
  expect(loadConfig({ INBOX_SWEEP_DATA_DIR: 'new' }).dataDir).toBe('new');
});

test('the new name wins over the old one; an empty new name falls back to the old', () => {
  expect(loadConfig({ INBOX_SWEEP_PORT: '9003', JEV_SWEEP_PORT: '9002' }).port).toBe(9003);
  expect(loadConfig({ INBOX_SWEEP_DATA_DIR: 'new', JEV_SWEEP_DATA_DIR: 'old' }).dataDir).toBe('new');
  expect(loadConfig({ INBOX_SWEEP_PORT: '', JEV_SWEEP_PORT: '9002' }).port).toBe(9002);
  expect(loadConfig({ INBOX_SWEEP_DATA_DIR: '', JEV_SWEEP_DATA_DIR: 'old' }).dataDir).toBe('old');
});
