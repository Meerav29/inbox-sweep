import { useEffect, useState } from 'react';
import type { BatchStatus, SessionSummary, Settings, Stats } from '../../shared/types';
import { api } from '../api';
import { StatusPill } from '../components/Pill';
import type { Status } from '../components/Pill';
import { FILED_SOLID, FOLDER_PALETTE, archiveColor, keepColor } from '../destColor';

const SIZES: Settings['batchSize'][] = [10, 20, 30, 50];
const RED = { bg: 'var(--redbg)', fg: 'var(--red)' };
const AMBER = FOLDER_PALETTE[1];
const TEAL = FOLDER_PALETTE[0];

interface Props {
  onSession: (batchId: string) => void;
  /** A resumed batch that Jev has finished: it opens on the board. */
  onReview: (batchId: string) => void;
  onPast: (batchId: string) => void;
  onFolders: () => void;
}

/** Archived / filed / kept as one stacked bar, in the destination colors. */
function SplitBar({ split }: { split: SessionSummary['split'] }) {
  const parts = [
    { k: 'archived', v: split.archived, c: archiveColor.solid },
    { k: 'filed', v: split.filed, c: FILED_SOLID },
    { k: 'kept', v: split.kept ?? 0, c: keepColor.solid },
  ];
  const sum = parts.reduce((a, p) => a + p.v, 0);
  return (
    <span className="bar" role="img" aria-label={parts.map((p) => `${p.v} ${p.k}`).join(', ')}>
      {sum > 0 && parts.map((p) => <i key={p.k} style={{ width: `${(p.v / sum) * 100}%`, background: p.c }} />)}
    </span>
  );
}

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

/** Unfinished beats the rest; a fully dry session is "dry run", never "applied". */
function statuses(s: SessionSummary): Status[] {
  const dry: Status[] = s.dryRun ? ['dry'] : s.partlyDryRun ? ['partly'] : [];
  if (s.unfinishedBatchId) return ['unfinished', ...dry];
  return dry.length ? dry : ['applied'];
}

/** Statuses a resumed batch belongs on the board for, not the Session screen. */
const BOARD_STATUSES: BatchStatus[] = ['reviewing', 'applying', 'applied'];

const Icon = ({ children }: { children: React.ReactNode }) => <svg viewBox="0 0 24 24" aria-hidden="true">{children}</svg>;
const ICONS = {
  archive: <Icon><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" /></Icon>,
  folder: <Icon><path d="M3 7a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /></Icon>,
  asked: <Icon><path d="M4 5h16v11H9l-5 4z" /><path d="M9.5 9.5a2.5 2.5 0 0 1 5 0c0 1.5-2.5 1.5-2.5 3M12 14.5v.01" /></Icon>,
  flag: <Icon><path d="M6 21V4M6 4h11l-2 4 2 4H6" /></Icon>,
  clock: <Icon><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>,
};

function Tile({ icon, tint, label, big, sub }: {
  icon: keyof typeof ICONS; tint: { bg: string; fg: string }; label: string; big: string; sub: React.ReactNode;
}) {
  return (
    <div className="tile">
      <span className="ic" style={{ background: tint.bg, color: tint.fg }}>{ICONS[icon]}</span>
      <div className="big">{big}</div>
      <div className="tl">{label}</div>
      <div className="ts">{sub}</div>
    </div>
  );
}

export function Home({ onSession, onReview, onPast, onFolders }: Props) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let live = true;
    api.settings().then((s) => live && setSettings(s)).catch((e: Error) => live && setError(e.message));
    api.sessions().then((s) => live && setSessions(s)).catch((e: Error) => live && setError(e.message));
    // The tiles are a nicety: if the totals can't load they just stay blank.
    api.stats().then((s) => live && setStats(s)).catch(() => {});
    return () => { live = false; };
  }, []);

  const save = async (patch: Partial<Settings>) => {
    setError(undefined);
    try {
      setSettings(await api.saveSettings(patch));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const start = async () => {
    setStarting(true);
    setError(undefined);
    try {
      onSession((await api.startSession()).batchId);
    } catch (e) {
      setError((e as Error).message);
      setStarting(false);
    }
  };

  const unfinished = sessions?.find((s) => s.unfinishedBatchId)?.unfinishedBatchId;

  const resume = async (batchId: string) => {
    setStarting(true);
    setError(undefined);
    try {
      const v = await api.resume(batchId);
      if (BOARD_STATUSES.includes(v.status)) onReview(v.batchId);
      else onSession(v.batchId);
    } catch (e) {
      setError((e as Error).message);
      setStarting(false);
    }
  };

  const n = (v: number | undefined) => (stats ? String(v ?? 0) : '–');
  const decided = stats?.decided ?? 0;
  const askedPct = stats ? `${decided > 0 ? Math.round(((stats.askedYou ?? 0) / decided) * 100) : 0}%` : '–';
  const openCount = stats?.unfinished ?? 0;

  return (
    <main className="dash">
      <header className="dtop">
        <h1>inbox-sweep</h1>
        <div className="tools">
          <div className="seg" role="group" aria-label="Emails per batch">
            {SIZES.map((s) => (
              <button key={s} className={settings?.batchSize === s ? 'on' : ''} aria-pressed={settings?.batchSize === s}
                disabled={!settings} onClick={() => save({ batchSize: s })}>{s}</button>
            ))}
          </div>
          <button className="btn dark" onClick={start} disabled={starting}>Start session</button>
        </div>
      </header>
      {error && <p className="err" role="alert">{error}</p>}
      <section className="stats" aria-label="All-time totals">
        <Tile icon="archive" tint={archiveColor} label="Archived" big={n(stats?.archived)} sub="all time" />
        <Tile icon="folder" tint={TEAL} label="Filed into folders" big={n(stats?.filed)} sub="all time" />
        <Tile icon="asked" tint={keepColor} label="Asked you" big={askedPct}
          sub={stats ? `${stats.askedYou ?? 0} of ${decided} emails` : 'of decided emails'} />
        <Tile icon="flag" tint={RED} label="Important kept" big={n(stats?.important)} sub="flagged important, left in inbox" />
        <Tile icon="clock" tint={AMBER} label="Unfinished batches" big={n(stats?.unfinished)}
          sub={unfinished
            ? <button type="button" className="linkbtn" disabled={starting} onClick={() => resume(unfinished)}>Resume unfinished batch</button>
            : openCount > 0 ? 'in progress' : 'all caught up'} />
      </section>
      <section className="past" aria-labelledby="past-h">
        <div className="lbl" id="past-h">Past sessions</div>
        {sessions?.length === 0 && <div className="empty">No sessions yet. Start one to begin sorting your inbox.</div>}
        {!!sessions?.length && (
          <table className="stable">
            <thead>
              <tr>
                <th scope="col">Status</th>
                <th scope="col">Emails</th>
                <th scope="col" className="hide-sm">Batches</th>
                <th scope="col">Date</th>
                <th scope="col">Sorted</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className={s.lastBatchId ? 'go' : undefined} onClick={() => s.lastBatchId && onPast(s.lastBatchId)}>
                  <td><span className="pills">{statuses(s).map((st) => <StatusPill key={st} status={st} />)}</span></td>
                  <td className="num">{s.total}</td>
                  <td className="num hide-sm">{s.batches}</td>
                  <th scope="row">
                    <button type="button" className="rowlink" disabled={!s.lastBatchId}>{when(s.startedAt)}</button>
                  </th>
                  <td><SplitBar split={s.split} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <div className="footer-links">
        <button className="btn ghost" onClick={onFolders}>Settings</button>
        <label className="toggle">
          <input type="checkbox" checked={settings?.dryRun ?? false} disabled={!settings}
            onChange={(e) => save({ dryRun: e.target.checked })} />
          Dry run (nothing changes in Gmail)
        </label>
      </div>
    </main>
  );
}
