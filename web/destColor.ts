import type { Dest } from '../shared/types';

export interface DestColor { bg: string; fg: string; solid: string }

export const archiveColor: DestColor = { bg: '#F1EFE8', fg: '#444441', solid: '#888780' };
export const keepColor: DestColor = { bg: '#EEEDFE', fg: '#3C3489', solid: '#7F77DD' };

/** Folders get one of these by name. No red: red belongs to Important alone. */
export const FOLDER_PALETTE: readonly DestColor[] = [
  { bg: '#E1F5EE', fg: '#085041', solid: '#1D9E75' }, // teal
  { bg: '#FAEEDA', fg: '#633806', solid: '#BA7517' }, // amber
  { bg: '#FAECE7', fg: '#712B13', solid: '#D85A30' }, // coral
  { bg: '#FBEAF0', fg: '#72243E', solid: '#D4537E' }, // pink
  { bg: '#E6F1FB', fg: '#0C447C', solid: '#378ADD' }, // blue
  { bg: '#EAF3DE', fg: '#27500A', solid: '#639922' }, // green
];

/** One tone for "filed" when it stands for every folder at once (rings, split bars). */
export const FILED_SOLID = FOLDER_PALETTE[0].solid;

function hash(name: string): number {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return h;
}

/** Where an email is going, as colors: the same folder is the same color in every batch. */
export function destColor(dest: Dest): DestColor {
  if (dest === 'archive') return archiveColor;
  if (dest === 'keep') return keepColor;
  return FOLDER_PALETTE[hash(dest.slice('label:'.length)) % FOLDER_PALETTE.length];
}
