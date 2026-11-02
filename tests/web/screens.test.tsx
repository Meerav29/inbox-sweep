// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { Setup } from '../../web/screens/Setup';
import { Home } from '../../web/screens/Home';
import { mergeFolders } from '../../web/screens/Folders';
import { DEFAULT_SETTINGS } from '../../shared/types';
import type { SessionSummary, SetupStatus, Stats } from '../../shared/types';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const status = (o: Partial<SetupStatus> = {}): SetupStatus => ({
  typesafe: true, anthropic: true, google: true, gmailConnected: true, foldersChosen: true, fake: false, ...o,
});

test('Setup lists the missing items with their fixes and marks the rest done', () => {
  render(<Setup status={status({ typesafe: false, gmailConnected: false, foldersChosen: false })} onFolders={() => {}} onRecheck={() => {}} />);
  const ts = screen.getByTestId('setup-typesafe');
  expect(ts.className).toBe('todo');
  expect(within(ts).getByRole('link', { name: 'How to add it' }).getAttribute('href')).toMatch(/#typesafe$/);
  expect(screen.getByTestId('setup-anthropic').className).toBe('ok');
  expect(screen.getByRole('link', { name: 'Connect Gmail' }).getAttribute('href')).toBe('/api/auth/google');
  expect(screen.getByRole('button', { name: 'Choose folders' })).toHaveProperty('disabled', true);
});

test('Setup shows Anthropic as optional, ticked only when the key is present', () => {
  const { unmount } = render(<Setup status={status({ anthropic: false })} onFolders={() => {}} onRecheck={() => {}} />);
  const row = screen.getByTestId('setup-anthropic');
  expect(row.className).toBe('todo');
  expect(row.textContent).toMatch(/optional/i);
  expect(within(row).getByRole('link').getAttribute('href')).toMatch(/#anthropic$/);
  unmount();
  render(<Setup status={status({ anthropic: true })} onFolders={() => {}} onRecheck={() => {}} />);
  expect(screen.getByTestId('setup-anthropic').className).toBe('ok');
});

test('Setup shows a sign-in error line when asked', () => {
  render(<Setup status={status({ gmailConnected: false })} authError onFolders={() => {}} onRecheck={() => {}} />);
  expect(screen.getByRole('alert').textContent).toMatch(/sign-in/i);
});

const ZERO_STATS: Stats = { archived: 0, filed: 0, kept: 0, askedYou: 0, decided: 0, important: 0, unfinished: 0 };
function stubApi(sessions: SessionSummary[], stats: Stats = ZERO_STATS) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const body = url === '/api/sessions' ? sessions : url === '/api/settings' ? DEFAULT_SETTINGS
      : url === '/api/stats' ? stats
      : url.endsWith('/resume') ? { batchId: 'b9', status: 'running' } : {};
    return new Response(JSON.stringify(body), { status: 200 });
  }));
}
const summary = (o: Partial<SessionSummary> = {}): SessionSummary => ({
  id: 's1', startedAt: '2026-10-30T10:00:00Z', batches: 1, total: 10, split: { archived: 5, filed: 3, kept: 2, you: 2, important: 1 }, ...o,
});

test('Home shows Resume when a session has an unfinished batch, and resumes that batch', async () => {
  stubApi([summary({ unfinishedBatchId: 'b9', lastBatchId: 'b9' })]);
  const onSession = vi.fn();
  render(<Home onSession={onSession} onReview={() => {}} onPast={() => {}} onFolders={() => {}} />);
  const btn = await screen.findByRole('button', { name: 'Resume unfinished batch' });
  btn.click();
  await waitFor(() => expect(onSession).toHaveBeenCalledWith('b9'));
});

test('Home hides Resume when nothing is unfinished and opens a past session by its last batch', async () => {
  stubApi([summary({ lastBatchId: 'b3' })]);
  const onPast = vi.fn();
  render(<Home onSession={() => {}} onReview={() => {}} onPast={onPast} onFolders={() => {}} />);
  await screen.findByRole('table');
  expect(screen.queryByRole('button', { name: 'Resume unfinished batch' })).toBeNull();
  screen.getAllByRole('row')[1].click();
  await waitFor(() => expect(onPast).toHaveBeenCalledWith('b3'));
});

test('Home marks a dry-run past session', async () => {
  stubApi([summary({ id: 'd', lastBatchId: 'b1', dryRun: true }), summary({ id: 'r', lastBatchId: 'b2', total: 7 })]);
  render(<Home onSession={() => {}} onReview={() => {}} onPast={() => {}} onFolders={() => {}} />);
  await screen.findByRole('table');
  const [, dryRow, realRow] = screen.getAllByRole('row');
  expect(within(dryRow).getByText('dry run')).toBeTruthy();
  expect(within(realRow).queryByText('dry run')).toBeNull();
  expect(within(realRow).getByText('applied')).toBeTruthy();
});

test('Home marks a partly dry-run past session', async () => {
  stubApi([summary({ id: 'p', lastBatchId: 'b1', partlyDryRun: true })]);
  render(<Home onSession={() => {}} onReview={() => {}} onPast={() => {}} onFolders={() => {}} />);
  await screen.findByRole('table');
  const row = screen.getAllByRole('row')[1];
  expect(within(row).getByText('partly dry run')).toBeTruthy();
  expect(within(row).queryByText('dry run')).toBeNull();
});

test('Home saves the batch size through PUT /api/settings with a JSON body', async () => {
  stubApi([]);
  render(<Home onSession={() => {}} onReview={() => {}} onPast={() => {}} onFolders={() => {}} />);
  const btn = await screen.findByRole('button', { name: '30' });
  await waitFor(() => expect(btn).toHaveProperty('disabled', false));
  btn.click();
  const put = await waitFor(() => {
    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[1]?.method === 'PUT');
    expect(call).toBeTruthy();
    return call!;
  });
  expect(put[0]).toBe('/api/settings');
  expect(put[1].headers).toEqual({ 'Content-Type': 'application/json' });
  expect(JSON.parse(put[1].body)).toEqual({ batchSize: 30 });
});

test('mergeFolders defaults every label on at first visit, and keeps saved choices after', () => {
  expect(mergeFolders(['A', 'B'], [])).toEqual([{ name: 'A', enabled: true }, { name: 'B', enabled: true }]);
  expect(mergeFolders(['A', 'B', 'C'], [{ name: 'A', enabled: true, description: 'x' }, { name: 'B', enabled: false }, { name: 'Gone', enabled: true }]))
    .toEqual([{ name: 'A', enabled: true, description: 'x' }, { name: 'B', enabled: false }, { name: 'C', enabled: false }]);
});

test('Home renders the stat tiles from /api/stats', async () => {
  stubApi([], { archived: 120, filed: 45, kept: 12, askedYou: 25, decided: 200, important: 7, unfinished: 2 });
  render(<Home onSession={() => {}} onReview={() => {}} onPast={() => {}} onFolders={() => {}} />);
  const tiles = within(await screen.findByLabelText('All-time totals'));
  await waitFor(() => expect(tiles.getByText('120')).toBeTruthy());
  expect(tiles.getByText('Archived')).toBeTruthy();
  expect(tiles.getByText('45')).toBeTruthy();
  expect(tiles.getByText('13%')).toBeTruthy(); // 25 of 200, rounded
  expect(tiles.getByText('25 of 200 emails')).toBeTruthy();
  expect(tiles.getByText('7')).toBeTruthy();
  expect(tiles.getByText('2')).toBeTruthy();
});

test('Home for a brand-new user shows zeros and an empty state, with Start as the only dark button', async () => {
  stubApi([]);
  render(<Home onSession={() => {}} onReview={() => {}} onPast={() => {}} onFolders={() => {}} />);
  expect(await screen.findByText(/No sessions yet/)).toBeTruthy();
  const tiles = within(screen.getByLabelText('All-time totals'));
  await waitFor(() => expect(tiles.getByText('0%')).toBeTruthy());
  expect(tiles.getByText('all caught up')).toBeTruthy();
  expect(screen.queryByRole('table')).toBeNull();
  expect(document.querySelectorAll('.btn.dark')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Start session' })).toBeTruthy();
});

test('Home past sessions are a real table with headers, status pills and a split bar', async () => {
  stubApi([
    summary({ id: 'a', lastBatchId: 'b1', total: 12, batches: 2 }),
    summary({ id: 'u', lastBatchId: 'b2', unfinishedBatchId: 'b2', total: 5 }),
  ]);
  render(<Home onSession={() => {}} onReview={() => {}} onPast={() => {}} onFolders={() => {}} />);
  const table = await screen.findByRole('table');
  const heads = within(table).getAllByRole('columnheader').map((h) => h.textContent);
  expect(heads).toEqual(['Status', 'Emails', 'Batches', 'Date', 'Sorted']);
  const [, first, second] = within(table).getAllByRole('row');
  expect(within(first).getByText('applied')).toBeTruthy();
  expect(within(first).getByText('12')).toBeTruthy();
  expect(within(first).getByRole('img', { name: '5 archived, 3 filed, 2 kept' })).toBeTruthy();
  expect(within(second).getByText('unfinished')).toBeTruthy();
});
