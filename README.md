# DataPrivacyCheckMendix

A small Svelte + Vite tool for checking what data a [Mendix](https://www.mendix.com/) app actually exposes. Point it at an app and find out **which entities/endpoints are readable, how many objects each returns, and what those objects contain** — the sort of thing you want to verify before an app goes live with anonymous or low-privilege access.

It offers two complementary modes:

| Mode | What it checks | How it reaches the data |
|------|----------------|-------------------------|
| **Live client probe** | Which **entities** the current session can read (incl. anonymous) | Runs inside the app's own page via the Mendix client API (`mx.meta.getMap` + `mx.data.get`) |
| **OData / REST scanner** | Which **published OData/REST endpoints** are open | Fetches the service document from outside the app |

---

## Why two modes?

Mendix exposes data in two very different ways, and a privacy check needs both angles:

- **Published OData/REST services** are reachable from anywhere over HTTP. The scanner reads the service document, lists every entity set, and queries each for its count and objects.
- **Entity read access** inside the running app is governed by security rules. The only faithful way to test "what can an anonymous user actually read?" is to ask the client runtime itself — which requires running in the app's page, with its session. That's what the live probe does.

> **Note:** pointing either mode at the app's `index.html` won't work — that page is the Mendix web client (HTML), not a data endpoint. Use an OData service root for the scanner, or the live probe for entity-level checks.

---

## How to start the App locally

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

```bash
npm run build     # production build into dist/
npm run preview   # preview the production build
```

Requires Node 18+ (developed on Node 24).

---

## Mode 1 — Live client probe (`mx.data.get`)

This is the most thorough privacy check. It generates a self-contained script (console snippet **and** bookmarklet) that you run **inside the running Mendix app**, because the `mx` client API only exists there and uses the live session.

**Steps**

1. In the tool, optionally list specific entities — or leave the box empty to **auto-discover every entity** via `mx.meta.getMap()`.
2. Set **Amount** (page size / max objects to fetch) and **Offset**.
3. Copy the generated script (or drag the bookmarklet to your bookmarks bar).
4. Open the target Mendix app in a browser tab, logged in as the user whose access you want to test (**or stay anonymous** — that's the interesting case).
5. Paste the script into the DevTools console (`F12`) and press Enter, or click the bookmarklet.

**What you get** — a floating panel in the app that:

- lists every discovered entity with a status badge and **exact object count**:
  - `READABLE` — the session can read objects
  - `empty/constrained` — query allowed but returned nothing
  - `denied` — no read access
  - `timeout` — no response within 8s
- probes entities **sequentially** (8s timeout each) so it doesn't flood the server,
- lets you **click any entity to load and view its objects** (`guid` + all attributes),
- has a **"readable only"** filter to show just what leaks.

Results are also left on `window` for further processing:

- `window.__scan` — the full readability overview (also printed via `console.table`)
- `window.__dp_results` — objects loaded for entities you clicked

**Scope note:** `mx.meta.getMap()` returns the entities the *client* knows about — those referenced by pages/microflows reachable in the current session. For an anonymous user that may be a subset of all server entities, which is exactly what an attacker in that session could enumerate.

---

## Mode 2 — OData / REST scanner

Discovers and inspects endpoints from **outside** the app.

1. Paste an endpoint URL, e.g. a Mendix OData service root:
   `https://your-app.mendixcloud.com/odata/myservice/v1/`
2. Click **Scan**.

The scanner:

- detects **OData v4** and **v3** service documents and lists every entity set as an endpoint,
- falls back to treating any plain JSON response as a single **generic** endpoint,
- queries each endpoint for its **count** (`$count`/`$inlinecount`) and objects,
- shows per-endpoint counts, and expands to a **table or raw JSON** view of the objects.

### CORS and the dev proxy

Browsers block cross-origin `fetch`, so the scanner routes requests through a small **dev-only proxy** built into the Vite config (`/__proxy?target=…`). Keep the *"Use dev proxy"* toggle on unless the target already sends CORS headers. The proxy only runs under `npm run dev`; a production deployment would need the target to allow CORS or a real backend proxy.

---

## Project structure

```
index.html              App shell
vite.config.js          Vite config + dynamic dev proxy for the scanner
src/
  main.js               App bootstrap
  app.css               Global theme (dark)
  App.svelte            Tab shell (Live probe / OData scanner)
  lib/
    LiveProbe.svelte    Live client probe: generates the mx.data.get script
    scanner.js          OData/REST discovery + probing logic
    ObjectList.svelte   Table / JSON viewer for returned objects
```

---

## Security & intended use

This tool is for **authorized testing of apps you own or are permitted to assess** — verifying that a Mendix app doesn't unintentionally expose data to anonymous or low-privilege users. It only ever reads data the given session is already allowed to read; it does not attempt to bypass authentication or authorization. Don't point it at systems you don't have permission to test.
