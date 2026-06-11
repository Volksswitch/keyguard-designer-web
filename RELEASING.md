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
before the final `git push origin main`. After pushing, Claude immediately
performs the post-release steps (sync + pre-bump) without waiting to be asked.
No other per-step instruction is needed.

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

Now reconcile the **release number** in `app.html`. `APP_RELEASE` (near `SETTINGS_KEY`) is
pre-incremented on `dev` at the *start* of each development cycle (the convention mirrors
keyguard.scad's `keyguard_designer_version`), so by the time you merge `dev → main` it should
**already** read the number you're releasing. **Verify** `const APP_RELEASE = N;` is the new
release number — it normally needs no edit here. (If a cycle somehow shipped without a
pre-bump, set it now.) It is the number clinicians see on **Settings → About** and in the
project-open console banner. `CACHE_NAME` is the separate cache key bumped above; the two end
up equal-by-increment but don't have to be equal in value. Like the cache number, `APP_RELEASE`
only ever goes up.

Now update `CHANGELOG.md`: rename the **`## Unreleased (next release)`** heading to
**`## Release <new APP_RELEASE>`**, and add a fresh empty `## Unreleased (next release)`
section above it for the next cycle. The changelog is clinician-facing — keep entries to
what a clinician can see or do differently; leave test/build/tooling changes out.

Now update **`latest_app_version.json`** so the app self-updater knows this release is live.
It tracks the *deployed* `APP_RELEASE` and moves **only here, at release** — exactly like
`CACHE_NAME`, and never on `dev`. Regenerate it from the (now-correct) `APP_RELEASE`:

```
node scripts/publish-app-version.mjs        # or say "publish app version" to Claude
```

The script prints the `app_release` it wrote and the current `CACHE_NAME` — confirm the number
matches the release you're shipping before committing. (Edit the `notes` line by hand if you
want a clinician-facing "what's new"; the script preserves it on future runs.) A stale or
pre-bumped value here would bounce clinicians through a forced refresh to a build that isn't
live, so only ever commit it as part of this ritual.

Finish the atomic commit (the `--no-commit` above left the merge staged; this single
commit *is* the merge commit, now carrying the cache + release + changelog + app-manifest bump):

```
git add sw.js app.html CHANGELOG.md latest_app_version.json
git commit -m "Release: <one-line summary of the chunk> (cache keyguard-v2)"
git push origin main
```

GitHub Pages redeploys within ~1 minute. Clinicians get the new app on their next
reload/reopen (occasionally the one after that, because the service worker swaps in on
one load and serves the new shell on the next).

**Post-release (do this immediately after pushing `main`):**

```
git checkout dev
git merge main --no-edit          # bring CHANGELOG + sw.js back into dev
# bump APP_RELEASE in app.html: N → N+1
git add app.html
git commit -m "chore: pre-bump APP_RELEASE to <N+1> for next dev cycle"
git push origin dev
```

This keeps `dev` one ahead of public at all times and closes the window where a
dev build would report the same release number as the just-shipped public version.

## Invariants — do not break these

- **Never bump `CACHE_NAME` on `dev`.** It changes only during the ritual above, on
  `main`. This is what makes "push to `dev`" safe.
- **Never commit app changes straight to `main`.** Only the release merge moves `main`.
- **The cache number only increases** (v5 → v6, never back to v4). Browsers detect a
  *changed* `sw.js`, and a lower/old number can leave clients stuck.
- **`APP_RELEASE` is pre-bumped on `dev`; `CACHE_NAME` is not.** `APP_RELEASE` is a display
  label — increment it on `dev` to (last public release + 1) at the *start* of each cycle, so
  a dev build always reads one ahead of public (mirrors keyguard.scad's
  `keyguard_designer_version`). `CACHE_NAME` is the deployment cache key and still moves ONLY
  during the release ritual, on `main` (above). At release the two end up equal-by-increment;
  between releases `dev`'s `APP_RELEASE` leads. Both only ever increase.
- **`latest_app_version.json` moves like `CACHE_NAME`, not like `APP_RELEASE`.** It is the
  signal the app self-updater compares against, so it must equal the *deployed* release. Bump
  it ONLY in the release commit on `main` (via `publish-app-version.mjs`), never on `dev`.
  Pre-bumping it would force live clinicians to refresh toward a build that isn't deployed yet.
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
