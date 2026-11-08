# Knobs /refine can turn

All of these are saved settings, changed with `PUT http://localhost:8787/api/settings`. Read the current values first with `GET` on the same URL. Defaults are `DEFAULT_SETTINGS` in `shared/types.ts`.

## How a decision is made

For each email Jev answers twelve yes/no questions, each as a probability from 0 to 1 (`important`, `needs_reply`, `bulk_marketing`, `newsletter`, `automated_sender`, `needs_attention`, `routine_financial`, `financial_exception`, `money_movement`, `transactional`, `dev_bot`, `stale`). Jev also picks a destination: archive, keep in inbox, or one of the enabled folders, with a confidence. `server/policy/decide.ts` turns those answers into one of three outcomes:

- **Auto-archive**: done in Gmail without asking (unless dry run is on).
- **Proposed**: shown on the end-of-batch board, where the user approves the moves in one go.
- **Queued**: a review card. These are the "asked you" emails.

The checks run in this order. The first one that decides wins.

0. If Jev's call failed, the email is queued.
1. **Stale rule:** auto-archive. It needs the email to be at least `staleDays` old, `stale` at least `staleConfidence`, and the email to be clearly automated with no reply needed and no money exception or movement. It runs before the guard and the important check.
2. **Important:** if `important` is at least `importantQueue`, queue an important card.
3. **Needs reply:** if `needs_reply` is at least `needsReplyQueue`, queue it, suggesting keep.
4. **Guard flag:** this decides nothing on its own; it blocks rules 5 to 7. It is raised when `financial_exception`, `money_movement` or `important` is at least `guardNoul`, or `automated_sender` is below `guardNoul`, meaning the email reads as written by a person. Guarded mail falls through to rule 8.
5. **Junk:** applies when not guarded, the triage rules say archive, Jev did not pick keep, and its keep probability is at most `junkMaxKeep`. A folder pick with confidence at least `proposeConfidence` is proposed; anything else is auto-archived. This rule ignores `autoArchiveConfidence`.
6. **Archive:** applies when not guarded, the triage rules say archive, Jev picks archive, and confidence is at least `autoArchiveConfidence`. The email is auto-archived.
7. **Folder or keep:** applies when not guarded, Jev picks a folder or keep, and confidence is at least `proposeConfidence`. The move is proposed.
8. Everything else is queued.

The triage rules (`triageSaysArchive`) never archive mail that reads as written by a person (`automated_sender` below 0.5), whatever the settings. Mail younger than `recentDays` only counts as junk when `bulk_marketing` is at least 0.95.

## The settings

| Setting | Default | Less cautious (asks less) | More cautious (checks more) |
|---|---|---|---|
| `thresholds.autoArchiveConfidence` | 0.85 | lower, e.g. 0.75 | raise, e.g. 0.92 |
| `thresholds.junkMaxKeep` | 0.15 | raise, e.g. 0.25 | lower, e.g. 0.08 |
| `thresholds.proposeConfidence` | 0.6 | lower, e.g. 0.5: more folder moves go to the board instead of cards | raise, e.g. 0.75 |
| `thresholds.needsReplyQueue` | 0.7 | raise, e.g. 0.8 | lower, e.g. 0.6 |
| `thresholds.recentDays` | 7 | lower, e.g. 3: fewer days count as recent and get the strict junk bar | raise, e.g. 14 |
| `thresholds.staleDays` | 14 | lower, e.g. 7 | raise, e.g. 30 |
| `thresholds.staleConfidence` | 0.85 | lower, e.g. 0.75 | raise, e.g. 0.92 |
| `thresholds.importantQueue` | 0.7 | see below | lower, e.g. 0.6: more important cards |
| `thresholds.guardNoul` | 0.5 | see below | see below |
| `batchSize` | 20 | 10, 20, 30 or 50; smaller means shorter sessions, not fewer questions | |
| `query` | `in:inbox is:unread -category:promotions -category:social` | | |
| `folders` | `[]` | | |
| `dryRun` | false | | |

**`importantQueue` and `guardNoul` work together.** Raising `importantQueue` alone does not cut questions. Mail whose `important` falls between `guardNoul` and `importantQueue` still trips the guard and is queued anyway, just as a filing card instead of an important one. Asking less about important-ish mail means raising both, for example `guardNoul` 0.6 and `importantQueue` 0.8.

**`guardNoul` has mixed effects.** Raising it lets more mail through on the money and important checks. At the same time it makes more mail count as person-written, because `automated_sender` must now clear a higher bar, and that mail is held back. Lowering it does the opposite on both counts. Move it only to deal with money or important mail, by 0.1 at most, and say both effects out loud. No setting lets person-written mail be auto-archived; that bar is fixed in code.

**Rough plays:**
- *Too cautious.* Lower `autoArchiveConfidence`, raise `junkMaxKeep`, lower `recentDays`, loosen the stale pair, lower `proposeConfidence`, and raise `needsReplyQueue`.
- *Too confident.* Do the reverse, and add query exclusions and sharper folder descriptions.

**Query.** This is the Gmail search that decides which mail gets swept at all. Mail the query excludes is never fetched, scored or touched. For "never touch mail from X", exclusion is the strongest tool: add `-from:x.com`. A thread is swept if any message in it matches. The default `is:unread` means read inbox mail is never swept.

**Folders.** A list of `{name, enabled, description}`. Jev reads each enabled folder's description when it picks a destination, so the description is the main way to say what belongs where. For example: "Receipts and order confirmations from shops. Not bank statements." `GET /api/labels` lists the user's Gmail labels.

**Dry run.** While `dryRun` is true, nothing changes in Gmail.

## Patch rules

**Send a partial patch.** Include only the keys you change, for example `{"thresholds": {"autoArchiveConfidence": 0.78}}`.

**How keys combine:**
- `thresholds` is merged into the stored values.
- `folders` is replaced whole. `GET` it, edit it, and send the full list back.

**Validation.** The patch is rejected with 400 when:
- it has an unknown key
- a unit threshold is outside 0 to 1
- `recentDays` or `staleDays` is not a positive whole number

**Running batches.** A running batch keeps the thresholds, folders and query it started with. There are two exceptions:
- If the server restarts and the batch is resumed, it picks up the new values.
- `dryRun` is checked when moves are written, so turning it on takes effect right away.

`GET /api/stats` reports batches that are still running, reviewing or applying as `unfinished`.

## Fixed in code (not settings)

These are in `server/policy/decide.ts`:
- the 0.5 bar below which mail reads as written by a person and is never triage-archived
- the 0.95 recent-junk bar
- the other triage bars: old junk 0.85, dev bot 0.85, routine financial 0.85, transactional 0.85
- the stale rule's extra conditions
- the 0.5 money block

The wording of Jev's twelve questions is in `server/jev/questions.ts`.

## Measuring "asks too much"

`GET /api/stats` returns `askedYou` and `decided`. The share of emails the user had to answer is `askedYou / decided`.
- Approved proposals count in `decided`.
- Dry-run decisions don't count at all.
