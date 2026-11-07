import type { Config } from '../config';
import { redirectUri } from '../mail/oauth';
import { classify, type ErrorCode } from './errors';

export type CheckId = 'node' | 'deps' | 'env_file' | 'typesafe' | 'anthropic' | 'google_client' | 'redirect_uri' | 'gmail' | 'folders';
export type CheckStatus = 'pass' | 'fail' | 'skip' | 'warn' | 'info';
export interface CheckResult { id: CheckId; status: CheckStatus; required: boolean; hint?: string; errorCode?: ErrorCode; detail?: string }

export interface Probes {
  nodeVersion(): string;
  depsInstalled(): boolean;
  envFile(): { exists: boolean; ignored: boolean | null }; // null = not a git checkout
  typesafe(key: string, model: string): Promise<void>;
  anthropic(key: string, model: string): Promise<void>;
  gmailProfile(config: Config, tokenPath: string): Promise<string | null>; // null = no/unreadable token file; resolves to the address
  enabledFolderCount(dbPath: string): number | null; // null = no DB file / no settings
}

export interface DoctorContext { config: Config; tokenPath: string; dbPath: string; demo: boolean; probes: Probes }

const MIN_NODE = [22, 12, 0];
const FAKE_HINT = 'not needed for the fake inbox';

function nodeOk(version: string): boolean {
  const have = version.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < MIN_NODE.length; i++) {
    const d = (have[i] ?? 0) - MIN_NODE[i];
    if (d !== 0) return d > 0;
  }
  return true;
}

const ok = (id: CheckId, required: boolean, detail?: string): CheckResult => ({ id, status: 'pass', required, ...(detail ? { detail } : {}) });
const bad = (id: CheckId, required: boolean, hint: string, status: CheckStatus = 'fail'): CheckResult => ({ id, status, required, hint });

export async function runChecks(ctx: DoctorContext): Promise<CheckResult[]> {
  const { config, probes } = ctx;
  const fake = config.fake || ctx.demo;
  const out: Record<CheckId, CheckResult> = {} as Record<CheckId, CheckResult>;

  const version = probes.nodeVersion();
  out.node = nodeOk(version) ? ok('node', true, version) : bad('node', true, `Node ${version} is too old. Install Node 22.12.0 or newer.`);
  out.deps = probes.depsInstalled() ? ok('deps', true) : bad('deps', true, 'Dependencies are missing. Run npm install.');

  const env = probes.envFile();
  if (env.exists && env.ignored !== false) out.env_file = ok('env_file', true);
  else {
    const hint = env.exists ? '.env is not git-ignored. Add it to .gitignore before putting keys in it.' : '.env is missing. Run npm run doctor -- --init-env.';
    out.env_file = fake ? bad('env_file', false, hint, 'warn') : bad('env_file', true, hint);
  }

  const skip = (id: CheckId, required: boolean, hint: string): CheckResult => ({ id, status: 'skip', required, hint });
  const skipFake = (id: CheckId): CheckResult => skip(id, false, FAKE_HINT);
  const ready = out.node.status === 'pass' && out.deps.status === 'pass';
  const blocked = (id: CheckId, required: boolean) => skip(id, required, 'Skipped: fix node and dependencies first.');

  const probe = async (id: 'typesafe' | 'anthropic', required: boolean, key: string | undefined, name: string, call: (k: string) => Promise<void>): Promise<CheckResult> => {
    if (!key) return required ? bad(id, true, `${name} is not set. Add it to .env.`) : bad(id, false, `${name} is not set. Optional: the app works without it.`, 'warn');
    try { await call(key); return ok(id, required); } catch (err) {
      const { errorCode, hint } = classify(id, err);
      return { ...(required ? bad(id, true, hint) : bad(id, false, hint, 'warn')), errorCode };
    }
  };

  const { googleId, googleSecret } = config.keys;
  const googleCheck = (): CheckResult => {
    if (!googleId || !googleSecret) return bad('google_client', true, 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.');
    if (!googleId.endsWith('.apps.googleusercontent.com')) return bad('google_client', true, 'GOOGLE_CLIENT_ID should end in .apps.googleusercontent.com. Re-copy it from the Google Cloud console.');
    return ok('google_client', true);
  };

  if (fake) {
    for (const id of ['typesafe', 'anthropic', 'google_client', 'gmail', 'folders'] as const) out[id] = skipFake(id);
  } else {
    out.typesafe = ready ? await probe('typesafe', true, config.keys.typesafe, 'TYPESAFE_API_KEY', k => probes.typesafe(k, config.jevModel)) : blocked('typesafe', true);
    out.anthropic = ready ? await probe('anthropic', false, config.keys.anthropic, 'ANTHROPIC_API_KEY', k => probes.anthropic(k, config.claudeModel)) : blocked('anthropic', false);
    out.google_client = ready ? googleCheck() : blocked('google_client', true);
    if (out.google_client.status !== 'pass') out.gmail = ready ? skip('gmail', true, 'Skipped: fix the Google client ID and secret first.') : blocked('gmail', true);
    else {
      try {
        const address = await probes.gmailProfile(config, ctx.tokenPath);
        out.gmail = address === null ? bad('gmail', true, 'Gmail is not connected yet. Start the app and press Connect Gmail.') : ok('gmail', true, address);
      } catch (err) {
        const { errorCode, hint } = classify('gmail', err);
        out.gmail = { ...bad('gmail', true, hint), errorCode };
      }
    }
    const folders = probes.enabledFolderCount(ctx.dbPath);
    out.folders = folders ? ok('folders', true, String(folders)) : bad('folders', true, 'No folders chosen yet. In the app, connect Gmail and choose folders.');
  }

  out.redirect_uri = { id: 'redirect_uri', status: 'info', required: false, detail: redirectUri(config) };

  const order: CheckId[] = ['node', 'deps', 'env_file', 'typesafe', 'anthropic', 'google_client', 'redirect_uri', 'gmail', 'folders'];
  return order.map(id => out[id]);
}

export function summarize(results: CheckResult[]): { ok: boolean; exitCode: 0 | 1 | 2 } {
  if (results.some(r => r.required && r.status !== 'pass' && r.status !== 'info')) return { ok: false, exitCode: 1 };
  // env_file only warns in fake mode, where it is not a problem worth an exit code.
  const degraded = results.some(r => !r.required && r.id !== 'env_file' && (r.status === 'fail' || r.status === 'warn'));
  return { ok: true, exitCode: degraded ? 2 : 0 };
}
