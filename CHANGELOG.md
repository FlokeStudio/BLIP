# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Release **version numbers** track [`app-metadata.json`](app-metadata.json) (synced into `package.json` on build).

## [Unreleased]

## [0.5.2] — Handshake

### Fixed

- **Group mesh protocol (Handshake)** — TCP `from` is always the socket peer; group chat now uses `author` for the real sender and `relayed` to stop double-relay duplicates. Members only accept `group-msg` from the designated host.
- **Group WebRTC** — `originFrom` on `group-call-signal` so host relay no longer breaks offers/answers after 0.5.0 Handshake.
- **Leave / delete group** — UI refreshes on `blip-groups-changed` even when a group chat was open; TCP notify no longer sends redundant `from` in payload (main sets it).

### Changed

- **Group call UI** — full-screen `call-overlay` (same shell as 1:1 voice): avatars, waveform, mute/deafen, timer, accept/reject on incoming.

## [0.5.1] — Group fixes

### Fixed

- **Group messages duplicated** — TCP handler called `addGroupMessage` and `handleIncoming` (which added again); dedupe by message `id` on store and load.
- **Leave / delete group errors** — member IDs normalized (`Number`); TCP notify uses safe send (offline peers no longer abort leave); UI shows toast on failure.
- **Group calls not arriving** — `isGroupMember` / `shouldInitiate` used strict `includes` and string IDs; invite uses `showAppToast` directly; call-start works when group record exists.

## [0.5.0] — Handshake

### Added

- **Mesh Handshake** — Ed25519 device identity; signed UDP announce (`meshProto` 1); TCP `mesh-handshake` / `mesh-handshake-ack` before app traffic.
- **TOFU peer keys** — `knownPeerKeys` in config; pubkey mismatch rejects handshake.
- **TCP hardening** — max line size 4 MB; inbound `from` must match authenticated session; IP must match discovery for peer ID.
- **Block list in main** — `blockedPeerIds` in config enforced before renderer (drops messages/calls/file transfer).
- **Trust sync** — `trustedPeerIds` / `blockedPeerIds` in `blip-config.json` (migrated from localStorage).

### Changed

- Peers with verified announce show **HS** badge; legacy (&lt;0.5) peers show **!** — TCP mesh requires Handshake on both sides.

### Security

- Addresses spoofed `from`, unbounded TCP lines, and UI-only block list (see local `SECURITY.local.md`).

## [0.4.8] — Mesh

### Added

- **LAN file transfer** — send files in 1:1 chat (inline up to **768 KB**, chunked TCP up to **16 MB**); drag & drop images and files; **FILE** button; download card in chat. Group chats support inline files/images up to **768 KB**.
- **Custom status text** — optional line (e.g. “In game”, “AFK”) in **Settings → Profile**; broadcast on UDP/mDNS (`presenceText`); shown under peer name when online.

### Changed

- Drop overlay accepts any file type in direct chat (images still compressed as before).

## [0.4.5] — Mesh

### Added

- **Group chats (mesh hub)** — right-click a peer → **Create group**; host relays messages to all members. Host migrates to the next online BLIP ID if the current host leaves.
- **Group voice calls** — **GRP CALL** in group chat; mesh audio with signaling relayed through the host (LAN).
- **Mesh activity log** — **Settings → Network** shows recent peer online/offline events (local).
- **UI sound pack** — chiptune-style Web Audio synth: looping **incoming ring** and **outgoing dial**, connect chime, message/notify/group/ping cues; preview grid in **Settings → Sound**.
- **Sound themes** — two FX packs (**SIGNAL** / **PULSE**) and two call melody packs (**MESH** / **GRID**); pick in **Settings → Sound** (`uiSoundPack`, `uiMelodyPack`).

### Changed

- Call, chat, toast, and peer events use the unified **mesh signal** motif (square-wave arpeggios, no sample files).

### Fixed

- **Sound preview** (“Прослушать”) — resumes `AudioContext` on click and plays even when UI sounds are disabled.

- **Screen share** — capture uses Electron `chromeMediaSourceId` after the picker (reliable stream to WebRTC); fallback to `getDisplayMedia` handler. Voice-only calls show video when sharing.

## [0.4.1] — Mesh

### Added

- **Screen share picker** — choose **SCREENS** or **WINDOWS** with thumbnails (Discord-style) before sharing.
- **Drag & drop** — drop images into an open chat to send over LAN.

### Fixed

- **Screen share** — broken `getDisplayMedia` handler (`useSystemPicker` + empty callback); capture uses a pre-selected source again.
- **Dial input** — wider field so placeholder and values **1–64** / **64** are not clipped.
- **ID grid** — larger cells and two-digit styling so **10–64** fit cleanly.

## [0.4.0] — Mesh

Rich LAN messaging: receipts, reactions, images, favorites, and presence — still no cloud.

### Added

- **Read receipts**: **✓** delivered and **✓✓** read on your outgoing messages (TCP `receipt`).
- **Message reactions**: quick **+** / emoji chips on messages (TCP `reaction`).
- **LAN image send**: **📎** in chat — resized JPEG over TCP (up to ~4 MB source).
- **Clickable links** in chat (http/https open in the system browser).
- **Emoji picker** next to the message input.
- **Favorite peers**: star in context menu; favorites sort first on **Peers** and **Chat** hub.
- **Presence**: **Online / Away / Busy** in **Settings → Profile** (broadcast on UDP; **DND** shows as busy).

### Changed

- Chat messages carry stable **IDs** for receipts and reactions.
- Peer list status dot supports **away** (yellow) and **busy** (red).

## [0.3.5] — Mesh

Mesh tightens the LAN experience: system shortcuts, live peer latency, Discord-style chat presence, and a proper screen-share pipeline.

### Added

- **Dial**: BLIP ID input and **Message** / **Call** actions centered on the page.
- **Mesh Pulse**: automatic round-trip ping every minute for online peers; **Pulse · N ms** under each name on **Peers** (manual ping still in the context menu).
- **Typing indicators**: TCP `typing` packets; **{name} is typing** bar in chat and **typing…** under peers (Discord-style).
- **Unread badges**: red count on **Chat** nav and per-conversation rows until you open the chat.
- **OS global shortcuts** (optional, **Settings → Shortcuts**): **Alt+1–4** (views), **Ctrl+,** (settings), **Ctrl+Shift+D** (Do Not Disturb), **Ctrl+Shift+End** (hang up) — work when the window is in the tray.
- **Network diagnostics**: **Refresh** and **Copy** in **Settings → Network**; hostname and discovery status.
- **Microphone test** in **Settings → Call**: live input level meter.
- **Screen share (theater mode)**: **720p+** capture, **S** to share, **F** fullscreen; clean video without theme wallpaper or pixel grid on the stream.

### Changed

- **Video calls**: camera capture targets **720p** (was 320×320); screen share uses higher WebRTC bitrate and `object-fit: contain` in theater layout.

### Fixed

- **Call window**: animated backgrounds no longer render over shared or remote video (theme colors only).

## [0.3.0] — Mesh

### Added

- **First-contact trust**: confirm dialog before opening chat with a peer for the first time (local trust list).
- **Local block**: hide a peer on this device; block from peer context menu; blocked peers cannot message you.
- **Settings → Privacy**: list blocked BLIP IDs and **Unblock** (local only).
- **Peer ping** with round-trip **ms** (context menu); latency shown in peer list after ping.
- **Chat timestamps** on each message (local time).
- **Screen share** during calls (voice or video); **S** hotkey; works on voice calls via SDP renegotiation.
- **Remote call status**: peer sees **MIC OFF** / **SOUND OFF** when you mute or deafen.
- Context menu: **Copy BLIP ID**, **Ping**, **Block** / **Unblock**.

### Fixed

- **Appearance**: theme and animated background names fully localized (EN/RU via i18n).

### Changed

- `ping-peer` IPC returns `{ ok, ms }` instead of a bare boolean.

## [0.2.5] — Pulse

### Added

- **Do Not Disturb**: silence UI sounds and block desktop notifications (including incoming calls); toggle in **Settings → Notifications**.
- **Update toasts** on startup (bottom-right): check for updates; available / up to date / download / ready to install (dev builds use GitHub releases API).
- **In-app toast stack** (bottom-right) for messages and updates.
- **Global shortcuts**: **Alt+1–4** — Dial / Peers / Chat / Settings; **Ctrl+,** — Settings; **Ctrl+F** — focus chat search in an open conversation.
- **About**: buttons for **Changelog** and **Releases** on GitHub.
- **Profile**: **Copy BLIP ID** to clipboard.

### Changed

- **Settings → Shortcuts** lists main-window keys in addition to call-window keys.

### Fixed

- **Mesh Labels**: custom dialog instead of `window.prompt` (broken in frameless Electron); context menu clicks no longer cancel the action.
- Removed **mesh status bar** (per user preference).

## [0.2.0] — Mesh

### Added

- **Chat**: search within the active conversation; **export** chat to a `.txt` file; chat actions menu (⋮).
- **Settings → Call**: choose **microphone** and **speaker** (saved in config, used by the call window).
- **Settings → Network**: BLIP ID, LAN ports, local IPv4 hint, online peer count.
- **Settings → Updates**: list of recent GitHub releases with notes excerpt.
- **Call window**: theme/language sync with main app; minimize and maximize; title bar uses theme colors.
- **Dial**: centered ID input with actions below.
- **Profile**: regenerate pixel avatar; improved local photo upload (any image, up to 4 MB; CSP allows `data:` avatars).
- **Mesh Labels**: local-only peer nicknames (right-click in **Peers**); shown in chat and notifications.
- **Appearance**: tech-themed names for color schemes and animated backgrounds (e.g. Terminal, Matrix, CRT).

## [0.1.8] — Relay

### Fixed

- **Calls**: serialize WebRTC SDP as plain `{ type, sdp }` over TCP/IPC (fixes empty offers/answers after `JSON.stringify`).
- **Calls**: send **answer / reject / ICE / hangup** on the peer’s existing inbound TCP socket when possible (fixes accept path).
- **Calls**: auto-allow **microphone/camera** in Electron; failed accept no longer closes the call window immediately (shows error, can retry).

### Added

- **Settings → Sound**: toggle UI sounds and volume slider (messages, calls, peer online).
- **Settings → Shortcuts**: reference list for call-window keys (**M** mute, **D** deafen, **Enter** accept, **Esc** end).
- **Call window keyboard shortcuts** (when the call window is focused).
- **Desktop notification** for incoming calls (toggle in **Settings → Notifications**).

## [0.1.6]

### Added

- **Desktop notifications** for incoming chat messages (OS toast; click opens the chat). Toggle in **Settings → Notifications**. On Windows, `AppUserModelId` is set for correct toast branding.

### Changed

- **Settings**: **Language** and **Notifications** are separate sidebar sections; **Profile** keeps display name, avatar, and BLIP ID only.
- App version **0.1.6** (`app-metadata.json` / `package.json`).

## [0.1.5] — Relay

### Added

- **Auto-updates** from [GitHub Releases](https://github.com/krwg/BLIP/releases) via `electron-updater` (packaged Windows builds); background check after startup; **Updates** section with manual check, progress, and **Restart and install** when a build is downloaded.
- **Settings layout**: section list on the **left** (like a second sidebar), **content on the right**; until a section is chosen, the right pane shows **Settings** and a short line to pick a section (Profile, Language, Notifications, Appearance, System & tray, Updates, About).
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
