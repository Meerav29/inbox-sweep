# /setup skill: design

Date: 2026-11-06. Status: draft for Meerav's review.

## Intent

The Substack post ("I made a little app to get my inbox...", Nov 3 2026) promised a `/setup` skill that "asks basic questions and based on your email and decision model of choice recommends the fastest setup path with step-by-step instructions." Today a new user reads the README, then `docs/details.md`, and has to get four separate things right by hand (Node + install, TypeSafe key, Google Cloud OAuth client, Gmail connect + folders). The Google part is where people give up: six console screens, one of which (test users) fails silently.

The skill's job: take someone from "just cloned it" to "first dry-run batch finished" in one sitting, with the fewest clicks, a real check after every step, and no secrets in the chat.

Success = a new user reaches a finished dry-run batch without opening `docs/details.md`, and re-running `/setup` on a working machine says "all good" in seconds.

## Decisions (Meerav, 2026-11-06)

1. **Scope is Gmail + Jev only.** That is what the app supports. If the user asks about another decision model or mail provider, the skill says it is not supported yet and points at `JevClient` in `server/jev/client.ts` (models) and the IMAP idea in the post (mail). It does not walk them through code changes.
2. **Secrets: the user edits `.env` themselves.** The skill creates `.env` from `.env.example` if missing and tells the user which line to fill. It never asks for a key in chat, never reads key values into the conversation, never echoes them. If a user pastes a key into chat anyway, the skill tells them to put it in `.env` and suggests rotating it.
3. **Google: use gcloud when it's installed.** If `gcloud` is on PATH, the skill runs project creation and Gmail API enablement. Consent screen, test user and OAuth client stay click-by-click (Google has no supported CLI/API for these), with a check between steps. No gcloud: everything is guided clicks. No browser automation of the Cloud Console.
4. **Add `npm run doctor` to the app.** A script that makes one real call per credential, so setup is verified, not assumed. It is useful without the skill (Codex users, people following the README), and the skill runs it after every step.

## Part 1: `npm run doctor` (app change)

New file `scripts/doctor.ts`, script `"doctor": "tsx scripts/doctor.ts"`. Loads `.env` the same way the server does (`server/index.ts:12`, `process.loadEnvFile`) and reuses `server/config.ts` so names, fallbacks (`INBOX_SWEEP_*` then `JEV_SWEEP_*`) and defaults match exactly.

Checks, in order. Each reports `pass | fail | skip | warn` plus a short fix hint. A check is skipped when an earlier one it depends on failed.

| id | check | how | required |
|---|---|---|---|
| `node` | Node >= 22.12 | `process.versions.node` | yes |
| `deps` | dependencies installed | `node_modules/@typesafe-ai/sdk` resolves | yes |
| `env_file` | `.env` exists and is git-ignored | file exists; `git check-ignore .env` (skip the git part if not a git checkout) | yes |
| `typesafe` | key set and works | one minimal `systemOne` call with the pinned `JEV_MODEL` and a tiny fixed state | yes |
| `anthropic` | key set and works | `messages.create` with `CLAUDE_MODEL`, `max_tokens: 1` | no (warn) |
| `google_client` | client ID + secret set, ID looks like `*.apps.googleusercontent.com` | format check only (the secret can only be proven by the OAuth exchange) | yes |
| `redirect_uri` | prints the exact redirect URI to register | `http://localhost:${port}/api/auth/google/callback` from config | info |
| `gmail` | token file exists and works | load `<dataDir>/google-token.json`, refresh **in memory only** if needed (do not persist the refreshed token; the server owns that file), call `users.getProfile` | yes |
| `folders` | at least one folder chosen | open the DB file chosen by `dbFileName()` (`server/db/path.ts`) **read-only and only if it exists**; never `new Repo` (it creates the file and runs migrations). No DB yet means `fail` with hint "connect Gmail and choose folders in the app" | yes |

Rules:
- `redirect_uri` is always emitted, even when every other check fails or is skipped (setup step 6 needs it before any keys exist).
- A required check that is skipped because an earlier one failed counts as failing for `ok` and the exit code.
- **Fake mode:** when `INBOX_SWEEP_FAKE=1` is set, or `--demo` is passed, only `node`, `deps` and `env_file` (as a warning) are checked; the rest report `skip` with "not needed for the fake inbox". This matches the app, which treats fake mode as fully set up (`server/services.ts`).
- `--init-env` copies `.env.example` to `.env` if `.env` doesn't exist and never overwrites. The skill uses this instead of `cp`/`copy`, so the step is the same in every shell.
- Never prints a key, secret or token, or any part of one. For the Gmail check it may print the connected address (the user's own, useful to confirm the right account).
- `--json` prints one machine-readable object `{checks:[{id,status,hint,errorCode?}], ok}` for the skill. Default output is a human checklist.
- Exit code: 0 when every required check passes; 1 when any required check fails; 2 when only optional ones fail.
- Maps known provider errors to an `errorCode` and hint (see the error table below), e.g. Google `invalid_grant` gives `gmail_token_expired`: "press Connect Gmail again (tokens in Testing mode expire after 7 days)".
- Works while the dev server is running or not (does not need the server).
- Costs: the TypeSafe and Anthropic calls are the cheapest possible and are made only when the key is set.

Builder's call: whether `doctor` imports server modules directly or the shared bits get pulled into a small module both use. Add vitest tests for the parts that don't hit the network (env loading, error mapping, exit codes).

Also: README "Use it on your own inbox" and `docs/details.md` gain one line, "run `npm run doctor` to check your setup", and the Setup screen's "How to add it" help can mention it. Keep the change small.

## Part 2: the `/setup` skill

Location: `.claude/skills/setup/SKILL.md`, with long click-by-click text in `.claude/skills/setup/references/google-cloud.md` so SKILL.md stays short. It's committed to the repo, so anyone who clones and opens Claude Code gets `/setup`. (My call: also add a short `AGENTS.md` at the repo root that points Codex at that file when asked to set up, since the post says it works with Codex too. It points; it doesn't duplicate. The secrets rules live in SKILL.md, so they apply to both.)

Shells: the skill must work in bash, zsh and PowerShell. File operations go through `doctor` (`--init-env`) or plain instructions, not shell-specific commands. gcloud commands are shown as single lines with no shell-specific quoting.

Frontmatter description should trigger on "set up inbox-sweep", "get this running", "connect my Gmail", "it says setup incomplete", "doctor is failing", and first-time-clone situations.

### Flow

**0. Preflight (no questions yet).** Check Node version. If `node_modules` is missing, say so and run `npm install` (the one command the skill runs without asking, since nothing works without it). Then run `npm run doctor -- --json` and show a short checklist of what's done and what's left. Use the per-check results to pick where to resume, not `ok` alone: a fresh clone fails most checks, and that's expected. If everything passes: say so, offer to start the app, stop.

**1. Ask only what changes the path.** At most three questions, one at a time, skipping any the preflight already answered:
- "Do you want to try it with a fake inbox first, or go straight to your own Gmail?" (Fake inbox needs no keys.)
- "Is this a personal @gmail.com account, or a work/school (Google Workspace) account?" Workspace admins may block unverified apps or restrict who can create Cloud projects. Warn, and suggest a personal account or asking the admin.
- "Do you already have a Google Cloud project you want to use?" (Otherwise create one.)
Detect, don't ask: gcloud installed? `.env` present? which keys already pass?

**2. Recommend one path, with a time estimate.** No menu. One of:
- **Demo** (about 1 min): `npm run dev:fake`, open http://localhost:5173, press Start session. Then offer to continue to the real setup.
- **Own inbox, gcloud** (about 10 min).
- **Own inbox, console only** (about 15 min).
Say upfront what they'll have to do themselves: get a TypeSafe key, click through about 3 Google screens, paste values into `.env`, press Connect Gmail.

**3. Steps, each ending in a check.** Skip any step whose doctor check already passes, so the flow resumes wherever it stopped.
1. `.env`: `npm run doctor -- --init-env` (copies `.env.example` if missing, never overwrites).
2. TypeSafe key: link to typesafe.ai, tell them which line in `.env` to fill. Check with `doctor` (`typesafe`).
3. Anthropic key (optional): explain it only writes the one-line "why" on review cards, and the app works without it. Check (`anthropic`), and a warn is fine.
4. Google project + Gmail API.
   - gcloud path: `gcloud auth login` (the user does this in their browser), then `gcloud projects create <id>` with a generated unique id, then `gcloud config set project`, then `gcloud services enable gmail.googleapis.com`. Check with `gcloud services list --enabled`. Show each command before running it.
   - Console path: the steps in `references/google-cloud.md`.
5. Consent screen: External, Testing, app name, support email. **Add your own address as a test user.** Say plainly that skipping this gives "Access blocked" or a page that hangs, with no clear error.
6. OAuth client: type **Web application** (not Desktop; the app uses a web redirect). Authorised redirect URI = the exact value `doctor` prints in `redirect_uri`. User pastes the client ID and secret into `.env`. Check (`google_client`).
7. Start the app. Default: ask the user to run `npm run dev` in their own terminal, so they own it. If the skill starts it in the background instead, it stops only the process it started (by that PID, never by name). `.env` is read once at start, so restart after any `.env` edit.
8. Connect Gmail: open http://localhost:5173, press Connect Gmail, and on the "Google hasn't verified this app" screen press Advanced, then Continue (expected: it's their own app). Check (`gmail`).
9. Folders: choose them on the Folders screen in the app. Check (`folders`). Tuning folders and rules is `/refine`'s job; this step is just "pick at least one".
10. First run: tick **Dry run**, batch size 10, Start session. Say that dry run still sends email content to TypeSafe (and Anthropic, if set), but changes nothing in Gmail.

**4. Wrap up.** Short summary: what's set up, what's optional and skipped, and three things to know:
- In Testing mode the Gmail connection expires every 7 days. Press Connect Gmail again. `doctor` reports it as `gmail_token_expired`.
- Untick Dry run once the board looks right.
- `/refine` is next, once it exists.

### Error table (lives in SKILL.md, shared with doctor's hints)

| Symptom / code | Cause | Fix |
|---|---|---|
| "Access blocked", or the consent page hangs | account not a test user | add it under Audience → Test users |
| `redirect_uri_mismatch` | URI not registered, wrong port, or Desktop client | register the exact URI `doctor` prints, on a Web application client |
| `invalid_client` | typo or stray space in ID/secret | re-copy into `.env`, restart the app |
| `accessNotConfigured` / Gmail API disabled | API not enabled (or just enabled) | enable it, wait ~1 min, retry |
| `invalid_grant` on Gmail calls | Testing-mode token expired (7 days) or revoked | Connect Gmail again |
| "setup incomplete" from the API | Gmail not connected or TypeSafe key missing | run `npm run doctor` |
| TypeSafe 401/403 | bad or revoked key | new key from typesafe.ai |
| Port already in use | another process on 8787/5173 | free the port. (Changing ports is not a setup path: `vite.config.ts` reads only the shell environment, not `.env`, so a port set in `.env` moves the API but not the proxy. Point advanced users at `docs/details.md`.) |

### Behaviour rules

- Never print, read aloud or log secret values; never `cat .env`. Use only `doctor`'s pass/fail.
- Never overwrite `.env` or `data/` files. Never delete `data/google-token.json` without asking.
- Never run a non-dry-run batch, never publish the OAuth app to Production, never enable Google APIs other than Gmail.
- Run gcloud commands only after showing them; `gcloud auth login` is the user's.
- One step at a time; don't dump all ten steps at once.
- Plain language, no Google jargon without a one-line gloss.

## Goals / non-goals / anti-goals

- **Goals:** fastest path to a finished dry-run batch; resumable; every step proven by a real call; works for people who only follow the README (via `doctor`).
- **Non-goals:** other decision models, IMAP or other mail providers, a shared/verified OAuth client, tuning rules and folders (that's `/refine`), Windows/macOS installers for Node.
- **Anti-goals:** keys in the chat transcript; a wall of instructions with no checks; browser-automating the Cloud Console; anything that touches the user's mail outside dry run during setup.

## Calls made by Claude (not by Meerav), for review

- `doctor` refreshes the Gmail token in memory only, and opens the DB read-only and only if it exists, so it never writes to `data/`.
- Fake mode / `--demo` reduces `doctor` to node, deps and `.env`.
- `doctor --init-env` handles `.env` creation, so the step is the same in every shell.
- Port conflicts: "free the port" only. Changing ports is left out of setup.
- The user runs `npm run dev` in their own terminal by default.
- A pointer `AGENTS.md` for Codex.
- Workspace-account warning in the questions.

## Left to the builder

- Exact doctor output wording and colours; the TypeSafe smoke-call payload.
- How `doctor` reads settings (shared repo module vs a direct SQLite read).
- Project-id generation scheme for the gcloud path (e.g. `inbox-sweep-<random6>`).
- Testing: unit tests for doctor's non-network logic; for the skill, a manual run-through on a clean clone in fake mode, then real mode with a fresh Google project.
