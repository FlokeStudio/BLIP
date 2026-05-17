# Contributing to BLIP

Thanks for helping improve BLIP. This project is **GPL-3.0** — your contributions will be under the same license.

## Prerequisites

- **Node.js** ≥ 20 (see `.nvmrc`). Use `nvm use` if you use nvm.
- **npm** (ships with Node).
- **Windows** is the primary target today; other platforms may work but are not fully validated in CI.

## GitHub Pages

The static landing page lives in **`docs/index.html`**. To publish:

1. Repo **Settings** → **Pages** → **Build and deployment** → source: **Deploy from a branch**.
2. Branch: **`main`**, folder: **`/docs`**, Save.
3. Site URL: `https://krwg.github.io/BLIP/` (after the first successful deploy).

Update the hardcoded clone URL in `docs/index.html` only if the repo moves.

## Quick setup

```bash
git clone https://github.com/krwg/BLIP.git
cd BLIP
npm ci
```

## Development

```bash
npm run electron:dev
```

This runs Vite and Electron with `BLIP_VITE_DEV=1`. The UI loads from `http://localhost:5173`.

**Second instance** (separate config directory — see `scripts/electron-dev-peer2.mjs`):

```bash
npm run electron:dev:peer2
```

## Production-like run

```bash
npm start
```

Builds the renderer first (`prestart` → `vite build`), then launches Electron against `dist/`.

## Building installers

Requires Windows for the current electron-builder targets:

```bash
npm run electron:build        # NSIS installer
npm run electron:build:portable
```

Outputs go to `dist-electron/` (see `electron-builder.yml`).

## Release metadata

Version and codename live in [`app-metadata.json`](app-metadata.json) (synced into `package.json` on `npm run build`). Update [`CHANGELOG.md`](CHANGELOG.md) when shipping.

## TCP payloads (renderer ↔ main)

Chat and signalling use newline-delimited JSON on TCP port **42070**. Common `type` values: `message`, `typing`, `ping`/`pong`, `call-*`, `avatar-sync`, `group-*`, `group-call-*`, `file-*`, `clipboard-push`. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

The renderer Vite build produces three HTML entry points: `index.html`, `call-window.html`, `group-call-window.html`.

## Version / metadata

- Release version and display metadata live in **`app-metadata.json`** (current line: **0.6.0 — Portrait**).
- `npm run build` runs `scripts/sync-app-metadata.mjs` so `package.json`’s `version` stays in sync.
- User-facing release notes go in **`CHANGELOG.md`** before tagging.

## Code style

- Match existing patterns in `main/` and `renderer/`.
- Prefer small, focused PRs with a clear **what** and **why**.
- If you change user-visible strings, update **EN + RU** in `renderer/i18n.js` when applicable.

## Pull requests

1. Fork → branch → push → open PR against `main`.
2. Ensure **CI is green** (see `.github/workflows/ci.yml`).
3. Describe behavior change, testing done, and screenshots for UI changes.

## Security

Do **not** open public issues for sensitive vulnerabilities. See [SECURITY.md](SECURITY.md).

## Questions

Open a GitHub issue. If **Discussions** are enabled for this repo, you may ask broader questions there instead.
