import { expect, test } from 'vitest';
import { FOLDER_PALETTE, destColor } from '../../web/destColor';

test('archive and keep have fixed colors', () => {
  expect(destColor('archive')).toEqual({ bg: '#F1EFE8', fg: '#444441', solid: '#888780' });
  expect(destColor('keep')).toEqual({ bg: '#EEEDFE', fg: '#3C3489', solid: '#7F77DD' });
});

test('a folder gets the same color whatever its case, and the same every time', () => {
  expect(destColor('label:Travel')).toEqual(destColor('label:travel'));
  expect(destColor('label:TRAVEL')).toEqual(destColor('label:Travel'));
  expect(destColor('label:Travel')).toEqual(destColor('label:Travel'));
});

test('folders come from the palette and the palette is never red', () => {
  for (const name of ['Travel', 'Receipts', 'Work', 'Family', 'Bills', 'Trips', 'x', 'Newsletters/Tech']) {
    expect(FOLDER_PALETTE).toContainEqual(destColor(`label:${name}`));
  }
  for (const c of FOLDER_PALETTE) {
    expect(c.solid.toLowerCase()).not.toBe('#c2362b');
    expect(c.bg.toLowerCase()).not.toBe('#fdf1f0');
  }
  expect(new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((n) => destColor(`label:${n}`).solid)).size).toBeGreaterThan(1);
});
