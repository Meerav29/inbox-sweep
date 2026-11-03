import { join } from 'node:path';
import { expect, test } from 'vitest';
import { dbFileName } from '../../../server/db/path';

const has = (...names: string[]) => (p: string) => names.some((n) => p === join('d', n));

test('a fresh data dir uses inbox-sweep.db', () => {
  expect(dbFileName('d', false, has())).toBe('inbox-sweep.db');
});
test('only a pre-rename jev-sweep.db: keep using it', () => {
  expect(dbFileName('d', false, has('jev-sweep.db'))).toBe('jev-sweep.db');
});
test('both exist: inbox-sweep.db wins', () => {
  expect(dbFileName('d', false, has('jev-sweep.db', 'inbox-sweep.db'))).toBe('inbox-sweep.db');
});
test('only inbox-sweep.db exists', () => {
  expect(dbFileName('d', false, has('inbox-sweep.db'))).toBe('inbox-sweep.db');
});
test('fake mode always uses fake.db', () => {
  expect(dbFileName('d', true, has('jev-sweep.db'))).toBe('fake.db');
});
