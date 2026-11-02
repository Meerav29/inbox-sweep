const fmt = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' });
const DAY = 86_400_000;

/** "Mar 4, 2023 · 2 years ago" for an ISO date; '' when it is missing or invalid. */
export function describeDate(iso: string | undefined, now: Date): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const days = Math.floor((now.getTime() - d.getTime()) / DAY);
  return `${fmt.format(d)} · ${relative(days)}`;
}

function relative(days: number): string {
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) { const m = Math.floor(days / 30); return `${m} ${m === 1 ? 'month' : 'months'} ago`; }
  const y = Math.floor(days / 365);
  return `${y} ${y === 1 ? 'year' : 'years'} ago`;
}
