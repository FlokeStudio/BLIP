# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Release **version numbers** track [`app-metadata.json`](app-metadata.json) (synced into `package.json` on build).

## [Unreleased]

## [1.0.3] — Echo — 2026-05-22

Stable release (codename **Echo**). Focus: profiles with GIF status, reliable chat open, restored MESH PLUS badge, MESH+ settings pixel banner.

### Fixed

- **Profiles** — opening a peer profile with a status GIF no longer fails; direct mount instead of blocked re-render; GIF loads asynchronously without blocking the page.
- **Chats** — conversations open from peer list, chat hub, and context menu (`mountMainContentView` + `isConnected` check).
- **Calls** — TCP signalling prefers existing inbound/outbound sockets (carried from 1.0.2).
- **Windows auto-update** — `verifyUpdateCodeSignature = false` for unsigned GitHub installers (install **1.0.3** once if you are on a broken **1.0.2** build without this fix).

### Changed

- **MESH PLUS badge** — platinum plaque + animated gradient label **MESH PLUS** (not «+»); unofficial subscriptions use the same style with a **red** gradient.
- **Settings → MESH+** — pixel cube strip with gradient animation and **MESH PLUS** label above the benefits carousel; gray when FREE.
- **MESH+ docs** — test tier, free keys via blipteam@icloud.com ([`docs/MESH-PLUS.md`](docs/MESH-PLUS.md)).

## [1.0.2] — Mesh Plus UI & trust — 2026-05-21

### Added

- **Achievements** — **Beta tester** (beta releases toggle in Developer) and **Unofficial build** (unverified maintainer signature / dev or self-built client).
- **MESH+ settings** — animated pixel grid (BLIP purple → cyan → mint when subscribed; gray pixels when FREE).

### Changed

- **Trust UI** — removed purple/red build rings on peer avatars; **Settings → About** shows a square notice (official vs unofficial client). MESH+ badge trust fixed in profile preview (`resolvePeerMeshPlusTrust`).

### Fixed

- **Chats** — opening a conversation from the peer list, chat hub, or context menu mounts the chat view directly (fixes clicks doing nothing when `renderView` short-circuited); offline peers with history can be opened; context menus render above the UI.
- **Calls** — signalling uses inbound or outbound TCP sockets before opening a new connection; outgoing calls require a warmed peer socket; retry when the peer was not in discovery yet.
- **Profile GIF (MESH+)** — peers can open profiles when a subscriber uses a status GIF: LAN share downscales oversized GIFs for TCP, profile view updates in place (no full re-render on every peer ping), and GIF is requested when opening a profile.
- **Boot crash** — renderer no longer writes to read-only `window.trustState` / `buildTrust` (contextBridge).
- **Windows auto-update** — unsigned installers on builds 1.0.1+ after one manual install; `verifyUpdateCodeSignature = false`.

## [1.0.1] — Security & fixes — 2026-05-21

> **⚠️ If you are on v1.0.0 (Windows):** in-app auto-update **will not** install this version. Download **`BLIP-Setup-1.0.1.exe`** from **Assets** below and run it once (install over the existing app). Settings, chats, and config are kept. From **v1.0.1 onward**, later updates can download automatically again.
>
> **⚠️ Если у вас v1.0.0 (Windows):** автообновление **не установит** этот релиз. Скачайте **`BLIP-Setup-1.0.1.exe`** в **Assets** и запустите один раз (поверх текущей установки). Настройки и чаты сохранятся. С **v1.0.1** следующие версии снова смогут обновляться из приложения.

Patch release: MESH+ integrity improvements and profile GIF fixes.

### Added

- **Verified Builds & MESH+ trust** — official signed builds show purple/cyan cues; unofficial clients and MESH+ use red accents only (tooltips, no text badges). LAN announce carries build trust; renderer reads `window.trustState` from main.

### Changed

- **MESH+** — stronger premium-tier checks across settings, Signal Corps, and main process.
- **Profile GIF** — safer LAN sync for large GIFs; profile page opens reliably when a peer has a status GIF.

### Fixed

- **Profile page** — GIF cloud and peer/self GIF URLs; no ping spam when opening a profile.
- **Chat hub** — avatar opens the full peer profile (including status GIF flag).

### Note (Windows updates from v1.0.0)

**v1.0.0 → v1.0.1:** the updater runs inside **1.0.0** and rejects unsigned installers (`publisherName: krwg`). Either Authenticode-sign the release Setup (`scripts/sign-windows-installer.ps1` + re-upload assets) or install Setup once by hand; **1.0.1 → later** auto-updates work unsigned with the updater fix.

## [1.0.0] — Mesh Plus — 2026-05-21

First **1.x** stable line. Codename **Mesh Plus**. Builds on everything since the last public GitHub release **[v0.7.7](https://github.com/krwg/BLIP/releases/tag/v0.7.7)** (pin/edit messages, export). Intermediate versions **0.7.8–0.10.1** were developed on `main` and are summarized here.

### Added

- **MESH+ licensing** (0.7.9+) — Ed25519 keys, activation UI, benefits carousel, premium wallpapers/sounds/icons, theme editor (`#RRGGBB`), status GIF cloud, peer badge.
- **Signal Corps / Projects** (0.7.6+) — standalone **PROJECTS** nav (`devProjectsEnabled`): shared **Pad**, **Board** (kanban), **Canvas** (32×16, brush/fill/palette), **Clipboard** mesh history; pad snapshots (MESH+); board card context menu (delete, move column).
- **Settings → Achievements** — optional, off by default; **Unlocked** / **Not yet unlocked** sections; custom SVG icons in [`ach-icons/`](ach-icons/); locked icons hidden until unlock (click **?** slot for hint).
- **Settings → Network** — session stats + activity bars; **Signal Corps clipboard** toggle (off by default, confirm on enable).
- **Settings → Developer** — **Groups (conferences)** beta toggle (off by default); Projects hint on toggle (no separate Signal Corps prose block).
- **Peer profile page** (0.8+) — in-app full profile; settings preview polish.
- **In-app dialogs** — `openConfirmDialog` / `openAlertDialog` / `openTextPromptDialog` replace native `confirm`/`alert`/`prompt` in key flows.
- **Achievement unlock toasts** with icon; **BLIP-styled color picker** (`blip-color-input.js`) for appearance + canvas.
- **8 achievement SVGs** — `ach-icons/*.svg`, bundled via `renderer/achievements-icons.js`.

### Changed

- **Version & branding:** `1.0.0`, codename **Mesh Plus** (`app-metadata.json` / `package.json`).
- **Settings shell** — grouped sidebar (Account / App / Connection / System); opens **Profile** first; more transparent panels; appearance backgrounds visible again.
- **UI copy** — section labels use **ALL CAPS** (EN/RU) via stylesheet; inputs/chat unchanged.
- **Dial** — title, ID field, **Message** / **Call** aligned in one column.
- **Default reaction** — **❤️** only; custom reaction field removed.
- **Hotkeys panel** — no vertical squeeze; shortcuts list scrolls horizontally.
- **Updates panel** — release feed fills remaining height in fullscreen.
- **MESH+ carousel** — theme editor, app icons, export slides; relay slide marked planned-only.
- **Projects** — removed mesh online strip and tier legend; MESH+ lock uses toast + CTA; clipboard gated in Network settings.
- **Profile preview** — GIF cloud position fix; no black bar over avatar when GIF is set.

### Removed

- **Mesh identity** settings (ID color, status icons, ID bookmarks).
- **Custom default reaction** emoji field.
- **Native `confirm`/`alert`** in achievements reset, chat clear, group flows (replaced by modals).

### Fixed

- **Canvas** — `setCanvasPixel` import; painting, flood fill, eraser; full-area grid; tools/palette dock bottom-right.
- **Board** — card create via in-app prompt (Electron `prompt` was broken).
- **Achievements** — icon glyphs no longer show `{}`; reset only clears unlock storage.
- **Groups** — create menu hidden unless `devGroupsEnabled`.

## [0.10.1] — Achievements, Network stats, polish

### Added

- **Settings → Achievements** — off by default; Steam-style cards; unlock toasts; empty `iconAsset` slots for custom icons.
- **Settings → Network** — session stats summary + activity bar chart.
- **MESH+** — status GIF gated; themed PDF/HTML chat export; profile banner styling.

### Removed

- **Mesh identity** settings (ID color, status icons, ID bookmarks) — dropped as unnecessary.
- **`docs/MESH-PLUS-PLAN.md`** — replaced by short [`docs/MESH-PLUS.md`](docs/MESH-PLUS.md).

### Changed

- MESH+ panel is activation + carousel only (relay/bridge remain marketing-only).

## [0.10.0] — MESH+ Identity & Stats

### Added

- **MESH+ Phase 8 — Identity:** custom BLIP ID color (LAN announce), status icons (game/code/stream/listen/work/afk), up to 8 reserved ID bookmarks on the change-ID grid.
- **MESH+ Phase 9 — Gamification:** session stats (messages, files, calls, peak peers, online time) and achievements in Settings → MESH+.
- **Profile:** quick status-icon picker for MESH+; preview shows ID tint and icon.
- **Peers list:** peer ID color and status glyph when announced on LAN.

### Changed

- Phase 7 (LAN relay, MESH+ Bridge, traffic priority) stays in the MESH+ carousel only — not implemented until after a stable release.

## [0.9.1] — Signal Corps · Clipboard & Theme

### Added

- **MESH+ Phase 6 — Clipboard Board:** mesh sync (`mesh-proj-clipboard`, pull); **FREE** up to 20 entries; **MESH+** up to 500 + search filter.
- **MESH+ Theme editor:** custom `#RRGGBB` accent in Settings → Appearance (color picker + hex); cleared on license revoke.

### Changed

- Projects → **БУФЕР / CLIPBOARD** is live for all users (dev Projects flag still required).

## [0.9.0] — Signal Corps

### Added

- **MESH+ Phase 5 — Projects (Signal Corps):** **BOARD** (kanban, mesh sync `mesh-proj-board`) and **CANVAS** (32×16 grid, `mesh-proj-canvas`) in standalone Projects — MESH+ only; FREE sees lock stub + toast.
- **Pad history (MESH+):** local snapshots in Pad tool — save, list, restore/rollback; sync still via `mesh-proj-pad` with LWW on `updatedAt`.
- **Mesh wire:** `broadcastMeshBoard` / `broadcastMeshCanvas`; pad receive respects last-write-wins.

### Changed

- Projects hub uses live config getter so activation unlocks Board/Canvas without restart.
- Clipboard in Projects nav remains “coming soon” (Phase 6).

## [0.8.1] — MESH+ Gate

### Added

- **Peer profile page** — full in-app profile (avatar left, details right): BLIP ID, status, Mesh Pulse, MESH+ badge, mesh label, actions. Open from avatar click, context menu **Profile**, or chat header. Back / Esc returns to the previous screen.

## [0.8.0] — MESH+ Gate

### Added

- **`requireMeshPlus(feature)`** — shared gates in `shared/mesh-plus-gates.js`; enforced in main on load, save, and deactivate.
- **Premium animated backgrounds** — Ember & Rift locked for FREE (◆ in picker, toast on attempt).
- **Premium sound packs** — WIRE / STATIC FX and BEACON / CHIME melodies locked for FREE.

### Changed

- Settings hints for animated background and sound sections (what requires MESH+).
- Revoking MESH+ resets premium wallpaper and sound prefs to FREE defaults.

## [0.7.10] — MESH+ Gate

### Added

- **App icon picker** (Appearance) — free: main + dop-1…4; MESH+: mesh-1…6 with lock toast when inactive.
- **Icon pipeline** — `icon-main.svg` drives installer/`.exe`; all variants rasterized to `build/icons/` via `npm run build:icons`.

### Changed

- **МЭШ ПЛЮС** settings UX — status card, carousel counter, activation card, **Удалить ключ**.
- **Russian localization** — full RU strings for МЭШ ПЛЮС tab (status «БЕСПЛАТНО» / «МЭШ ПЛЮС», toasts, carousel).
- **Developer** — **Удалить подписку** clears MESH+ license (with toast if already FREE).
- Tray/window/About icon updates live when changing variant (Start Menu shortcut updates on reinstall).

## [0.7.9] — MESH+ Gate

### Added

- **MESH+ licensing** — Ed25519 activation in main (`mesh-plus-license.js`), IPC `activate-mesh-plus` / `deactivate-mesh-plus`, tier in public config.
- **Settings → MESH+** — benefits carousel, activation UI, FREE / MESH+ status (EN/RU).
- **MESH+ badge** on peer list — platinum plaque + violet gradient pixel label; `meshPlus` in UDP announce.
- **Key generator** — `npm run mesh-plus:keygen` (private key in `scripts/.mesh-plus-private.b64`, gitignored).
- **Installer metadata** — publisher `krwg`, file description, NSIS welcome/finish (`build/installer.nsh`), GPL license page.

### Changed

- `get-config` / `config-updated` no longer expose `meshPrivateKey` or raw license signature to renderer.

## [0.7.8] — MESH+ Gate

### Added

- **[`docs/MESH-PLUS.md`](docs/MESH-PLUS.md)** — MESH+ tier summary (license, feature list). Phased roadmap file removed in 0.10.1.

### Changed

- **Settings UX** — shared list panels, taller dropdowns, aligned section headings (see settings styles / `settings-ui.js`).

## [0.7.7] — Signal Corps

### Added

- **Pin message** — right-click in 1:1 chat; pin strip under header; LAN sync (`message-pin`).
- **Edit message** — edit your own messages; **edited** label; LAN sync (`message-edit`).
- **Export JSON** / **Export PDF** — chat menu (`blip_chat_export_v1` + PDF transcript).

### Fixed

- **Clicks & context menus** — avoid full view re-render during active chat (fixes dead LMB/RCM and sliders); stronger Electron hit-testing on interactive panels.
- **1:1 screen share** — mini preview of your stream (PiP) when the peer’s camera is on.
- **Media viewer** — pixel play/pause glyphs (no Unicode media symbols in controls).

## [0.7.6] — Signal Corps

### Added

- **Projects (Signal Corps)** — standalone workspace in nav (Developer toggle): shared **Pad** syncs over the mesh to online peers; board, canvas, clipboard marked *in development*.
- **Group rename** — click the group title in the sidebar or use the context menu.
- **Group custom avatar** — upload from the sidebar (unchanged, documented).

### Changed

- **Localization (RU)** — Сигнал Корпс, ЛАН, МЕШ, АЙДИ, БЕТА-релизы; quick status presets save translated text.
- **Peers** — removed HS handshake badge from the name row.
- **Projects** — no longer tied to groups (groups remain beta/unstable separately).

### Fixed

- **Clicks & context menus** — disabled `backdrop-filter` on `.glass` panels app-wide (Electron hit-testing); restored pointer events on chat controls, sliders, emoji, and peer menus.

## [0.7.5] — Signal Corps (preview)

- Initial Projects hub tied to groups; pixel media controls; group hub UX. Superseded by 0.7.6 standalone Projects.

## [0.7.2] — Syscall

### Added

- **Custom profile photos** — upload/remove; shared with online peers over LAN (`avatar-share`).
- **Pixel toggles** — square switches replace checkboxes across settings.
- **Pixel ? hints** — tooltips on hover for DND, LAN clipboard, files, calls, peers, updates, developer, and more.
- **Dial dashboard** — online count, your ID, mesh size on the home dial screen.
- **Theme modes** — Light / Dark / Automatic (system); **color accents** (16 presets); **5 animated + 5 art** backgrounds; redesigned **City** skyline art.

### Changed

- **Profile** — photo first, custom status with quick preset buttons («Пусто» instead of «Сброс»).
- **Chat** — no `#id` caption in header; empty hub shows «Нет чатов».
- **Peers** — subtitle moved to ? hint next to title.
- **Dial** — error when entering ID outside 1–64.
- **About** — centered layout with app icon.
- **Network copy** — fallback clipboard when OS API blocks copy.

## [0.7.1] — Portrait

### Added

- **In-chat media viewer** — tap photos/videos for fullscreen player with pixel **◀◼▶** controls, **Share**, and **Download** (top right).
- **YouTube embeds** — links open as preview cards; playback in the in-app viewer.
- **Quote replies** — ↩ on a message to reply with a quoted strip (1:1 chat).
- **Reactive wallpaper** — background pulses with mic in voice/calls (Settings → Appearance).
- **Art wallpapers** — skyline, bloom, horizon, embers, rift, depths, signal (no grid/mesh tiles).

### Changed

- Removed checkered/grid animated backgrounds; legacy IDs map to art scenes.
- Images no longer show redundant «[IMG]» / «Файл» caption text under the bubble.

## [0.7.0.7] — Portrait

### Changed

- **Chat** — removed trust gate and read receipts; default reaction is **➕** (custom emoji in Settings → Appearance).
- **Voice channel** — default channel label **Voice** / **Голос** (was lounge).
- **Appearance** — six new animated backgrounds; **Reduce background motion** toggle.

### Fixed

- **Voice channels** — audio via resumed `AudioContext` and raw mic for WebRTC (no silent mix).
- **1:1 screen share** — frozen frame cleared; **Exit stream** button under fullscreen.
- **Build** — restored `formatClipboardToast` export.

## [0.7.0.6] — Portrait

### Fixed

- **Voice channels** — host join after clients, reconnect signal, stale peer cleanup; screen share sends video (renegotiate) with preview tiles.
- **1:1 calls** — closing the app sends `call-hangup` to the remote peer.

### Added

- **Screen picker** — “Share system audio” checkbox when starting screen share (1:1, group, voice).
- **Mic test** — input volume slider, level meter, and test loop (Settings → Calls).
- **Updates** — toggle **Download updates automatically** (off = check only, no background download).

## [0.7.0.5] — Portrait

### Fixed

- **Voice channels** — roster merges joins and removes leavers (no ghost avatars); SFU **mix-minus-self** (no hearing only yourself); mesh audio when group host is not in the channel.

### Added

- **Noise suppression** — WebRTC `noiseSuppression` / `autoGainControl` (Settings → Calls); shared `audio-capture.js` for 1:1 and voice channels.
- **Voice channel screen share** — share button on the voice stage (status badge for peers).

## [0.7.0.4] — Portrait

### Fixed

- **Voice channels (lounge)** — incoming `voice-ch-roster` / `voice-ch-signal` TCP messages reach the voice stack; host mixer plays locally and sends mixed audio to clients.
- **1:1 fullscreen + screen share** — remote mic stays on a dedicated audio element; optional **Share sound** mixes system audio with the microphone.

### Added

- **Settings → Updates** — **Auto-update** section (startup check + background download).
- **Settings → Developer** — **Receive beta releases** toggles `electron-updater` prerelease channel (`0.7.1-beta.x` vs stable `0.7.x`).

## [0.7.0.3] — Portrait

### Fixed

- **1:1 call screen share + fullscreen** — remote microphone audio no longer drops when the stage is fullscreen; playback uses a dedicated `<audio>` element outside the fullscreen video container (Chromium/Electron quirk).

## [0.7.0.2] — Portrait

### Fixed

- **Messages and group invites** — TCP `message`, `typing`, `group-msg`, `group-invite`, etc. were routed only to the group-call window instead of the main UI (regression in 0.7.0.x).

## [0.7.0.1] — Portrait

Display version **0.7.0.1**; package / installer semver **0.7.1-beta.1** (electron-builder requires `major.minor.patch`, not `0.7.0.1`).

### Fixed

- **Leave group** — voice channel cleanup no longer throws (broken `leaveGroupCall` reference).
- **Group invites** — arrive as **cards in Chat** (Join / Decline), not a blocking dialog.

### Added

- **Themes**: Trace, Bloom, Midnight, Aqua, Crimson.
- **Backgrounds**: Pixel (`static`), Rain, Glitch, Beacon.

## [0.7.0] — Portrait

### Added

- **Voice channels** — groups have text + voice channels; sidebar on the main window (pixel/glass style).
- **Star voice topology** — all voice flows through the **group host** (mixer); join channel = subscribe, no ad-hoc “group call” mesh.

### Changed

- Group voice uses `voice-ch-roster` / `voice-ch-signal` instead of opening a separate group-call window for new sessions.

## [0.6.4] — Portrait

### Fixed

- **1:1 calls** — reliable delivery of `call-outgoing` / `incoming-call` to the call window (queue + flush); TCP to peer warmed before dial; retry if peer socket is not ready yet.
- **Group calls** — mesh only to active voice participants (no stale PCs to offline members); reconnect when a peer joins; stop dial tone when WebRTC connects.
- **Group roster** — main window hub/chat counts stay in sync with the group-call window (`sync-group-call-roster` IPC).
- **Group UI** — status shows «СОЕДИНЕНО» when linked; member label no longer shows «ГОЛОС» before WebRTC is up.

## [0.6.3] — Portrait

### Fixed

- **Group calls** — leaving peer is removed from the roster and tiles; mesh re-syncs screen share for rejoining participants; stopping share shows avatar again (not a gray tile).
- **Group calls** — participant list sync every 4s (`group-call-state`) plus pruning stale WebRTC peers when roster shrinks.
- **1:1 calls** — after remote screen share ends, video stage clears (no frozen frame); call controls stay visible; periodic `call-state` sync every 4s.
- **Chat** — opening a conversation scrolls to the latest messages at the bottom.

## [0.6.2] — Portrait

### Fixed

- **Calls (1:1 and group)** — pre-warm call windows at startup; wait until renderer is ready before IPC (fixes lost `call-outgoing` / `group-call-join`).
- **Group calls** — group data is read from the main window’s `localStorage` (`get-group-for-call`); separate `file://` pages no longer see an empty group list.

## [0.6.1] — Portrait

### Fixed

- **1:1 and group calls** — IPC to call windows is queued until the renderer signals ready (fixes lost `call-outgoing`, `incoming-call`, and `group-call-join` on first open).
- **Group call window** — `config` is passed into join/handlers so `blipId` and mic access work reliably.

### Removed

- **Custom / LAN-synced profile photos** — avatars are **8×8 auto-generated** only (regenerate in Settings).

## [0.6.0] — Portrait

### Added

- **Peer avatars over LAN** — custom profile photos sync to peers; shown in peer list, 1:1 chat, groups, and calls.
- **Separate group call window** — dedicated frame with min / max / close and title **Group call** / **Групповой звонок**.
- **Autostart (Windows)** — Settings → System: launch BLIP when you sign in.
- **Chat search** — Ctrl+F focuses search in the open conversation (EN/RU).

### Changed

- **i18n** — group call badges, host line, handshake tag, and UI chrome fully localized (EN/RU).
- **Group call roster** — shared state module for main window badges while WebRTC runs in the group-call window.

## [0.5.8] — Handshake

### Added

- **LAN clipboard sync** — Settings → Network: Off / active chat / trusted peers; P2P text up to 32 KB.
- **Group chat drag & drop** — drop files/images into group chat (inline, up to 768 KB).
- **Group large files** — chunked P2P to every member (same limit as 1:1 from Settings → Files).
- **Transfer cancel** — CANCEL in Transfer Hub for outgoing transfers.

### Changed

- **Settings appearance** — theme and animated background use pixel-style dropdowns.
- **Profile** — quick status presets as dropdown.

## [0.5.4] — Handshake

### Added

- **Ongoing group voice (Discord-style)** — `group-call-state` broadcasts who is in voice; non-participants see a join bar in chat, **VOICE** badge in hub, and can enter anytime.
- **Late join** — mesh connects to participants already in call when you join mid-session.

### Changed

- **Group call UI** — same `call-overlay` shell as 1:1: participant tiles, link ring, waveform, timer, mute/deafen.

## [0.5.3] — Handshake

### Fixed

- **Leave / delete group** — hub used `getAllGroups()` and showed groups after you left; now `getGroupsFor(blipId)` only lists memberships. Local leave/disband applies before TCP notify.
- **Group calls** — WebRTC signals go peer-to-peer (no host relay); call overlay DOM fixed (`div` shell).

### Changed

- **Group chat** — full mesh: each sender pushes `group-msg` to every other member (`author` + `members` list); host relay removed.

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
