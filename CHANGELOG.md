# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Release **version numbers** track [`app-metadata.json`](app-metadata.json) (synced into `package.json` on build).

## [Unreleased]

## [0.1.5] — Relay

### Added

- **Auto-updates** from [GitHub Releases](https://github.com/krwg/BLIP/releases) via `electron-updater` (packaged Windows builds); background check after startup; **Updates** section with manual check, progress, and **Restart and install** when a build is downloaded.
- **Settings layout**: section list on the **left** (like a second sidebar), **content on the right**; until a section is chosen, the right pane shows **Settings** and a short line to pick a section (Profile, Appearance, System & tray, Updates, About).
- `electron-builder` **publish** config for `krwg/BLIP` (for CI/release uploads).
- **Themes**, **animated backgrounds**, **local profile avatars**, and **Windows tray / close-to-tray** (already on `main`; summarized here for the 0.1.5 release line).

### Changed

- **Settings** reorganized into panels; appearance block no longer repeats the main “Look & background” heading inside the panel title.
- **`get-app-metadata` IPC** now includes `isPackaged` for the renderer (updates UI, dev hint).
- **`package.json`**: `author`, `repository`, version **0.1.5**.

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
