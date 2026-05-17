# Releasing the Keyguard Designer (web)

## Branch model

Two branches, nothing else:

- **`dev`** — all day-to-day work. Push here as often as you like.
  **Pushing to `dev` never reaches clinicians.**
- **`main`** — the released app. GitHub Pages serves this branch
  (<https://volksswitch.github.io/keyguard-designer-web/>). It is *frozen* between
  releases. You never commit app changes directly to `main`.

"Release branch" and `main` are the same branch. There is no separate `release` branch.

A clinician's browser only picks up a new version when the service worker file `sw.js`
changes byte-for-byte, and that only happens when you bump `CACHE_NAME`. So:

> **Push to `dev` = save your work.
> Merge to `main` + bump `CACHE_NAME` = release to clinicians.**

These are deliberately two different acts. Everything you push to `dev` piles up,
invisible to clinicians, until you choose to release.

## When to release

Merge `dev → main` only when **all** of these hold:

1. **A coherent chunk is done.** Don't release per-commit or per-tiny-fix. Wait until a
   set of features/fixes forms a unit you'd describe to a clinician in one breath.
2. **Cadence: no more often than ~every 2 months.** Routine improvements wait for the
   next window. (Exception below.)
3. **The full test suite is green on `dev`:** `scripts\test.cmd` (all layers) passes.
4. **You've eyeballed it** in a real Chrome/Edge session against a real project folder.

**Critical-fix exception:** a bug that *blocks clinicians from designing a keyguard* may
be released as soon as it's fixed and tested, even inside the 2-month window. Same ritual
below — just don't wait for the calendar.

Anything that doesn't meet the bar stays on `dev`. `main` does not move.

## Trigger phrase (Claude Code)

Ken says **"Release the web app"** (or an obvious variant — "do a web release",
"ship the web app"). That single phrase authorizes the entire ritual below.
Claude runs steps automatically through the merge + `CACHE_NAME` bump + commit,
then shows the release summary and new cache number and waits for one go-ahead
before the final `git push origin main`. No other per-step instruction is needed.

## How to release (the ritual)

This is the **only** time `CACHE_NAME` changes and the **only** time `main` moves. It
produces one atomic release commit that both merges `dev` and bumps the cache.

```
git checkout main
git pull origin main
git merge --no-ff --no-commit dev
```

Now bump the cache version in `sw.js` (line ~4) — increment the integer by one:

```
const CACHE_NAME = 'keyguard-v1';   →   const CACHE_NAME = 'keyguard-v2';
```

Edit it by hand in your editor — it's a single digit and a manual edit is the least
error-prone. The number must only ever **go up**.

Finish the atomic commit (the `--no-commit` above left the merge staged; this single
commit *is* the merge commit, now carrying the cache bump too):

```
git add sw.js
git commit -m "Release: <one-line summary of the chunk> (cache keyguard-v2)"
git push origin main
```

GitHub Pages redeploys within ~1 minute. Clinicians get the new app on their next
reload/reopen (occasionally the one after that, because the service worker swaps in on
one load and serves the new shell on the next).

Then keep working on `dev` as usual.

## Invariants — do not break these

- **Never bump `CACHE_NAME` on `dev`.** It changes only during the ritual above, on
  `main`. This is what makes "push to `dev`" safe.
- **Never commit app changes straight to `main`.** Only the release merge moves `main`.
- **The cache number only increases** (v5 → v6, never back to v4). Browsers detect a
  *changed* `sw.js`, and a lower/old number can leave clients stuck.
- If `git merge` reports a conflict in `sw.js`, the **`main` side's version number always
  wins** — resolve in favor of `main`, then bump it as normal. (Conflicts here are rare:
  `dev` never touches the `CACHE_NAME` line.)

## Rolling back a bad release

Revert the release commit on `main`, then bump the cache **up** again (e.g. v6 → v7, not
back to v5):

```
git checkout main
git revert -m 1 <release-commit-sha>
# hand-edit sw.js: bump CACHE_NAME up by one more
git add sw.js
git commit --amend --no-edit
git push origin main
```

Clinicians roll back to the previous app on their next reload, same as a forward release.
