# Keyguard Designer (web) — Security Overview for IT

_Last updated: 2026-05-23_

This document is written for IT / information-security teams evaluating whether the
**Keyguard Designer** web app is safe for clinicians to use on managed workstations.
It describes what the app is, how it handles data, the network and permission
footprint, the threat model, and recommended hosting hardening.

The app is open source and released to the **public domain (CC0)**, so everything
below can be independently verified in the source:
<https://github.com/Volksswitch/keyguard-designer-web>

---

## 1. Executive summary

- The app is a **100% client-side, static web page**. It runs entirely inside the
  clinician's browser (Chrome or Edge). There is **no application server, no
  database, and no user accounts**.
- **No clinician data ever leaves the device.** Designs are created, rendered, and
  exported locally. The app makes **no network calls to any third party** — no
  analytics, no telemetry, no cloud storage, no external APIs.
- The heavy lifting (the OpenSCAD CAD engine) runs inside the browser's
  **WebAssembly sandbox**, which has no access to the host filesystem or network.
- It needs **no installation and no administrator rights**; it runs on
  locked-down workstations where installing desktop software is not permitted.
- The project is open source (CC0) and auditable.

If your main question is *"can this app exfiltrate patient data or reach into the
machine?"* — the architecture is designed so that it structurally cannot: there is
no server to send data to, and the app makes no outbound requests beyond loading
its own files from wherever you host it.

---

## 2. What the app is and how it runs

- A single static web page (`app.html`) plus bundled assets, served as plain files
  over HTTPS (e.g. GitHub Pages, an internal static host, or a USB/offline copy).
- It loads two bundled, **local** libraries — no third-party CDNs:
  - **OpenSCAD compiled to WebAssembly** — the parametric CAD engine that turns a
    keyguard design into a 3D model.
  - **Three.js** — renders the 3D preview in the browser.
- It is a **Progressive Web App (PWA)**: after the first load, a service worker
  caches the app's own files so it can run **offline**. The service worker only
  ever caches the app's own same-origin files.

### Data flow (all local)

```
Clinician picks a project folder ──► browser reads the design files
        │                                   │
        ▼                                   ▼
  3D preview (Three.js)  ◄──  OpenSCAD-WASM renders the model in-browser
        │
        ▼
  Clinician clicks Export ──► browser "Save As" dialog ──► file saved locally
```

Nothing in this loop touches a network or a server.

---

## 3. Data handling & privacy

- **No collection.** The app does not collect, transmit, or log any personal,
  health, or usage data. There is no telemetry or analytics of any kind.
- **No uploads.** Design files the clinician opens (`.scad`, `.json`,
  `openings_and_additions.txt`, optional `.svg` screenshots) are read and processed
  in-browser only. They are never sent anywhere.
- **Local browser storage** is used only for convenience and stays on the device:
  - a reference to the **last-opened folder** (a browser "file handle") and its
    name, so the clinician can reopen it without re-browsing;
  - **UI preferences** (e.g. theme).
  No design content and no personal data are stored in this way, and none of it
  is transmitted.
- **Clearing site data** in the browser removes the above completely.

---

## 4. Network footprint

- **Outbound requests:** only to the **origin you host the app on**, and only to
  fetch the app's own static files (HTML/JS/WASM/icons). After the PWA caches
  these, it can run with no network at all.
- **No third-party requests.** No CDNs, ad networks, fonts services, trackers, or
  external APIs are contacted. (Dependencies are bundled and served from the app's
  own origin.)
- This is straightforward to confirm in the browser's DevTools **Network** tab or
  via a proxy/firewall log: after initial load you will see no egress.

You can safely **allowlist a single origin** (wherever you host it) and block
everything else; the app will still work.

---

## 5. Permissions the app uses

- **File System Access API** (Chrome/Edge): when the clinician clicks
  *Open Project* and *picks a folder*, the app gets read access to **only that
  folder**, and only for that session (the browser re-prompts on later visits).
  The app does **not** and **cannot** silently scan the filesystem or read files
  outside the chosen folder.
- **Saving exports** uses the browser's native **"Save As" dialog**. Write access
  is granted only to the specific file the clinician chooses in that dialog — there
  is no blanket write permission.
- The app requests **no other permissions** (no camera, microphone, location,
  notifications, clipboard-read, etc.).

---

## 6. Threat model & mitigations

Because there is no server, classic server-side risks (SQL injection, SSRF,
authentication bypass, server data breach) **do not apply**. The relevant risks for
a client-side app are browser-level (cross-site scripting) and the handling of
**design files from untrusted sources**. These have been reviewed and hardened:

| Area | Risk | Mitigation in place |
|---|---|---|
| Console output | A malicious design file printing `<script>` via OpenSCAD `echo` | Console is rendered as **plain text** (`textContent`), never as HTML. |
| Customizer / labels | Section names, file names, or folder names containing HTML | All such values are rendered with **`textContent`/DOM construction**, never `innerHTML`. |
| Deep-link loader | A crafted link making the app fetch & render a project from a **foreign server** | The internal test "fixture" loader is **restricted to same-origin** paths; cross-origin loads are refused. |
| CAD engine | A malicious design file abusing the OpenSCAD/`import()` parsers | OpenSCAD runs in the **WebAssembly sandbox** — no host filesystem, no network. Worst case is a crashed/hung render tab (which is cancellable), **not** machine access. |
| Plugin / base-tag injection | Defense-in-depth | A **Content-Security-Policy** is set (`object-src 'none'; base-uri 'self'`). A stricter HTTP-header CSP is recommended in §8. |
| Supply chain | Compromised third-party CDN/library | Dependencies are **bundled and served from the app's own origin** — no runtime CDN. Source is public for audit. |

### Residual considerations

- **Treat shared design files like any document.** As with opening an email
  attachment or an Office file, opening a *deliberately malicious* keyguard project
  from an untrusted source is the main residual risk. The mitigations above
  (text-only rendering + WASM sandbox) are designed so that even a malicious design
  file cannot script the page or reach the machine — at worst it fails to render.
  Clinicians should still only open keyguard projects from sources they trust.
- **Denial of service:** a pathological design could make a render slow or hang the
  tab. Renders run in a background worker and can be cancelled; closing the tab
  fully recovers.

---

## 7. Updates & change control

- The public site is served from the `main` branch; day-to-day development happens
  on `dev` and is **not** served to clinicians. Releases are deliberate, manual
  merges (see `RELEASING.md`), and the PWA cache is versioned so clients pick up a
  new release cleanly.
- Because the app is static files, you may also **self-host a pinned copy** (or an
  offline copy) if you prefer to control exactly which version clinicians run.

---

## 8. Recommended hosting hardening (for whoever serves the app)

The app is safe as static files, but if you host it you can add defense-in-depth at
the web-server / CDN level. Suggested HTTP response headers:

```
Content-Security-Policy: default-src 'self'; object-src 'none'; base-uri 'self';
    frame-ancestors 'none'; connect-src 'self'; img-src 'self' blob: data:;
    script-src 'self' 'wasm-unsafe-eval' <hash-of-inline-script>; style-src 'self' 'unsafe-inline'
Strict-Transport-Security: max-age=63072000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
```

Notes:
- `frame-ancestors`/`X-Frame-Options` prevent clickjacking (these only work as HTTP
  headers, not via the in-page `<meta>` tag).
- The full `script-src` requires a hash or nonce for the app's inline script;
  the in-page `<meta>` CSP shipped with the app intentionally omits `script-src`
  so it cannot break the app — the stricter policy belongs at the header level,
  validated in a browser before rollout.
- Serve over **HTTPS** (also required for the File System Access API and service
  worker).

---

## 9. Verifying these claims

- **Source code:** <https://github.com/Volksswitch/keyguard-designer-web> (CC0).
- **Network behavior:** open the app, then in DevTools → Network, confirm no
  third-party or post-load requests; or observe firewall/proxy logs.
- **Storage:** DevTools → Application → Storage shows the local IndexedDB/handle and
  preferences described in §3.

---

## 10. Reporting a security concern

If you believe you have found a security issue, please report it via the project's
GitHub repository (open an issue, or contact the maintainer listed there:
Volksswitch — <https://www.volksswitch.org>). The project is volunteer-maintained
and public-domain; please include enough detail to reproduce.
