import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { initEnv } from '../../../server/doctor/initEnv';

const tmp = () => mkdtempSync(join(tmpdir(), 'doctor-env-'));

describe('initEnv', () => {
  it('copies .env.example to a missing .env', () => {
    const d = tmp();
    writeFileSync(join(d, '.env.example'), 'X=1\n');
    expect(initEnv(d)).toBe('created');
    expect(readFileSync(join(d, '.env'), 'utf8')).toBe('X=1\n');
  });
  it('never overwrites an existing .env', () => {
    const d = tmp();
    writeFileSync(join(d, '.env.example'), 'X=1\n');
    writeFileSync(join(d, '.env'), 'A=1');
    expect(initEnv(d)).toBe('exists');
    expect(readFileSync(join(d, '.env'), 'utf8')).toBe('A=1');
  });
  it('reports a missing example', () => {
    expect(initEnv(tmp())).toBe('no-example');
  });
});
