# /setup skill + `npm run doctor` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `npm run doctor` script that proves each credential with a real call, and a `/setup` Claude Code skill that uses it to take a fresh clone to a finished dry-run batch.

**Architecture:** Doctor lives in `server/doctor/` (so `tsc` and vitest already cover it). The pure check runner takes injected *probes*, which keeps every test offline. The real probes reuse `loadConfig`, the OAuth helpers and the SDK clients the server already uses. The skill is markdown (`.claude/skills/setup/`), plus a pointer `AGENTS.md` for Codex.

**Tech Stack:** TypeScript, tsx, vitest, better-sqlite3, google-auth-library + googleapis, @typesafe-ai/sdk 0.7.0, @anthropic-ai/sdk 1.3.0.

**Spec:** `docs/superpowers/specs/2026-11-06-setup-skill-design.md`

**Delivery (Meerav's rule: one PR per bucket, fresh reviewer go/no-go, Meerav merges):**
- PR A, branch `b13-doctor`: Tasks 1–3.
- PR B, branch `b14-setup-skill`: Tasks 4–5. It needs PR A merged first.
- Commit with his global git email; never override it.

## Global Constraints

- Node `>=22.12` (package.json engines); doctor's `node` check uses exactly `22.12.0`.
- Doctor **never prints any part of** `TYPESAFE_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_SECRET`, or the token file. `GOOGLE_CLIENT_ID` is not printed either. The Gmail address may be printed.
- Doctor **never writes** under `data/`: the DB is opened `readonly` + `fileMustExist`; the Gmail token is refreshed in memory only (no `persistRefreshes`).
- `--init-env` never overwrites an existing `.env`.
- Exit codes: `0` all required checks pass; `1` any required check fails (a required check `skip`ped because a dependency failed counts as failing); `2` only optional checks fail.
- Redirect URI is exactly `http://localhost:${config.port}/api/auth/google/callback`, and `redirect_uri` is always emitted.
- Fake mode (`INBOX_SWEEP_FAKE=1` via `loadConfig`, or `--demo`): only `node`, `deps` and `env_file` are checked. `env_file` failing is downgraded to `warn`, and the rest are `skip` with hint `not needed for the fake inbox`. They don't count as failing.
- The skill never asks for or reads key values, never `cat`s `.env`, never runs a non-dry-run batch, never publishes the OAuth app, and enables no Google API but `gmail.googleapis.com`.
- Change from the spec, decided while planning: doctor lives at `server/doctor/` instead of `scripts/doctor.ts`, because `tsconfig.json` `include` doesn't cover `scripts/`.

## Review Focus

1. **A fresh clone with no `.env` and no `data/`:** doctor must not crash and must not create `data/` or a DB file. `folders` fails with the "connect Gmail and choose folders" hint, and `redirect_uri` still prints. (Test in Task 2.)
2. **A corrupt or empty `google-token.json`, or a DB with no `settings` row or table:** the check gives `fail` with a hint, not a stack trace. (Tests in Tasks 1 and 2.)
3. **A network failure (offline, DNS) during the TypeSafe, Anthropic or Gmail call:** errorCode `network`, hint "check your internet connection". Not reported as a bad key. (Test in Task 1.)
4. **`.env` exists but isn't git-ignored**, or there's no git checkout (a zip download): it fails in the first case, and the git part is skipped in the second. (Test in Task 2.)
5. **Secrets in output:** a test asserts that the `--json` and human output for a fixture env contain none of the fixture key strings, including inside error messages bubbled up from SDKs. (Test in Task 2.)

---

### Task 1: Check runner + error classifier (pure, offline)

**Files:**
- Modify: `server/mail/oauth.ts`. Add `export` to `redirectUri`, `makeClient` and `readTokens`; no behaviour change.
- Create: `server/doctor/checks.ts`, `server/doctor/errors.ts`
- Test: `tests/server/doctor/checks.test.ts`, `tests/server/doctor/errors.test.ts`

**Interfaces:**
- Produces (`checks.ts`):
  ```ts
  export type CheckId = 'node'|'deps'|'env_file'|'typesafe'|'anthropic'|'google_client'|'redirect_uri'|'gmail'|'folders';
  export type CheckStatus = 'pass'|'fail'|'skip'|'warn'|'info';
  export interface CheckResult { id: CheckId; status: CheckStatus; required: boolean; hint?: string; errorCode?: ErrorCode; detail?: string }
  export interface Probes {
    nodeVersion(): string;
    depsInstalled(): boolean;
    envFile(): { exists: boolean; ignored: boolean | null };   // null = not a git checkout
    typesafe(key: string, model: string): Promise<void>;
    anthropic(key: string, model: string): Promise<void>;
    gmailProfile(config: Config, tokenPath: string): Promise<string | null>; // null = no/unreadable token file; resolves to the address
    enabledFolderCount(dbPath: string): number | null;          // null = no DB file / no settings
  }
  export interface DoctorContext { config: Config; tokenPath: string; dbPath: string; demo: boolean; probes: Probes }
  export function runChecks(ctx: DoctorContext): Promise<CheckResult[]>;  // always returns all 9 ids, in the spec's order
  export function summarize(results: CheckResult[]): { ok: boolean; exitCode: 0 | 1 | 2 };
  ```
- Produces (`errors.ts`):
  ```ts
  export type ErrorCode = 'network'|'typesafe_bad_key'|'anthropic_bad_key'|'anthropic_bad_model'|'gmail_token_expired'
    |'google_invalid_client'|'gmail_api_disabled'|'unknown';
  export function classify(check: 'typesafe'|'anthropic'|'gmail', err: unknown): { errorCode: ErrorCode; hint: string };
  ```

- [ ] **Step 1: Write failing tests for `classify`** (`errors.test.ts`), one case each:
  - `{code:'ENOTFOUND'}` and `{cause:{code:'ECONNREFUSED'}}` both give `network`.
  - `{status:401}` with check `typesafe` gives `typesafe_bad_key`, and with `anthropic` gives `anthropic_bad_key`.
  - `{status:404}` with `anthropic` gives `anthropic_bad_model`.
  - `{response:{data:{error:'invalid_grant'}}}` with `gmail` gives `gmail_token_expired`, and its hint contains `Connect Gmail` and `7 days`.
  - `{response:{data:{error:'invalid_client'}}}` gives `google_invalid_client`.
  - `{status:403, message:'Gmail API has not been used in project 123'}` gives `gmail_api_disabled`.
  - `new Error('weird')` gives `unknown`, and its hint does not contain the error message text.
- [ ] **Step 2:** Run `npx vitest run tests/server/doctor/errors.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `classify`.** Read `status ?? response.status`, `response.data.error`, `code ?? cause.code` and `message` defensively. The hints are the "Fix" column of the spec's error table, in plain words. They never interpolate `err.message` (SDK messages can echo request data).
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5: Write failing tests for `runChecks`/`summarize`** (`checks.test.ts`) with a `fakeProbes(overrides)` helper. Every probe passes by default; the config comes from `loadConfig({TYPESAFE_API_KEY:'ts-SECRET', ANTHROPIC_API_KEY:'an-SECRET', GOOGLE_CLIENT_ID:'x.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET:'gs-SECRET'})`.
  - `all pass`: 9 results in the order `node, deps, env_file, typesafe, anthropic, google_client, redirect_uri, gmail, folders`. `summarize` gives `{ok:true, exitCode:0}`. The `redirect_uri` detail is `http://localhost:8787/api/auth/google/callback`, with status `info`.
  - `node 22.11.0` gives `node` fail and exitCode 1. `22.12.0` passes.
  - `no typesafe key` gives `typesafe` fail with a hint mentioning `TYPESAFE_API_KEY`, and the typesafe probe is not called.
  - `anthropic missing` gives `anthropic` warn, `required:false`, and exitCode 2 when everything else passes.
  - `google id not *.apps.googleusercontent.com` gives `google_client` fail.
  - `google_client fails` gives `gmail` skip and exitCode 1. `redirect_uri` is still `info`.
  - `gmail probe returns null` gives `gmail` fail with a hint containing `Connect Gmail`.
  - `gmail probe throws {response:{data:{error:'invalid_grant'}}}` gives errorCode `gmail_token_expired`.
  - `gmail passes` puts the address in `detail`.
  - `folders null` gives fail with a hint containing `choose folders`. `0` also fails. `2` passes.
  - `demo: true` with no keys gives typesafe, anthropic, google_client, gmail and folders all `skip` with hint `not needed for the fake inbox`, and `summarize` exitCode 0. Same result with `config.fake=true`.
  - `demo + env_file missing` gives `env_file` warn and exitCode 0.
  - `no secrets`: `JSON.stringify(results)` contains none of `ts-SECRET`, `an-SECRET`, `gs-SECRET`, even when probes throw `new Error('bad key ts-SECRET')`.
- [ ] **Step 6:** Run `npx vitest run tests/server/doctor/checks.test.ts`. Expected: FAIL.
- [ ] **Step 7: Implement `runChecks` and `summarize`** in `checks.ts`. Dependencies:
  - `typesafe`, `anthropic`, `google_client` and `gmail` run only if `node` and `deps` pass.
  - `gmail` needs `google_client` to pass.
  - `folders` does not depend on `gmail`.

  Compare versions numerically, not as strings. `redirect_uri` uses the exported `redirectUri(config)`. Probe exceptions go through `classify`.
- [ ] **Step 8:** Run `npx vitest run tests/server/doctor && npm run typecheck`. Expected: PASS, no type errors.
- [ ] **Step 9: Commit** `git add server/mail/oauth.ts server/doctor tests/server/doctor && git commit -m "feat(doctor): check runner and error classifier"`

### Task 2: Real probes, `.env` init, CLI, npm script

**Files:**
- Create: `server/doctor/probes.ts`, `server/doctor/initEnv.ts`, `server/doctor/cli.ts`
- Modify: `package.json` (add `"doctor": "tsx server/doctor/cli.ts"` to scripts)
- Test: `tests/server/doctor/probes.test.ts`, `tests/server/doctor/initEnv.test.ts`, `tests/server/doctor/cli.test.ts`

**Interfaces:**
- Consumes: `runChecks`, `summarize`, `Probes`, `CheckResult` (Task 1); `loadConfig`, `dbFileName`, `makeClient`, `readTokens`, `TypeSafeJev`.
- Produces:
  ```ts
  // probes.ts
  export function realProbes(cwd?: string): Probes;
  export function enabledFolderCount(dbPath: string): number | null;   // exported for tests
  export function envFileStatus(cwd: string, git?: (args: string[]) => number /* exit code; throws if git missing */): { exists: boolean; ignored: boolean | null };
  // initEnv.ts
  export function initEnv(cwd: string): 'created' | 'exists' | 'no-example';
  // cli.ts
  export interface CliArgs { json: boolean; demo: boolean; initEnv: boolean }
  export function parseArgs(argv: string[]): CliArgs;
  export function formatHuman(results: CheckResult[]): string;
  export async function main(argv: string[], cwd: string, probes?: Probes): Promise<{ exitCode: number; output: string }>;
  ```

- [ ] **Step 1: Write failing tests** (use `mkdtempSync` temp dirs; no network):
  - `initEnv`:
    - The temp dir has `.env.example` and no `.env`. Result is `'created'`, and the contents equal the example's.
    - `.env` exists with `A=1`. Result is `'exists'`, and the contents are unchanged.
    - Neither file exists. Result is `'no-example'`.
  - `enabledFolderCount`:
    - Missing file gives `null`, and no file is created afterwards.
    - A DB made with better-sqlite3 that has `settings` row `{"folders":[{"name":"A","enabled":true},{"name":"B","enabled":false}]}` gives `1`.
    - A DB with no `settings` table gives `null`.
    - The row holds invalid JSON. Result is `null`.
  - `envFileStatus`:
    - No `.env` gives `{exists:false, ignored:null}`.
    - The `git` stub returns 0 for `{exists:true, ignored:true}`, and 1 for `ignored:false`.
    - The stub throws `ENOENT`. Result is `ignored:null`.
  - `cli`:
    - `parseArgs(['--json','--demo'])`.
    - `main(['--json'], tmp, fakeProbes)` returns parseable JSON `{checks, ok}` with exitCode 0.
    - `main(['--init-env'], tmp)` creates `.env` and still runs the checks.
    - A temp dir with no `data/`: after `main`, `existsSync(join(tmp,'data'))` is false.
    - `formatHuman` has one line per check and includes the redirect URI.
    - No fixture secret string appears in `output`.
- [ ] **Step 2:** Run `npx vitest run tests/server/doctor`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement `initEnv`** with `copyFileSync(src, dst, constants.COPYFILE_EXCL)`, mapping `EEXIST` to `'exists'`.
- [ ] **Step 4: Implement the probes.**
  - `enabledFolderCount`: `new Database(path, { readonly: true, fileMustExist: true })`. Any error gives `null`. Close in `finally`.
  - `envFileStatus`: the default `git` runs `spawnSync('git', ['check-ignore','-q','.env'], {cwd})` and throws when `error` is set.
  - `typesafe`: `new TypeSafeJev(key, model).ask(PING_EMAIL, [])`. `PING_EMAIL` is a fixed `Email`, e.g. subject "inbox-sweep doctor check" from `doctor@example.com`, a one-line body, and `date: new Date().toISOString()`.
  - `anthropic`: `messages.create({model, max_tokens: 1, messages:[{role:'user', content:'ping'}]})`.
  - `gmailProfile`: `readTokens` gives null when there are no tokens. Otherwise use `makeClient(config)`, then `setCredentials`, **without** `persistRefreshes`. Then `google.gmail({version:'v1', auth}).users.getProfile({userId:'me'})`, returning `data.emailAddress`.
  - `depsInstalled`: `existsSync(join(cwd,'node_modules','@typesafe-ai','sdk'))`.
- [ ] **Step 5: Implement `cli.ts`.**
  - `main` steps:
    1. If `initEnv`, run it and add a line to the output.
    2. If `<cwd>/.env` exists, `process.loadEnvFile` it.
    3. `loadConfig(process.env)`.
    4. Set `tokenPath = join(dataDir,'google-token.json')` and `dbPath = join(dataDir, dbFileName(dataDir, config.fake))`, both resolved against `cwd`.
    5. Call `runChecks`, then `summarize`.
  - Output is `JSON.stringify({checks, ok}, null, 2)` with `--json`, else `formatHuman`.
  - The file ends with an `import.meta.url === pathToFileURL(process.argv[1]).href` guard that calls `main(process.argv.slice(2), process.cwd())`, prints, and sets `process.exitCode`.
- [ ] **Step 6:** Run `npx vitest run tests/server/doctor && npm run typecheck`. Expected: PASS.
- [ ] **Step 7: Smoke test on this machine (real config; DO NOT paste output that contains secrets; there should be none).**
  - Run `npm run doctor -- --demo`. Expected: node, deps and env_file pass, everything else is `skip`, and the exit code is 0.
  - Run `npm run doctor`. Expected: real results for this machine's existing `.env` and token.
  - Then run `git status --porcelain data` and `ls data`. Expected: no new or modified files under `data/` (compare mtimes before and after).
- [ ] **Step 8: Commit** `git add server/doctor tests/server/doctor package.json && git commit -m "feat(doctor): npm run doctor with real checks, --json, --demo, --init-env"`

### Task 3: Point the docs at doctor

**Files:**
- Modify: `README.md` (section "Use it on your own inbox", around line 32)
- Modify: `docs/details.md` (section "Setup for your own inbox", line 9; and a new short "Checking your setup" subsection before "First real run", line 61)

- [ ] **Step 1: README.** After the `.env` step, add: "Run `npm run doctor` to check each key and the Gmail connection. It prints the exact redirect URI to give Google." Also mention `npm run doctor -- --init-env` as the way to create `.env`.
- [ ] **Step 2: `docs/details.md`.** Add the "Checking your setup" subsection: what each check means, the exit codes, `--json` and `--demo`, the fact that it never prints keys or writes to `data/`, and the error table from the spec (Symptom, Cause, Fix).
- [ ] **Step 3: Check it.** Run `npm test && npm run typecheck`. Expected: all pass. Then open PR A from `b13-doctor` and get a fresh-reviewer go/no-go.
- [ ] **Step 4: Commit** `git add README.md docs/details.md && git commit -m "docs: npm run doctor"`

### Task 4: The `/setup` skill

**Files:**
- Create: `.claude/skills/setup/SKILL.md`, `.claude/skills/setup/references/google-cloud.md`, `AGENTS.md`

**Interfaces:**
- Consumes: `npm run doctor -- --json` output `{checks: CheckResult[], ok}`, plus `--demo` and `--init-env` (Task 2).

- [ ] **Step 1: Write `SKILL.md`.**
  - Frontmatter:
    - `name: setup`.
    - The description triggers on "set up inbox-sweep", "get this running", "connect my Gmail", "setup incomplete", "doctor is failing", and a first run after cloning.
  - Body sections, following the spec's Flow, steps 0 to 4:
    - Preflight.
    - Questions: at most 3, one at a time, detect before asking.
    - Recommend one path, with times of about 1, 10 and 15 minutes.
    - The 10 steps, each naming the doctor check id that proves it.
    - Wrap up: 7-day expiry, untick Dry run later, `/refine` coming.
    - The error table.
    - The behaviour rules, verbatim from the spec, including: user runs `npm run dev` in their own terminal by default, and if the skill starts it, it stops only that PID.
    - The scope note: Gmail + Jev only, pointing at `JevClient` in `server/jev/client.ts`.
  - Keep it under about 200 lines and put click-by-click text in the reference file.
- [ ] **Step 2: Write `references/google-cloud.md`.**
  - Two paths:
    - gcloud: `gcloud auth login`, `gcloud projects create inbox-sweep-<random6>`, `gcloud config set project …`, `gcloud services enable gmail.googleapis.com`, then check with `gcloud services list --enabled`, all single-line commands.
    - Console clicks: create project, enable Gmail API.
  - Then the shared manual part:
    - Consent screen: External, Testing, app name, support email.
    - Add yourself under Audience → Test users. Bold warning: skipping this gives "Access blocked" or a hanging page.
    - OAuth client: type **Web application**, with the authorised redirect URI taken from doctor's `redirect_uri`.
    - Paste the ID and secret into `.env`, then restart the app.
    - On the "unverified app" screen: Advanced, then Continue.
  - Note: Workspace accounts may be blocked by their admin.
- [ ] **Step 3: Write `AGENTS.md`.** About 5 lines: the project summary, "To set up, follow `.claude/skills/setup/SKILL.md`", "To check setup, run `npm run doctor`", and "Never ask for or print API keys."
- [ ] **Step 4: Check the skill against the spec.** Every flow step, behaviour rule and error-table row in the spec appears in SKILL.md or the reference file. Every doctor check id named in SKILL.md exists in `CheckId`.
- [ ] **Step 5: Commit** `git add .claude/skills/setup AGENTS.md && git commit -m "feat: /setup skill and AGENTS.md pointer"`

### Task 5: Run-through on a clean clone

**Files:** none changed unless the run-through finds problems. Fixes go in the same branch.

- [ ] **Step 1: Make a clean clone.** Clone the branch to a scratch folder outside the repo: `git clone --branch b14-setup-skill <repo path> <scratch>/inbox-sweep-clean`. Don't copy `.env` or `data/`.
- [ ] **Step 2: Demo path.** In the clean clone, start a fresh Claude Code session (a Sonnet subagent with the clone as cwd is fine) and say "set up inbox-sweep, I want to try the fake inbox first". Expected:
  - The skill runs `npm install`, then `doctor --demo`.
  - It recommends Demo.
  - It never asks for a key.
  - `npm run dev:fake` serves http://localhost:5173.
- [ ] **Step 3: Real path, up to the first manual step.** Say "now my own Gmail". Expected:
  - It creates `.env` via `--init-env`.
  - It asks at most 3 questions.
  - It recommends one path with a time estimate.
  - It stops at the TypeSafe key step, pointing at the right `.env` line.
  - It never reads `.env` contents.

  The Google console steps are verified by Meerav, not here.
- [ ] **Step 4: Clean up.** Delete the scratch clone, stopping only processes this run started, by PID. Then open PR B from `b14-setup-skill`, get a fresh-reviewer go/no-go, and Meerav merges.
