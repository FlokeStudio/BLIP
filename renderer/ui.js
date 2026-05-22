import { t, setLang, getLang, applyLangChange, onLangChange, applyI18n } from './i18n.js';
import { createIdGrid } from './grid.js';
import { createChatView, getMessages } from './chat.js';
import { isFavorite, toggleFavorite, comparePeersFavoriteFirst } from './peer-favorites.js';
import {
  getGroup,
  getGroupsFor,
  groupDisplayName,
  getGroupMessages,
  isGroupMember,
  purgeGroupsFor,
  saveGroup,
} from './groups.js';
import { createGroupAvatarElement } from './group-avatar.js';
import { createProjectsView } from './projects-view.js';
import { handleMeshProjectTcp } from './projects-mesh-wire.js';
import { openGroupCreateDialog } from './group-create-dialog.js';
import { createGroupCommunityView } from './group-community-view.js';
import {
  createGroupFromUi,
  handleGroupTcpMessage,
  migrateGroupsHostOnPeerOffline,
  sendGroupChatMessage,
  leaveGroup,
  acceptGroupInvite,
  declineGroupInviteFlow,
} from './groups-wire.js';
import { getPendingGroupInvites } from './group-invites.js';
import {
  leaveVoiceChannel,
  joinVoiceChannel,
  getActiveVoiceChannel,
} from './voice-channel.js';
import { getVoiceChannels } from './groups.js';
import { getVoiceChannelRoster } from './voice-channel-roster.js';
import { logPeerEvent, getNetworkLogEntries, clearNetworkLog } from './network-log.js';
import { createMessageId } from './message-id.js';
import { showSignalLost } from './call.js';
import {
  createAvatarElement,
  regenerateAvatar,
  loadSelfAvatarFromMain,
  setSelfAvatarCache,
  setPeerAvatarDataUrl,
  getSelfAvatarCache,
} from './avatar.js';
import {
  appendAboutBuildTrustNotice,
  createTrustedAvatarElement,
} from './trust-ui.js';
import { openAvatarCropDialog } from './avatar-crop-dialog.js';
import {
  sounds,
  setSoundPrefs,
  SOUND_PREVIEW_KEYS,
  MELODY_PREVIEW_KEYS,
  SOUND_PACK_IDS,
  MELODY_PACK_IDS,
} from './audio.js';
import {
  sendChatFile,
  fileToDataUrl,
  handleFileTransferTcp,
  abortFileTransfer,
} from './file-transfer.js';
import {
  sendGroupChatFile,
  completeIncomingGroupFile,
  applyStashedGroupFile,
} from './group-file-transfer.js';
import {
  FILE_LIMIT_GB_OPTIONS,
  normalizeFileLimitGb,
  formatFileLimitLabel,
} from './file-transfer-limits.js';
import {
  FILE_TRANSFER_SPEED_IDS,
  normalizeFileTransferSpeed,
} from './file-transfer-speed.js';
import {
  trackTransferStart,
  trackTransferProgress,
  trackTransferEnd,
  refreshTransferHubI18n,
} from './file-transfer-hub.js';
import {
  STREAM_QUALITY_IDS,
  normalizeStreamQuality,
  normalizeFullscreenQuality,
} from './call-media.js';
import {
  buildThemedSelect,
  fillSettingsDropdown,
  buildSettingsField,
  buildSettingsFieldWithHint,
  buildPanelTitleRow,
  buildSectionSubtitleRow,
  buildSettingsLabelRow,
  createPixelToggle,
  createPixelHintIcon,
  copyTextToClipboard,
  createSettingsListPanel,
  wrapInSettingsListPanel,
} from './settings-ui.js';
import { buildMicTestPanel } from './mic-test-panel.js';
import {
  appendMeshPlusBadgeToNameRow,
  fillPremiumGatedDropdown,
  premiumTierEnabled,
  markPremiumGatedOptions,
  MESH_PLUS_FEATURES,
} from './mesh-plus.js';
import { buildSettingsMeshPlusPanel } from './mesh-plus-settings.js';
import { appendAppIconPickerSections } from './app-icon-picker.js';
import { appendThemeEditorSection } from './theme-editor.js';
import { recordCallStarted, recordFileSent, recordPeersOnline, setAchievementConfigProvider } from './session-stats.js';
import { buildSettingsAchievementsPanel } from './achievements-settings-panel.js';
import { appendSessionStatsSection } from './session-stats-panel.js';
import { syncAchievements } from './achievements-tracker.js';
import {
  startClipboardSync,
  stopClipboardSync,
  handleClipboardPush,
  normalizeClipboardSyncMode,
  CLIPBOARD_SYNC_MODES,
  formatClipboardToast,
} from './clipboard-sync.js';
import { formatPeerDisplayName } from './peer-labels.js';
import { openMeshLabelDialog } from './mesh-label-dialog.js';
import { showAppToast } from './toasts.js';
import { openConfirmDialog } from './confirm-dialog.js';
import {
  clearRendererLocalStorage,
  resetRendererMemoryStores,
} from './factory-reset-local.js';
import { buildPeerProfilePage } from './peer-profile.js';
import { buildSettingsProfilePanel as buildSettingsProfilePanelView } from './settings-profile-panel.js';
import { renderSettingsNavAside as renderSettingsNavGroups } from './settings-nav.js';
import { setPeerProfileGifDataUrl } from './peer-gif-cache.js';
import {
  initPeerTrust,
  applyTrustFromConfig,
  isBlocked,
  blockPeer,
  unblockPeer,
  getBlockedPeerIds,
} from './peer-trust.js';
import {
  THEME_MODES,
  ACCENT_IDS,
  ANIMATED_BACKGROUNDS,
  STATIC_ART_BACKGROUNDS,
  applyAppearance,
  listenReducedMotion,
  labelThemeMode,
  labelAccent,
  labelBg,
  normalizeThemeMode,
  normalizeAccentId,
  normalizeBgId,
} from './appearance.js';
import { initReactiveWallpaper, applyReactiveWallpaperConfig } from './reactive-wallpaper.js';

async function broadcastCustomAvatar() {
  const dataUrl = getSelfAvatarCache();
  if (!dataUrl || !state.config?.blipId) return;
  const targets = state.peers.filter((p) => p.online && !isBlocked(p.blipId));
  for (const p of targets) {
    try {
      await api.sendTcpMessage({
        type: 'avatar-share',
        to: p.blipId,
        from: state.config.blipId,
        dataUrl,
      });
    } catch {
      /* offline */
    }
  }
}

async function broadcastProfileGif() {
  const dataUrl = await window.blip?.getProfileGifShareUrl?.();
  if (!dataUrl || !state.config?.blipId) return;
  const targets = state.peers.filter((p) => p.online && !isBlocked(p.blipId));
  for (const p of targets) {
    try {
      await api.sendTcpMessage({
        type: 'profile-gif-share',
        to: p.blipId,
        from: state.config.blipId,
        dataUrl,
      });
    } catch {
      /* offline */
    }
  }
}

async function requestPeerProfileGif(blipId) {
  if (!state.config?.blipId || !blipId) return;
  try {
    await api.sendTcpMessage({
      type: 'profile-gif-request',
      to: blipId,
      from: state.config.blipId,
    });
  } catch {
    /* ignore */
  }
}

function restartClipboardSync() {
  stopClipboardSync();
  startClipboardSync({
    getConfig: () => state.config,
    getPeers: () => state.peers,
    getActivePeer: () => state.activePeer,
    sendTcpMessage: (payload) => api.sendTcpMessage(payload),
  });
}

let state = {
  config: null,
  peers: [],
  occupiedIds: [],
  view: 'grid',
  activePeer: null,
  activeGroup: null,
  chatViews: new Map(),
  groupChatViews: new Map(),
  /** `null` = no subsection selected (placeholder in content column). */
  settingsSection: null,
  /** Peer profile page (full main-content view). */
  profilePeerId: null,
  /** Where to return from profile (view + chat targets). */
  profileReturn: null,
};

/** @type {Map<string, number>} */
const unreadByGroup = new Map();

/** Last payload from main `update-status` (auto-updater). */
let lastUpdateStatus = null;

let rootEl = null;
let mainContent = null;
let gridComponent = null;
let api = null;
let appearanceListenerDispose = null;
let lastUpdateToastDismiss = null;
/** @type {Map<number, number>} */
const peerLatencyMs = new Map();

const MESH_PULSE_INTERVAL_MS = 60_000;
let meshPulseTimer = null;
/** @type {(() => void) | null} */
let profilePageCleanup = null;
/** @type {{ peerId: number, refresh: () => void, setPeer?: (p: object) => void, destroy: () => void } | null} */
let profilePageApi = null;

/** @type {Map<number, number>} */
const unreadByPeer = new Map();
let unreadInviteCount = 0;
/** @type {Set<number>} */
const peersTyping = new Set();

/** UI label from app-metadata (`displayVersion` for test builds like 0.7.0.1). */
function formatAppVersion(meta) {
  if (!meta) return '—';
  return meta.displayVersion || meta.version || '—';
}

async function openCallOutgoing(peerId, video = false) {
  if (!window.blip?.openCallOutgoing) return;
  const id = Number(peerId);
  const peer = state.peers.find((p) => Number(p.blipId) === id);
  if (!peer?.online) {
    showAppToast({
      title: t('call.signal_lost'),
      body: t('call.signal_lost_hint'),
      durationMs: 4500,
    });
    return;
  }
  recordCallStarted();
  try {
    const result = await window.blip.openCallOutgoing({ peerId: id, video });
    if (!result?.ok) {
      showAppToast({
        title: t('call.signal_lost'),
        body: result?.error || t('call.signal_lost_hint'),
        variant: 'danger',
        durationMs: 5000,
      });
    }
  } catch (e) {
    console.error('[BLIP] openCallOutgoing', e);
    showAppToast({
      title: t('call.signal_lost'),
      body: e?.message || t('call.signal_lost_hint'),
      variant: 'danger',
      durationMs: 5000,
    });
  }
}

function showMessageToast(peerId, preview) {
  const peer = state.peers.find((p) => p.blipId === peerId);
  const label = formatPeerDisplayName(peer, peerId);
  if (!state.config?.doNotDisturb) sounds.notify();

  showAppToast({
    title: `${t('toast.new_message')} · ${label}`,
    body: preview || '',
    actions: [
      {
        label: t('toast.open_chat'),
        primary: true,
        onClick: () => openChat(peerId),
      },
    ],
  });
  tryShowDesktopMessageNotification(peerId, preview);
}

function tryShowDesktopMessageNotification(peerId, preview) {
  if (state.config?.doNotDisturb) return;
  if (state.config?.desktopNotifications === false) return;
  if (!window.blip?.showMessageNotification) return;
  const peer = state.peers.find((p) => p.blipId === peerId);
  const label = formatPeerDisplayName(peer, peerId);
  const title = `${t('toast.new_message')} · ${label}`;
  void window.blip.showMessageNotification({
    peerId,
    title,
    body: typeof preview === 'string' ? preview : '',
  });
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function createTitleBar() {
  const bar = document.createElement('div');
  bar.className = 'title-bar';
  bar.innerHTML = `
    <span class="title-logo" data-i18n="app.title">${t('app.title')}</span>
    <span class="title-spacer"></span>
    <button type="button" class="win-btn" id="btn-min" aria-label="Minimize">—</button>
    <button type="button" class="win-btn" id="btn-max" aria-label="Maximize">□</button>
    <button type="button" class="win-btn win-close" id="btn-close" aria-label="Close">×</button>
  `;
  bar.querySelector('#btn-min')?.addEventListener('click', () => window.blip.windowMinimize());
  bar.querySelector('#btn-max')?.addEventListener('click', () => window.blip.windowMaximize());
  bar.querySelector('#btn-close')?.addEventListener('click', () => window.blip.windowClose());
  return bar;
}

function peerPresenceClass(peer) {
  if (!peer?.online) return 'offline';
  if (peer.presence === 'away') return 'away';
  if (peer.presence === 'busy') return 'busy';
  return 'online';
}

function peerStatusTooltip(peer) {
  const base =
    peerPresenceClass(peer) === 'away'
      ? t('peers.away')
      : peerPresenceClass(peer) === 'busy'
        ? t('peers.busy')
        : peer.online
          ? t('peers.online')
          : t('peers.offline');
  const custom = (peer?.presenceText || '').trim();
  return custom && peer.online ? `${base} · ${custom}` : base;
}

function formatPeerSubline(peer) {
  const custom = (peer?.presenceText || '').trim();
  if (peer?.online && custom) return custom;
  return formatPeerPulseLine(peer);
}

function ensureGroupChatView(groupId) {
  if (!state.groupChatViews.has(groupId)) {
    const group = getGroup(groupId);
    if (!group) return null;
    const view = createGroupCommunityView(
      group,
      state.config,
      (gid, msg) => sendGroupChatMessage(api, state.config, gid, msg),
      () => {
        state.activeGroup = null;
        void leaveVoiceChannel();
        renderView('chat');
      },
      (e) => {
        const fresh = getGroup(groupId);
        if (fresh) showGroupContextMenu(e, fresh);
      },
      async (gid, file, onUiProgress) => {
        const g = getGroup(gid);
        if (!g) return;
        const broadcast = (msg) => sendGroupChatMessage(api, state.config, gid, msg);
        await sendGroupChatFile(api, state.config, g, file, broadcast, {
          onPeerStart: (to, transferId) => {
            trackTransferStart(to, transferId, {
              name: file.name,
              size: file.size,
              direction: 'out',
              cancellable: true,
              onCancel: () => void abortFileTransfer(api, state.config, to, transferId),
            });
          },
          onPeerEnd: (to, transferId) => trackTransferEnd(to, transferId),
          onProgress: (pct, to, transferId) => {
            onUiProgress?.();
            trackTransferProgress(to, transferId, pct, {
              name: file.name,
              size: file.size,
              direction: 'out',
              cancellable: true,
              onCancel: () => void abortFileTransfer(api, state.config, to, transferId),
            });
          },
        });
      },
      api
    );
    state.groupChatViews.set(groupId, view);
  }
  return state.groupChatViews.get(groupId);
}

function openGroupChat(groupId) {
  const group = getGroup(groupId);
  if (!group || !isGroupMember(group, state.config.blipId)) return;
  state.activeGroup = groupId;
  state.activePeer = null;
  state.view = 'chat';
  unreadByGroup.delete(groupId);
  ensureGroupChatView(groupId);
  if (mainContent?.isConnected) renderView('chat');
  else render();
}

/** @type {ReturnType<typeof createProjectsView> | null} */
let projectsViewInstance = null;

/** @type {(() => void) | null} */
let settingsPanelCleanup = null;

function ensureProjectsView() {
  if (!projectsViewInstance || !projectsViewInstance.el?.parentElement) {
    projectsViewInstance?.destroy?.();
    projectsViewInstance = createProjectsView(
      () => state.config,
      api,
      () =>
        state.peers
          .filter((p) => p.online && !isBlocked(p.blipId))
          .map((p) => p.blipId),
      {
        onOpenMeshPlus: () => {
          state.settingsSection = 'mesh_plus';
          renderView('settings');
        },
      }
    );
  }
  return projectsViewInstance;
}

function normalizeBlipId(id) {
  const n = Number(id);
  return Number.isFinite(n) ? n : null;
}

function refreshLiveChat(peerId) {
  const id = normalizeBlipId(peerId);
  if (id == null) return;
  const chat = state.chatViews.get(id);
  if (!chat?.el?.isConnected) return;
  if (state.view !== 'chat' || state.activePeer !== id) return;
  chat.renderMessages?.();
  chat.scrollToBottom?.();
}

const CHAT_VIEW_API_VERSION = 2;

function ensureChatView(peerId) {
  const id = normalizeBlipId(peerId);
  if (id == null) return null;
  const stale = state.chatViews.get(id);
  if (stale && stale.apiVersion !== CHAT_VIEW_API_VERSION) {
    state.chatViews.delete(id);
  }
  if (!state.chatViews.has(id)) {
    const peer = state.peers.find((p) => p.blipId === id);
    const chat = createChatView(
      id,
      () => state.config,
      (to, msg) =>
        api.sendTcpMessage({
          to,
          type: 'message',
          text: msg.text,
          id: msg.id,
          timestamp: msg.timestamp,
          attachment: msg.attachment,
          replyTo: msg.replyTo,
        }),
      () => {
        state.activePeer = null;
        renderView('chat');
      },
      (to, active) =>
        api.sendTcpMessage({
          type: 'typing',
          to,
          active,
        }),
      (to, payload) =>
        api.sendTcpMessage({
          type: 'reaction',
          to,
          messageId: payload.messageId,
          emoji: payload.emoji,
          add: payload.add,
        }),
      async (to, file, onProgress) => {
        const xfer = { transferId: createMessageId() };
        const abortXfer = () =>
          void abortFileTransfer(api, state.config, to, xfer.transferId);
        trackTransferStart(to, xfer.transferId, {
          name: file.name,
          size: file.size,
          direction: 'out',
          cancellable: true,
          onCancel: abortXfer,
        });
        try {
          const result = await sendChatFile(
            api,
            state.config,
            to,
            file,
            (pct, extra) => {
              trackTransferProgress(to, xfer.transferId, pct, {
                name: file.name,
                size: file.size,
                direction: 'out',
                speedBps: extra?.speedBps,
                cancellable: true,
                onCancel: abortXfer,
              });
              onProgress?.(pct, extra);
            },
            { transferId: xfer.transferId }
          );
          if (result.transferId) xfer.transferId = result.transferId;
          if (result?.ok !== false) recordFileSent();
          if (result.chunked) {
            const dataUrl = await fileToDataUrl(file);
            result.attachment = { ...result.attachment, dataUrl };
          }
          return result;
        } catch (err) {
          if (err?.message === 'cancelled') throw err;
          throw err;
        } finally {
          trackTransferEnd(to, xfer.transferId);
        }
      },
      (e, peerId) => showPeerContextMenu(e, peerId, { hideMessage: true }),
      (peerId) => openPeerProfileFromUi(peerId),
      () => state.peers.find((p) => p.blipId === id),
      (to, payload) =>
        api.sendTcpMessage({
          type: 'message-pin',
          to,
          messageId: payload.messageId,
          pinned: payload.pinned !== false,
        }),
      (to, payload) =>
        api.sendTcpMessage({
          type: 'message-edit',
          to,
          messageId: payload.messageId,
          text: payload.text,
          editedAt: payload.editedAt,
        })
    );
    if (peer) chat.setPeerName(formatPeerDisplayName(peer, id));
    state.chatViews.set(id, chat);
  }
  return state.chatViews.get(id);
}

function getUnreadTotal() {
  let n = unreadInviteCount;
  for (const c of unreadByPeer.values()) n += c;
  for (const c of unreadByGroup.values()) n += c;
  return n;
}

function bumpInviteUnread() {
  unreadInviteCount += 1;
  updateNavUnreadBadge();
  if (state.view === 'chat' && !state.activePeer && !state.activeGroup && mainContent) {
    renderView('chat');
  }
}

function clearInviteUnread() {
  if (unreadInviteCount <= 0) return;
  unreadInviteCount = 0;
  updateNavUnreadBadge();
}

function updateNavUnreadBadge() {
  const chatBtn = document.querySelector('.nav-btn[data-view="chat"]');
  if (!chatBtn) return;
  const total = getUnreadTotal();
  let badge = chatBtn.querySelector('.nav-unread-badge');
  if (total > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'nav-unread-badge';
      chatBtn.appendChild(badge);
    }
    badge.textContent = total > 99 ? '99+' : String(total);
  } else {
    badge?.remove();
  }
}

function bumpUnread(peerId) {
  if (state.view === 'chat' && state.activePeer === peerId) return;
  unreadByPeer.set(peerId, (unreadByPeer.get(peerId) || 0) + 1);
  updateNavUnreadBadge();
}

function clearUnread(peerId) {
  if (!unreadByPeer.has(peerId)) return;
  unreadByPeer.delete(peerId);
  updateNavUnreadBadge();
}

function updateNavActive() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    const view = btn.dataset.view;
    let active = view === state.view;
    if (view === 'chat' && state.view === 'chat') active = true;
    btn.classList.toggle('active', active);
  });
  updateNavUnreadBadge();
}

function getNavKeys() {
  const keys = ['dial', 'peers', 'chat'];
  if (state.config?.devProjectsEnabled) keys.push('projects');
  keys.push('settings');
  return keys;
}

function createNav(onNavigate) {
  const nav = document.createElement('nav');
  nav.className = 'side-nav glass';
  getNavKeys().forEach((key) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nav-btn';
    btn.dataset.view = key;
    btn.dataset.i18n = `nav.${key}`;
    btn.textContent = t(`nav.${key}`);
    btn.addEventListener('click', () => onNavigate(key));
    nav.appendChild(btn);
  });
  return nav;
}

function renderDialView() {
  const wrap = document.createElement('div');
  wrap.className = 'view dial-view';

  const center = document.createElement('div');
  center.className = 'dial-center';

  const title = document.createElement('h2');
  title.className = 'section-title dial-title';
  title.dataset.i18n = 'dial.title';
  title.textContent = t('dial.title');

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'input dial-input';
  input.maxLength = 2;
  input.placeholder = t('dial.placeholder');
  input.dataset.i18nPlaceholder = 'dial.placeholder';
  input.inputMode = 'numeric';

  const actions = document.createElement('div');
  actions.className = 'dial-actions';

  const msgBtn = document.createElement('button');
  msgBtn.type = 'button';
  msgBtn.className = 'btn btn-accent';
  msgBtn.dataset.i18n = 'dial.message';
  msgBtn.textContent = t('dial.message');

  const callBtn = document.createElement('button');
  callBtn.type = 'button';
  callBtn.className = 'btn btn-accent';
  callBtn.dataset.i18n = 'dial.call';
  callBtn.textContent = t('dial.call');

  const dialError = document.createElement('p');
  dialError.className = 'hint dial-error hidden';
  dialError.dataset.i18n = 'dial.invalid_id';
  dialError.textContent = t('dial.invalid_id');

  function resolvePeerId() {
    const raw = input.value.trim();
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1 || n > 64) return 'invalid';
    return n;
  }

  function showDialError() {
    dialError.classList.remove('hidden');
  }

  function hideDialError() {
    dialError.classList.add('hidden');
  }

  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 2);
    if (input.value.length >= 2) {
      const r = resolvePeerId();
      if (r === 'invalid') showDialError();
      else hideDialError();
    } else {
      hideDialError();
    }
  });

  function findPeer(id) {
    return state.peers.find((p) => p.blipId === id && p.online);
  }

  msgBtn.addEventListener('click', () => {
    const id = resolvePeerId();
    if (id === 'invalid') {
      showDialError();
      return;
    }
    if (!id) return;
    hideDialError();
    if (!findPeer(id)) {
      showSignalLost(wrap);
      return;
    }
    openChat(id);
  });

  callBtn.addEventListener('click', () => {
    const id = resolvePeerId();
    if (id === 'invalid') {
      showDialError();
      return;
    }
    if (!id) return;
    hideDialError();
    if (!findPeer(id)) {
      showSignalLost(wrap);
      return;
    }
    openCallOutgoing(id, false);
  });

  actions.appendChild(msgBtn);
  actions.appendChild(callBtn);
  const dialBody = document.createElement('div');
  dialBody.className = 'dial-body';
  dialBody.appendChild(input);
  dialBody.appendChild(dialError);
  dialBody.appendChild(actions);

  center.appendChild(title);
  center.appendChild(dialBody);
  wrap.appendChild(center);
  return wrap;
}

function renderPeersView() {
  const wrap = document.createElement('div');
  wrap.className = 'view peers-view';

  const title = document.createElement('h2');
  title.className = 'section-title';
  title.dataset.i18n = 'peers.title';
  title.textContent = t('peers.title');

  const titleRow = document.createElement('div');
  titleRow.className = 'section-title-row';
  titleRow.appendChild(title);
  titleRow.appendChild(createPixelHintIcon('peers.subtitle_hint'));

  const list = document.createElement('div');
  list.className = 'peers-list';

  const online = state.peers.filter((p) => p.online);
  if (online.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.dataset.i18n = 'peers.none';
    empty.textContent = t('peers.none');
    list.appendChild(empty);
  } else {
    const visiblePeers = state.peers.filter((p) => !isBlocked(p.blipId));
    if (visiblePeers.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.dataset.i18n = 'peers.all_blocked';
      empty.textContent = t('peers.all_blocked');
      list.appendChild(empty);
    }
    visiblePeers.sort(comparePeersFavoriteFirst).forEach((peer) => {
      const row = document.createElement('div');
      row.className = `peer-row glass ${peer.online ? 'online' : 'offline'} ${
        isFavorite(peer.blipId) ? 'peer-row--favorite' : ''
      }`;

      const avatar = createTrustedAvatarElement(peer.blipId, 2, {
        selfBlipId: state.config.blipId,
      });
      avatar.classList.add('peer-row-avatar');
      avatar.style.cursor = 'pointer';
      avatar.title = t('peers.profile_open');
      avatar.addEventListener('click', (e) => {
        e.stopPropagation();
        openPeerProfileFromUi(peer);
      });
      const info = document.createElement('div');
      info.className = 'peer-info';
      const name = document.createElement('span');
      name.className = 'peer-name';
      if (isFavorite(peer.blipId)) {
        const star = document.createElement('span');
        star.className = 'peer-fav-star';
        star.textContent = '★';
        star.title = t('peers.favorite');
        name.appendChild(star);
      }
      name.appendChild(document.createTextNode(formatPeerDisplayName(peer)));
      appendMeshPlusBadgeToNameRow(name, peer);
      if (peer.meshLegacy) {
        const leg = document.createElement('span');
        leg.className = 'peer-handshake-badge peer-handshake-badge--legacy';
        leg.title = t('peers.handshake_legacy');
        leg.textContent = '!';
        name.appendChild(leg);
      }
      const idSpan = document.createElement('span');
      idSpan.className = 'peer-id';
      idSpan.textContent = `#${peer.blipId}`;

      const pulseLine = document.createElement('span');
      pulseLine.className = 'peer-pulse';
      pulseLine.dataset.peerPulse = String(peer.blipId);
      pulseLine.textContent = formatPeerSubline(peer);
      pulseLine.classList.toggle('peer-pulse--status', !!(peer.online && (peer.presenceText || '').trim()));
      const lat = peerLatencyMs.get(peer.blipId);
      pulseLine.classList.toggle('peer-pulse--live', peer.online && lat != null);
      pulseLine.classList.toggle('peer-pulse--offline', !peer.online);

      const typingLine = document.createElement('span');
      typingLine.className = 'peer-typing hidden';
      typingLine.dataset.peerTyping = String(peer.blipId);
      if (peersTyping.has(peer.blipId)) {
        typingLine.textContent = t('peers.typing');
        typingLine.classList.remove('hidden');
      }

      info.appendChild(name);
      info.appendChild(pulseLine);
      info.appendChild(typingLine);
      info.appendChild(idSpan);

      const dot = document.createElement('span');
      const pClass = peerPresenceClass(peer);
      dot.className = `status-dot ${pClass}`;
      dot.title = peerStatusTooltip(peer);

      row.appendChild(avatar);
      row.appendChild(info);
      row.appendChild(dot);

      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showPeerContextMenu(e, peer);
      });

      const openPeerChat = () => void openChat(peer.blipId);
      row.addEventListener('click', openPeerChat);
      row.addEventListener('auxclick', (e) => {
        if (e.button === 1) openPeerChat();
      });
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          void openChat(peer.blipId);
        }
      });
      row.setAttribute('tabindex', '0');
      row.setAttribute('role', 'button');

      row.style.cursor = 'pointer';

      list.appendChild(row);
    });
  }

  wrap.appendChild(titleRow);
  wrap.appendChild(list);
  return wrap;
}

function refreshPeersTypingDom() {
  if (state.view !== 'peers' || !mainContent?.isConnected) return;
  mainContent.querySelectorAll('[data-peer-typing]').forEach((el) => {
    const id = Number(el.dataset.peerTyping);
    const show = peersTyping.has(id);
    el.classList.toggle('hidden', !show);
    if (show) el.textContent = t('peers.typing');
  });
}

async function promptMeshLabel(peer) {
  const fallback = peer?.displayName || `BLIP-${peer.blipId}`;
  const saved = await openMeshLabelDialog(peer.blipId, fallback);
  if (saved === null) return;

  const chat = state.chatViews.get(peer.blipId);
  if (chat) chat.setPeerName(formatPeerDisplayName(peer));
  if (state.view === 'peers') renderView('peers');
  if (state.view === 'profile') syncPeerProfilePage();
  if (state.view === 'chat' && !state.activePeer) renderView('chat');

  showAppToast({
    title: t('peers.mesh_label_saved'),
    body: saved ? saved : t('peers.mesh_label_removed'),
    durationMs: 4000,
  });
}

function getPeerProfileHooks(peer) {
  return {
    selfBlipId: state.config?.blipId ?? null,
    isBlocked: (id) => isBlocked(id),
    presenceClass: peerPresenceClass,
    statusTooltip: peerStatusTooltip,
    onMessage: () => openChatFromProfile(peer.blipId),
    onCall: () => {
      if (peer.online) openCallOutgoing(peer.blipId, false);
    },
    onBlock: () => {
      if (isBlocked(peer.blipId)) {
        unblockPeer(peer.blipId);
        showAppToast({ title: t('peers.unblock_done'), durationMs: 3000 });
      } else {
        blockPeer(peer.blipId);
        showAppToast({ title: t('peers.block_done'), durationMs: 3000 });
      }
      if (state.view === 'profile' && state.profilePeerId === peer.blipId) {
        syncPeerProfilePage();
      }
      if (state.view === 'peers') renderView('peers');
      if (state.view === 'chat' && state.activePeer === peer.blipId) {
        state.activePeer = null;
        renderView('chat');
      }
    },
    onPing: () => runPeerPing(peer),
  };
}

function openPeerProfileFromUi(peerOrId) {
  const peer = resolvePeerForProfile(peerOrId);
  if (!peer?.blipId) return;
  if (peer.hasProfileGif && !getPeerProfileGifDataUrl(peer.blipId)) {
    void requestPeerProfileGif(peer.blipId);
  }
  if (state.view !== 'profile') {
    state.profileReturn = {
      view: state.view,
      activePeer: state.activePeer,
      activeGroup: state.activeGroup,
    };
  }
  state.profilePeerId = peer.blipId;
  state.view = 'profile';
  const wrap = renderPeerProfileViewInner();
  if (!wrap) return;
  if (mainContent?.isConnected) {
    mountMainContentView(wrap);
  } else {
    render();
  }
}

function leavePeerProfilePage() {
  const ret = state.profileReturn ?? { view: 'peers', activePeer: null, activeGroup: null };
  state.profilePeerId = null;
  state.profileReturn = null;
  state.activePeer = ret.activePeer ?? null;
  state.activeGroup = ret.activeGroup ?? null;
  renderView(ret.view);
}

function openChatFromProfile(peerId) {
  state.profilePeerId = null;
  state.profileReturn = null;
  void openChat(peerId);
}

function resolvePeerForProfile(peerOrId) {
  if (peerOrId && typeof peerOrId === 'object' && peerOrId.blipId != null) {
    const id = Number(peerOrId.blipId);
    const live = state.peers.find((p) => Number(p.blipId) === id);
    return live ? { ...live, ...peerOrId, blipId: id } : peerOrId;
  }
  return peerForContextMenu(peerOrId);
}

function syncPeerProfilePage() {
  const peer = resolvePeerForProfile(state.profilePeerId);
  if (!peer?.blipId) return;
  if (peer.hasProfileGif && !getPeerProfileGifDataUrl(peer.blipId)) {
    void requestPeerProfileGif(peer.blipId);
  }
  if (
    profilePageApi?.refresh &&
    Number(profilePageApi.peerId) === Number(peer.blipId)
  ) {
    profilePageApi.setPeer?.(peer);
    profilePageApi.refresh();
  }
}

function renderPeerProfileView() {
  return renderPeerProfileViewInner();
}

function renderPeerProfileViewInner() {
  profilePageCleanup?.();
  profilePageCleanup = null;
  profilePageApi = null;

  const peer = resolvePeerForProfile(state.profilePeerId);
  if (peer.hasProfileGif && !getPeerProfileGifDataUrl(peer.blipId)) {
    void requestPeerProfileGif(peer.blipId);
  }
  let built;
  try {
    built = buildPeerProfilePage(peer, getPeerProfileHooks(peer));
  } catch (err) {
    console.error('[BLIP] profile render', err);
    const errWrap = document.createElement('div');
    errWrap.className = 'view peer-profile-view';
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = t('peers.profile_open_failed');
    errWrap.appendChild(p);
    return errWrap;
  }
  profilePageApi = {
    peerId: Number(peer.blipId),
    refresh: built.refresh,
    setPeer: built.setPeer,
    destroy: built.destroy,
  };
  profilePageCleanup = () => {
    profilePageApi?.destroy?.();
    profilePageApi = null;
  };

  const wrap = document.createElement('div');
  wrap.className = 'view peer-profile-view';

  const toolbar = document.createElement('div');
  toolbar.className = 'peer-profile-toolbar';

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'btn btn-lang peer-profile-back';
  backBtn.dataset.i18n = 'peers.profile_back';
  backBtn.textContent = `← ${t('peers.profile_back')}`;
  backBtn.addEventListener('click', () => leavePeerProfilePage());

  const title = document.createElement('h2');
  title.className = 'section-title peer-profile-toolbar-title';
  title.dataset.i18n = 'peers.profile_title';
  title.textContent = t('peers.profile_title');

  toolbar.appendChild(backBtn);
  toolbar.appendChild(title);
  wrap.appendChild(toolbar);
  wrap.appendChild(built.el);

  return wrap;
}

function peerForContextMenu(peerOrId) {
  if (peerOrId && typeof peerOrId === 'object' && peerOrId.blipId != null) return peerOrId;
  const id = Number(peerOrId);
  const found = state.peers.find((p) => p.blipId === id);
  if (found) return found;
  return {
    blipId: id,
    displayName: formatPeerDisplayName(null, id),
    online: false,
    presence: 'offline',
    presenceText: '',
    hasProfileGif: false,
  };
}

function closeGroupChatUi(groupId) {
  const active = getActiveVoiceChannel();
  if (active?.groupId === groupId) void leaveVoiceChannel();
  state.groupChatViews.get(groupId)?.destroy?.();
  state.groupChatViews.delete(groupId);
  if (state.activeGroup === groupId) {
    state.activeGroup = null;
    if (state.view === 'chat') renderView('chat');
  }
}

function showGroupContextMenu(e, group) {
  const menu = document.createElement('div');
  menu.className = 'context-menu glass';
  menu.style.left = `${e.clientX}px`;
  menu.style.top = `${e.clientY}px`;

  function bindItem(btn, handler) {
    btn.addEventListener('mousedown', (ev) => ev.stopPropagation());
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      menu.remove();
      handler();
    });
  }

  const openItem = document.createElement('button');
  openItem.type = 'button';
  openItem.textContent = t('group.menu_open');
  bindItem(openItem, () => openGroupChat(group.id));

  const renameItem = document.createElement('button');
  renameItem.type = 'button';
  renameItem.textContent = t('group.menu_rename');
  bindItem(renameItem, () => {
    const val = prompt(t('group.rename_prompt'), group.name || groupDisplayName(group));
    if (val === null) return;
    const trimmed = val.trim();
    group.name = trimmed || undefined;
    saveGroup(group);
    state.groupChatViews.get(group.id)?.updateGroup?.(getGroup(group.id));
    if (state.view === 'chat') renderView('chat');
    showAppToast({ title: t('group.rename_done'), durationMs: 2800 });
  });

  const callItem = document.createElement('button');
  callItem.type = 'button';
  callItem.textContent = t('group.call');
  bindItem(callItem, () => {
    openGroupChat(group.id);
    const vch = getVoiceChannels(group)[0];
    if (vch) void joinVoiceChannel(group.id, vch.id, api, state.config);
  });

  const leaveItem = document.createElement('button');
  leaveItem.type = 'button';
  leaveItem.textContent = t('group.menu_leave');
  bindItem(leaveItem, async () => {
    const ok = await openConfirmDialog({
      title: t('group.leave_confirm_title'),
      body: t('group.leave_confirm_body').replace('{name}', groupDisplayName(group)),
      confirmLabel: t('group.menu_leave'),
    });
    if (!ok) return;
    try {
      const res = await leaveGroup(api, state.config, group.id, state.peers);
      if (!res?.ok) {
        showAppToast({
          title: t('group.leave_failed'),
          body: t(`group.err_${res?.error || 'unknown'}`),
          variant: 'danger',
          durationMs: 5000,
        });
        return;
      }
      closeGroupChatUi(group.id);
      if (state.view === 'chat') renderView('chat');
    } catch (err) {
      console.error('[group] leave:', err);
      showAppToast({
        title: t('group.leave_failed'),
        body: err?.message || String(err),
        variant: 'danger',
        durationMs: 5000,
      });
    }
  });

  menu.appendChild(openItem);
  menu.appendChild(renameItem);
  menu.appendChild(callItem);
  menu.appendChild(leaveItem);
  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0);
}

function showPeerContextMenu(e, peerOrId, options = {}) {
  const peer = peerForContextMenu(peerOrId);
  const menu = document.createElement('div');
  menu.className = 'context-menu glass';
  menu.style.left = `${e.clientX}px`;
  menu.style.top = `${e.clientY}px`;

  function bindItem(btn, handler) {
    btn.addEventListener('mousedown', (ev) => ev.stopPropagation());
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      menu.remove();
      handler();
    });
  }

  const profileItem = document.createElement('button');
  profileItem.type = 'button';
  profileItem.dataset.i18n = 'peers.profile';
  profileItem.textContent = t('peers.profile');
  bindItem(profileItem, () => openPeerProfileFromUi(peer));

  const msgItem = document.createElement('button');
  msgItem.type = 'button';
  msgItem.textContent = t('dial.message');
  bindItem(msgItem, () => openChat(peer.blipId));

  const callItem = document.createElement('button');
  callItem.type = 'button';
  callItem.textContent = t('dial.call');
  bindItem(callItem, () => {
    if (peer.online) openCallOutgoing(peer.blipId, false);
  });

  const labelItem = document.createElement('button');
  labelItem.type = 'button';
  labelItem.textContent = t('peers.mesh_label');
  bindItem(labelItem, () => {
    void promptMeshLabel(peer);
  });

  const pingItem = document.createElement('button');
  pingItem.type = 'button';
  pingItem.textContent = t('peers.ping');
  bindItem(pingItem, () => {
    void runPeerPing(peer);
  });

  const copyIdItem = document.createElement('button');
  copyIdItem.type = 'button';
  copyIdItem.textContent = t('peers.copy_id');
  bindItem(copyIdItem, () => {
    void navigator.clipboard.writeText(String(peer.blipId));
    showAppToast({ title: t('peers.copy_id_done'), durationMs: 2500 });
  });

  const groupItem = document.createElement('button');
  groupItem.type = 'button';
  groupItem.textContent = t('group.create_menu');
  bindItem(groupItem, () => {
    void (async () => {
      const result = await openGroupCreateDialog({
        selfId: state.config.blipId,
        peers: state.peers,
        seedPeerId: peer.blipId,
      });
      if (!result) return;
      const g = await createGroupFromUi(api, state.config, result.memberIds, result.name);
      if (!g) return;
      openGroupChat(g.id);
    })();
  });

  const favItem = document.createElement('button');
  favItem.type = 'button';
  favItem.textContent = isFavorite(peer.blipId) ? t('peers.unfavorite') : t('peers.favorite');
  bindItem(favItem, () => {
    const nowFav = toggleFavorite(peer.blipId);
    showAppToast({
      title: nowFav ? t('peers.favorite_added') : t('peers.favorite_removed'),
      durationMs: 2500,
    });
    if (state.view === 'peers') renderView('peers');
    if (state.view === 'chat' && !state.activePeer) renderView('chat');
  });

  const blockItem = document.createElement('button');
  blockItem.type = 'button';
  blockItem.textContent = isBlocked(peer.blipId) ? t('peers.unblock') : t('peers.block');
  bindItem(blockItem, () => {
    if (isBlocked(peer.blipId)) {
      unblockPeer(peer.blipId);
      showAppToast({ title: t('peers.unblock_done'), durationMs: 3000 });
    } else {
      blockPeer(peer.blipId);
      showAppToast({ title: t('peers.block_done'), durationMs: 3000 });
    }
    if (state.view === 'peers') renderView('peers');
  });

  menu.addEventListener('mousedown', (ev) => ev.stopPropagation());
  menu.addEventListener('click', (ev) => ev.stopPropagation());

  menu.appendChild(profileItem);
  if (!options.hideMessage) menu.appendChild(msgItem);
  menu.appendChild(callItem);
  menu.appendChild(labelItem);
  menu.appendChild(pingItem);
  menu.appendChild(copyIdItem);
  if (state.config?.devGroupsEnabled) menu.appendChild(groupItem);
  menu.appendChild(favItem);
  menu.appendChild(blockItem);
  document.body.appendChild(menu);

  const close = () => menu.remove();
  setTimeout(() => {
    document.addEventListener('click', close, { once: true });
  }, 0);
}

function buildAvatarSettingsSection() {
  const block = document.createElement('div');
  block.className = 'settings-avatar-wrap';
  if (!state.config?.blipId) return block;

  const head = buildSettingsLabelRow('settings.avatar_title', 'settings.avatar_hint');
  head.classList.add('settings-avatar-head');
  block.appendChild(head);

  const row = document.createElement('div');
  row.className = 'settings-avatar-row';

  const preview = document.createElement('div');
  preview.className = 'settings-avatar-preview';

  function refreshPreview() {
    preview.innerHTML = '';
    preview.appendChild(
      createAvatarElement(state.config.blipId, 4, { selfBlipId: state.config.blipId })
    );
  }
  refreshPreview();
  row.appendChild(preview);

  const col = document.createElement('div');
  col.className = 'settings-avatar-actions';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/png,image/jpeg,image/webp';
  fileInput.className = 'settings-avatar-file-input';
  fileInput.id = 'settings-avatar-file';

  const uploadLabel = document.createElement('label');
  uploadLabel.htmlFor = fileInput.id;
  uploadLabel.className = 'btn btn-accent settings-avatar-upload-label';
  uploadLabel.dataset.i18n = 'settings.avatar_upload';
  uploadLabel.textContent = t('settings.avatar_upload');

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const dataUrl = await openAvatarCropDialog(file);
      if (!dataUrl) return;
      const r = await window.blip.saveAvatar?.(dataUrl);
      if (!r?.ok) throw new Error(r?.error || 'save_failed');
      setSelfAvatarCache(dataUrl);
      state.config.customAvatar = true;
      refreshPreview();
      window.dispatchEvent(new CustomEvent('blip-avatar-changed'));
      void broadcastCustomAvatar();
      showAppToast({ title: t('settings.avatar_saved'), durationMs: 3000 });
    } catch (e) {
      showAppToast({
        title: t('settings.avatar_failed'),
        body: e?.message || '',
        variant: 'danger',
        durationMs: 4500,
      });
    }
  });

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn btn-lang';
  removeBtn.dataset.i18n = 'settings.avatar_remove';
  removeBtn.textContent = t('settings.avatar_remove');
  removeBtn.addEventListener('click', async () => {
    await window.blip.clearAvatar?.();
    setSelfAvatarCache(null);
    state.config.customAvatar = false;
    refreshPreview();
    window.dispatchEvent(new CustomEvent('blip-avatar-changed'));
    void broadcastCustomAvatar();
  });

  const regenBtn = document.createElement('button');
  regenBtn.type = 'button';
  regenBtn.className = 'btn btn-lang';
  regenBtn.dataset.i18n = 'settings.avatar_regenerate';
  regenBtn.textContent = t('settings.avatar_regenerate');
  regenBtn.addEventListener('click', async () => {
    if (state.config.customAvatar) await window.blip.clearAvatar?.();
    setSelfAvatarCache(null);
    state.config.customAvatar = false;
    regenerateAvatar(state.config.blipId);
    refreshPreview();
    window.dispatchEvent(new CustomEvent('blip-avatar-changed'));
  });

  col.appendChild(fileInput);
  col.appendChild(uploadLabel);
  col.appendChild(removeBtn);
  col.appendChild(regenBtn);
  row.appendChild(col);
  block.appendChild(row);

  return block;
}

function buildLaunchAtLoginSection() {
  if (typeof window === 'undefined' || window.blip?.platform !== 'win32') {
    return null;
  }

  const block = document.createElement('div');
  block.className = 'settings-tray-wrap settings-tray-wrap--flat';

  const row = document.createElement('div');
  row.className = 'settings-toggle-with-hint';
  const toggle = createPixelToggle({
    checked: !!state.config.launchAtLogin,
    labelKey: 'settings.launch_at_login',
    onChange: async (checked) => {
      state.config = await api.saveConfig({ launchAtLogin: checked });
    },
  });
  row.appendChild(toggle.el);
  row.appendChild(createPixelHintIcon('settings.launch_at_login_hint'));
  block.appendChild(row);

  return block;
}

function buildCloseToTraySection() {
  if (typeof window === 'undefined' || window.blip?.platform !== 'win32') {
    return null;
  }

  const block = document.createElement('div');
  block.className = 'settings-tray-wrap settings-tray-wrap--flat';

  const row = document.createElement('div');
  row.className = 'settings-toggle-with-hint';
  const toggle = createPixelToggle({
    checked: !!state.config.closeToTray,
    labelKey: 'settings.close_to_tray',
    onChange: async (checked) => {
      state.config = await api.saveConfig({ closeToTray: checked });
    },
  });
  row.appendChild(toggle.el);
  row.appendChild(createPixelHintIcon('settings.close_to_tray_hint'));
  block.appendChild(row);

  return block;
}

function appendAppearanceControl(parent, controlEl) {
  const wrap = document.createElement('div');
  wrap.className = 'settings-appearance-control';
  wrap.appendChild(controlEl);
  parent.appendChild(wrap);
}

function buildAppearanceSection() {
  const block = document.createElement('div');
  block.className = 'settings-appearance-wrap';
  const curMode = normalizeThemeMode(state.config.themeMode, state.config.themeId);
  const curAccent = normalizeAccentId(state.config.accentId, state.config.themeId);
  const curBg = normalizeBgId(state.config.animatedBgId);

  block.appendChild(buildSectionSubtitleRow('settings.appearance_theme'));
  const modeOpts = THEME_MODES.map((id) => ({ value: id, label: labelThemeMode(id) }));
  const modeSelect = buildThemedSelect();
  fillSettingsDropdown(modeSelect, modeOpts, curMode, async (id) => {
    state.config = await api.saveConfig({ themeMode: id });
    applyAppearance(state.config);
  });
  appendAppearanceControl(block, modeSelect);

  const accentGroup = document.createElement('div');
  accentGroup.className = 'settings-appearance-accent-group settings-list-panel';
  accentGroup.appendChild(buildSectionSubtitleRow('settings.appearance_accent'));

  const accentOpts = ACCENT_IDS.map((id) => ({ value: id, label: labelAccent(id) }));
  const accentSelect = buildThemedSelect();
  fillSettingsDropdown(accentSelect, accentOpts, curAccent, async (id) => {
    state.config = await api.saveConfig({ accentId: id });
    applyAppearance(state.config);
  });
  appendAppearanceControl(accentGroup, accentSelect);

  appendThemeEditorSection(accentGroup, () => state.config, async (patch) => {
    state.config = await api.saveConfig(patch);
    return state.config;
  });
  block.appendChild(accentGroup);

  block.appendChild(
    buildSectionSubtitleRow('settings.bg_animated', 'settings.bg_animated_mesh_hint')
  );
  const animOpts = markPremiumGatedOptions(
    ANIMATED_BACKGROUNDS.map((id) => ({ value: id, label: labelBg(id) })),
    MESH_PLUS_FEATURES.animated_bg,
    state.config
  );
  const animSelect = buildThemedSelect();
  fillPremiumGatedDropdown(
    animSelect,
    animOpts,
    ANIMATED_BACKGROUNDS.includes(curBg) ? curBg : 'none',
    MESH_PLUS_FEATURES.animated_bg,
    state.config,
    async (id) => {
      state.config = await api.saveConfig({ animatedBgId: normalizeBgId(id) });
      applyAppearance(state.config);
      applyReactiveWallpaperConfig(state.config);
    }
  );
  appendAppearanceControl(block, animSelect);

  block.appendChild(buildSectionSubtitleRow('settings.bg_art'));
  const artOpts = STATIC_ART_BACKGROUNDS.map((id) => ({ value: id, label: labelBg(id) }));
  const artSelect = buildThemedSelect();
  const artCurrent = STATIC_ART_BACKGROUNDS.includes(curBg) ? curBg : 'none';
  fillSettingsDropdown(artSelect, artOpts, artCurrent, async (id) => {
    state.config = await api.saveConfig({ animatedBgId: normalizeBgId(id) });
    applyAppearance(state.config);
    applyReactiveWallpaperConfig(state.config);
  });
  appendAppearanceControl(block, artSelect);

  const reactiveToggle = createPixelToggle({
    checked: !!state.config.reactiveBackground,
    labelKey: 'settings.reactive_background',
    onChange: async (checked) => {
      state.config = await api.saveConfig({ reactiveBackground: checked });
      applyAppearance(state.config);
      applyReactiveWallpaperConfig(state.config);
    },
  });
  const reactiveRow = document.createElement('div');
  reactiveRow.className = 'settings-toggle-with-hint';
  reactiveRow.appendChild(reactiveToggle.el);
  reactiveRow.appendChild(createPixelHintIcon('settings.reactive_background_hint'));
  block.appendChild(reactiveRow);

  const motionToggle = createPixelToggle({
    checked: !!state.config.reduceMotion,
    labelKey: 'settings.reduce_motion',
    onChange: async (checked) => {
      state.config = await api.saveConfig({ reduceMotion: checked });
      applyAppearance(state.config);
    },
  });
  const motionRow = document.createElement('div');
  motionRow.className = 'settings-toggle-with-hint';
  motionRow.appendChild(motionToggle.el);
  motionRow.appendChild(createPixelHintIcon('settings.motion_hint'));
  block.appendChild(motionRow);

  appendAppIconPickerSections(block, state, (patch) => api.saveConfig(patch));

  return block;
}

function applySoundPrefsFromConfig(cfg = state.config) {
  setSoundPrefs({
    enabled: cfg?.uiSoundsEnabled !== false && cfg?.doNotDisturb !== true,
    volume: typeof cfg?.uiSoundsVolume === 'number' ? cfg.uiSoundsVolume : 1,
    soundPack: cfg?.uiSoundPack,
    melodyPack: cfg?.uiMelodyPack,
  });
}

function parseSemver(v) {
  const m = String(v || '')
    .replace(/^v/i, '')
    .match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareAppVersions(a, b) {
  const strip = (v) => String(v || '').replace(/^v/i, '').trim();
  const pa = strip(a).split('-');
  const pb = strip(b).split('-');
  const na = pa[0].split('.').map((n) => Number(n) || 0);
  const nb = pb[0].split('.').map((n) => Number(n) || 0);
  for (let i = 0; i < 3; i++) {
    if (na[i] > nb[i]) return 1;
    if (na[i] < nb[i]) return -1;
  }
  const preA = pa[1] || '';
  const preB = pb[1] || '';
  if (!preA && preB) return 1;
  if (preA && !preB) return -1;
  if (preA > preB) return 1;
  if (preA < preB) return -1;
  return 0;
}

function isVersionNewer(a, b) {
  return compareAppVersions(a, b) > 0;
}

function filterReleasesForChannel(releases, receiveBeta) {
  if (!releases?.length) return [];
  if (receiveBeta) return releases;
  return releases.filter((r) => !r.prerelease);
}

function showUpdateStatusToast(payload) {
  if (!payload?.state) return;
  lastUpdateToastDismiss?.();
  lastUpdateToastDismiss = null;

  const actions = [];
  let title = '';
  let body = '';
  let variant = 'accent';
  let durationMs = 10000;

  switch (payload.state) {
    case 'checking':
      title = t('toast.update_checking');
      durationMs = 5000;
      break;
    case 'available':
      title = t('toast.update_available');
      body = t('toast.update_available_body').replace('{v}', payload.version || '—');
      actions.push({
        label: t('settings.section_updates'),
        primary: true,
        onClick: () => {
          state.settingsSection = 'updates';
          renderView('settings');
        },
      });
      break;
    case 'none':
      title = t('toast.update_latest');
      durationMs = 5000;
      break;
    case 'progress':
      title = t('toast.update_progress');
      body = `${payload.percent ?? 0}%`;
      durationMs = 0;
      break;
    case 'downloaded':
      title = t('toast.update_ready');
      body = t('toast.update_ready_body').replace('{v}', payload.version || '—');
      actions.push({
        label: t('settings.updates_install'),
        primary: true,
        onClick: () => window.blip.quitAndInstall?.(),
      });
      durationMs = 0;
      break;
    case 'error':
      title = t('toast.update_error');
      body = payload.message || '';
      variant = 'danger';
      break;
    default:
      return;
  }

  const toast = showAppToast({ title, body, variant, durationMs, actions });
  lastUpdateToastDismiss = toast?.dismiss ?? null;
}

async function checkUpdatesViaGithub(currentVersion) {
  const result = await window.blip.getGithubReleases?.(3);
  if (!result?.ok || !result.releases?.length) {
    showUpdateStatusToast({ state: 'error', message: t('settings.updates_releases_error') });
    return;
  }
  const channel = filterReleasesForChannel(result.releases, !!state.config?.receiveBetaUpdates);
  const latest = channel[0];
  const tag = latest?.tag?.replace(/^v/i, '') || '';
  if (isVersionNewer(tag, currentVersion)) {
    showUpdateStatusToast({ state: 'available', version: tag });
  } else {
    showUpdateStatusToast({ state: 'none' });
  }
}

async function runStartupUpdateCheck() {
  if (!window.blip?.getAppMetadata) return;
  const meta = await window.blip.getAppMetadata();
  const current = meta?.version || '0.0.0';

  showUpdateStatusToast({ state: 'checking' });

  if (meta?.isPackaged && window.blip.checkForUpdates) {
    const r = await window.blip.checkForUpdates();
    if (r?.skipped) {
      await checkUpdatesViaGithub(current);
    }
    return;
  }

  await checkUpdatesViaGithub(current);
}

export function navigateToView(view) {
  if (!state.config?.blipId) return;
  if (view === 'settings' && state.view !== 'settings') {
    state.settingsSection = null;
  }
  if (view === 'chat' && state.view === 'chat' && state.activePeer) {
    state.activePeer = null;
  }
  renderView(view);
}

export async function toggleDoNotDisturb() {
  if (!state.config?.blipId) return;
  const next = !state.config.doNotDisturb;
  state.config = await api.saveConfig({ doNotDisturb: next });
  applySoundPrefsFromConfig(state.config);
  if (state.view === 'settings') renderView('settings');
  showAppToast({
    title: next ? t('settings.notifications_dnd') : t('toast.dnd_off_title'),
    body: next ? t('settings.notifications_dnd_hint') : t('toast.dnd_off_body'),
    durationMs: 3500,
  });
}

function setupGlobalShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (!state.config?.blipId) return;
    const tag = e.target?.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

    if (e.altKey && !e.ctrlKey && !e.metaKey && !typing) {
      const views = { 1: 'dial', 2: 'peers', 3: 'chat', 4: 'settings' };
      const next = views[e.key];
      if (next) {
        e.preventDefault();
        if (next === 'settings') {
          state.settingsSection = null;
        }
        if (next === 'chat' && state.view === 'chat' && state.activePeer) {
          state.activePeer = null;
        }
        renderView(next);
        return;
      }
    }

    if (e.ctrlKey && e.key === ',' && !e.altKey && !e.metaKey) {
      e.preventDefault();
      state.settingsSection = null;
      renderView('settings');
      return;
    }

    if (e.ctrlKey && (e.key === 'f' || e.key === 'F') && !e.altKey && !e.metaKey) {
      if (state.view === 'chat' && state.activePeer != null) {
        const search = mainContent?.querySelector('.chat-search-input');
        if (search) {
          e.preventDefault();
          search.focus();
          search.select();
        }
      }
    }

    if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.metaKey && !typing) {
      if (state.view === 'profile' && state.profilePeerId != null) {
        e.preventDefault();
        leavePeerProfilePage();
        return;
      }
      if (state.view === 'chat' && (state.activePeer || state.activeGroup)) {
        e.preventDefault();
        state.activePeer = null;
        state.activeGroup = null;
        renderView('chat');
      }
    }
  });
}

function getSettingsSectionIds() {
  const ids = [
    'profile',
    'achievements',
    'mesh_plus',
    'language',
    'notifications',
    'privacy',
    'sound',
    'shortcuts',
    'call',
    'transfer',
    'appearance',
    'network',
    'system',
    'updates',
    'developer',
    'about',
  ];
  if (typeof window !== 'undefined' && window.blip?.platform !== 'win32') {
    return ids.filter((id) => id !== 'system');
  }
  return ids;
}

function buildSettingsProfilePanel() {
  return buildSettingsProfilePanelView(state, api, {
    broadcastCustomAvatar,
    broadcastProfileGif,
    onChangeId: () => showGridView(true),
  });
}

function buildSettingsLanguagePanel() {
  const frag = document.createElement('div');
  frag.className = 'settings-panel';

  appendSettingsPanelHeader(frag, 'settings.section_language');

  const langSelect = buildThemedSelect();
  fillSettingsDropdown(
    langSelect,
    [
      { value: 'en', label: 'English' },
      { value: 'ru', label: 'Русский' },
    ],
    state.config.language || getLang() || 'en',
    async (lang) => {
      setLang(lang);
      state.config.language = lang;
      await api.saveConfig({ language: lang });
      applyLangChange();
      state.settingsSection = 'language';
      renderView('settings');
    }
  );

  frag.appendChild(buildSettingsField('settings.language', langSelect));
  return frag;
}

function buildSettingsNotificationsPanel() {
  const frag = document.createElement('div');
  frag.className = 'settings-panel';

  appendSettingsPanelHeader(frag, 'settings.section_notifications');

  frag.appendChild(
    createPixelToggle({
      checked: state.config.desktopNotifications !== false,
      labelKey: 'settings.notifications_enable',
      onChange: async (checked) => {
        state.config = await api.saveConfig({ desktopNotifications: checked });
      },
    }).el
  );

  frag.appendChild(
    createPixelToggle({
      checked: state.config.desktopCallNotifications !== false,
      labelKey: 'settings.notifications_calls',
      onChange: async (checked) => {
        state.config = await api.saveConfig({ desktopCallNotifications: checked });
      },
    }).el
  );

  const dndRow = document.createElement('div');
  dndRow.className = 'settings-toggle-with-hint';
  const dndToggle = createPixelToggle({
    checked: state.config.doNotDisturb === true,
    labelKey: 'settings.notifications_dnd',
    onChange: async (checked) => {
      state.config = await api.saveConfig({ doNotDisturb: checked });
      applySoundPrefsFromConfig(state.config);
    },
  });
  dndRow.appendChild(dndToggle.el);
  dndRow.appendChild(createPixelHintIcon('settings.notifications_dnd_hint'));
  frag.appendChild(dndRow);

  return frag;
}

function buildSettingsPrivacyPanel() {
  const frag = document.createElement('div');
  frag.className = 'settings-panel settings-panel--privacy';

  appendSettingsPanelHeader(frag, 'settings.section_privacy', 'settings.privacy_hint');

  const list = createSettingsListPanel('settings-blocked-list settings-list-panel--stretch-x');

  function renderList() {
    list.innerHTML = '';
    const blocked = getBlockedPeerIds();
    list.classList.toggle('settings-list-panel--empty', blocked.length === 0);
    if (blocked.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.dataset.i18n = 'settings.privacy_empty';
      empty.textContent = t('settings.privacy_empty');
      list.appendChild(empty);
      return;
    }
    for (const id of blocked) {
      const row = document.createElement('div');
      row.className = 'settings-blocked-row settings-list-panel__row';

      const peer = state.peers.find((p) => p.blipId === id);
      const meta = document.createElement('div');
      meta.className = 'settings-blocked-meta';

      const name = document.createElement('span');
      name.className = 'settings-blocked-name';
      name.textContent = formatPeerDisplayName(peer, id);

      const idLine = document.createElement('span');
      idLine.className = 'settings-blocked-id';
      idLine.textContent = `BLIP #${id}`;

      meta.appendChild(name);
      meta.appendChild(idLine);

      const unblockBtn = document.createElement('button');
      unblockBtn.type = 'button';
      unblockBtn.className = 'btn btn-lang';
      unblockBtn.dataset.i18n = 'settings.privacy_unblock';
      unblockBtn.textContent = t('settings.privacy_unblock');
      unblockBtn.addEventListener('click', () => {
        unblockPeer(id);
        showAppToast({
          title: t('peers.unblock_done'),
          body: `BLIP #${id}`,
          durationMs: 3500,
        });
        renderList();
        if (state.view === 'peers') renderView('peers');
      });

      row.appendChild(meta);
      row.appendChild(unblockBtn);
      list.appendChild(row);
    }
  }

  renderList();
  frag.appendChild(list);
  return frag;
}

function buildSettingsSoundPanel() {
  const frag = document.createElement('div');
  frag.className = 'settings-panel';

  appendSettingsPanelHeader(frag, 'settings.section_sound');

  const enableToggle = createPixelToggle({
    checked: state.config.uiSoundsEnabled !== false,
    labelKey: 'settings.sound_enable',
    onChange: async (checked) => {
      state.config = await api.saveConfig({ uiSoundsEnabled: checked });
      applySoundPrefsFromConfig(state.config);
      syncVolumeDisabled();
    },
  });

  const volLabel = document.createElement('label');
  volLabel.className = 'settings-sound-volume-label';
  volLabel.dataset.i18n = 'settings.sound_volume';
  volLabel.textContent = t('settings.sound_volume');

  const volRow = document.createElement('div');
  volRow.className = 'settings-sound-volume-row';

  const volRange = document.createElement('input');
  volRange.type = 'range';
  volRange.min = '0';
  volRange.max = '100';
  volRange.step = '5';
  volRange.className = 'settings-sound-range';
  const volPct = Math.round(
    (typeof state.config.uiSoundsVolume === 'number' ? state.config.uiSoundsVolume : 1) * 100
  );
  volRange.value = String(volPct);

  const volVal = document.createElement('span');
  volVal.className = 'settings-sound-volume-val';
  volVal.textContent = `${volPct}%`;

  async function persistVolume() {
    const v = Number(volRange.value) / 100;
    volVal.textContent = `${volRange.value}%`;
    state.config = await api.saveConfig({ uiSoundsVolume: v });
    applySoundPrefsFromConfig(state.config);
  }

  volRange.addEventListener('input', () => {
    volVal.textContent = `${volRange.value}%`;
    setSoundPrefs({
      enabled: enableToggle.input.checked,
      volume: Number(volRange.value) / 100,
      soundPack: state.config.uiSoundPack,
      melodyPack: state.config.uiMelodyPack,
    });
  });
  volRange.addEventListener('change', () => {
    void persistVolume();
  });

  function syncVolumeDisabled() {
    volRange.disabled = !enableToggle.input.checked;
    volLabel.style.opacity = enableToggle.input.checked ? '1' : '0.45';
  }
  syncVolumeDisabled();

  volRow.appendChild(volRange);
  volRow.appendChild(volVal);

  const soundPackSelect = buildThemedSelect();
  fillPremiumGatedDropdown(
    soundPackSelect,
    markPremiumGatedOptions(
      [
        { value: 'signal', label: t('settings.sound_pack_signal') },
        { value: 'pulse', label: t('settings.sound_pack_pulse') },
        { value: 'wire', label: t('settings.sound_pack_wire') },
        { value: 'static', label: t('settings.sound_pack_static') },
      ],
      MESH_PLUS_FEATURES.sound_pack,
      state.config
    ),
    SOUND_PACK_IDS.includes(state.config.uiSoundPack) ? state.config.uiSoundPack : 'signal',
    MESH_PLUS_FEATURES.sound_pack,
    state.config,
    async (id) => {
      state.config = await api.saveConfig({ uiSoundPack: id });
      applySoundPrefsFromConfig(state.config);
    }
  );

  const melodyPackSelect = buildThemedSelect();
  fillPremiumGatedDropdown(
    melodyPackSelect,
    markPremiumGatedOptions(
      [
        { value: 'mesh', label: t('settings.melody_pack_mesh') },
        { value: 'grid', label: t('settings.melody_pack_grid') },
        { value: 'beacon', label: t('settings.melody_pack_beacon') },
        { value: 'chime', label: t('settings.melody_pack_chime') },
      ],
      MESH_PLUS_FEATURES.melody_pack,
      state.config
    ),
    MELODY_PACK_IDS.includes(state.config.uiMelodyPack) ? state.config.uiMelodyPack : 'mesh',
    MESH_PLUS_FEATURES.melody_pack,
    state.config,
    async (id) => {
      state.config = await api.saveConfig({ uiMelodyPack: id });
      applySoundPrefsFromConfig(state.config);
    }
  );

  const previewLabels = {
    messageReceived: 'settings.sound_prev_message',
    messageSent: 'settings.sound_prev_sent',
    notify: 'settings.sound_prev_notify',
    incomingCall: 'settings.sound_prev_incoming',
    outgoingCall: 'settings.sound_prev_outgoing',
    callConnected: 'settings.sound_prev_connected',
    callEnd: 'settings.sound_prev_end',
    peerOnline: 'settings.sound_prev_online',
    groupInvite: 'settings.sound_prev_group',
    groupCallInvite: 'settings.sound_prev_group_call',
    meshPing: 'settings.sound_prev_ping',
  };

  function buildPreviewSection(titleKey, keys) {
    const sub = document.createElement('h3');
    sub.className = 'section-subtitle';
    sub.dataset.i18n = titleKey;
    sub.textContent = t(titleKey);
    const grid = document.createElement('div');
    grid.className = 'settings-sound-preview-grid';
    keys.forEach((key) => {
      const labelKey = previewLabels[key];
      if (!labelKey) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-lang settings-sound-preview-btn';
      btn.dataset.i18n = labelKey;
      btn.textContent = t(labelKey);
      btn.addEventListener('click', async () => {
        setSoundPrefs({
          enabled: true,
          volume: Number(volRange.value) / 100,
          soundPack: state.config.uiSoundPack,
          melodyPack: state.config.uiMelodyPack,
        });
        await sounds.preview(key);
      });
      grid.appendChild(btn);
    });
    return { sub, grid };
  }

  const fxPreview = buildPreviewSection('settings.sound_preview_fx', SOUND_PREVIEW_KEYS);
  const melodyPreview = buildPreviewSection(
    'settings.sound_preview_melody',
    MELODY_PREVIEW_KEYS
  );

  frag.appendChild(enableToggle.el);
  frag.appendChild(volLabel);
  frag.appendChild(volRow);
  frag.appendChild(
    buildSettingsFieldWithHint('settings.sound_pack', 'settings.sound_mesh_plus_hint', soundPackSelect)
  );
  frag.appendChild(buildSettingsField('settings.melody_pack', melodyPackSelect));
  const previewTitle = document.createElement('h3');
  previewTitle.className = 'section-subtitle';
  previewTitle.dataset.i18n = 'settings.sound_preview';
  previewTitle.textContent = t('settings.sound_preview');
  frag.appendChild(previewTitle);
  frag.appendChild(fxPreview.sub);
  frag.appendChild(fxPreview.grid);
  frag.appendChild(melodyPreview.sub);
  frag.appendChild(melodyPreview.grid);
  return frag;
}

async function ensureAudioDeviceLabels() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((tr) => tr.stop());
  } catch {
    /* labels may be empty without permission */
  }
}

async function listMediaDevices(kind) {
  await ensureAudioDeviceLabels();
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === kind);
}

function fillDeviceSelect(select, devices, currentId, defaultLabelKey, deviceLabelKey) {
  while (select.options.length > 1) select.remove(1);
  for (const d of devices) {
    const opt = document.createElement('option');
    opt.value = d.deviceId;
    opt.textContent =
      d.label || `${t(deviceLabelKey)} (${d.deviceId.slice(0, 8)}…)`;
    select.appendChild(opt);
  }
  const ok = [...select.options].some((o) => o.value === currentId);
  select.value = ok ? currentId : '';
}

function buildSettingsTransferPanel() {
  const frag = document.createElement('div');
  frag.className = 'settings-panel';

  appendSettingsPanelHeader(frag, 'settings.section_transfer', 'settings.transfer_hint');

  const limitSelect = buildThemedSelect();
  const limitOpts = FILE_LIMIT_GB_OPTIONS.map((gb) => ({
    value: String(gb),
    label: formatFileLimitLabel(gb, t),
  }));
  fillSettingsDropdown(
    limitSelect,
    limitOpts,
    String(normalizeFileLimitGb(state.config.maxFileTransferGb)),
    async (val) => {
      state.config = await api.saveConfig({ maxFileTransferGb: Number(val) });
    }
  );
  const speedSelect = buildThemedSelect();
  const speedOpts = FILE_TRANSFER_SPEED_IDS.map((id) => ({
    value: id,
    label: t(`settings.file_speed_${id}`),
  }));
  fillSettingsDropdown(
    speedSelect,
    speedOpts,
    normalizeFileTransferSpeed(state.config.fileTransferSpeed),
    async (val) => {
      state.config = await api.saveConfig({ fileTransferSpeed: val });
    }
  );
  frag.appendChild(
    buildSettingsFieldWithHint('settings.file_limit', 'settings.transfer_hint', limitSelect)
  );
  frag.appendChild(
    buildSettingsFieldWithHint('settings.file_speed', 'settings.file_speed_hint', speedSelect)
  );
  return frag;
}

function buildSettingsCallPanel() {
  const frag = document.createElement('div');
  frag.className = 'settings-panel';

  appendSettingsPanelHeader(frag, 'settings.section_call', 'settings.call_hint');

  const micTest = buildMicTestPanel(state.config, async (patch) => {
    state.config = await api.saveConfig(patch);
    return state.config;
  });
  frag.appendChild(micTest.el);

  const qualitySelect = buildThemedSelect('blip-select settings-call-select');
  const qOpts = STREAM_QUALITY_IDS.map((id) => ({
    value: id,
    label: t(`settings.stream_quality_${id}`),
  }));
  fillSettingsDropdown(
    qualitySelect,
    qOpts,
    normalizeStreamQuality(state.config.streamQuality),
    async (val) => {
      state.config = await api.saveConfig({ streamQuality: val });
    }
  );
  frag.appendChild(buildSettingsField('settings.stream_quality', qualitySelect));

  const fsSelect = buildThemedSelect('blip-select settings-call-select');
  fillSettingsDropdown(
    fsSelect,
    qOpts,
    normalizeFullscreenQuality(state.config),
    async (val) => {
      state.config = await api.saveConfig({ fullscreenQuality: val });
    }
  );
  frag.appendChild(buildSettingsField('settings.fullscreen_quality', fsSelect));

  const micSelect = buildThemedSelect('blip-select settings-call-select');
  const micDefault = document.createElement('option');
  micDefault.value = '';
  micDefault.dataset.i18n = 'settings.call_mic_default';
  micDefault.textContent = t('settings.call_mic_default');
  micSelect.appendChild(micDefault);

  const outSelect = buildThemedSelect('blip-select settings-call-select');
  const outDefault = document.createElement('option');
  outDefault.value = '';
  outDefault.dataset.i18n = 'settings.call_speaker_default';
  outDefault.textContent = t('settings.call_speaker_default');
  outSelect.appendChild(outDefault);

  async function populateDevices() {
    const inputs = await listMediaDevices('audioinput');
    const outputs = await listMediaDevices('audiooutput');
    fillDeviceSelect(
      micSelect,
      inputs,
      state.config.audioInputDeviceId || '',
      'settings.call_mic_default',
      'settings.call_mic_device'
    );
    fillDeviceSelect(
      outSelect,
      outputs,
      state.config.audioOutputDeviceId || '',
      'settings.call_speaker_default',
      'settings.call_speaker_device'
    );
  }

  micSelect.addEventListener('change', async () => {
    state.config = await api.saveConfig({ audioInputDeviceId: micSelect.value });
  });
  outSelect.addEventListener('change', async () => {
    state.config = await api.saveConfig({ audioOutputDeviceId: outSelect.value });
  });

  void populateDevices();

  const micTestWrap = document.createElement('div');
  micTestWrap.className = 'settings-mic-test';
  const micTestLabel = document.createElement('span');
  micTestLabel.className = 'settings-sub-label';
  micTestLabel.dataset.i18n = 'settings.call_mic_test_label';
  micTestLabel.textContent = t('settings.call_mic_test_label');

  const micTestActions = document.createElement('div');
  micTestActions.className = 'settings-mic-test-actions';

  const micTestBtn = document.createElement('button');
  micTestBtn.type = 'button';
  micTestBtn.className = 'btn btn-lang';
  micTestBtn.dataset.i18n = 'settings.call_mic_test';
  micTestBtn.textContent = t('settings.call_mic_test');

  const micTestStopBtn = document.createElement('button');
  micTestStopBtn.type = 'button';
  micTestStopBtn.className = 'btn btn-danger hidden';
  micTestStopBtn.dataset.i18n = 'settings.call_mic_test_stop';
  micTestStopBtn.textContent = t('settings.call_mic_test_stop');

  const micMeter = document.createElement('div');
  micMeter.className = 'settings-mic-meter hidden';
  for (let i = 0; i < 12; i++) {
    const bar = document.createElement('div');
    bar.className = 'settings-mic-bar';
    micMeter.appendChild(bar);
  }

  let micTestStream = null;
  let micTestRaf = 0;
  let micTestCtx = null;

  function stopMicTest() {
    if (micTestRaf) cancelAnimationFrame(micTestRaf);
    micTestRaf = 0;
    if (micTestStream) {
      micTestStream.getTracks().forEach((tr) => tr.stop());
      micTestStream = null;
    }
    if (micTestCtx) {
      void micTestCtx.close();
      micTestCtx = null;
    }
    micMeter.querySelectorAll('.settings-mic-bar').forEach((b) => b.classList.remove('lit'));
    micMeter.classList.add('hidden');
    micTestBtn.classList.remove('hidden');
    micTestStopBtn.classList.add('hidden');
  }

  micTestBtn.addEventListener('click', async () => {
    stopMicTest();
    const deviceId = micSelect.value;
    const audio =
      deviceId && deviceId !== 'default'
        ? { deviceId: { exact: deviceId } }
        : true;
    try {
      micTestStream = await navigator.mediaDevices.getUserMedia({ audio });
      micTestCtx = new AudioContext();
      const src = micTestCtx.createMediaStreamSource(micTestStream);
      const analyser = micTestCtx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const bins = new Uint8Array(analyser.frequencyBinCount);
      const bars = [...micMeter.querySelectorAll('.settings-mic-bar')];

      const tick = () => {
        analyser.getByteFrequencyData(bins);
        let sum = 0;
        for (let i = 0; i < bins.length; i++) sum += bins[i];
        const level = Math.min(1, sum / bins.length / 96);
        bars.forEach((bar, i) => {
          const threshold = (i + 1) / bars.length;
          bar.classList.toggle('lit', level >= threshold * 0.82);
        });
        micTestRaf = requestAnimationFrame(tick);
      };
      tick();
      micMeter.classList.remove('hidden');
      micTestBtn.classList.add('hidden');
      micTestStopBtn.classList.remove('hidden');
    } catch (err) {
      console.warn('[settings] mic test:', err.message);
      showAppToast({
        title: t('settings.call_mic_test_fail'),
        body: err?.message || '',
        durationMs: 4500,
        variant: 'danger',
      });
    }
  });

  micTestStopBtn.addEventListener('click', () => stopMicTest());
  micSelect.addEventListener('change', () => stopMicTest());

  micTestActions.appendChild(micTestBtn);
  micTestActions.appendChild(micTestStopBtn);
  micTestWrap.appendChild(micTestLabel);
  micTestWrap.appendChild(micTestActions);
  micTestWrap.appendChild(micMeter);

  frag.appendChild(buildSettingsField('settings.call_mic', micSelect));
  frag.appendChild(buildSettingsField('settings.call_speaker', outSelect));
  frag.appendChild(micTestWrap);
  return frag;
}

function buildSettingsNetworkPanel() {
  const frag = document.createElement('div');
  frag.className = 'settings-panel';

  appendSettingsPanelHeader(frag, 'settings.section_network');

  const clipOpts = CLIPBOARD_SYNC_MODES.map((id) => ({
    value: id,
    label: t(`clipboard.mode_${id}`),
  }));
  const clipSelect = buildThemedSelect();
  fillSettingsDropdown(
    clipSelect,
    clipOpts,
    normalizeClipboardSyncMode(state.config.clipboardSyncMode),
    async (mode) => {
      state.config = await api.saveConfig({ clipboardSyncMode: mode });
      restartClipboardSync();
    }
  );
  frag.appendChild(
    buildSettingsFieldWithHint('clipboard.mode', 'clipboard.hint', clipSelect)
  );

  const projClipRow = document.createElement('div');
  projClipRow.className = 'settings-toggle-with-hint';
  const projClipToggle = createPixelToggle({
    checked: !!state.config?.projectsClipboardEnabled,
    labelKey: 'settings.projects_clipboard',
    onChange: async (checked) => {
      if (checked) {
        const ok = await openConfirmDialog({
          title: t('settings.projects_clipboard'),
          body: t('settings.projects_clipboard_enable_confirm'),
        });
        if (!ok) {
          projClipToggle.input.checked = false;
          return;
        }
      }
      state.config = await api.saveConfig({ projectsClipboardEnabled: checked });
      showAppToast({
        title: checked
          ? t('settings.projects_clipboard_on')
          : t('settings.projects_clipboard_off'),
        durationMs: 4000,
      });
      if (state.view === 'projects') renderView('projects');
    },
  });
  projClipRow.appendChild(projClipToggle.el);
  projClipRow.appendChild(createPixelHintIcon('settings.projects_clipboard_hint'));
  frag.appendChild(projClipRow);

  const statsUi = appendSessionStatsSection(frag);

  const actions = document.createElement('div');
  actions.className = 'settings-network-actions';

  const refreshBtn = document.createElement('button');
  refreshBtn.type = 'button';
  refreshBtn.className = 'btn btn-lang';
  refreshBtn.dataset.i18n = 'settings.network_refresh';
  refreshBtn.textContent = t('settings.network_refresh');

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'btn btn-lang';
  copyBtn.dataset.i18n = 'settings.network_copy';
  copyBtn.textContent = t('settings.network_copy');

  actions.appendChild(refreshBtn);
  actions.appendChild(copyBtn);
  frag.appendChild(actions);

  const bodyHost = document.createElement('div');
  bodyHost.className = 'settings-network-body settings-list-panel settings-list-panel--auto';
  frag.appendChild(bodyHost);

  let lastDiagnostics = null;

  function formatDiagnosticsText(info) {
    const online = state.peers.filter((p) => p.online).length;
    const discovery = info.discoveryActive
      ? t('settings.network_discovery_on')
      : t('settings.network_discovery_off');
    return [
      `BLIP #${info.blipId ?? '—'}`,
      `${t('settings.network_hostname')}: ${info.hostname || '—'}`,
      `${t('settings.network_local_ip')}: ${info.localIp || '—'}`,
      `${t('settings.network_ipv4_all')}: ${(info.localIpv4s || []).join(', ') || '—'}`,
      `${t('settings.network_tcp')}: ${info.tcpPort ?? '—'}`,
      `${t('settings.network_udp')}: ${info.udpPort ?? '—'}`,
      `${t('settings.network_discovery')}: ${discovery}`,
      `${t('settings.network_peers')}: ${t('settings.network_peers_value')
        .replace('{online}', String(online))
        .replace('{total}', String(info.totalPeers ?? state.peers.length))}`,
    ].join('\n');
  }

  function renderDiagnostics(info) {
    bodyHost.innerHTML = '';
    lastDiagnostics = info;
    if (!info) {
      const err = document.createElement('p');
      err.className = 'hint';
      err.textContent = t('settings.network_unavailable');
      bodyHost.appendChild(err);
      return;
    }

    const list = document.createElement('dl');
    list.className = 'settings-network-list';

    function addRow(labelKey, value) {
      const dt = document.createElement('dt');
      dt.dataset.i18n = labelKey;
      dt.textContent = t(labelKey);
      const dd = document.createElement('dd');
      dd.textContent = value;
      list.appendChild(dt);
      list.appendChild(dd);
    }

    const online = state.peers.filter((p) => p.online).length;
    const discovery = info.discoveryActive
      ? t('settings.network_discovery_on')
      : t('settings.network_discovery_off');

    addRow('settings.network_blip_id', String(info.blipId ?? '—'));
    addRow('settings.network_hostname', info.hostname || '—');
    addRow('settings.network_local_ip', info.localIp || '—');
    addRow('settings.network_ipv4_all', (info.localIpv4s || []).join(', ') || '—');
    addRow('settings.network_tcp', String(info.tcpPort ?? '—'));
    addRow('settings.network_udp', String(info.udpPort ?? '—'));
    addRow('settings.network_discovery', discovery);
    addRow(
      'settings.network_peers',
      t('settings.network_peers_value')
        .replace('{online}', String(online))
        .replace('{total}', String(info.totalPeers ?? state.peers.length))
    );

    bodyHost.appendChild(list);

    const logTitle = document.createElement('h3');
    logTitle.className = 'section-subtitle';
    logTitle.dataset.i18n = 'settings.network_log';
    logTitle.textContent = t('settings.network_log');
    bodyHost.appendChild(logTitle);

    const logList = document.createElement('div');
    logList.className = 'network-log-list';

    function renderLog() {
      logList.innerHTML = '';
      const entries = getNetworkLogEntries();
      if (!entries.length) {
        const empty = document.createElement('p');
        empty.className = 'hint';
        empty.textContent = t('settings.network_log_empty');
        logList.appendChild(empty);
        return;
      }
      entries.slice(0, 24).forEach((e) => {
        const row = document.createElement('div');
        row.className = 'network-log-row';
        const time = new Date(e.ts).toLocaleTimeString();
        row.textContent = `${time} · #${e.peerId} · ${e.event}`;
        logList.appendChild(row);
      });
    }

    const clearLogBtn = document.createElement('button');
    clearLogBtn.type = 'button';
    clearLogBtn.className = 'btn btn-lang';
    clearLogBtn.textContent = t('settings.network_log_clear');
    clearLogBtn.addEventListener('click', () => {
      clearNetworkLog();
      renderLog();
    });

    bodyHost.appendChild(clearLogBtn);
    bodyHost.appendChild(logList);
    renderLog();
  }

  async function loadDiagnostics() {
    bodyHost.innerHTML = '';
    const loading = document.createElement('p');
    loading.className = 'hint';
    loading.textContent = '…';
    bodyHost.appendChild(loading);
    try {
      const info = await window.blip.getNetworkDiagnostics?.();
      renderDiagnostics(info);
    } catch {
      renderDiagnostics(null);
    }
  }

  refreshBtn.addEventListener('click', () => {
    void loadDiagnostics();
  });

  copyBtn.addEventListener('click', async () => {
    if (!lastDiagnostics) return;
    const text = formatDiagnosticsText(lastDiagnostics);
    const ok = await copyTextToClipboard(text);
    if (ok) {
      showAppToast({
        title: t('settings.network_copy_done'),
        durationMs: 2800,
      });
    } else {
      showAppToast({
        title: t('settings.network_copy_fail'),
        durationMs: 4000,
        variant: 'danger',
      });
    }
  });

  void loadDiagnostics();

  const statsRefreshTimer = setInterval(() => {
    statsUi?.refresh?.();
    if (state.config?.achievementsEnabled) syncAchievements(state.config);
  }, 60_000);

  frag._networkCleanup = () => clearInterval(statsRefreshTimer);

  return frag;
}

function buildSettingsShortcutsPanel() {
  const frag = document.createElement('div');
  frag.className = 'settings-panel settings-panel--shortcuts';

  appendSettingsPanelHeader(frag, 'settings.section_shortcuts');

  function addShortcutBlock(scopeKey, rows) {
    const sub = document.createElement('p');
    sub.className = 'settings-shortcuts-sub';
    sub.dataset.i18n = scopeKey;
    sub.textContent = t(scopeKey);
    frag.appendChild(sub);

    const list = document.createElement('dl');
    list.className = 'settings-shortcuts-list';
    for (const [key, keys] of rows) {
      const dt = document.createElement('dt');
      dt.dataset.i18n = key;
      dt.textContent = t(key);
      const dd = document.createElement('dd');
      dd.textContent = keys;
      list.appendChild(dt);
      list.appendChild(dd);
    }
    frag.appendChild(wrapInSettingsListPanel(list, 'settings-shortcuts-panel'));
  }

  addShortcutBlock('settings.shortcuts_main_scope', [
    ['settings.shortcuts_nav_dial', 'Alt+1'],
    ['settings.shortcuts_nav_peers', 'Alt+2'],
    ['settings.shortcuts_nav_chat', 'Alt+3'],
    ['settings.shortcuts_nav_settings', 'Alt+4'],
    ['settings.shortcuts_open_settings', 'Ctrl+,'],
    ['settings.shortcuts_chat_search', 'Ctrl+F'],
  ]);

  addShortcutBlock('settings.shortcuts_call_scope', [
    ['settings.shortcuts_mute', 'M'],
    ['settings.shortcuts_deafen', 'D'],
    ['settings.shortcuts_share', 'S'],
    ['settings.shortcuts_fullscreen', 'F'],
    ['settings.shortcuts_accept', 'Enter'],
    ['settings.shortcuts_end', 'Esc'],
  ]);

  addShortcutBlock('settings.shortcuts_global_scope', [
    ['settings.shortcuts_nav_dial', 'Alt+1'],
    ['settings.shortcuts_nav_peers', 'Alt+2'],
    ['settings.shortcuts_nav_chat', 'Alt+3'],
    ['settings.shortcuts_nav_settings', 'Alt+4'],
    ['settings.shortcuts_open_settings', 'Ctrl+,'],
    ['settings.shortcuts_toggle_dnd', 'Ctrl+Shift+D'],
    ['settings.shortcuts_hangup_global', 'Ctrl+Shift+End'],
  ]);

  const globalRow = document.createElement('div');
  globalRow.className = 'settings-toggle-with-hint';
  const globalToggle = createPixelToggle({
    checked: state.config.globalShortcutsEnabled !== false,
    labelKey: 'settings.shortcuts_global_enable',
    onChange: async (checked) => {
      state.config = await api.saveConfig({ globalShortcutsEnabled: checked });
      showAppToast({
        title: checked
          ? t('settings.shortcuts_global_on')
          : t('settings.shortcuts_global_off'),
        durationMs: 3200,
      });
    },
  });
  globalRow.appendChild(globalToggle.el);
  globalRow.appendChild(createPixelHintIcon('settings.shortcuts_global_hint'));
  frag.appendChild(globalRow);

  return frag;
}

function buildSettingsDeveloperPanel() {
  const frag = document.createElement('div');
  frag.className = 'settings-panel settings-panel--developer';

  frag.appendChild(buildPanelTitleRow('settings.section_developer', 'settings.dev_panel_hint'));

  const projRow = document.createElement('div');
  projRow.className = 'settings-toggle-with-hint';
  const projToggle = createPixelToggle({
    checked: !!state.config?.devProjectsEnabled,
    labelKey: 'settings.dev_projects',
    onChange: async (checked) => {
      state.config = await api.saveConfig({ devProjectsEnabled: checked });
      if (!checked) {
        projectsViewInstance?.destroy?.();
        projectsViewInstance = null;
      }
      showAppToast({
        title: checked ? t('settings.dev_projects_on') : t('settings.dev_projects_off'),
        durationMs: 4200,
      });
      render();
    },
  });
  projRow.appendChild(projToggle.el);
  projRow.appendChild(createPixelHintIcon('settings.dev_projects_hint'));
  frag.appendChild(projRow);

  const groupsRow = document.createElement('div');
  groupsRow.className = 'settings-toggle-with-hint';
  const groupsToggle = createPixelToggle({
    checked: !!state.config?.devGroupsEnabled,
    labelKey: 'settings.dev_groups',
    onChange: async (checked) => {
      state.config = await api.saveConfig({ devGroupsEnabled: checked });
      showAppToast({
        title: checked ? t('settings.dev_groups_on') : t('settings.dev_groups_off'),
        durationMs: 4500,
      });
      render();
    },
  });
  groupsRow.appendChild(groupsToggle.el);
  groupsRow.appendChild(createPixelHintIcon('settings.dev_groups_hint'));
  frag.appendChild(groupsRow);

  const betaRow = document.createElement('div');
  betaRow.className = 'settings-toggle-with-hint';
  const betaToggle = createPixelToggle({
    checked: !!state.config?.receiveBetaUpdates,
    labelKey: 'settings.dev_beta_updates',
    onChange: async (checked) => {
      state.config = await api.saveConfig({ receiveBetaUpdates: checked });
      if (state.config?.achievementsEnabled) syncAchievements(state.config);
      showAppToast({
        title: checked ? t('settings.dev_beta_on') : t('settings.dev_beta_off'),
        durationMs: 4000,
      });
    },
  });
  betaRow.appendChild(betaToggle.el);
  betaRow.appendChild(createPixelHintIcon('settings.dev_hint'));
  frag.appendChild(betaRow);

  const traceRow = document.createElement('div');
  traceRow.className = 'settings-toggle-with-hint';
  const traceToggle = createPixelToggle({
    checked: !!state.config?.devMeshTrace,
    labelKey: 'settings.dev_mesh_trace',
    onChange: async (checked) => {
      state.config = await api.saveConfig({ devMeshTrace: checked });
      showAppToast({
        title: checked ? t('settings.dev_mesh_trace_on') : t('settings.dev_mesh_trace_off'),
        durationMs: 3200,
      });
    },
  });
  traceRow.appendChild(traceToggle.el);
  traceRow.appendChild(createPixelHintIcon('settings.dev_mesh_trace_hint'));
  frag.appendChild(traceRow);

  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.className = 'btn btn-lang';
  exportBtn.dataset.i18n = 'settings.dev_export';
  exportBtn.textContent = t('settings.dev_export');
  exportBtn.addEventListener('click', async () => {
    let net = null;
    try {
      net = await window.blip.getNetworkDiagnostics?.();
    } catch {
      /* ignore */
    }
    const payload = {
      exportedAt: new Date().toISOString(),
      version: (await window.blip.getAppMetadata?.())?.version,
      blipId: state.config.blipId,
      network: net,
      peers: state.peers.map((p) => ({
        id: p.blipId,
        online: p.online,
        name: p.displayName,
      })),
      networkLog: getNetworkLogEntries(),
    };
    const ok = await copyTextToClipboard(JSON.stringify(payload, null, 2));
    showAppToast({
      title: ok ? t('settings.dev_export_done') : t('settings.dev_export_fail'),
      durationMs: 4000,
      variant: ok ? undefined : 'danger',
    });
  });
  frag.appendChild(exportBtn);

  const clearMeshBtn = document.createElement('button');
  clearMeshBtn.type = 'button';
  clearMeshBtn.className = 'btn btn-danger';
  clearMeshBtn.dataset.i18n = 'settings.dev_clear_mesh_plus';
  clearMeshBtn.textContent = t('settings.dev_clear_mesh_plus');
  clearMeshBtn.addEventListener('click', async () => {
    if (!premiumTierEnabled(state.config)) {
      showAppToast({
        title: t('settings.dev_clear_mesh_plus_none'),
        durationMs: 4000,
      });
      return;
    }
    try {
      await window.blip.deactivateMeshPlus();
      state.config = await window.blip.getConfig();
      showAppToast({
        title: t('settings.dev_clear_mesh_plus_ok'),
        durationMs: 4500,
      });
      if (state.view === 'settings') renderView('settings');
      if (state.view === 'peers') renderView('peers');
    } catch (e) {
      showAppToast({
        title: e?.message || t('settings.dev_clear_mesh_plus_fail'),
        durationMs: 4500,
        variant: 'danger',
      });
    }
  });
  frag.appendChild(clearMeshBtn);

  const factoryRow = document.createElement('div');
  factoryRow.className = 'settings-toggle-with-hint settings-dev-factory-row';
  const factoryBtn = document.createElement('button');
  factoryBtn.type = 'button';
  factoryBtn.className = 'btn btn-danger';
  factoryBtn.dataset.i18n = 'settings.dev_factory_reset';
  factoryBtn.textContent = t('settings.dev_factory_reset');
  factoryBtn.addEventListener('click', async () => {
    const ok = await openConfirmDialog({
      title: t('settings.dev_factory_reset'),
      body: t('settings.dev_factory_reset_confirm'),
      confirmLabel: t('settings.dev_factory_reset'),
      danger: true,
    });
    if (!ok) return;
    try {
      await applyFactoryReset();
      showAppToast({
        title: t('settings.dev_factory_reset_ok'),
        durationMs: 5000,
      });
    } catch (e) {
      showAppToast({
        title: e?.message || t('settings.dev_factory_reset_fail'),
        durationMs: 4500,
        variant: 'danger',
      });
    }
  });
  factoryRow.appendChild(factoryBtn);
  factoryRow.appendChild(createPixelHintIcon('settings.dev_factory_reset_hint'));
  frag.appendChild(factoryRow);

  return frag;
}

async function applyFactoryReset() {
  for (const chat of state.chatViews.values()) {
    chat?.destroy?.();
  }
  state.chatViews.clear();
  for (const gc of state.groupChatViews.values()) {
    gc?.destroy?.();
  }
  state.groupChatViews.clear();
  projectsViewInstance?.destroy?.();
  projectsViewInstance = null;
  clearProfileNavigationState();
  stopClipboardSync();
  clearRendererLocalStorage();
  resetRendererMemoryStores();

  const res = await window.blip.factoryReset?.();
  if (!res?.ok) throw new Error(t('settings.dev_factory_reset_fail'));

  state.config = res.config || (await window.blip.getConfig());
  state.peers = [];
  state.occupiedIds = [];
  state.activePeer = null;
  state.activeGroup = null;
  state.settingsSection = null;
  state.view = 'grid';
  unreadByGroup.clear();
  lastUpdateStatus = null;

  initPeerTrust(state.config, api);
  purgeGroupsFor(state.config.blipId);
  applySoundPrefsFromConfig(state.config);
  applyAppearance(state.config);
  applyReactiveWallpaperConfig(state.config);
  setAchievementConfigProvider(() => state.config);
  void loadSelfAvatarFromMain();
  restartClipboardSync();
  render();
}

function buildSettingsAboutPanel() {
  const frag = document.createElement('div');
  frag.className = 'settings-panel settings-panel--about';

  const hero = document.createElement('div');
  hero.className = 'settings-about-hero';
  const icon = document.createElement('img');
  icon.className = 'settings-about-icon';
  icon.alt = 'BLIP';
  void (async () => {
    try {
      const url = await window.blip.getAppIconUrl?.();
      if (url) icon.src = url;
    } catch {
      /* ignore */
    }
  })();
  hero.appendChild(icon);

  const aboutLine = document.createElement('p');
  aboutLine.className = 'settings-about-line';

  const aboutVersion = document.createElement('p');
  aboutVersion.className = 'settings-about-version';
  hero.appendChild(aboutLine);
  hero.appendChild(aboutVersion);
  frag.appendChild(hero);

  let aboutTrustNotice = appendAboutBuildTrustNotice(frag);
  window.blip?.onTrustState?.(() => {
    aboutTrustNotice?.remove();
    aboutTrustNotice = appendAboutBuildTrustNotice(frag);
  });

  const githubBtn = document.createElement('button');
  githubBtn.type = 'button';
  githubBtn.className = 'btn btn-lang';
  githubBtn.dataset.i18n = 'settings.github';
  githubBtn.textContent = t('settings.github');

  window.blip.getAppMetadata?.().then((meta) => {
    const name = meta?.displayName || 'BLIP';
    aboutLine.textContent = name;
    const code = meta?.codename ? ` · ${meta.codename}` : '';
    aboutVersion.textContent = `v${formatAppVersion(meta)}${code}`;
    if (meta?.githubUrl) {
      githubBtn.addEventListener('click', () => window.blip.openExternal?.(meta.githubUrl));
    } else {
      githubBtn.disabled = true;
    }
  }).catch(() => {});

  const actionsCol = document.createElement('div');
  actionsCol.className = 'settings-about-actions';

  const changelogBtn = document.createElement('button');
  changelogBtn.type = 'button';
  changelogBtn.className = 'btn btn-lang';
  changelogBtn.dataset.i18n = 'settings.changelog';
  changelogBtn.textContent = t('settings.changelog');
  changelogBtn.addEventListener('click', () => {
    window.blip.openExternal?.('https://github.com/krwg/BLIP/blob/main/CHANGELOG.md');
  });

  const releasesAboutBtn = document.createElement('button');
  releasesAboutBtn.type = 'button';
  releasesAboutBtn.className = 'btn btn-lang';
  releasesAboutBtn.dataset.i18n = 'settings.updates_releases';
  releasesAboutBtn.textContent = t('settings.updates_releases');
  releasesAboutBtn.addEventListener('click', () => {
    window.blip.openExternal?.('https://github.com/krwg/BLIP/releases');
  });

  const linkRow = document.createElement('div');
  linkRow.className = 'settings-about-links';
  linkRow.appendChild(changelogBtn);
  linkRow.appendChild(releasesAboutBtn);

  actionsCol.appendChild(githubBtn);
  actionsCol.appendChild(linkRow);
  frag.appendChild(actionsCol);
  return frag;
}

function buildSettingsSystemPanel() {
  const frag = document.createElement('div');
  frag.className = 'settings-panel';

  appendSettingsPanelHeader(frag, 'settings.section_system');

  const tray = buildCloseToTraySection();
  if (tray) {
    frag.appendChild(tray);
  }
  const autostart = buildLaunchAtLoginSection();
  if (autostart) {
    frag.appendChild(autostart);
  }
  if (!tray && !autostart) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.dataset.i18n = 'settings.system_na';
    p.textContent = t('settings.system_na');
    frag.appendChild(p);
  }
  return frag;
}

function buildAppearancePanelWithTitle() {
  const wrap = document.createElement('div');
  wrap.className = 'settings-panel';
  appendSettingsPanelHeader(wrap, 'settings.section_appearance');
  wrap.appendChild(buildAppearanceSection());
  return wrap;
}

function formatUpdateStatusText() {
  const u = lastUpdateStatus;
  if (!u) return t('settings.updates_status_idle');
  switch (u.state) {
    case 'checking':
      return t('settings.updates_status_checking');
    case 'none':
      return t('settings.updates_status_latest');
    case 'available':
      return t('settings.updates_status_available').replace('{v}', u.version || '—');
    case 'progress':
      return t('settings.updates_status_progress').replace('{p}', String(u.percent ?? 0));
    case 'downloaded':
      return t('settings.updates_status_downloaded').replace('{v}', u.version || '—');
    case 'error':
      if (u.code === 'stale_release') {
        return t('settings.updates_status_stale_release');
      }
      if (u.code === 'unsigned_installer') {
        return t('settings.updates_status_unsigned');
      }
      return t('settings.updates_status_error').replace('{m}', u.message || '');
    default:
      return t('settings.updates_status_idle');
  }
}

function buildSettingsUpdatesPanel() {
  const frag = document.createElement('div');
  frag.className = 'settings-panel settings-panel--updates';

  appendSettingsPanelHeader(frag, 'settings.section_updates');

  const autoTitle = document.createElement('h3');
  autoTitle.className = 'section-subtitle';
  autoTitle.dataset.i18n = 'settings.updates_auto_title';
  autoTitle.textContent = t('settings.updates_auto_title');

  const autoHintRow = document.createElement('div');
  autoHintRow.className = 'settings-label-row';
  autoHintRow.appendChild(autoTitle);
  autoHintRow.appendChild(createPixelHintIcon('settings.updates_auto_hint'));
  frag.appendChild(autoHintRow);

  frag.appendChild(
    createPixelToggle({
      checked: state.config.autoDownloadUpdates !== false,
      labelKey: 'settings.updates_auto_download',
      onChange: async (checked) => {
        state.config = await api.saveConfig({ autoDownloadUpdates: checked });
      },
    }).el
  );

  const verLine = document.createElement('p');
  verLine.className = 'settings-about-version';
  frag.appendChild(verLine);

  const statusLine = document.createElement('p');
  statusLine.className = 'settings-update-status';
  frag.appendChild(statusLine);

  const actions = document.createElement('div');
  actions.className = 'settings-updates-actions';

  const checkBtn = document.createElement('button');
  checkBtn.type = 'button';
  checkBtn.className = 'btn btn-accent';
  checkBtn.disabled = true;
  checkBtn.dataset.i18n = 'settings.updates_check';
  checkBtn.textContent = t('settings.updates_check');
  checkBtn.addEventListener('click', async () => {
    if (!window.blip.checkForUpdates) return;
    lastUpdateStatus = { state: 'checking' };
    delete statusLine.dataset.i18n;
    statusLine.textContent = formatUpdateStatusText();
    const r = await window.blip.checkForUpdates();
    if (r?.skipped) {
      lastUpdateStatus = null;
      statusLine.dataset.i18n = 'settings.updates_dev_only';
      statusLine.textContent = t('settings.updates_dev_only');
    } else {
      statusLine.textContent = formatUpdateStatusText();
    }
  });

  const releasesBtn = document.createElement('button');
  releasesBtn.type = 'button';
  releasesBtn.className = 'btn btn-lang';
  releasesBtn.dataset.i18n = 'settings.updates_releases';
  releasesBtn.textContent = t('settings.updates_releases');
  releasesBtn.addEventListener('click', () => {
    window.blip.openExternal?.('https://github.com/krwg/BLIP/releases');
  });

  const installBtn = document.createElement('button');
  installBtn.type = 'button';
  installBtn.className = 'btn btn-lang';
  installBtn.dataset.i18n = 'settings.updates_install';
  installBtn.textContent = t('settings.updates_install');
  installBtn.disabled = lastUpdateStatus?.state !== 'downloaded';
  installBtn.addEventListener('click', () => {
    window.blip.quitAndInstall?.();
  });

  actions.appendChild(checkBtn);
  actions.appendChild(releasesBtn);
  actions.appendChild(installBtn);
  frag.appendChild(actions);

  const releasesTitle = document.createElement('h3');
  releasesTitle.className = 'section-subtitle';
  releasesTitle.dataset.i18n = 'settings.updates_recent';
  releasesTitle.textContent = t('settings.updates_recent');
  frag.appendChild(releasesTitle);

  const releasesFeed = document.createElement('div');
  releasesFeed.className = 'settings-releases-feed settings-list-panel settings-list-panel--tall';
  releasesFeed.textContent = '…';
  frag.appendChild(releasesFeed);

  function formatReleaseDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString();
    } catch {
      return '';
    }
  }

  function excerptBody(body, max = 220) {
    if (!body) return '';
    const one = body.replace(/\r\n/g, '\n').trim();
    if (one.length <= max) return one;
    return `${one.slice(0, max).trim()}…`;
  }

  void window.blip.getGithubReleases?.(8).then((result) => {
    releasesFeed.innerHTML = '';
    if (!result?.ok || !result.releases?.length) {
      const err = document.createElement('p');
      err.className = 'hint';
      err.dataset.i18n = 'settings.updates_releases_error';
      err.textContent = t('settings.updates_releases_error');
      releasesFeed.appendChild(err);
      return;
    }
    const feed = filterReleasesForChannel(result.releases, !!state.config?.receiveBetaUpdates);
    for (const r of feed) {
      const card = document.createElement('article');
      card.className = 'settings-release-card';

      const head = document.createElement('div');
      head.className = 'settings-release-head';
      const tag = document.createElement('strong');
      tag.textContent = r.tag || r.name || '—';
      const date = document.createElement('span');
      date.className = 'settings-release-date';
      date.textContent = formatReleaseDate(r.publishedAt);
      head.appendChild(tag);
      if (r.prerelease) {
        const pre = document.createElement('span');
        pre.className = 'settings-release-pre';
        pre.dataset.i18n = 'settings.release_pre';
        pre.textContent = t('settings.release_pre');
        head.appendChild(pre);
      }
      head.appendChild(date);
      card.appendChild(head);

      if (r.name && r.name !== r.tag) {
        const title = document.createElement('p');
        title.className = 'settings-release-name';
        title.textContent = r.name;
        card.appendChild(title);
      }

      if (r.body) {
        const body = document.createElement('p');
        body.className = 'settings-release-body';
        body.textContent = excerptBody(r.body);
        card.appendChild(body);
      }

      if (r.url) {
        const link = document.createElement('button');
        link.type = 'button';
        link.className = 'btn btn-lang settings-release-link';
        link.dataset.i18n = 'settings.updates_open_release';
        link.textContent = t('settings.updates_open_release');
        link.addEventListener('click', () => window.blip.openExternal?.(r.url));
        card.appendChild(link);
      }

      releasesFeed.appendChild(card);
    }
  }).catch(() => {
    releasesFeed.innerHTML = '';
    const err = document.createElement('p');
    err.className = 'hint';
    err.textContent = t('settings.updates_releases_error');
    releasesFeed.appendChild(err);
  });

  window.blip.getAppMetadata?.().then((meta) => {
    verLine.textContent = `v${formatAppVersion(meta)}`;
    if (!meta?.isPackaged) {
      statusLine.dataset.i18n = 'settings.updates_dev_only';
      statusLine.textContent = t('settings.updates_dev_only');
      checkBtn.disabled = true;
      installBtn.disabled = true;
    } else {
      checkBtn.disabled = false;
      delete statusLine.dataset.i18n;
      statusLine.textContent = formatUpdateStatusText();
      installBtn.disabled = lastUpdateStatus?.state !== 'downloaded';
    }
  }).catch(() => {});

  return frag;
}

function buildSettingsPlaceholderPanel() {
  const wrap = document.createElement('div');
  wrap.className = 'settings-panel settings-panel--empty';

  const h = document.createElement('h2');
  h.className = 'section-title';
  h.dataset.i18n = 'settings.title';
  h.textContent = t('settings.title');

  const p = document.createElement('p');
  p.className = 'hint';
  p.dataset.i18n = 'settings.pick_section_hint';
  p.textContent = t('settings.pick_section_hint');

  wrap.appendChild(h);
  wrap.appendChild(p);
  return wrap;
}

function runSettingsPanelCleanup() {
  settingsPanelCleanup?.();
  settingsPanelCleanup = null;
}

function attachSettingsPanelCleanup(frag) {
  const cleanups = [];
  if (typeof frag._profileCleanup === 'function') cleanups.push(frag._profileCleanup);
  if (typeof frag._meshPlusCleanup === 'function') cleanups.push(frag._meshPlusCleanup);
  if (typeof frag._networkCleanup === 'function') cleanups.push(frag._networkCleanup);
  if (cleanups.length) {
    frag._settingsCleanup = () => cleanups.forEach((fn) => fn());
  }
  return frag;
}

function appendSettingsPanelHeader(frag, labelKey, hintKey) {
  frag.appendChild(hintKey ? buildPanelTitleRow(labelKey, hintKey) : buildPanelTitleRow(labelKey));
}

function renderSettingsMainPanel() {
  runSettingsPanelCleanup();
  if (state.settingsSection == null) {
    settingsPanelCleanup = null;
    return buildSettingsPlaceholderPanel();
  }
  const section = state.settingsSection;
  let frag;
  switch (section) {
    case 'profile':
      frag = buildSettingsProfilePanel();
      break;
    case 'achievements':
      frag = buildSettingsAchievementsPanel(state, api);
      break;
    case 'mesh_plus':
      frag = buildSettingsMeshPlusPanel(state, () => {
        applyAppearance(state.config);
        applySoundPrefsFromConfig(state.config);
        ensureProjectsView().refreshMeshPlus?.();
        syncAchievements(state.config);
        if (state.view === 'peers') renderView('peers');
        if (state.view === 'settings') renderView('settings');
      });
      break;
    case 'language':
      frag = buildSettingsLanguagePanel();
      break;
    case 'notifications':
      frag = buildSettingsNotificationsPanel();
      break;
    case 'privacy':
      frag = buildSettingsPrivacyPanel();
      break;
    case 'sound':
      frag = buildSettingsSoundPanel();
      break;
    case 'shortcuts':
      frag = buildSettingsShortcutsPanel();
      break;
    case 'call':
      frag = buildSettingsCallPanel();
      break;
    case 'transfer':
      frag = buildSettingsTransferPanel();
      break;
    case 'appearance':
      frag = buildAppearancePanelWithTitle();
      break;
    case 'network':
      frag = buildSettingsNetworkPanel();
      break;
    case 'system':
      frag = buildSettingsSystemPanel();
      break;
    case 'updates':
      frag = buildSettingsUpdatesPanel();
      break;
    case 'developer':
      frag = buildSettingsDeveloperPanel();
      break;
    case 'about':
      frag = buildSettingsAboutPanel();
      break;
    default:
      return buildSettingsPlaceholderPanel();
  }
  attachSettingsPanelCleanup(frag);
  settingsPanelCleanup = frag._settingsCleanup || null;
  return frag;
}

function renderSettingsNavAside() {
  return renderSettingsNavGroups(
    state,
    (id) => {
      if (id === state.settingsSection) return;
      state.settingsSection = id;
      renderView('settings');
    },
    getSettingsSectionIds
  );
}

function renderSettingsView() {
  const wrap = document.createElement('div');
  wrap.className = 'view settings-view';

  const shell = document.createElement('div');
  shell.className = 'settings-shell';

  const aside = renderSettingsNavAside();
  const main = document.createElement('div');
  main.className = 'settings-shell__main';
  main.appendChild(renderSettingsMainPanel());

  shell.appendChild(aside);
  shell.appendChild(main);
  wrap.appendChild(shell);
  return wrap;
}

function ensureMainContent(gridOnly = false) {
  if (mainContent?.isConnected) return;

  rootEl.querySelector('.app-body')?.remove();
  const body = document.createElement('div');
  body.className = gridOnly ? 'app-body app-body--grid' : 'app-body';
  mainContent = document.createElement('main');
  mainContent.className = 'main-content';
  body.appendChild(mainContent);
  rootEl.appendChild(body);
}

function showGridView(isChange = false) {
  ensureMainContent(true);
  mainContent.innerHTML = '';
  const prevId = state.config.blipId;

  gridComponent = createIdGrid({
    occupiedIds: state.occupiedIds.filter((id) => id !== prevId),
    selectedId: prevId,
    onSelect: async (id, confirmed) => {
      if (!confirmed) {
        gridComponent.setSelected(id);
        return;
      }

      const conflict = await window.blip.checkIdConflict(id);
      if (conflict.taken) {
        showError(t('error.id_taken'), t('error.id_taken_hint'));
        return;
      }

      state.config.blipId = id;
      await api.saveConfig({ blipId: id });
      gridComponent.setSelected(id);

      setTimeout(() => {
        if (isChange) {
          state.settingsSection = 'profile';
          renderView('settings');
        } else {
          render();
        }
      }, 400);
    },
  });

  mainContent.appendChild(gridComponent.el);
  applyI18n(mainContent);
}

function showError(title, hint) {
  const box = document.createElement('div');
  box.className = 'error-toast glass';
  box.innerHTML = `<strong>${title}</strong><p>${hint}</p>`;
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 4000);
}

function formatPeerPulseLine(peer) {
  const lat = peerLatencyMs.get(peer.blipId);
  if (lat != null) {
    return t('peers.pulse_ms').replace('{ms}', String(lat));
  }
  if (peer.online) return t('peers.pulse_pending');
  return t('peers.pulse_offline');
}

function refreshPeerPulseDom() {
  if (state.view !== 'peers' || !mainContent?.isConnected) return;
  mainContent.querySelectorAll('[data-peer-pulse]').forEach((el) => {
    const id = Number(el.dataset.peerPulse);
    const peer = state.peers.find((p) => p.blipId === id);
    if (!peer) return;
    el.textContent = formatPeerSubline(peer);
    el.classList.toggle('peer-pulse--status', !!(peer.online && (peer.presenceText || '').trim()));
    el.classList.toggle('peer-pulse--live', peer.online && peerLatencyMs.has(id));
    el.classList.toggle('peer-pulse--offline', !peer.online);
  });
}

async function pingPeerSilent(blipId) {
  if (!window.blip?.pingPeer) return;
  try {
    const result = await window.blip.pingPeer(blipId);
    if (result?.ok && result.ms != null) {
      peerLatencyMs.set(blipId, result.ms);
    } else {
      peerLatencyMs.delete(blipId);
    }
  } catch {
    peerLatencyMs.delete(blipId);
  }
}

async function runMeshPulseRound() {
  if (!state.config?.blipId) return;
  const targets = state.peers.filter((p) => p.online && !isBlocked(p.blipId));
  await Promise.all(targets.map((p) => pingPeerSilent(p.blipId)));
  refreshPeerPulseDom();
}

function startMeshPulse() {
  if (!state.config?.blipId) return;
  if (meshPulseTimer) return;
  void runMeshPulseRound();
  meshPulseTimer = setInterval(() => {
    void runMeshPulseRound();
  }, MESH_PULSE_INTERVAL_MS);
}

function stopMeshPulse() {
  if (meshPulseTimer) {
    clearInterval(meshPulseTimer);
    meshPulseTimer = null;
  }
}

async function runPeerPing(peer) {
  if (!peer?.online || !window.blip?.pingPeer) {
    showAppToast({ title: t('peers.ping_fail'), variant: 'danger', durationMs: 4000 });
    return;
  }
  const result = await window.blip.pingPeer(peer.blipId);
  if (result?.ok && result.ms != null) {
    peerLatencyMs.set(peer.blipId, result.ms);
    if (!state.config?.doNotDisturb) sounds.meshPing();
    showAppToast({
      title: t('peers.ping_ok'),
      body: t('peers.ping_ok_body').replace('{ms}', String(result.ms)),
      durationMs: 4000,
    });
    refreshPeerPulseDom();
  } else {
    peerLatencyMs.delete(peer.blipId);
    showAppToast({ title: t('peers.ping_fail'), variant: 'danger', durationMs: 4000 });
    refreshPeerPulseDom();
  }
}

function mountMainContentView(el) {
  if (!mainContent || !el) return;
  const current = mainContent.firstElementChild;
  if (current === el && el.isConnected) return;
  if (state.view === 'settings') runSettingsPanelCleanup();
  profilePageCleanup?.();
  mainContent.replaceChildren(el);
  applyI18n(mainContent);
  updateNavActive();
}

async function openChat(peerId) {
  const id = Number(peerId);
  if (!Number.isFinite(id)) return;

  if (isBlocked(id)) {
    showAppToast({ title: t('peers.blocked_chat'), durationMs: 5000 });
    return;
  }

  clearProfileNavigationState();
  state.activePeer = id;
  state.activeGroup = null;
  state.view = 'chat';
  clearUnread(id);
  const chat = ensureChatView(id);
  if (!chat) return;
  chat.markRead?.();
  if (mainContent?.isConnected) {
    mountMainContentView(chat.el);
    chat.renderMessages?.();
    chat.scrollToBottom?.();
  } else {
    render();
  }
}

function renderProjectsView() {
  const view = ensureProjectsView().el;
  view.classList.add('view', 'projects-workspace-view');
  return view;
}

function renderChatHubView() {
  clearInviteUnread();
  const wrap = document.createElement('div');
  wrap.className = 'view chat-hub-view';

  const title = document.createElement('h2');
  title.className = 'section-title';
  title.dataset.i18n = 'chat.title';
  title.textContent = t('chat.title');

  const list = document.createElement('div');
  list.className = 'chat-hub-list';

  const pendingInvites = getPendingGroupInvites();
  if (pendingInvites.length) {
    const invSection = document.createElement('div');
    invSection.className = 'chat-hub-invites-section';
    const invTitle = document.createElement('h3');
    invTitle.className = 'chat-hub-invites-title';
    invTitle.dataset.i18n = 'group.invite_section';
    invTitle.textContent = t('group.invite_section');
    invSection.appendChild(invTitle);

    pendingInvites.forEach((inv) => {
      const card = document.createElement('div');
      card.className = 'chat-hub-invite glass';
      const body = document.createElement('div');
      body.className = 'chat-hub-invite-body';
      const line1 = document.createElement('span');
      line1.className = 'chat-hub-invite-name';
      line1.textContent = t('group.invite_card_title')
        .replace('{name}', inv.name || t('group.unnamed'))
        .replace('{host}', String(inv.hostId ?? inv.from));
      const line2 = document.createElement('span');
      line2.className = 'chat-hub-invite-meta';
      line2.textContent = t('group.invite_card_meta').replace(
        '{n}',
        String(inv.members?.length || 0)
      );
      body.appendChild(line1);
      body.appendChild(line2);
      const actions = document.createElement('div');
      actions.className = 'chat-hub-invite-actions';
      const joinBtn = document.createElement('button');
      joinBtn.type = 'button';
      joinBtn.className = 'btn btn-accent';
      joinBtn.textContent = t('group.invite_card_join');
      const declineBtn = document.createElement('button');
      declineBtn.type = 'button';
      declineBtn.className = 'btn btn-lang';
      declineBtn.textContent = t('group.invite_card_decline');
      joinBtn.addEventListener('click', async () => {
        try {
          const g = await acceptGroupInvite(api, state.config, inv);
          clearInviteUnread();
          openGroupChat(g.id);
        } catch (err) {
          console.error('[group invite] accept', err);
        }
      });
      declineBtn.addEventListener('click', async () => {
        await declineGroupInviteFlow(api, state.config, inv);
        if (state.view === 'chat' && !state.activePeer && !state.activeGroup) renderView('chat');
      });
      actions.appendChild(joinBtn);
      actions.appendChild(declineBtn);
      card.appendChild(body);
      card.appendChild(actions);
      invSection.appendChild(card);
    });
    list.appendChild(invSection);
  }

  getGroupsFor(state.config.blipId).forEach((group) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'chat-hub-row glass chat-hub-row--group online';
    const avatar = createGroupAvatarElement(group.id, 2);
    const info = document.createElement('div');
    info.className = 'chat-hub-info';
    const name = document.createElement('span');
    name.className = 'peer-name';
    name.textContent = groupDisplayName(group);
    const sub = document.createElement('span');
    sub.className = 'peer-id';
    sub.textContent = t('group.hub_sub').replace('{n}', String(group.members.length));
    info.appendChild(name);
    info.appendChild(sub);
    const msgs = getGroupMessages(group.id);
    const last = msgs[msgs.length - 1];
    if (last) {
      const preview = document.createElement('span');
      preview.className = 'chat-hub-preview';
      preview.textContent = (last.text || '').slice(0, 48);
      info.appendChild(preview);
    }
    let voiceCount = 0;
    for (const ch of getVoiceChannels(group)) {
      const snap = getVoiceChannelRoster(group.id, ch.id);
      if (snap.count > voiceCount) voiceCount = snap.count;
    }
    const dot = document.createElement('span');
    dot.className = voiceCount > 0 ? 'status-dot online' : 'status-dot offline';
    dot.title = voiceCount > 0 ? t('group.call_ongoing_hub') : '';
    item.appendChild(avatar);
    item.appendChild(info);
    item.appendChild(dot);
    const unread = unreadByGroup.get(group.id) || 0;
    if (unread > 0) {
      const ub = document.createElement('span');
      ub.className = 'chat-hub-unread';
      ub.textContent = unread > 99 ? '99+' : String(unread);
      item.appendChild(ub);
    }
    item.addEventListener('click', () => openGroupChat(group.id));
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showGroupContextMenu(e, group);
    });
    list.appendChild(item);
  });

  const peerIds = new Set();
  state.peers.forEach((p) => peerIds.add(p.blipId));
  for (const id of state.chatViews.keys()) peerIds.add(id);

  const rows = [...peerIds]
    .filter((id) => !isBlocked(id))
    .map((id) => {
      const peer = state.peers.find((p) => p.blipId === id);
      const msgs = getMessages(id);
      return {
        blipId: id,
        displayName: formatPeerDisplayName(peer, id),
        online: peer?.online ?? false,
        lastMsg: msgs[msgs.length - 1],
      };
    })
    .sort((a, b) => {
      const af = isFavorite(a.blipId) ? 0 : 1;
      const bf = isFavorite(b.blipId) ? 0 : 1;
      if (af !== bf) return af - bf;
      const ta = a.lastMsg?.timestamp ?? 0;
      const tb = b.lastMsg?.timestamp ?? 0;
      if (tb !== ta) return tb - ta;
      if (a.online !== b.online) return a.online ? -1 : 1;
      return a.blipId - b.blipId;
    });

  if (rows.length === 0 && getGroupsFor(state.config.blipId).length === 0) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.dataset.i18n = 'chat.no_chats';
    empty.textContent = t('chat.no_chats');
    list.appendChild(empty);
  } else if (rows.length > 0) {
    rows.forEach((row) => {
      const peer = state.peers.find((p) => p.blipId === row.blipId);
      const peerForProfile = peer || {
        blipId: row.blipId,
        displayName: row.displayName,
        online: row.online,
        presence: 'offline',
        presenceText: '',
        hasProfileGif: false,
      };

      const item = document.createElement('button');
      item.type = 'button';
      item.className = `chat-hub-row glass ${row.online ? 'online' : 'offline'}`;

      const avatar = createAvatarElement(row.blipId, 2, { selfBlipId: state.config.blipId });
      avatar.classList.add('chat-hub-avatar');
      avatar.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        openPeerProfileFromUi(peerForProfile);
      });
      const info = document.createElement('div');
      info.className = 'chat-hub-info';
      const name = document.createElement('span');
      name.className = 'peer-name';
      name.textContent = row.displayName;
      const idSpan = document.createElement('span');
      idSpan.className = 'peer-id';
      idSpan.textContent = `#${row.blipId}`;
      info.appendChild(name);
      info.appendChild(idSpan);

      if (row.lastMsg) {
        const preview = document.createElement('span');
        preview.className = 'chat-hub-preview';
        const prevText =
          row.lastMsg.attachment?.kind === 'image'
            ? t('chat.image_preview')
            : row.lastMsg.attachment?.kind === 'file'
              ? t('chat.file_preview').replace('{name}', row.lastMsg.attachment.name || 'file')
              : (row.lastMsg.text || '').slice(0, 48);
        preview.textContent = prevText;
        info.appendChild(preview);
      }

      const dot = document.createElement('span');
      dot.className = `status-dot ${peerPresenceClass(peerForProfile)}`;

      const unread = unreadByPeer.get(row.blipId) || 0;
      if (unread > 0) {
        const badge = document.createElement('span');
        badge.className = 'chat-hub-unread';
        badge.textContent = unread > 99 ? '99+' : String(unread);
        item.appendChild(badge);
      }

      item.appendChild(avatar);
      item.appendChild(info);
      item.appendChild(dot);
      const openHubChat = () => void openChat(row.blipId);
      item.addEventListener('click', openHubChat);
      item.addEventListener('auxclick', (e) => {
        if (e.button === 1) openHubChat();
      });
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showPeerContextMenu(e, peer || { blipId: row.blipId, displayName: row.displayName, online: row.online });
      });
      list.appendChild(item);
    });
  }

  wrap.appendChild(title);
  wrap.appendChild(list);
  return wrap;
}

function renderView(viewName) {
  if (!mainContent) return;
  if (viewName === 'profile' && state.profilePeerId == null) {
    viewName = 'peers';
  }
  state.view = viewName;

  let view;
  switch (viewName) {
    case 'dial':
      view = renderDialView();
      break;
    case 'peers':
      view = renderPeersView();
      break;
    case 'settings':
      view = renderSettingsView();
      break;
    case 'projects':
      view = renderProjectsView();
      break;
    case 'profile': {
      view = renderPeerProfileView();
      break;
    }
    case 'chat': {
      if (state.activeGroup) {
        const gchat = ensureGroupChatView(state.activeGroup);
        gchat?.renderMessages?.();
        view = gchat?.el ?? renderChatHubView();
      } else if (state.activePeer) {
        const chat = ensureChatView(state.activePeer);
        chat.markRead?.();
        chat.renderMessages();
        view = chat.el;
      } else {
        view = renderChatHubView();
      }
      break;
    }
    default:
      view = renderDialView();
  }

  if (state.view === 'settings' && viewName !== 'settings') {
    runSettingsPanelCleanup();
  }

  const current = mainContent.firstElementChild;
  if (current === view) {
    if (viewName === 'chat') {
      if (state.activePeer != null) {
        state.chatViews.get(state.activePeer)?.renderMessages?.();
      } else if (state.activeGroup != null) {
        state.groupChatViews.get(state.activeGroup)?.renderMessages?.();
      }
    }
    applyI18n(mainContent);
    updateNavActive();
    if (viewName === 'peers' || viewName === 'profile') {
      void runMeshPulseRound();
    }
    return;
  }

  mainContent.innerHTML = '';
  mainContent.appendChild(view);
  applyI18n(mainContent);

  updateNavActive();

  if (viewName === 'peers' || viewName === 'profile') {
    void runMeshPulseRound();
  }
}

function clearProfileNavigationState() {
  profilePageCleanup?.();
  profilePageCleanup = null;
  profilePageApi = null;
  state.profilePeerId = null;
  state.profileReturn = null;
}

function render() {
  if (!state.config.blipId) {
    stopMeshPulse();
    showGridView();
    return;
  }

  startMeshPulse();

  const layout = document.createElement('div');
  layout.className = 'app-layout';

  const nav = createNav((view) => {
    clearProfileNavigationState();
    if (view === 'chat' && state.view === 'chat') {
      state.activePeer = null;
      state.activeGroup = null;
    }
    if (view === 'settings') {
      state.settingsSection = null;
    }
    if (view === 'projects') {
      state.activePeer = null;
      state.activeGroup = null;
    }
    renderView(view);
  });

  mainContent = document.createElement('main');
  mainContent.className = 'main-content';

  layout.appendChild(nav);
  layout.appendChild(mainContent);

  rootEl.querySelector('.app-body')?.remove();
  const body = document.createElement('div');
  body.className = 'app-body';
  body.appendChild(layout);
  rootEl.appendChild(body);

  renderView(state.view || 'dial');
}

export function initUI(config, blipApi) {
  state.config = config;
  api = {
    ...blipApi,
    get config() {
      return state.config;
    },
  };
  initPeerTrust(config, blipApi);
  purgeGroupsFor(config.blipId);
  setLang(config.language || localStorage.getItem('blip_lang') || 'en');
  applySoundPrefsFromConfig(config);
  applyAppearance(state.config);
  applyReactiveWallpaperConfig(state.config);
  setAchievementConfigProvider(() => state.config);
  initReactiveWallpaper(() => state.config);
  if (state.config?.achievementsEnabled) syncAchievements(state.config);
  void loadSelfAvatarFromMain();
  appearanceListenerDispose?.();
  appearanceListenerDispose = listenReducedMotion(
    () => applyAppearance(state.config),
    () => state.config
  );

  rootEl = document.getElementById('app');
  if (!rootEl) {
    throw new Error('#app element not found');
  }
  rootEl.innerHTML = '';
  mainContent = null;
  window.__blipShowToast = showAppToast;

  const titleBar = createTitleBar();
  rootEl.appendChild(titleBar);

  setupGlobalShortcuts();

  /* Calls use a separate BrowserWindow — see main/index.js + call-window.html */

  onLangChange(() => {
    refreshTransferHubI18n();
    applyI18n(rootEl);
    if (state.config.blipId) {
      renderView(state.view || 'dial');
    } else if (mainContent) {
      applyI18n(mainContent);
    }
  });

  if (typeof window.blip.onNotificationOpenChat === 'function') {
    window.blip.onNotificationOpenChat((peerId) => {
      const id = Number(peerId);
      if (!Number.isFinite(id)) return;
      openChat(id);
    });
  }

  if (typeof window.blip.onConfigUpdated === 'function') {
    window.blip.onConfigUpdated((cfg) => {
      state.config = cfg;
      applyTrustFromConfig(cfg);
      restartClipboardSync();
      void import('./mesh-plus-verify.js').then(({ syncPremiumTierWithHost }) =>
        syncPremiumTierWithHost(state)
      );
    });
  }

  restartClipboardSync();

  if (typeof window.blip.onUpdateStatus === 'function') {
    window.blip.onUpdateStatus((payload) => {
      lastUpdateStatus = payload;
      showUpdateStatusToast(payload);
      if (state.view === 'settings' && state.settingsSection === 'updates') {
        renderView('settings');
      }
    });
  }

  setTimeout(() => {
    void runStartupUpdateCheck();
  }, 1200);

  window.addEventListener('blip-peer-block-changed', () => {
    if (state.view === 'peers') renderView('peers');
    if (state.view === 'chat' && !state.activePeer) renderView('chat');
  });

  window.addEventListener('blip-mesh-labels-changed', () => {
    if (state.view === 'peers') renderView('peers');
    if (state.view === 'chat' && !state.activePeer) renderView('chat');
    if (state.activePeer != null) {
      const peer = state.peers.find((p) => p.blipId === state.activePeer);
      state.chatViews.get(state.activePeer)?.setPeerName?.(formatPeerDisplayName(peer, state.activePeer));
    }
  });

  window.addEventListener('blip-favorites-changed', () => {
    if (state.view === 'peers') renderView('peers');
    if (state.view === 'chat' && !state.activePeer) renderView('chat');
  });

  window.addEventListener('blip-group-invites-changed', () => {
    if (state.view === 'chat' && !state.activePeer && !state.activeGroup && mainContent) {
      renderView('chat');
    }
    updateNavUnreadBadge();
  });

  window.addEventListener('blip-voice-channel-state', () => {
    if (state.view === 'chat' && !state.activePeer && !state.activeGroup) {
      renderView('chat');
    }
    if (state.activeGroup) {
      state.groupChatViews.get(state.activeGroup)?.refreshChannels?.();
    }
  });

  window.addEventListener('blip-groups-changed', () => {
    if (state.activeGroup) {
      const g = getGroup(state.activeGroup);
      if (!g || !isGroupMember(g, state.config.blipId)) {
        closeGroupChatUi(state.activeGroup);
      }
    }
    if (state.view === 'chat') {
      if (!state.activePeer && !state.activeGroup) {
        renderView('chat');
      } else if (state.activeGroup) {
        const g = getGroup(state.activeGroup);
        if (g) ensureGroupChatView(state.activeGroup)?.updateGroup?.(g);
      }
    }
  });

  window.addEventListener('blip-avatar-changed', () => {
    if (!mainContent?.isConnected) return;
    if (state.view === 'peers') renderView('peers');
    else if (state.view === 'chat' && !state.activePeer) renderView('chat');
    if (state.view === 'chat' && state.activePeer != null) {
      state.chatViews.get(state.activePeer)?.refreshHeaderAvatar?.();
    }
  });


  render();
}

export function updatePeers({ peers, occupiedIds }) {
  const prevOnline = new Set(state.peers.filter((p) => p.online).map((p) => p.blipId));
  const nextOnline = new Set(peers.filter((p) => p.online).map((p) => p.blipId));
  state.peers = peers;
  state.occupiedIds = occupiedIds;
  recordPeersOnline(peers.filter((p) => p.online).length);

  peers.forEach((p) => {
    if (p.online && !prevOnline.has(p.blipId)) {
      logPeerEvent(p.blipId, 'online');
      if (!state.config?.doNotDisturb) sounds.peerOnline();
      if (getSelfAvatarCache()) void broadcastCustomAvatar();
      if (p.hasProfileGif) void requestPeerProfileGif(p.blipId);
      void broadcastProfileGif();
    } else if (!p.online && prevOnline.has(p.blipId)) {
      logPeerEvent(p.blipId, 'offline');
      if (!state.config?.doNotDisturb) sounds.peerOffline();
      migrateGroupsHostOnPeerOffline(p.blipId, nextOnline, api, state.config);
    }
    const chat = state.chatViews.get(p.blipId);
    if (chat) chat.setPeerName(formatPeerDisplayName(p));
  });

  if (gridComponent) {
    gridComponent.updateOccupied(occupiedIds.filter((id) => id !== state.config.blipId));
  }

  /* Never full re-render during active conversation (fixes scroll jump + input focus loss) */
  if (state.view === 'chat' && (state.activePeer || state.activeGroup) && mainContent) {
    return;
  }

  if (state.view === 'peers' && mainContent) {
    renderView('peers');
  }
  if (state.view === 'profile' && mainContent && state.profilePeerId != null) {
    syncPeerProfilePage();
  }
  if (state.view === 'chat' && !state.activePeer && mainContent) {
    renderView('chat');
  }
  if (state.view === 'projects') {
    projectsViewInstance?.refreshPeers?.();
  }
}

function handleTypingTcp(msg) {
  const peerId = Number(msg.from);
  if (!Number.isFinite(peerId) || isBlocked(peerId)) return;
  if (Number(msg.to) !== Number(state.config.blipId)) return;

  if (msg.active) {
    peersTyping.add(peerId);
  } else {
    peersTyping.delete(peerId);
  }

  ensureChatView(peerId);
  const peer = state.peers.find((p) => p.blipId === peerId);
  const label = formatPeerDisplayName(peer, peerId);
  state.chatViews.get(peerId)?.setTyping?.(!!msg.active, label);
  refreshPeersTypingDom();
}

export function handleTcpMessage(msg) {
  if (state.config?.devMeshTrace && msg.type) {
    const peerId = Number(msg.from === state.config.blipId ? msg.to : msg.from);
    if (Number.isFinite(peerId)) logPeerEvent(peerId, `tcp:${msg.type}`);
  }
  if (msg.type === 'profile-gif-request') {
    const from = Number(msg.from);
    if (!Number.isFinite(from) || isBlocked(from)) return;
    void (async () => {
      const dataUrl = await window.blip?.getProfileGifShareUrl?.();
      if (!dataUrl) return;
      await api.sendTcpMessage({
        type: 'profile-gif-share',
        to: from,
        from: state.config.blipId,
        dataUrl,
      });
    })();
    return;
  }

  if (msg.type === 'profile-gif-share') {
    const from = Number(msg.from);
    if (!Number.isFinite(from) || isBlocked(from)) return;
    const raw = msg.dataUrl ? String(msg.dataUrl) : '';
    if (raw.length > 4_500_000) {
      console.warn('[BLIP] profile-gif-share too large, ignored');
      return;
    }
    setPeerProfileGifDataUrl(from, raw || null);
    const peer = state.peers.find((p) => Number(p.blipId) === from);
    if (peer && !peer.hasProfileGif) peer.hasProfileGif = true;
    if (state.view === 'profile' && Number(state.profilePeerId) === from) {
      syncPeerProfilePage();
    }
    return;
  }

  if (msg.type === 'avatar-share') {
    const from = Number(msg.from);
    if (!Number.isFinite(from) || isBlocked(from)) return;
    if (msg.dataUrl) setPeerAvatarDataUrl(from, String(msg.dataUrl));
    else setPeerAvatarDataUrl(from, null);
    const mine = getSelfAvatarCache();
    if (mine) {
      void api.sendTcpMessage({
        type: 'avatar-share',
        to: from,
        from: state.config.blipId,
        dataUrl: mine,
      });
    }
    void broadcastProfileGif();
    window.dispatchEvent(new CustomEvent('blip-avatar-changed'));
    if (state.view === 'peers') {
      renderView('peers');
    } else if (state.view === 'profile') {
      renderView('profile');
    } else if (state.view === 'chat') {
      if (state.activePeer != null) {
        state.chatViews.get(state.activePeer)?.refreshHeaderAvatar?.();
      } else if (state.activeGroup != null) {
        state.groupChatViews.get(state.activeGroup)?.refreshHeaderAvatar?.();
      } else {
        renderView('chat');
      }
    }
    return;
  }

  if (handleMeshProjectTcp(msg, state.config, api)) return;

  if (msg.type === 'clipboard-push') {
    if (isBlocked(Number(msg.from))) return;
    void handleClipboardPush(msg, {
      getConfig: () => state.config,
      getActivePeer: () => state.activePeer,
      onApplied: (from) => {
        showAppToast({
          title: formatClipboardToast(from),
          durationMs: 3200,
        });
      },
    });
    return;
  }

  if (msg.type?.startsWith?.('file-')) {
    if (isBlocked(Number(msg.from))) return;
    if (msg.type === 'file-offer') {
      trackTransferStart(Number(msg.from), msg.transferId, {
        name: msg.name,
        size: msg.size,
        direction: 'in',
      });
    }
    handleFileTransferTcp(msg, {
      config: state.config,
      onProgress: (peerId, transferId, pct) => {
        trackTransferProgress(peerId, transferId, pct, { direction: 'in' });
      },
      onComplete: (peerId, payload) => {
        if (payload?.transferId) trackTransferEnd(peerId, payload.transferId);
        if (payload.groupId && payload.msgId) {
          completeIncomingGroupFile(payload.groupId, payload.msgId, payload.attachment);
          state.groupChatViews.get(payload.groupId)?.renderMessages?.();
          if (state.view === 'chat' && state.activeGroup !== payload.groupId) {
            unreadByGroup.set(
              payload.groupId,
              (unreadByGroup.get(payload.groupId) || 0) + 1
            );
            if (!state.activePeer && !state.activeGroup) renderView('chat');
          }
          return;
        }
        const incoming = {
          type: 'message',
          from: peerId,
          to: state.config.blipId,
          id: createMessageId(),
          text: t('chat.file_received'),
          timestamp: Date.now(),
          attachment: payload.attachment,
        };
        routePeerMessage(incoming);
      },
      onAbort: (peerId, transferId) => {
        trackTransferEnd(peerId, transferId);
      },
    });
    return;
  }

  if (
    msg.type === 'voice-ch-roster' ||
    msg.type === 'voice-ch-signal' ||
    msg.type?.startsWith?.('group-')
  ) {
    void handleGroupTcpMessage(msg, {
      api,
      config: state.config,
      statePeers: state.peers,
      getGroupChatView: (id) => state.groupChatViews.get(id),
      openGroupChat,
      bumpGroupUnread: (groupId) => {
        if (state.view === 'chat' && state.activeGroup === groupId) return;
        unreadByGroup.set(groupId, (unreadByGroup.get(groupId) || 0) + 1);
        updateNavUnreadBadge();
        if (state.view === 'chat' && !state.activePeer && !state.activeGroup) {
          renderView('chat');
        }
      },
      bumpInviteUnread,
      onGroupRemoved: (groupId) => {
        closeGroupChatUi(groupId);
        unreadByGroup.delete(groupId);
        if (state.view === 'chat' && !state.activePeer && !state.activeGroup) {
          renderView('chat');
        }
      },
      onMemberLeft: (groupId) => {
        if (state.view === 'chat' && state.activeGroup === groupId) {
          ensureGroupChatView(groupId)?.updateGroup?.(getGroup(groupId));
        } else if (state.view === 'chat' && !state.activePeer && !state.activeGroup) {
          renderView('chat');
        }
      },
    });
    return;
  }

  if (msg.type === 'typing') {
    handleTypingTcp(msg);
    return;
  }

  const peerId = Number(msg.from === state.config.blipId ? msg.to : msg.from);
  if (!Number.isFinite(peerId) || isBlocked(peerId)) return;

  if (msg.type === 'reaction') {
    state.chatViews.get(peerId)?.handleReaction?.(msg);
    return;
  }

  if (msg.type === 'message-pin') {
    const pinPeer = Number(msg.from === state.config.blipId ? msg.to : msg.from);
    if (Number.isFinite(pinPeer) && !isBlocked(pinPeer)) {
      ensureChatView(pinPeer);
      state.chatViews.get(pinPeer)?.handlePin?.(msg);
    }
    return;
  }

  if (msg.type === 'message-edit') {
    const editPeer = Number(msg.from === state.config.blipId ? msg.to : msg.from);
    if (Number.isFinite(editPeer) && !isBlocked(editPeer)) {
      ensureChatView(editPeer);
      state.chatViews.get(editPeer)?.handleEdit?.(msg);
    }
    return;
  }

  if (msg.type !== 'message') return;

  routePeerMessage(msg);
}

function routePeerMessage(msg) {
  const peerId = Number(msg.from === state.config.blipId ? msg.to : msg.from);
  if (!Number.isFinite(peerId) || isBlocked(peerId)) return;

  const id = normalizeBlipId(peerId);
  if (id == null) return;

  ensureChatView(id);
  const chat = state.chatViews.get(id);
  chat?.handleIncoming(msg);
  refreshLiveChat(id);

  if (state.view === 'chat' && state.activePeer === id) {
    return;
  }

  bumpUnread(id);

  let preview = typeof msg.text === 'string' ? msg.text.slice(0, 120) : '';
  if (msg.attachment?.kind === 'file') {
    preview = t('chat.file_preview').replace('{name}', msg.attachment.name || 'file');
  } else if (msg.attachment?.kind === 'image') {
    preview = t('chat.image_preview');
  }
  showMessageToast(id, preview);

  const typingOther =
    state.view === 'chat' &&
    state.activePeer &&
    state.activePeer !== id &&
    document.activeElement?.closest?.('.chat-input-row');

  if (typingOther) {
    return;
  }

  state.view = 'chat';
  state.activePeer = id;
  clearUnread(id);
  if (mainContent?.isConnected) renderView('chat');
}

export function getCallUI() {
  return null;
}
