# Why a PWA keeps serving a stale version (and the user reaches for Ctrl+Shift+R)

Portable findings from diagnosing a single-page PWA that kept showing an old
build until a hard refresh. Written to be project-agnostic — nothing here is
specific to the app it came from. If your PWA has a service worker and users
say "I have to hard-refresh to see your changes," this is almost certainly why.

---

## TL;DR

Ctrl+Shift+R works because it **bypasses the service worker and HTTP cache
entirely**. If users need it, your service worker is doing its job (serving from
cache) but your page never **notices a new version landed** and never **reloads
itself** to pick it up. The fix is ~15 lines of service-worker *lifecycle*
wiring on the page side — not a change to your caching strategy.

---

## The setup that causes it

A very common, reasonable-looking PWA setup:

1. **A cache-first service worker.** On `fetch` it returns the cached asset and
   only hits the network on a miss. This is what makes the app fast and
   offline-capable — you want to keep it.
2. **A cache name (or asset list) that only changes when you deploy.** Bumping
   it is what tells the browser "the worker changed."
3. **Fire-and-forget registration on the page:** `navigator.serviceWorker
   .register('/sw.js')` and nothing else.

Items 1–2 are healthy. **Item 3 is the bug.** With only a bare `register()`
call, the page has no idea when a new worker takes over, and nothing ever
triggers a reload to swap in the new HTML/JS.

---

## Why the stale version sticks (the lifecycle, step by step)

When you deploy a new build:

1. The browser, on its **own** schedule, re-checks `sw.js` for byte changes —
   primarily **on navigation** to a page in scope, and at most about **every 24
   hours** otherwise. A long-lived open tab/PWA may not check for a while.
2. When it sees `sw.js` changed, it installs the new worker. By default the new
   worker then **waits** until every tab using the old one is closed before it
   activates. (Calling `self.skipWaiting()` in `install` skips this wait — see
   below.)
3. Crucially, even once the new worker **activates and claims** the page, the
   **already-loaded tab keeps showing the old HTML/JS that's already in the
   DOM.** Activation does not reload the page. Nothing tells the page "new
   version is live — refresh."

So the user is staring at the old app. They refresh once — but because of the
cache-first worker plus an activation race, that first refresh is often *still*
served from the old cache while the new worker finishes activating in the
background. The **second** refresh (or a hard refresh) finally shows the new
build. That "refresh twice, or hit Ctrl+Shift+R" experience is the whole
symptom.

---

## The fix (page side): notice the update, then reload once

Add real update handling to your registration. Two small pieces:

```js
if ('serviceWorker' in navigator) {
  let reloadArmed = false;   // only reload when WE asked for an update check
  let reloaded    = false;   // guard against reload loops

  // When a new worker takes control, reload exactly once — but ONLY if a
  // load-time check armed it. This keeps the browser's own background SW
  // updates from refreshing the page out from under the user mid-task.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadArmed && !reloaded) { reloaded = true; location.reload(); }
  });

  navigator.serviceWorker.register('/sw.js').then(reg => {
    // Proactively check for a new worker at moments where a reload is safe:
    // on load, and on tab focus (or a periodic timer). Without this you wait
    // on the browser's lazy ~24h schedule.
    const checkForUpdate = () => { reloadArmed = true; reg.update().catch(() => {}); };
    checkForUpdate();
    window.addEventListener('focus', checkForUpdate);
  });
}
```

And in the **service worker**, activate new versions immediately instead of
waiting for all tabs to close:

```js
self.addEventListener('install',  e => e.waitUntil(
  caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
));
```

`skipWaiting()` + `clients.claim()` make the new worker take over as soon as it
installs; the page's `controllerchange` handler then reloads to the new build.
Together these remove the need for any manual refresh.

---

## Auto-reload vs. "Update available — Reload" prompt

`controllerchange → location.reload()` is a **forced** refresh. Decide whether
that's safe for your app:

- If a reload can land **mid-task and lose unsaved state**, don't auto-reload on
  every deploy. Instead show a small non-blocking toast ("A new version is
  available — Reload") and let the user choose. (Implement by *not* calling
  `skipWaiting()` in `install`; keep the new worker waiting, and have the page
  `postMessage` it to skip-waiting only when the user clicks.)
- If you can guarantee a reload only happens at **safe moments** (e.g. you only
  ever run the update check at app load or right after loading a document, when
  there are provably no unsaved edits), a silent forced reload is fine and
  simpler. **The key is to arm the reload only from those safe checks** (the
  `reloadArmed` flag above) so a *background* worker update can't reload the
  page at an arbitrary mid-task moment.

---

## Optional: an explicit version file as the trigger

You can publish a tiny JSON manifest (on a stable URL, fetched with
`cache: 'no-store'` so it bypasses caching) carrying the latest deployed version
number, and compare it to a version constant baked into the running build:

```js
const r = await fetch('/latest_version.json?t=' + Date.now(), { cache: 'no-store' });
const latest = (await r.json()).version;
if (latest > RUNNING_VERSION) { /* we are stale */ }
```

This gives a **definitive, human-readable signal** that the running app is old,
independent of service-worker timing — handy for a "what's new" prompt or as a
belt-and-suspenders check on managed/locked-down browsers where SW update checks
can be sluggish.

**Important caveat — detection is only half the job.** Knowing you're stale does
**not** fetch the new code: with a cache-first worker, a plain `location.reload()`
is still served the **old** bytes from cache. The version file is the *trigger*;
the *engine* that actually pulls the new build is still the service-worker update
(`reg.update()` → `controllerchange` → reload). The two compose — the version
file does nothing useful on its own.

---

## Gotchas worth pre-empting

- **Loop guard.** If you force a reload on "stale detected" but the new bytes
  never actually arrive (an inconsistent deploy, or a CDN serving an old file),
  you can loop. Record the version you tried (e.g. in `sessionStorage`) and stop
  re-trying the same target; optionally fall back to clearing caches +
  unregistering the worker + reloading **once** as a guaranteed-fresh escape
  hatch (it terminates because the reloaded build's version then matches).
- **Bootstrap is one release late.** The update-handling code only starts
  working *after* users are running a build that contains it. The first deploy
  that introduces it still needs a manual refresh to reach; every deploy after
  that is automatic. Unavoidable — just expect it.
- **`sw.js` must not be long-cached by HTTP.** Browsers normally revalidate the
  worker script on update checks, but make sure your host/CDN isn't serving
  `sw.js` with a long `max-age`. The version manifest (if you use one) likewise
  needs `cache: 'no-store'` and ideally a cache-busting query param.
- **The cache version/asset list must actually change every deploy.** That byte
  change in `sw.js` is the *only* thing that makes the browser detect an update.
  If it doesn't change, nothing above fires.
- **Don't fix this by going network-first for the shell.** That re-breaks
  offline support and adds latency. Cache-first + proper update handling is the
  right combination.

---

## One-paragraph summary to paste into the other project

> Our PWA served stale builds (users needed Ctrl+Shift+R) because the page did a
> bare `serviceWorker.register()` with no update handling: a cache-first worker
> kept serving old assets, and nothing reloaded the page when a new worker took
> over. Fix is page-side lifecycle wiring — call `registration.update()` at safe
> moments (load/focus), add a `controllerchange` listener that reloads once
> (armed only by those checks, so background updates can't reload mid-task), and
> `skipWaiting()` + `clients.claim()` in the worker so new versions activate
> immediately. Optionally publish a `latest_version.json` (fetched `no-store`) as
> an explicit staleness signal, but remember it's only a trigger — the
> service-worker update is still what fetches the new bytes.
