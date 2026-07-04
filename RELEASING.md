# Releasing the Keyguard Designer web app

This is the formal release process for the Keyguard Designer web app. It is the
**same shape** as the process for the other Volksswitch projects (Conversant AAC and
the Keyguard Designer `.scad`): *work locally, log each user-visible change to
`## Unreleased` in plain language, and say "bump keyguard web app" to cut a release.*
Only the mechanics (integer release numbers, GitHub Pages) differ.

## Environment model

- **The PC is the development environment.** All day-to-day work is committed to the
  local `main` branch on the PC. **These commits are NOT pushed.** They are backed up
  and synced across your machines by OneDrive, which syncs the whole project folder
  including the `.git` directory.
- **GitHub is the release environment.** The repository is
  <https://github.com/Volksswitch/keyguard-designer-web>. **GitHub Pages serves the
  `main` branch** (<https://volksswitch.github.io/keyguard-designer-web/>), so a
  clinician's browser picks up a new version when `main` moves. Therefore:

  > **Commit to local `main` = save your work.
  > Push `main` = release to clinicians.**

  These are two different acts. Everything you commit piles up locally, invisible to
  clinicians, until you choose to release. **Any push to `main` redeploys the app**
  (even a docs-only commit), so we do not push between releases — not even documentation.

There is one branch: `main`. The old `dev`/`main` split is retired (`origin/dev` is
redundant). There is no separate release branch.

## Between releases (the dev cycle)

- **Claude commits; Ken does not run git.** As each change is completed, Claude commits
  it to local `main`. No pushing.
- **Changelog-as-you-go (mandatory).** `CHANGELOG.md` is kept in lockstep with `app.html`.
  The moment a change lands that a **clinician** could see or do differently (a new
  feature or a visible fix), add or edit the matching plain-English bullet under the
  topmost **`## Unreleased (next release)`** heading, **in the same commit as the code**,
  written the way a clinician reads it (not engineering language), matching the voice of
  the existing `## Release N` bullets. Exclude internal-only work (tests, tooling,
  refactors, harness/CI, perf with no visible effect); when in doubt, ask Ken. If a
  change is backed out, delete its bullet in the same commit. **After any `CHANGELOG.md`
  edit, regenerate the bundled notes** (`node scripts/apply-release-notes.mjs`) so the
  in-app "What's new" notice stays in lockstep. **Ken's own edits to `CHANGELOG.md` are
  authoritative** — preserve his wording; make only surgical edits.

## Version numbers

Three things carry the version:

- **`APP_RELEASE`** (integer, in `app.html`) — the number clinicians see on Settings →
  About and in the project-open console banner. The analog of `keyguard_designer_version`
  in `keyguard.scad`.
- **`CACHE_NAME`** (`keyguard-vN`, in `sw.js`) — the service-worker cache key. A client
  only picks up a new build when this changes byte-for-byte.
- **`latest_app_version.json`** — the manifest the app's self-updater compares against;
  it must equal the *deployed* `APP_RELEASE`.

**Pre-bump (so you always know which build you're testing).** At the *end* of each
release, the local dev copy is immediately pre-incremented: `APP_RELEASE` → (last public
release + 1). The dev build's About screen and console banner therefore always read a
number **higher than the last public release**, so when you test dev changes you can tell
at a glance you're on a dev build. This pre-bump lives **locally only (unpushed)** until
its release. **`CACHE_NAME` and `latest_app_version.json` are NOT pre-bumped** — they move
only during the release ritual, to match the deployed `APP_RELEASE`. (A pre-bumped manifest
on `main` would bounce clinicians toward a build that isn't live.) All numbers only ever
**increase.**

## When to release

Release only when a coherent chunk is done — a set of fixes/features you'd describe to a
clinician in one breath — no more often than **~every 2 months** (routine improvements wait
for the next window). **Critical-fix exception:** a bug that blocks a clinician from
designing a keyguard may be released as soon as it's fixed and tested. Anything below that
bar stays as local commits; `main` does not move.

## Releasing — trigger phrase "bump keyguard web app"

Ken says **"bump keyguard web app"** (or an obvious variant). Ken issues this only **after
he has verified the `CHANGELOG.md` contents.** That single command authorizes the entire
ritual below **through the push** — Claude runs it end to end, printing the release summary
and the new cache/release numbers as it goes, and does **not** pause for a second
confirmation before pushing.

The ritual:

1. **Bump `CACHE_NAME`** in `sw.js` — increment the integer by one (`keyguard-v15` →
   `keyguard-v16`). It only ever goes up.
2. **Verify `APP_RELEASE`** in `app.html` already reads the release number (it was
   pre-bumped at the last release). If a cycle somehow shipped without a pre-bump, set it now.
3. **Finalize the changelog.** Rename the topmost **`## Unreleased (next release)`** heading
   to **`## Release <APP_RELEASE>`**, and add a fresh empty `## Unreleased (next release)`
   section above it.
4. **Regenerate the bundled "What's new" notes:** `node scripts/apply-release-notes.mjs`.
5. **Update the manifest:** `node scripts/publish-app-version.mjs` — writes the deployed
   `APP_RELEASE` into `latest_app_version.json`. Confirm the number matches the release.
6. **Commit** the release (`sw.js`, `app.html`, `CHANGELOG.md`, the `RELEASE_NOTES` block in
   `app.html`, `latest_app_version.json`) as one commit.
7. **Push `origin main`.** GitHub Pages redeploys within ~1 minute. Clinicians get the new app
   on their next reload (occasionally the one after, as the service worker swaps in).
8. **Start the next cycle — pre-bump.** Immediately increment `APP_RELEASE` in `app.html` to
   (release + 1), commit that locally, and **do not push.** The dev copy now leads public by one.

## Invariants — do not break these

- **Never push to `main` except as step 7 of "bump keyguard web app".** Any push to `main`
  deploys the app to clinicians — including a docs-only push. Between releases, everything
  stays as local commits.
- **The pre-bumped `APP_RELEASE` and the `CACHE_NAME`/manifest bump stay local (unpushed)
  until release.** GitHub `main` always equals the last **public** release, and on `main` the
  served `app.html`, `CACHE_NAME`, and `latest_app_version.json` all agree on that number.
- **`CACHE_NAME`, `APP_RELEASE`, and the manifest only ever increase** (never reused, never
  lowered). A lowered cache number can strand clients on a stale build.
- **`CHANGELOG.md` is authored as-you-go**, in clinician language; nothing is authored at
  release except the `## Unreleased` → `## Release <N>` rename.
- **Ken verifies `CHANGELOG.md` before issuing "bump keyguard web app";** the command then
  runs through the push without a second confirmation.

## Rolling back a bad release

Revert the release commit on `main`, then bump `CACHE_NAME` **up** again (e.g. v16 → v17,
never back to v15), and push:

```
git revert -m 1 <release-commit-sha>   # -m 1 if it was a merge; drop it otherwise
# hand-edit sw.js: bump CACHE_NAME up by one more
git commit --amend --no-edit
git push origin main
```

Clinicians roll back to the previous app on their next reload, same as a forward release.
