# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Release **version numbers** track [`app-metadata.json`](app-metadata.json) (synced into `package.json` on build).

## [Unreleased]

### Added

- OSS hygiene: Contributing guide (`CONTRIBUTING.md`), Code of Conduct, security policy (`SECURITY.md`), root changelog, architecture doc (`docs/ARCHITECTURE.md`).
- `.github/workflows/ci.yml` — `npm ci` + `npm run build` on push/PR to `main`/`master`.
- Issue / PR templates, Dependabot (npm + GitHub Actions), `.nvmrc`, `engines.node` in `package.json`.
- Tracked backlog files under `issues/` (removed from `.gitignore`).
- Static **`docs/index.html`** landing for GitHub Pages (`https://krwg.github.io/BLIP/`).
- **Themes**: 5 light + 5 dark color presets; **10 animated backgrounds** (+ none); persisted in `blip-config.json`; respects reduced-motion.
- **Settings**: optional **local profile picture** (PNG/WebP/JPEG, capped size); peers and chat hub show it for your own BLIP ID; **Remove** restores the deterministic generated avatar.

### Changed

- README: Community section + Node **20+**, navigation link to Pages, Contribution doc includes Pages setup.

## [0.1.4] — Obsidian

### Added

- Settings **About**: version from app metadata, GitHub link (`openExternal`).
- Chat history **clear conversation** action (with confirm).
- Central **`app-metadata.json`** + sync script for `package.json` version.

### Changed

- Main process handles **busy TCP/UDP ports** (`EADDRINUSE`): user dialog + clean exit instead of uncaught exception.
- Discovery ignores **self-announcements** on any local IPv4 alias (fewer phantom “duplicate self” peers).

### Removed

- In-app UDP/TCP port preset UI (profiles A/B); advanced users use env vars / config as documented.

## Earlier

Prior development history lives in Git commits and GitHub Releases; append older semver sections here when you cut releases.
