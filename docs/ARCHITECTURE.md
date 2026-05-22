# BLIP — architecture overview

High-level map of how pieces fit together. For build and contribution workflow see [CONTRIBUTING.md](../CONTRIBUTING.md).

```
┌─────────────────────────────────────────────────────────────────┐
│                        Electron main process                     │
│  main/index.js  — IPC, tray, BrowserWindows, orchestration       │
│  main/discovery.js  — UDP (+ mDNS) peer presence                  │
│  main/tcp-server.js | tcp-client.js  — line-delimited JSON       │
└─────────────────────────────────────────────────────────────────┘
          ▲ preload.cjs (contextBridge → window.blip)
          │
┌─────────┴─────────────────────────────────────────────────────────┐
│ Renderer (Vite bundles)                                             │
│  renderer/main.js · ui.js · chat.js · projects-view.js · …        │
│  renderer/call-window.html + call-window-main.js (1:1 call)      │
│  renderer/group-call-window.html + group-call-window-main.js     │
│  renderer/group-call-client.js — main-window IPC bridge          │
│  renderer/group-call-roster.js — ongoing voice state (main UI)   │
│  main/global-shortcuts.js — OS hotkeys when tray-hidden           │
└─────────────────────────────────────────────────────────────────┘

WebRTC signalling (SDP, ICE candidates) travels over the same TCP
connection as chat messages; media is peer-to-peer in the renderer.
```

## Processes & windows

| Piece | Role |
|--------|------|
| **Main** | TCP server/client coordination, discovery, IPC to all renderers. |
| **Main window** | Chat, dial, peers, settings (`dist/index.html` or Vite dev URL). Hosts group-call **roster** badges only (not WebRTC). |
| **Call window** | `call-window.html` — 1:1 WebRTC UI. Theme colors only (`applyCallWindowAppearance`); animated wallpapers disabled. |
| **Group call window** | `group-call-window.html` — group mesh WebRTC + tiles; custom title bar (**Group call** / **Групповой звонок**). Routed from main via IPC (`open-group-call`, `group-call-tcp`, …). |

Vite build entries: `index.html`, `call-window.html`, `group-call-window.html` (`vite.config.js`).

## Networking

| Mechanism | Default port | Purpose |
|-----------|---------------|---------|
| UDP broadcast (+ optional multi-port fan-out) | 42069 (config/env) | `announce` payloads: `blipId`, display name, `presence`, IPs, advertised TCP/UDP. |
| TCP | 42070 (config/env) | Framed `\n`-delimited JSON (see below). |
| mDNS | — | Auxiliary discovery (`_blip._udp.local` TXT records). |

Environment overrides: `BLIP_UDP_PORT`, `BLIP_TCP_PORT`. Separate user data dirs support side-by-side dev instances (`BLIP_USER_DATA_DIR`).

### TCP message types (line-delimited JSON)

| `type` | Direction | Purpose |
|--------|-----------|---------|
| `message` | Peer ↔ peer | Chat text + `id` + timestamp; optional `attachment` (LAN image JPEG data URL) |
| `receipt` | Peer ↔ peer | `{ messageId, receipt: 'delivered' \| 'read' }` |
| `reaction` | Peer ↔ peer | `{ messageId, emoji, add: true \| false }` |
| `typing` | Peer ↔ peer | `{ active: true \| false }` while composing |
| `ping` / `pong` | Peer ↔ peer | Reachability probe (Mesh Pulse + manual ping) |
| `call-offer` / `call-answer` / `call-candidate` / `call-reject` / `call-hangup` | Peer ↔ peer | WebRTC signalling |
| `call-state` | Peer ↔ peer | Mute / deafen / screen-share flags |
| `call-renegotiate` / `call-renegotiate-answer` | Peer ↔ peer | Mid-call SDP (e.g. screen share on voice calls) |
| `group-invite` / `group-invite-ack` / `group-msg` / `group-host` / `group-sync` / `group-leave` / `group-disband` | Mesh | Group membership and chat relay |
| `group-call-start` / `group-call-state` / `group-call-signal` / `group-call-end` | Mesh | Group voice mesh (signals peer-to-peer; state broadcast) |
| `file-offer` / `file-chunk` / `file-done` / `file-abort` | Peer ↔ peer | Chunked large files |
| `clipboard-push` | Peer ↔ peer | LAN clipboard text (mode-gated in renderer) |
| `mesh-proj-pad` | Mesh (online peers) | Signal Corps shared Pad (LWW text, debounced) — not group-scoped |

## MESH+ (test tier / licensing lab)

Optional tier activated in **Settings → MESH+**. Introduced to test **offline license activation** (Ed25519, author-issued keys). Keys are **free** — request at **blipteam@icloud.com**; subscribers get **new features first**, with a goal to move gated features to **FREE** over time. Gates live in `shared/mesh-plus-gates.js`; settings UI in `renderer/mesh-plus-settings.js`. Product and policy: [`MESH-PLUS.md`](MESH-PLUS.md).

| Area | Modules |
|------|---------|
| Themes & sound | `appearance.js`, `theme-editor.js`, premium IDs in `mesh-plus-gates.js` |
| App icons | `app-icon-picker.js`, `main/app-icons.js` |
| Profile GIF | `profile-gif-store.js`, `profile-card.js`, TCP `profile-gif-*` |
| Signal Corps | Board/Canvas/history gates in `projects-view.js`, `project-tools-ui.js` |
| Export | `chat-export.js` themed PDF/HTML |
| Badge | UDP announce `meshPlus`; `renderer/mesh-plus.js` badge |

FREE baseline keeps core chat, calls, Pad, Mesh Pulse, and Clipboard (20 entries).

## Signal Corps (Projects)

**Signal Corps** is BLIP’s flagship builder workspace — the feature teams should enable first on a dev LAN. It lives in the main renderer (`projects-view.js`, `project-tools-ui.js`, `projects-mesh-wire.js`), gated by `devProjectsEnabled` in config.

| Piece | Role |
|--------|------|
| **Nav entry** | `PROJECTS` between Chat and Settings when the developer toggle is on. |
| **Pad (✦)** | Full-height shared textarea; `mesh-proj-pad` broadcasts LWW updates to all **online** peers (not group-scoped). |
| **Board / Canvas** | MESH+ gated kanban + 32×16 canvas (`mesh-proj-board`, `mesh-proj-canvas`); board cards support context menu (delete, move status). |
| **Clipboard** | Mesh sync; gated by `projectsClipboardEnabled` in **Settings → Network**; FREE 20 entries, MESH+ 500 + search. |
| **UX** | Tool sidebar + **?** hint on pad history; locked MESH+ tools show stub + toast (no tier legend). |

Groups (`groups.js`, voice channels) are beta and gated by `devGroupsEnabled` in **Settings → Developer**; do not route Signal Corps traffic through group relays.

## Persistence

| Data | Location |
|------|-----------|
| User config (`blipId`, name, language, `presenceStatus`, audio devices, `globalShortcutsEnabled`, …) | Electron `userData` → `blip-config.json`. |
| Chat history | Renderer `localStorage` key `blip_chat_v1`. |
| Favorite peer IDs | Renderer `localStorage` key `blip_favorites_v1`. |
| Avatar seeds (per BLIP ID) | Renderer `localStorage` key `blip_avatar_seed_v1` (`avatar.js`). |
| Release metadata | `app-metadata.json` (version **1.0.3**, codename **Echo**, repo URL). |
| Achievement icons | `ach-icons/*.svg` → `renderer/achievements-icons.js` (Vite `?url` imports). |
| MESH+ overview | [`MESH-PLUS.md`](MESH-PLUS.md) — tier summary (no phased roadmap file). |
| Group avatars | Renderer `localStorage` `blip_group_avatar_v1` |
| Session stats | Renderer `session-stats.js` + **Settings → Network** |
| Achievements | Renderer `achievements*.js` + **Settings → Achievements** (off by default) |

## Security posture (today)

- `contextIsolation: true`, preload exposes a narrow API (`preload.cjs`).
- `openExternal` is restricted to http(s) URLs in main.
- LAN trust model: peers are whoever answers on your network segment.

See [SECURITY.md](../SECURITY.md) for reporting expectations.

## Calls & media

| Piece | Role |
|--------|------|
| `renderer/call.js` | Call UI, mute/deafen state sync, screen share, fullscreen theater mode. |
| `renderer/call-media.js` | 720p camera/screen constraints, RTP bitrate tuning. |
| `main/index.js` | `setDisplayMediaRequestHandler` with OS screen picker; forwards `call-state`, renegotiation SDP. |

Screen share targets **1280×720 minimum** capture, up to 1080p ideal, with `object-fit: contain` in theater layout. Camera calls use 720p ideal; pixel grid applies to camera preview only.

## UI sounds (`renderer/audio.js`)

All UI audio is synthesized in the renderer via **Web Audio** (no asset files).

| Pack | Config key | Role |
|------|------------|------|
| **SIGNAL** / **PULSE** | `uiSoundPack` | FX: messages, notify, peer on/off, group, ping, errors |
| **MESH** / **GRID** | `uiMelodyPack` | Call melodies: incoming ring loop, outgoing dial loop, connect chime, hangup sweep |

| Sound | Trigger |
|--------|---------|
| Incoming ring | Looping arpeggio while a call is ringing (`incomingCall` / `stopIncomingRing`) |
| Outgoing dial | Loop until the peer answers (`outgoingCall` / `stopOutgoingRing`) |
| Connected | Ascending chime when the call links |
| End | Descending sweep on hangup / reject |
| Messages | Short blips on send/receive |
| Notify | Toast for new messages (respects DND) |
| Peer online/offline | Sweep + blip on discovery |
| Group / group-call | Invite motifs |
| Mesh ping | Manual ping success |

Config: `uiSoundsEnabled`, `uiSoundsVolume`, `uiSoundPack`, `uiMelodyPack`. **Settings → Sound** — pack toggles + preview grid (`sounds.preview()` resumes `AudioContext` on user click).

## Mesh Handshake (0.5.0)

Codename **Handshake**. Each client has an Ed25519 keypair in `blip-config.json` (`meshPublicKey` / `meshPrivateKey`).

| Layer | Mechanism |
|-------|-----------|
| UDP/mDNS | Signed announce (`meshAnnounceSig` over canonical fields, `meshProto: 1`) |
| TCP | `mesh-handshake` → `mesh-handshake-ack` before any other app packet |
| Binding | Peer IP must match discovery; `msg.from` must match authenticated session |
| TOFU | `knownPeerKeys[blipId]` updated after successful handshake |
| Policy | `blockedPeerIds` dropped in main; `trustedPeerIds` for UI chat gate |

Legacy peers without `meshProto` appear with `meshLegacy` — TCP mesh with 0.5 requires both sides on Handshake.

## File transfer

| Mode | Limit | Wire |
|------|-------|------|
| Inline | ≤768 KB | `message.attachment` with `kind: 'file'` + data URL |
| Chunked (1:1) | Config `maxFileTransferGb` (1–100 GB) | `file-offer` → `file-chunk` × N → `file-done` |
| Chunked (group) | Same cap | Per-member offers via `group-file-transfer.js` |

Images use `kind: 'image'` (JPEG resize). Group `group-msg` relays inline attachments; large files use chunked mesh to each member.

## LAN clipboard (0.5.8+)

Config `clipboardSyncMode`: `off` | `active` (open 1:1 chat) | `trusted`. Renderer `clipboard-sync.js` sends `clipboard-push` (text, max 32 KB). Main forwards like other TCP types.

## Avatars

| Mode | Module | Notes |
|------|--------|-------|
| **8×8 pixel** | `renderer/avatar.js` | Symmetric art from per-`blipId` seed (`blip_avatar_seed_v1`); **Regenerate** in Settings. |
| **Profile photo** | `renderer/avatar-share.js` | Upload/remove; JPEG resized; synced to online peers via TCP `avatar-share` / `avatar-share-req`. |

Peers show whichever the remote has advertised; fallback to pixel art when no photo.

## Appearance (0.7.2+)

`renderer/appearance.js` drives `html[data-theme]` (light / dark / auto) and `html[data-accent]` (16 presets including **slate** `#94a3b8`).

| Piece | Role |
|--------|------|
| `renderer/themes.css` | Palette tokens (`--blip-accent`, glass, chat bubbles) per theme + accent. |
| `renderer/wallpaper-art.css` | Static art backgrounds (skyline, bloom, horizon, …). |
| Animated BG | `beacon`, `depths`, `signal`, `ember`, `rift` in `themes.css`. |

Legacy theme IDs (e.g. `dark-void`) map to mode + accent (`dark-void` → dark + **slate**). **Settings → Appearance** — mode, accent grid, background picker, reduce motion, reactive wallpaper (mic pulse in calls).

## Chat media & quotes (0.7.1+)

| Feature | Module |
|---------|--------|
| In-chat viewer | Fullscreen photo/video with pixel transport controls, share/download. |
| YouTube | Link cards → in-app embed viewer. |
| Quote replies | `quote` field on `message`; ↩ UI in `chat.js`. |

Images use `chat-attachments.js` (JPEG resize); large files use chunked `file-*` wire types (see File transfer).

## Call window IPC (0.6.1)

Secondary windows (`call-window.html`, `group-call-window.html`) call `reportCallWindowReady` / `reportGroupCallWindowReady` after boot. Main queues `call-outgoing`, `incoming-call`, `group-call-join`, and `group-call-tcp` until ready, then flushes.

## Presence text (0.4.8)

UDP/mDNS announce includes optional `presenceText` (max 48 chars, sanitized). Shown on the **Peers** list instead of pulse line when the peer is online. Config key: `presenceText`.

## Voice channels (0.7.0+)

Persistent voice rooms inside a group (Discord-style), separate from the legacy **group call window**.

| Piece | Role |
|--------|------|
| `renderer/voice-channel.js` | WebRTC mesh / SFU-style audio routing, screen share renegotiation, reconnect signals. |
| `renderer/voice-channel-ui.js` | Channel bar, join/leave, mute/deafen, screen picker. |
| `renderer/voice-channel-roster.js` | Live roster in group hub. |
| `groups-wire.js` | Routes `voice-ch-*` TCP types; `handleVoiceChSignal`. |

Wire types include `voice-ch-join`, `voice-ch-leave`, `voice-ch-state`, `voice-ch-signal` (see `groups-wire.js`).

## Group mesh

- **Group chat**: host relays `group-msg` to all members; `group-invite` / `group-host` for membership and host failover.
- **Group call (0.6.0)**:
  - **UI + WebRTC** in `group-call-window.html` (`renderer/group-call.js`).
  - **Main window** uses `group-call-client.js` → IPC `openGroupCall` / `openGroupCallIncoming`; roster in `group-call-roster.js` drives hub **VOICE** badge and join bar (`blip-group-call-state` event).
  - **Signaling**: `group-call-signal` is peer-to-peer (`originFrom`); main process forwards signals only to the group-call window.
  - **State**: `group-call-state` lists participants + mute/deafen/screen flags; `group-call-start` / `group-call-end` for invites and teardown.
  - Ongoing calls: non-participants can join anytime (Discord-style bar in `group-chat.js`).

## Autostart (0.6.0)

Windows: `config.launchAtLogin` → `app.setLoginItemSettings({ openAtLogin })` in main on load and on `save-config`. Toggle in **Settings → System**.

## Mesh Pulse

While the app is running with a BLIP ID, the renderer pings every **online, non-blocked** peer once per minute (`runMeshPulseRound` in `ui.js`). Latency is shown on the **Peers** screen under each nickname (`peer-pulse` line). Manual ping remains in the peer context menu.

## Typing & unread (Discord-style)

- TCP `typing` packets (`active: true/false`) while the user types in an open chat (`chat.js` debounce).
- Typing line in chat UI and under peer name on **Peers**.
- Unread message counts per peer; red badge on **Chat** nav and hub rows until the conversation is opened.

## Mesh messages (0.4.0)

- Each chat message has a stable `id` (`renderer/message-id.js`).
- Incoming messages trigger `receipt: delivered`; opening the thread sends `receipt: read` for peer messages.
- Reactions stored on the message object in `localStorage` and synced via TCP `reaction`.
- Images resized in `renderer/chat-attachments.js` before embedding in `message.attachment`.
- URLs in text are linkified in the renderer; `openExternal` opens http(s) only.
- Favorite peers (`renderer/peer-favorites.js`) are local-only sort hints.

## i18n

All user-visible chrome in `renderer/i18n.js` (**EN + RU**), including group call window, voice channel labels, appearance accent names (e.g. **Slate** / **Сланец**), dial dashboard, and settings ? hints. `applyI18n` runs on language change in each window.

## Landing (GitHub Pages)

Static showcase: [`docs/index.html`](index.html) → [krwg.github.io/BLIP](https://krwg.github.io/BLIP/). Uses the **Slate** accent (`#94a3b8`) to match the app; deploy via **Settings → Pages → branch `main`, folder `/docs`**.

## Future seams

- CI packaging smoke jobs, mobile client, optional STUN for routed VPN edge cases.
- macOS/Linux autostart parity beyond Windows login items.
