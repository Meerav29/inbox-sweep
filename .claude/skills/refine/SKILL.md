---
name: refine
description: Use when someone wants to tune inbox-sweep to their taste - it asks too much or too little, archives things they wanted, leaves junk behind, files mail in the wrong folder, or they want to set up or describe folders, change which mail gets swept, or "make it less cautious / more careful". Also use right after /setup finishes.
---

# Refine inbox-sweep

Turn the user's preferences into inbox-sweep settings. They can arrive with preferences ("stop asking me about receipts", "never touch mail from my bank", "it archives too fast") or with none. If they have none, interview them until you have enough.

Calibration goes both ways. Some people find it too cautious: too many review cards. Others find it too confident: it sorts fast and they don't trust it. Find out which, and move the settings that way.

What you change: saved settings only (thresholds, folders and their descriptions, the Gmail query, batch size), through `PUT http://localhost:8787/api/settings`. The map from each setting to what it does is in [references/knobs.md](references/knobs.md). Read it before suggesting changes.

Plain language. Say "how sure it has to be before archiving on its own", not `autoArchiveConfidence`. Show setting names only in the before/after.

## 0. Preflight

1. Run `npm run doctor -- --json`. If `typesafe`, `gmail` or `folders` fails, say what's missing and suggest `/setup` first. Refining still works without Gmail connected, but folder names can't be checked against Gmail.
2. The app must be running for the settings API. Check with `GET http://localhost:8787/api/settings`. If it isn't running, ask the user to start `npm run dev` in their own terminal. If you start it yourself, stop only the process tree you started, by its PID, never by name or pattern (the /setup skill, step 7, has the per-shell commands).
3. Read the current settings and `GET /api/stats`. If `decided` is 20 or more, work out the share of emails it asked about (`askedYou / decided`) and keep it in mind. It helps you check the user's sense of "too much".

## 1. Take what they gave you

If the user stated preferences, restate each one in one line as you understand it, and map it to a setting with knobs.md. Then ask only about what's still unclear or uncovered. Do not run the full interview.

## 2. Interview (only for what's missing)

One question at a time, in plain words, and skip any the user already answered. Stop as soon as you have enough. Usually that's 3 to 5 questions.

1. **Direction.** "When you've used it, did it ask you about too many emails, or did it sort things faster than you were comfortable with?" If they haven't used it yet, ask: "Would you rather it asks you more at first, or handles more on its own and you check the board?"
2. **Must never go unseen.** "Is there any mail that must always reach you, even if it looks like junk?" Bank, school, a person, a work tool. These become query exclusions or folder descriptions. If the list is long, keep the loosening modest.
3. **Happy to lose.** "What could it archive without you ever seeing it?" Promos, newsletters, receipts, GitHub notifications. These move the junk and stale settings.
4. **Folders.** "Which kinds of mail do you want filed somewhere, not just archived or kept?" For each one, get a name and a one-sentence description of what belongs there and what doesn't. Use existing Gmail labels where they fit (`GET /api/labels`).
5. **Scope.** "Should it look at all unread inbox mail, or skip some, like the Promotions tab or anything older than a month?" This sets the Gmail query.

If the user says "just pick for me", propose a full set of changes for the direction they gave and go to step 3.

## 3. Propose before changing

Show one short before/after list in plain words, with the setting in brackets. For example:

- Archives on its own when it's 78% sure, down from 85% (`autoArchiveConfidence` 0.85 → 0.78)
- Asks about "might need a reply" mail only when it's 80% sure, up from 70% (`needsReplyQueue` 0.7 → 0.8)
- New folder **Receipts**: "Order confirmations and receipts from shops. Not bank statements."
- Never looks at mail from chase.com (query adds `-from:chase.com`)

Say what each change risks in one line when it lowers caution: auto-archives happen in Gmail with no card and no board. If the round loosens anything that auto-archives (`autoArchiveConfidence`, `junkMaxKeep`, `recentDays`, the stale pair), recommend turning on dry run with it and trying a batch first (step 5). Don't promise fewer questions from a change knobs.md says won't deliver them, for example `importantQueue` on its own. Then ask: "Apply these?" Change nothing until they say yes. They can drop or edit items.

## 4. Apply and confirm

1. Send a single `PUT /api/settings` patch with only the changed keys. For folders, `GET` the current list first and send the full edited list, since folders are replaced, not merged. On a 400, read the message, fix the value, and tell the user what changed.
2. `GET /api/settings` again and confirm the new values took.
3. If `GET /api/stats` shows `unfinished` above 0, say the change applies to the next batch. The exceptions are a dry-run change, which applies at once, and a batch resumed after a server restart, which picks up the new values.

## 5. Try it (offer, don't push)

Offer a check on real mail: "Want to see how this handles a few real emails before you trust it?" If they say yes:

1. Set `dryRun` to true with the settings API, after saying you're doing it. If it was false before, remember to offer to set it back.
2. Ask them to pick batch size 10 on the app's home screen and press Start session. Starting it is theirs to do.
3. Afterwards, ask what it got wrong or asked about needlessly, and loop back to step 3 with that.

Dry run still sends email content to TypeSafe (and Anthropic, if set), but changes nothing in Gmail.

## When settings can't do it

Some preferences need a code change, for example a fixed bar in `server/policy/decide.ts` (knobs.md lists them), or changing the questions Jev answers in `server/jev/questions.ts`. First try the nearest settings route: a query exclusion or a folder description. Then say plainly what it can't do.

Only if the user asks for a code change in so many words: explain the change first and get a yes. Make it, run `npm test`, and leave it uncommitted for them to review. These files are shared app code, so a change affects everyone who uses this clone.

## Rules

- Never apply a change the user hasn't approved. Never set `dryRun` to false without asking.
- Never run a non-dry-run batch yourself, and never apply a batch's moves.
- Never read or print `.env` or anything in `data/`. Settings come only from the API.
- Never ask for or accept API keys in chat.
- Don't move any single threshold more than about 0.15 in one round without saying why. Repeat rounds are fine. Never set `autoArchiveConfidence` or `proposeConfidence` below 0.5.
- Folder descriptions go to Jev with every email, so keep each to one or two sentences.
