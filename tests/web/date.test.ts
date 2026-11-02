import { expect, test } from 'vitest';
import { describeDate } from '../../web/cards/date';

const now = new Date('2026-11-01T12:00:00Z');
const d = (iso: string) => describeDate(iso, now);

test('relative phrases', () => {
  expect(d('2026-11-01T11:00:00Z')).toBe('Nov 1, 2026 · today');
  expect(d('2026-10-31T11:00:00Z')).toBe('Oct 31, 2026 · yesterday');
  expect(d('2026-10-27T12:00:00Z')).toBe('Oct 27, 2026 · 5 days ago');
  expect(d('2026-09-01T12:00:00Z')).toBe('Sep 1, 2026 · 2 months ago');
  expect(d('2025-10-01T12:00:00Z')).toBe('Oct 1, 2025 · 1 year ago');
  expect(d('2023-03-04T12:00:00Z')).toBe('Mar 4, 2023 · 3 years ago');
});
test('future dates read as today', () => expect(d('2026-12-01T12:00:00Z')).toBe('Dec 1, 2026 · today'));
test('missing or invalid gives nothing', () => {
  expect(describeDate('', now)).toBe('');
  expect(describeDate(undefined, now)).toBe('');
  expect(describeDate('garbage', now)).toBe('');
});
