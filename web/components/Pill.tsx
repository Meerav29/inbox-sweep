export type Status = 'applied' | 'unfinished' | 'partly' | 'dry' | 'failed';

const LABEL: Record<Status, string> = {
  applied: 'applied', unfinished: 'unfinished', partly: 'partly dry run', dry: 'dry run', failed: 'failed',
};

/** A status word as a small pill: soft green applied, amber unfinished or partly dry, gray outline dry run, red failed. */
export function StatusPill({ status }: { status: Status }) {
  return <span className={`pill st-${status}`}>{LABEL[status]}</span>;
}
