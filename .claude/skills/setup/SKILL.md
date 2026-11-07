---
name: setup
description: Use when someone wants to set up inbox-sweep, get this running, connect their Gmail, or has just cloned the repo. Also use when the app says "setup incomplete", when `npm run doctor` is failing, or when Gmail, Google sign-in or the TypeSafe key stop working.
---

# Set up inbox-sweep

Take the user from a fresh clone to a finished dry-run batch, one step at a time, with a real check after each step. Re-running this skill on a working machine should say "all good" in seconds.

Scope: Gmail and the Jev decision model only. If the user asks about another model or mail provider, say it is not supported yet. Models are called through `JevClient` in `server/jev/client.ts`. Do not walk them through code changes.

Plain language. Add a one-line gloss for any Google term. Never dump all ten steps at once.

## The checker

`npm run doctor -- --json` prints `{checks: [{id, status, required, hint?, errorCode?, detail?}], ok}`. Check ids, in order: `node`, `deps`, `env_file`, `typesafe`, `anthropic`, `google_client`, `redirect_uri`, `gmail`, `folders`. Statuses: `pass`, `fail`, `skip`, `warn`, `info`.

- `redirect_uri`: `detail` is the exact URI to register with Google. It is always present.
- `gmail`: `detail` is the connected address. Use it to confirm it is the right account.
- Flags: `--demo` (fake inbox, only node, deps and `.env` are checked), `--init-env` (copies `.env.example` to `.env`, never overwrites).
- Exit codes: 0 all required pass, 1 a required check failed, 2 only an optional one failed. `ok` is true for 0 and 2.
- Run it after every step. Use the per-check results to decide where to resume, not `ok` alone. A fresh clone fails most checks, and that is expected.

Full check list and error codes: `docs/details.md`, "Checking your setup".

## 0. Preflight (no questions yet)

1. Node must be 22.12 or newer. If `node --version` is older, ask them to install a newer one and stop.
2. If `node_modules` does not exist, say so and run `npm install`. This is the one command you run without asking. `doctor` cannot run before it (its runner is missing).
3. If the user already said they want the fake inbox or demo, run `npm run doctor -- --demo` instead of the full doctor and skip the questions. A `WARN env_file` is fine there: the fake inbox starts without `.env`. Otherwise run `npm run doctor -- --json`.
4. Show a short checklist of what is done and what is left.
5. If everything passes, say so, offer to start the app, and stop.

## 1. Ask only what changes the path

At most three questions, one at a time. Skip any the preflight already answered. Detect before asking: is `gcloud` on PATH, does `.env` exist, which keys already pass.

1. "Do you want to try it with a fake inbox first, or go straight to your own Gmail?" (The fake inbox needs no keys.)
2. "Is this a personal @gmail.com account, or a work or school (Google Workspace) account?" Workspace admins may block unverified apps or limit who can create Cloud projects. Warn, and suggest a personal account or asking the admin.
3. "Do you already have a Google Cloud project you want to use?" If not, you will create one. If yes, skip creating it, and ask for the project id as part of this same question (gcloud path only). Show then run `gcloud config set project <id>`. On the console path they just select it in the project picker. Either way, still confirm the Gmail API is enabled on that project (step 4).

## 2. Recommend one path

Name one path with its time. No menu.

- Demo, about 1 minute: `npm run dev:fake`, open http://localhost:5173, press Start session. If you start `dev:fake` yourself, the stop-only-your-own-PID rule in step 7 applies. Then offer to continue to the real setup.
- Own inbox with gcloud, about 10 minutes.
- Own inbox, console only, about 15 minutes.

For the own-inbox paths, say upfront what they do themselves: get a TypeSafe key, click through about 3 Google screens, paste values into `.env`, and press Connect Gmail.

## 3. Steps, each ending in a check

Skip any step whose check already passes, so the flow resumes where it stopped. Click-by-click text for Google is in [references/google-cloud.md](references/google-cloud.md).

1. `.env`: run `npm run doctor -- --init-env`. Check: `env_file`.
2. TypeSafe key: send them to https://typesafe.ai/ to make a key, and tell them to put it on the `TYPESAFE_API_KEY=` line in `.env`. Check: `typesafe`.
3. Anthropic key (optional): they put it on the `ANTHROPIC_API_KEY=` line in `.env`. It only writes the one-line "why" on review cards. The app works without it. Check: `anthropic`. A warn is fine.
4. Google project and Gmail API. gcloud path or console path, see the reference. Check: `gcloud services list --enabled` shows `gmail.googleapis.com`.
5. Consent screen: External, Testing, app name, support email. They must add their own address as a test user. Say plainly that skipping this gives "Access blocked" or a page that hangs, with no clear error.
6. OAuth client: type **Web application** (not Desktop). Authorised redirect URI is the exact `redirect_uri` value from doctor. They paste the client ID and secret into `.env`. Check: `google_client`.
7. Start the app: ask them to run `npm run dev` in their own terminal, so they own it. If you start it in the background instead, stop only the process tree you started, by its PID, never by name or pattern. Kill the whole tree: killing just the npm wrapper leaves node/vite holding ports 5173 and 8787.
   - PowerShell: start it with `Start-Process npm.cmd -ArgumentList 'run','dev' -PassThru` (plain `npm` can fail in Windows PowerShell 5.1), which gives the PID. Stop it with `taskkill /PID <pid> /T /F`.
   - Git Bash only: `$!` is not the Windows PID. Read the `WINPID` column from `ps`, then run `MSYS_NO_PATHCONV=1 taskkill /PID <winpid> /T /F` (without that variable Git Bash rewrites `/PID`).
   - macOS/Linux: start it with `npm run dev &` and note the PID (`$!`). Stop it with `pkill -P <pid>; kill <pid>` (children first, then the npm process).
   `.env` is read once at start, so restart after every `.env` edit.
8. Connect Gmail: open http://localhost:5173, press Connect Gmail. On "Google hasn't verified this app", press Advanced, then Continue (expected, it is their own app). Check: `gmail`.
9. Folders: they pick at least one on the Folders screen in the app. Check: `folders`. Tuning folders and rules is `/refine`'s job.
10. First run: tick **Dry run**, batch size 10, Start session. Dry run still sends email content to TypeSafe (and Anthropic, if set), but changes nothing in Gmail.

## 4. Wrap up

Short summary: what is set up, what is optional and skipped. Then three things to know:

- In Testing mode the Gmail connection expires every 7 days. Press Connect Gmail again. `doctor` reports it as `gmail_token_expired`.
- Untick Dry run once the board looks right.
- `/refine` is next, once it exists.

## Errors

| Symptom / code | Cause | Fix |
|---|---|---|
| "Access blocked", or the consent page hangs | Account is not a test user | Add it under Audience, then Test users |
| `redirect_uri_mismatch` | URI not registered, wrong port, or Desktop client | Register the exact URI doctor prints, on a Web application client |
| `invalid_client` (doctor: `google_invalid_client`) | Typo or stray space in the ID or secret | Re-copy into `.env`, restart the app |
| `accessNotConfigured`, Gmail API disabled (doctor: `gmail_api_disabled`) | API not enabled, or just enabled | Enable it, wait about 1 minute, retry |
| `invalid_grant` on Gmail calls (doctor: `gmail_token_expired`) | Testing-mode token expired (7 days) or revoked | Press Connect Gmail again |
| "setup incomplete" from the API | Gmail not connected, TypeSafe key missing, or no folders | Run `npm run doctor` |
| TypeSafe 401 or 403 (doctor: `typesafe_bad_key`) | Bad or revoked key | New key from typesafe.ai |
| Port already in use | Another process on 8787 or 5173 | Free the port. Changing ports is not part of setup: `vite.config.ts` reads only the shell environment, not `.env`, so a port set in `.env` moves the API but not the proxy. Point advanced users at `docs/details.md`. |

Doctor cannot see "Access blocked", `redirect_uri_mismatch` or port clashes. They only show up in Google's screens or when the server starts.

## Rules

- Never print, read aloud or log secret values. Never `cat .env`. Use only doctor's pass/fail. Never ask for a key in chat. If the user pastes one anyway, tell them to put it in `.env` instead and to rotate that key.
- Never overwrite `.env` or files in `data/`. Never delete `data/google-token.json` without asking.
- Never run a non-dry-run batch, never publish the OAuth app to Production, never enable Google APIs other than Gmail.
- Run gcloud commands only after showing them. `gcloud auth login` is the user's to do.
- One step at a time.
- Do not use browser automation on the Cloud Console.
- Use `doctor --init-env`, not `cp` or `copy`, so every shell behaves the same.
