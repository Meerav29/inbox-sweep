import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../config';
import { dbFileName } from '../db/path';
import { runChecks, summarize, type CheckResult } from './checks';
import type { Probes } from './checks';
import { initEnv } from './initEnv';
import { realProbes } from './probes';

export interface CliArgs { json: boolean; demo: boolean; initEnv: boolean }

export function parseArgs(argv: string[]): CliArgs {
  return { json: argv.includes('--json'), demo: argv.includes('--demo'), initEnv: argv.includes('--init-env') };
}

const MARK: Record<CheckResult['status'], string> = { pass: 'PASS', fail: 'FAIL', skip: 'SKIP', warn: 'WARN', info: 'INFO' };

export function formatHuman(results: CheckResult[]): string {
  return results.map(r => {
    const note = r.status === 'pass' || r.status === 'info' ? r.detail : r.hint;
    return `${MARK[r.status]}  ${r.id}${note ? `  ${note}` : ''}`;
  }).join('\n');
}

// Never include err.message or the stack: they could contain .env values.
function crashMessage(err: unknown): string {
  const name = err instanceof Error ? err.name : 'Error';
  return `doctor crashed: ${name}\ncheck that .env is valid KEY=value lines`;
}

export async function main(argv: string[], cwd: string, probes: Probes = realProbes(cwd)): Promise<{ exitCode: number; output: string }> {
  const args = parseArgs(argv);
  const lines: string[] = [];
  if (args.initEnv) {
    const r = initEnv(cwd);
    lines.push(r === 'created' ? 'Created .env from .env.example.' : r === 'exists' ? '.env already exists; left unchanged.' : 'No .env.example found; nothing to copy.');
  }
  const envPath = join(cwd, '.env');
  if (existsSync(envPath)) {
    try { process.loadEnvFile(envPath); }
    catch (err) { return { exitCode: 1, output: crashMessage(err) }; }
  }

  const config = loadConfig(process.env);
  const dataDir = resolve(cwd, config.dataDir);
  const tokenPath = join(dataDir, 'google-token.json');
  const dbPath = join(dataDir, dbFileName(dataDir, config.fake));
  const checks = await runChecks({ config, tokenPath, dbPath, demo: args.demo, probes });
  const { ok, exitCode } = summarize(checks);

  const output = args.json ? JSON.stringify({ checks, ok }, null, 2) : [...lines, formatHuman(checks)].join('\n');
  return { exitCode, output };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2), process.cwd()).then(({ exitCode, output }) => {
    console.log(output);
    process.exitCode = exitCode;
  }).catch(err => {
    console.error(crashMessage(err));
    process.exitCode = 1;
  });
}
