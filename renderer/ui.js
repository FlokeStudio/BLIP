import { t, setLang, getLang, applyLangChange, onLangChange, applyI18n } from './i18n.js';
import { createIdGrid } from './grid.js';
import { createChatView, getMessages, applyReceiptToMessage } from './chat.js';
import { isFavorite, toggleFavorite, comparePeersFavoriteFirst } from './peer-favorites.js';
import { getGroup, getAllGroups, groupDisplayName, getGroupMessages, amHost } from './groups.js';
import { openGroupCreateDialog } from './group-create-dialog.js';
import { createGroupChatView } from './group-chat.js';
import {
  createGroupFromUi,
  handleGroupTcpMessage,
  migrateGroupsHost,
  sendGroupChatMessage,
  joinGroupCall,
  leaveGroup,
  dissolveGroup,
} from './groups-wire.js';
import { logPeerEvent, getNetworkLogEntries, clearNetworkLog } from './network-log.js';
import { createMessageId } from './message-id.js';
import { showSignalLost } from './call.js';
import {
  createAvatarElement,
  encodeAvatarFileToDataUrl,
  clearCustomAvatar,
  hasCustomAvatar,
  setCustomAvatarDataUrl,
  regenerateAvatar,
} from './avatar.js';
import {
  sounds,
  setSoundPrefs,
  PREVIEW_KEYS,
  SOUND_PACK_IDS,
  MELODY_PACK_IDS,
} from './audio.js';
import { sendChatFile, fileToDataUrl, handleFileTransferTcp } from './file-transfer.js';
import { formatPeerDisplayName } from './peer-labels.js';
import { openMeshLabelDialog } from './mesh-label-dialog.js';
import { showAppToast } from './toasts.js';
import { openConfirmDialog } from './confirm-dialog.js';
import {
  initPeerTrust,
  applyTrustFromConfig,
  isTrusted,
  trustPeer,
  isBlocked,
  blockPeer,
  unblockPeer,
  getBlockedPeerIds,
} from './peer-trust.js';
import {
  THEME_GROUPS,
  BG_META,
  applyAppearance,
  listenReducedMotion,
  labelTheme,
  labelBg,
  normalizeThemeId,
  normalizeBgId,
} from './appearance.js';

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

/** @type {Map<number, number>} */
const unreadByPeer = new Map();
/** @type {Set<number>} */
const peersTyping = new Set();

async function openCallOutgoing(peerId, video = false) {
  if (!window.blip?.openCallOutgoing) return;
  try {
    await window.blip.openCallOutgoing({ peerId, video });
  } catch (e) {
    console.error('[BLIP] openCallOutgoing', e);
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
    <span class="title-slogan" data-i18n="app.slogan">${t('app.slogan')}</span>
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
    const view = createGroupChatView(
      group,
      state.config,
      (gid, msg) => sendGroupChatMessage(api, state.config, gid, msg),
      () => {
        state.activeGroup = null;
        renderView('chat');
      },
      (gid) => joinGroupCall(gid, api),
      (e) => {
        const fresh = getGroup(groupId);
        if (fresh) showGroupContextMenu(e, fresh);
      }
    );
    state.groupChatViews.set(groupId, view);
  }
  return state.groupChatViews.get(groupId);
}

function openGroupChat(groupId) {
  if (!getGroup(groupId)) return;
  state.activeGroup = groupId;
  state.activePeer = null;
  state.view = 'chat';
  unreadByGroup.delete(groupId);
  ensureGroupChatView(groupId);
  if (mainContent?.isConnected) renderView('chat');
  else render();
}

function ensureChatView(peerId) {
  if (!state.chatViews.has(peerId)) {
    const peer = state.peers.find((p) => p.blipId === peerId);
    const chat = createChatView(
      peerId,
      state.config,
      (to, msg) =>
        api.sendTcpMessage({
          to,
          type: 'message',
          text: msg.text,
          id: msg.id,
          timestamp: msg.timestamp,
          attachment: msg.attachment,
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
          type: 'receipt',
          to,
          messageId: payload.messageId,
          receipt: payload.receipt,
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
        const result = await sendChatFile(api, state.config, to, file, onProgress);
        if (result.chunked) {
          const dataUrl = await fileToDataUrl(file);
          result.attachment = { ...result.attachment, dataUrl };
        }
        return result;
      },
      (e, peerId) => showPeerContextMenu(e, peerId, { hideMessage: true })
    );
    if (peer) chat.setPeerName(formatPeerDisplayName(peer, peerId));
    state.chatViews.set(peerId, chat);
  }
  return state.chatViews.get(peerId);
}

function getUnreadTotal() {
  let n = 0;
  for (const c of unreadByPeer.values()) n += c;
  return n;
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

function createNav(onNavigate) {
  const nav = document.createElement('nav');
  nav.className = 'side-nav glass';
  ['dial', 'peers', 'chat', 'settings'].forEach((key) => {
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

  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 2);
  });

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

  function resolvePeerId() {
    const n = Number(input.value);
    if (n < 1 || n > 64) return null;
    return n;
  }

  function findPeer(id) {
    return state.peers.find((p) => p.blipId === id && p.online);
  }

  msgBtn.addEventListener('click', () => {
    const id = resolvePeerId();
    if (!id) return;
    if (!findPeer(id)) {
      showSignalLost(wrap);
      return;
    }
    openChat(id);
  });

  callBtn.addEventListener('click', () => {
    const id = resolvePeerId();
    if (!id) return;
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

  const peersSubtitle = document.createElement('p');
  peersSubtitle.className = 'hint peers-subtitle';
  peersSubtitle.dataset.i18n = 'peers.subtitle';
  peersSubtitle.textContent = t('peers.subtitle');

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

      const avatar = createAvatarElement(peer.blipId, 2, { selfBlipId: state.config.blipId });
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
      if (peer.meshVerified) {
        const hs = document.createElement('span');
        hs.className = 'peer-handshake-badge';
        hs.title = t('peers.handshake_ok');
        hs.textContent = 'HS';
        name.appendChild(hs);
      } else if (peer.meshLegacy) {
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

      row.addEventListener('click', () => {
        if (peer.online) openChat(peer.blipId);
      });

      row.style.cursor = peer.online ? 'pointer' : 'default';

      list.appendChild(row);
    });
  }

  wrap.appendChild(title);
  wrap.appendChild(peersSubtitle);
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
  if (state.view === 'chat' && !state.activePeer) renderView('chat');

  showAppToast({
    title: t('peers.mesh_label_saved'),
    body: saved ? saved : t('peers.mesh_label_removed'),
    durationMs: 4000,
  });
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
  };
}

function closeGroupChatUi(groupId) {
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

  const callItem = document.createElement('button');
  callItem.type = 'button';
  callItem.textContent = t('group.call');
  bindItem(callItem, () => void joinGroupCall(group.id, api));

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

  const disbandItem = document.createElement('button');
  disbandItem.type = 'button';
  disbandItem.textContent = t('group.menu_disband');
  if (amHost(group, state.config.blipId)) {
    bindItem(disbandItem, async () => {
      const ok = await openConfirmDialog({
        title: t('group.disband_confirm_title'),
        body: t('group.disband_confirm_body').replace('{name}', groupDisplayName(group)),
        confirmLabel: t('group.menu_disband'),
      });
      if (!ok) return;
      try {
        const res = await dissolveGroup(api, state.config, group.id);
        if (!res?.ok) {
          showAppToast({
            title: t('group.disband_failed'),
            body: t(`group.err_${res?.error || 'unknown'}`),
            variant: 'danger',
            durationMs: 5000,
          });
          return;
        }
        closeGroupChatUi(group.id);
        if (state.view === 'chat') renderView('chat');
      } catch (err) {
        console.error('[group] disband:', err);
        showAppToast({
          title: t('group.disband_failed'),
          body: err?.message || String(err),
          variant: 'danger',
          durationMs: 5000,
        });
      }
    });
  } else {
    disbandItem.disabled = true;
  }

  menu.appendChild(openItem);
  menu.appendChild(callItem);
  menu.appendChild(leaveItem);
  menu.appendChild(disbandItem);
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

  if (!options.hideMessage) menu.appendChild(msgItem);
  menu.appendChild(callItem);
  menu.appendChild(labelItem);
  menu.appendChild(pingItem);
  menu.appendChild(copyIdItem);
  menu.appendChild(groupItem);
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

  const h = document.createElement('h3');
  h.className = 'section-subtitle';
  h.dataset.i18n = 'settings.avatar_title';
  h.textContent = t('settings.avatar_title');
  block.appendChild(h);

  const row = document.createElement('div');
  row.className = 'settings-avatar-row';

  const preview = document.createElement('div');
  preview.className = 'settings-avatar-preview';

  function refreshPreview() {
    preview.innerHTML = '';
    preview.appendChild(
      createAvatarElement(state.config.blipId, 5, { selfBlipId: state.config.blipId })
    );
  }
  refreshPreview();
  row.appendChild(preview);

  const col = document.createElement('div');
  col.className = 'settings-avatar-actions';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.id = 'blip-avatar-file';
  fileInput.accept = 'image/*';
  fileInput.className = 'settings-avatar-file-input';

  const uploadLabel = document.createElement('label');
  uploadLabel.setAttribute('for', 'blip-avatar-file');
  uploadLabel.className = 'btn btn-accent settings-avatar-upload-label';
  uploadLabel.dataset.i18n = 'settings.avatar_upload';
  uploadLabel.textContent = t('settings.avatar_upload');

  const regenBtn = document.createElement('button');
  regenBtn.type = 'button';
  regenBtn.className = 'btn btn-lang';
  regenBtn.dataset.i18n = 'settings.avatar_regenerate';
  regenBtn.textContent = t('settings.avatar_regenerate');
  regenBtn.addEventListener('click', () => {
    regenerateAvatar(state.config.blipId);
    refreshPreview();
    removeBtn.disabled = !hasCustomAvatar();
    window.dispatchEvent(new CustomEvent('blip-avatar-changed'));
  });

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn btn-lang';
  removeBtn.dataset.i18n = 'settings.avatar_remove';
  removeBtn.textContent = t('settings.avatar_remove');
  removeBtn.disabled = !hasCustomAvatar();
  removeBtn.addEventListener('click', () => {
    clearCustomAvatar();
    refreshPreview();
    removeBtn.disabled = !hasCustomAvatar();
    window.dispatchEvent(new CustomEvent('blip-avatar-changed'));
  });

  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    fileInput.value = '';
    if (!f) return;
    try {
      const url = await encodeAvatarFileToDataUrl(f);
      setCustomAvatarDataUrl(url);
      refreshPreview();
      removeBtn.disabled = false;
      window.dispatchEvent(new CustomEvent('blip-avatar-changed'));
    } catch (e) {
      const msg = e?.message;
      const key =
        msg === 'file_too_big'
          ? 'settings.avatar_error_size'
          : msg === 'bad_mime'
            ? 'settings.avatar_error_mime'
            : msg === 'too_large'
              ? 'settings.avatar_error_output'
              : 'settings.avatar_error_decode';
      showError(t(key), '');
    }
  });

  col.appendChild(uploadLabel);
  col.appendChild(fileInput);
  col.appendChild(regenBtn);
  col.appendChild(removeBtn);
  row.appendChild(col);
  block.appendChild(row);

  const hint = document.createElement('p');
  hint.className = 'settings-motion-hint';
  hint.dataset.i18n = 'settings.avatar_hint';
  hint.textContent = t('settings.avatar_hint');
  block.appendChild(hint);

  return block;
}

function buildCloseToTraySection() {
  if (typeof window === 'undefined' || window.blip?.platform !== 'win32') {
    return null;
  }

  const block = document.createElement('div');
  block.className = 'settings-tray-wrap';

  const h = document.createElement('h3');
  h.className = 'section-subtitle';
  h.dataset.i18n = 'settings.tray_title';
  h.textContent = t('settings.tray_title');
  block.appendChild(h);

  const row = document.createElement('label');
  row.className = 'settings-tray-toggle-row';

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = !!state.config.closeToTray;

  const span = document.createElement('span');
  span.dataset.i18n = 'settings.close_to_tray';
  span.textContent = t('settings.close_to_tray');

  row.appendChild(cb);
  row.appendChild(span);

  cb.addEventListener('change', async () => {
    state.config = await api.saveConfig({ closeToTray: cb.checked });
  });

  block.appendChild(row);

  const hint = document.createElement('p');
  hint.className = 'settings-motion-hint';
  hint.dataset.i18n = 'settings.close_to_tray_hint';
  hint.textContent = t('settings.close_to_tray_hint');
  block.appendChild(hint);

  return block;
}

function buildAppearanceSection() {
  const block = document.createElement('div');
  block.className = 'settings-appearance-wrap';
  const curTheme = normalizeThemeId(state.config.themeId);
  const curBg = normalizeBgId(state.config.animatedBgId);

  const lightLbl = document.createElement('span');
  lightLbl.className = 'settings-sub-label';
  lightLbl.dataset.i18n = 'settings.theme_light';
  lightLbl.textContent = t('settings.theme_light');
  block.appendChild(lightLbl);

  const rowLight = document.createElement('div');
  rowLight.className = 'settings-appearance-grid';
  for (const id of THEME_GROUPS.light) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn btn-lang settings-swatch${curTheme === id ? ' selected' : ''}`;
    btn.textContent = labelTheme(id);
    btn.addEventListener('click', async () => {
      state.config = await api.saveConfig({ themeId: id });
      applyAppearance(state.config);
      renderView('settings');
    });
    rowLight.appendChild(btn);
  }
  block.appendChild(rowLight);

  const darkLbl = document.createElement('span');
  darkLbl.className = 'settings-sub-label';
  darkLbl.dataset.i18n = 'settings.theme_dark';
  darkLbl.textContent = t('settings.theme_dark');
  block.appendChild(darkLbl);

  const rowDark = document.createElement('div');
  rowDark.className = 'settings-appearance-grid';
  for (const id of THEME_GROUPS.dark) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn btn-lang settings-swatch${curTheme === id ? ' selected' : ''}`;
    btn.textContent = labelTheme(id);
    btn.addEventListener('click', async () => {
      state.config = await api.saveConfig({ themeId: id });
      applyAppearance(state.config);
      renderView('settings');
    });
    rowDark.appendChild(btn);
  }
  block.appendChild(rowDark);

  const bgLbl = document.createElement('span');
  bgLbl.className = 'settings-sub-label';
  bgLbl.dataset.i18n = 'settings.bg_title';
  bgLbl.textContent = t('settings.bg_title');
  block.appendChild(bgLbl);

  const rowBg = document.createElement('div');
  rowBg.className = 'settings-appearance-grid settings-bg-grid';
  for (const { id } of BG_META) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn btn-lang settings-swatch${curBg === id ? ' selected' : ''}`;
    btn.textContent = labelBg(id);
    btn.addEventListener('click', async () => {
      state.config = await api.saveConfig({ animatedBgId: id });
      applyAppearance(state.config);
      renderView('settings');
    });
    rowBg.appendChild(btn);
  }
  block.appendChild(rowBg);

  const motion = document.createElement('p');
  motion.className = 'settings-motion-hint';
  motion.dataset.i18n = 'settings.motion_hint';
  motion.textContent = t('settings.motion_hint');
  block.appendChild(motion);

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

function isSemverNewer(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return false;
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return true;
    if (pa[i] < pb[i]) return false;
  }
  return false;
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
  const latest = result.releases.find((r) => r.tag && !r.prerelease) || result.releases[0];
  const tag = latest?.tag?.replace(/^v/i, '') || '';
  if (isSemverNewer(tag, currentVersion)) {
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
  if (view === 'settings') state.settingsSection = null;
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
        if (next === 'settings') state.settingsSection = null;
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
  });
}

function getSettingsSectionIds() {
  const ids = [
    'profile',
    'language',
    'notifications',
    'privacy',
    'sound',
    'shortcuts',
    'call',
    'appearance',
    'network',
    'system',
    'updates',
    'about',
  ];
  if (typeof window !== 'undefined' && window.blip?.platform !== 'win32') {
    return ids.filter((id) => id !== 'system');
  }
  return ids;
}

function buildSettingsProfilePanel() {
  const frag = document.createElement('div');
  frag.className = 'settings-panel';

  const h = document.createElement('h2');
  h.className = 'settings-panel-title';
  h.dataset.i18n = 'settings.section_profile';
  h.textContent = t('settings.section_profile');
  frag.appendChild(h);

  const nameLabel = document.createElement('label');
  nameLabel.dataset.i18n = 'settings.name';
  nameLabel.textContent = t('settings.name');
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'input';
  nameInput.value = state.config.displayName || '';
  nameInput.placeholder = t('settings.name_placeholder');
  nameInput.dataset.i18nPlaceholder = 'settings.name_placeholder';

  const idRow = document.createElement('div');
  idRow.className = 'settings-id-row';
  const idLabel = document.createElement('span');
  idLabel.dataset.i18n = 'settings.id';
  idLabel.textContent = `${t('settings.id')}: ${state.config.blipId ?? '—'}`;
  const changeIdBtn = document.createElement('button');
  changeIdBtn.type = 'button';
  changeIdBtn.className = 'btn btn-accent';
  changeIdBtn.dataset.i18n = 'settings.change_id';
  changeIdBtn.textContent = t('settings.change_id');
  changeIdBtn.addEventListener('click', () => showGridView(true));

  const copyIdBtn = document.createElement('button');
  copyIdBtn.type = 'button';
  copyIdBtn.className = 'btn btn-lang';
  copyIdBtn.dataset.i18n = 'settings.copy_id';
  copyIdBtn.textContent = t('settings.copy_id');
  copyIdBtn.addEventListener('click', async () => {
    const text = String(state.config.blipId ?? '');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  });

  idRow.appendChild(idLabel);
  idRow.appendChild(copyIdBtn);
  idRow.appendChild(changeIdBtn);

  nameInput.addEventListener('change', async () => {
    const name = nameInput.value.trim() || 'Anonymous';
    state.config.displayName = name;
    await api.saveConfig({ displayName: name });
  });

  const presenceLabel = document.createElement('label');
  presenceLabel.dataset.i18n = 'settings.presence';
  presenceLabel.textContent = t('settings.presence');
  const presenceRow = document.createElement('div');
  presenceRow.className = 'presence-row';
  const currentPresence = state.config.presenceStatus || 'online';
  [
    { id: 'online', key: 'settings.presence_online' },
    { id: 'away', key: 'settings.presence_away' },
    { id: 'busy', key: 'settings.presence_busy' },
  ].forEach(({ id, key }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn btn-lang ${currentPresence === id ? 'selected' : ''}`;
    btn.dataset.i18n = key;
    btn.textContent = t(key);
    btn.addEventListener('click', async () => {
      state.config.presenceStatus = id;
      await api.saveConfig({ presenceStatus: id });
      presenceRow.querySelectorAll('.btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
    presenceRow.appendChild(btn);
  });

  frag.appendChild(nameLabel);
  frag.appendChild(nameInput);
  frag.appendChild(presenceLabel);
  frag.appendChild(presenceRow);

  const statusLabel = document.createElement('label');
  statusLabel.dataset.i18n = 'settings.status_text';
  statusLabel.textContent = t('settings.status_text');
  const statusInput = document.createElement('input');
  statusInput.type = 'text';
  statusInput.className = 'input settings-status-input';
  statusInput.maxLength = 48;
  statusInput.placeholder = t('settings.status_placeholder');
  statusInput.dataset.i18nPlaceholder = 'settings.status_placeholder';
  statusInput.value = state.config.presenceText || '';

  const statusPresets = document.createElement('div');
  statusPresets.className = 'presence-row settings-status-presets';
  [
    { text: '', key: 'settings.status_clear' },
    { text: 'In game', key: 'settings.status_game' },
    { text: 'AFK', key: 'settings.status_afk' },
    { text: 'Working', key: 'settings.status_work' },
  ].forEach(({ text, key }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-lang';
    btn.dataset.i18n = key;
    btn.textContent = t(key);
    btn.addEventListener('click', async () => {
      statusInput.value = text;
      state.config = await api.saveConfig({ presenceText: text });
    });
    statusPresets.appendChild(btn);
  });

  statusInput.addEventListener('change', async () => {
    const presenceText = statusInput.value.trim().slice(0, 48);
    statusInput.value = presenceText;
    state.config = await api.saveConfig({ presenceText });
  });

  frag.appendChild(statusLabel);
  frag.appendChild(statusInput);
  frag.appendChild(statusPresets);
  frag.appendChild(buildAvatarSettingsSection());
  frag.appendChild(idRow);
  return frag;
}

function buildSettingsLanguagePanel() {
  const frag = document.createElement('div');
  frag.className = 'settings-panel';

  const h = document.createElement('h2');
  h.className = 'settings-panel-title';
  h.dataset.i18n = 'settings.section_language';
  h.textContent = t('settings.section_language');
  frag.appendChild(h);

  const langLabel = document.createElement('label');
  langLabel.dataset.i18n = 'settings.language';
  langLabel.textContent = t('settings.language');
  const langRow = document.createElement('div');
  langRow.className = 'lang-row';
  ['en', 'ru'].forEach((lang) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn btn-lang ${state.config.language === lang || getLang() === lang ? 'selected' : ''}`;
    btn.textContent = lang.toUpperCase();
    btn.addEventListener('click', async () => {
      setLang(lang);
      state.config.language = lang;
      await api.saveConfig({ language: lang });
      applyLangChange();
      state.settingsSection = 'language';
      renderView('settings');
    });
    langRow.appendChild(btn);
  });

  frag.appendChild(langLabel);
  frag.appendChild(langRow);
  return frag;
}

function buildSettingsNotificationsPanel() {
  const frag = document.createElement('div');
  frag.className = 'settings-panel';

  const h = document.createElement('h2');
  h.className = 'settings-panel-title';
  h.dataset.i18n = 'settings.section_notifications';
  h.textContent = t('settings.section_notifications');
  frag.appendChild(h);

  const label = document.createElement('label');
  label.className = 'settings-tray-toggle-row';

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = state.config.desktopNotifications !== false;

  const span = document.createElement('span');
  span.dataset.i18n = 'settings.notifications_enable';
  span.textContent = t('settings.notifications_enable');

  label.appendChild(cb);
  label.appendChild(span);

  cb.addEventListener('change', async () => {
    state.config = await api.saveConfig({ desktopNotifications: cb.checked });
  });

  const callLabel = document.createElement('label');
  callLabel.className = 'settings-tray-toggle-row';

  const callCb = document.createElement('input');
  callCb.type = 'checkbox';
  callCb.checked = state.config.desktopCallNotifications !== false;

  const callSpan = document.createElement('span');
  callSpan.dataset.i18n = 'settings.notifications_calls';
  callSpan.textContent = t('settings.notifications_calls');

  callLabel.appendChild(callCb);
  callLabel.appendChild(callSpan);

  callCb.addEventListener('change', async () => {
    state.config = await api.saveConfig({ desktopCallNotifications: callCb.checked });
  });

  const dndLabel = document.createElement('label');
  dndLabel.className = 'settings-tray-toggle-row';

  const dndCb = document.createElement('input');
  dndCb.type = 'checkbox';
  dndCb.checked = state.config.doNotDisturb === true;

  const dndSpan = document.createElement('span');
  dndSpan.dataset.i18n = 'settings.notifications_dnd';
  dndSpan.textContent = t('settings.notifications_dnd');

  dndLabel.appendChild(dndCb);
  dndLabel.appendChild(dndSpan);

  dndCb.addEventListener('change', async () => {
    state.config = await api.saveConfig({ doNotDisturb: dndCb.checked });
    applySoundPrefsFromConfig(state.config);
  });

  const dndHint = document.createElement('p');
  dndHint.className = 'hint';
  dndHint.dataset.i18n = 'settings.notifications_dnd_hint';
  dndHint.textContent = t('settings.notifications_dnd_hint');

  frag.appendChild(label);
  frag.appendChild(callLabel);
  frag.appendChild(dndLabel);
  frag.appendChild(dndHint);
  return frag;
}

function buildSettingsPrivacyPanel() {
  const frag = document.createElement('div');
  frag.className = 'settings-panel';

  const h = document.createElement('h2');
  h.className = 'settings-panel-title';
  h.dataset.i18n = 'settings.section_privacy';
  h.textContent = t('settings.section_privacy');
  frag.appendChild(h);

  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.dataset.i18n = 'settings.privacy_hint';
  hint.textContent = t('settings.privacy_hint');
  frag.appendChild(hint);

  const list = document.createElement('div');
  list.className = 'settings-blocked-list';

  function renderList() {
    list.innerHTML = '';
    const blocked = getBlockedPeerIds();
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
      row.className = 'settings-blocked-row glass';

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

  const h = document.createElement('h2');
  h.className = 'settings-panel-title';
  h.dataset.i18n = 'settings.section_sound';
  h.textContent = t('settings.section_sound');
  frag.appendChild(h);

  const enableLabel = document.createElement('label');
  enableLabel.className = 'settings-tray-toggle-row';

  const enableCb = document.createElement('input');
  enableCb.type = 'checkbox';
  enableCb.checked = state.config.uiSoundsEnabled !== false;

  const enableSpan = document.createElement('span');
  enableSpan.dataset.i18n = 'settings.sound_enable';
  enableSpan.textContent = t('settings.sound_enable');

  enableLabel.appendChild(enableCb);
  enableLabel.appendChild(enableSpan);

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
      enabled: enableCb.checked,
      volume: Number(volRange.value) / 100,
      soundPack: state.config.uiSoundPack,
      melodyPack: state.config.uiMelodyPack,
    });
  });
  volRange.addEventListener('change', () => {
    void persistVolume();
  });

  function syncVolumeDisabled() {
    volRange.disabled = !enableCb.checked;
    volLabel.style.opacity = enableCb.checked ? '1' : '0.45';
  }
  syncVolumeDisabled();

  enableCb.addEventListener('change', async () => {
    state.config = await api.saveConfig({ uiSoundsEnabled: enableCb.checked });
    applySoundPrefsFromConfig(state.config);
    syncVolumeDisabled();
  });

  volRow.appendChild(volRange);
  volRow.appendChild(volVal);

  const soundPackLabel = document.createElement('label');
  soundPackLabel.dataset.i18n = 'settings.sound_pack';
  soundPackLabel.textContent = t('settings.sound_pack');
  const soundPackRow = document.createElement('div');
  soundPackRow.className = 'presence-row settings-sound-pack-row';
  const currentSoundPack = SOUND_PACK_IDS.includes(state.config.uiSoundPack)
    ? state.config.uiSoundPack
    : 'signal';
  [
    { id: 'signal', key: 'settings.sound_pack_signal' },
    { id: 'pulse', key: 'settings.sound_pack_pulse' },
  ].forEach(({ id, key }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn btn-lang ${currentSoundPack === id ? 'selected' : ''}`;
    btn.dataset.i18n = key;
    btn.textContent = t(key);
    btn.addEventListener('click', async () => {
      state.config = await api.saveConfig({ uiSoundPack: id });
      applySoundPrefsFromConfig(state.config);
      soundPackRow.querySelectorAll('.btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
    soundPackRow.appendChild(btn);
  });

  const melodyPackLabel = document.createElement('label');
  melodyPackLabel.dataset.i18n = 'settings.melody_pack';
  melodyPackLabel.textContent = t('settings.melody_pack');
  const melodyPackRow = document.createElement('div');
  melodyPackRow.className = 'presence-row settings-sound-pack-row';
  const currentMelodyPack = MELODY_PACK_IDS.includes(state.config.uiMelodyPack)
    ? state.config.uiMelodyPack
    : 'mesh';
  [
    { id: 'mesh', key: 'settings.melody_pack_mesh' },
    { id: 'grid', key: 'settings.melody_pack_grid' },
  ].forEach(({ id, key }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn btn-lang ${currentMelodyPack === id ? 'selected' : ''}`;
    btn.dataset.i18n = key;
    btn.textContent = t(key);
    btn.addEventListener('click', async () => {
      state.config = await api.saveConfig({ uiMelodyPack: id });
      applySoundPrefsFromConfig(state.config);
      melodyPackRow.querySelectorAll('.btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
    melodyPackRow.appendChild(btn);
  });

  const previewTitle = document.createElement('h3');
  previewTitle.className = 'section-subtitle';
  previewTitle.dataset.i18n = 'settings.sound_preview';
  previewTitle.textContent = t('settings.sound_preview');

  const previewGrid = document.createElement('div');
  previewGrid.className = 'settings-sound-preview-grid';

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

  PREVIEW_KEYS.forEach((key) => {
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
    previewGrid.appendChild(btn);
  });

  frag.appendChild(enableLabel);
  frag.appendChild(volLabel);
  frag.appendChild(volRow);
  frag.appendChild(soundPackLabel);
  frag.appendChild(soundPackRow);
  frag.appendChild(melodyPackLabel);
  frag.appendChild(melodyPackRow);
  frag.appendChild(previewTitle);
  frag.appendChild(previewGrid);
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

function buildThemedSelect(className = 'blip-select') {
  const sel = document.createElement('select');
  sel.className = className;
  return sel;
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

function buildSettingsCallPanel() {
  const frag = document.createElement('div');
  frag.className = 'settings-panel';

  const h = document.createElement('h2');
  h.className = 'settings-panel-title';
  h.dataset.i18n = 'settings.section_call';
  h.textContent = t('settings.section_call');
  frag.appendChild(h);

  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.dataset.i18n = 'settings.call_hint';
  hint.textContent = t('settings.call_hint');
  frag.appendChild(hint);

  const micLabel = document.createElement('label');
  micLabel.dataset.i18n = 'settings.call_mic';
  micLabel.textContent = t('settings.call_mic');

  const micSelect = buildThemedSelect('blip-select settings-call-select');
  const micDefault = document.createElement('option');
  micDefault.value = '';
  micDefault.dataset.i18n = 'settings.call_mic_default';
  micDefault.textContent = t('settings.call_mic_default');
  micSelect.appendChild(micDefault);

  const outLabel = document.createElement('label');
  outLabel.className = 'settings-call-field-label';
  outLabel.dataset.i18n = 'settings.call_speaker';
  outLabel.textContent = t('settings.call_speaker');

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

  frag.appendChild(micLabel);
  frag.appendChild(micSelect);
  frag.appendChild(outLabel);
  frag.appendChild(outSelect);
  frag.appendChild(micTestWrap);
  return frag;
}

function buildSettingsNetworkPanel() {
  const frag = document.createElement('div');
  frag.className = 'settings-panel';

  const h = document.createElement('h2');
  h.className = 'settings-panel-title';
  h.dataset.i18n = 'settings.section_network';
  h.textContent = t('settings.section_network');
  frag.appendChild(h);

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
  bodyHost.className = 'settings-network-body';
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

    const envHint = document.createElement('p');
    envHint.className = 'hint settings-network-env';
    envHint.dataset.i18n = 'settings.network_env_hint';
    envHint.textContent = t('settings.network_env_hint');
    bodyHost.appendChild(envHint);

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
    try {
      await navigator.clipboard.writeText(text);
      showAppToast({
        title: t('settings.network_copy_done'),
        durationMs: 2800,
      });
    } catch (err) {
      showAppToast({
        title: t('settings.network_copy_fail'),
        body: err?.message || '',
        durationMs: 4000,
        variant: 'danger',
      });
    }
  });

  void loadDiagnostics();
  return frag;
}

function buildSettingsShortcutsPanel() {
  const frag = document.createElement('div');
  frag.className = 'settings-panel';

  const h = document.createElement('h2');
  h.className = 'settings-panel-title';
  h.dataset.i18n = 'settings.section_shortcuts';
  h.textContent = t('settings.section_shortcuts');
  frag.appendChild(h);

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
    frag.appendChild(list);
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

  const globalHint = document.createElement('p');
  globalHint.className = 'hint';
  globalHint.dataset.i18n = 'settings.shortcuts_global_hint';
  globalHint.textContent = t('settings.shortcuts_global_hint');
  frag.appendChild(globalHint);

  const globalToggle = document.createElement('label');
  globalToggle.className = 'settings-tray-toggle-row';
  const globalCb = document.createElement('input');
  globalCb.type = 'checkbox';
  globalCb.checked = state.config.globalShortcutsEnabled !== false;
  const globalSpan = document.createElement('span');
  globalSpan.dataset.i18n = 'settings.shortcuts_global_enable';
  globalSpan.textContent = t('settings.shortcuts_global_enable');
  globalToggle.appendChild(globalCb);
  globalToggle.appendChild(globalSpan);
  globalCb.addEventListener('change', async () => {
    state.config = await api.saveConfig({ globalShortcutsEnabled: globalCb.checked });
    showAppToast({
      title: globalCb.checked
        ? t('settings.shortcuts_global_on')
        : t('settings.shortcuts_global_off'),
      durationMs: 3200,
    });
  });
  frag.appendChild(globalToggle);

  return frag;
}

function buildSettingsAboutPanel() {
  const frag = document.createElement('div');
  frag.className = 'settings-panel';

  const h = document.createElement('h2');
  h.className = 'settings-panel-title';
  h.dataset.i18n = 'settings.section_about';
  h.textContent = t('settings.section_about');
  frag.appendChild(h);

  const aboutLine = document.createElement('p');
  aboutLine.className = 'settings-about-line';

  const aboutVersion = document.createElement('p');
  aboutVersion.className = 'settings-about-version';

  const githubBtn = document.createElement('button');
  githubBtn.type = 'button';
  githubBtn.className = 'btn btn-lang';
  githubBtn.dataset.i18n = 'settings.github';
  githubBtn.textContent = t('settings.github');

  window.blip.getAppMetadata?.().then((meta) => {
    const name = meta?.displayName || 'BLIP';
    const code = meta?.codename ? ` · ${meta.codename}` : '';
    aboutLine.textContent = `${name}${code}`;
    aboutVersion.textContent = `v${meta?.version ?? '—'}`;
    if (meta?.githubUrl) {
      githubBtn.addEventListener('click', () => window.blip.openExternal?.(meta.githubUrl));
    } else {
      githubBtn.disabled = true;
    }
  }).catch(() => {});

  const linkRow = document.createElement('div');
  linkRow.className = 'settings-about-links';

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

  linkRow.appendChild(changelogBtn);
  linkRow.appendChild(releasesAboutBtn);

  frag.appendChild(aboutLine);
  frag.appendChild(aboutVersion);
  frag.appendChild(githubBtn);
  frag.appendChild(linkRow);
  return frag;
}

function buildSettingsSystemPanel() {
  const frag = document.createElement('div');
  frag.className = 'settings-panel';

  const h = document.createElement('h2');
  h.className = 'settings-panel-title';
  h.dataset.i18n = 'settings.section_system';
  h.textContent = t('settings.section_system');
  frag.appendChild(h);

  const tray = buildCloseToTraySection();
  if (tray) {
    frag.appendChild(tray);
  } else {
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
  const h = document.createElement('h2');
  h.className = 'settings-panel-title';
  h.dataset.i18n = 'settings.section_appearance';
  h.textContent = t('settings.section_appearance');
  wrap.appendChild(h);
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
      return t('settings.updates_status_error').replace('{m}', u.message || '');
    default:
      return t('settings.updates_status_idle');
  }
}

function buildSettingsUpdatesPanel() {
  const frag = document.createElement('div');
  frag.className = 'settings-panel';

  const h = document.createElement('h2');
  h.className = 'settings-panel-title';
  h.dataset.i18n = 'settings.section_updates';
  h.textContent = t('settings.section_updates');
  frag.appendChild(h);

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
  releasesFeed.className = 'settings-releases-feed';
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
    for (const r of result.releases) {
      const card = document.createElement('article');
      card.className = 'settings-release-card glass';

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
        pre.textContent = 'pre';
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
    verLine.textContent = `v${meta?.version ?? '—'}`;
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

function renderSettingsMainPanel() {
  if (state.settingsSection == null) {
    return buildSettingsPlaceholderPanel();
  }
  switch (state.settingsSection) {
    case 'profile':
      return buildSettingsProfilePanel();
    case 'language':
      return buildSettingsLanguagePanel();
    case 'notifications':
      return buildSettingsNotificationsPanel();
    case 'privacy':
      return buildSettingsPrivacyPanel();
    case 'sound':
      return buildSettingsSoundPanel();
    case 'shortcuts':
      return buildSettingsShortcutsPanel();
    case 'call':
      return buildSettingsCallPanel();
    case 'appearance':
      return buildAppearancePanelWithTitle();
    case 'network':
      return buildSettingsNetworkPanel();
    case 'system':
      return buildSettingsSystemPanel();
    case 'updates':
      return buildSettingsUpdatesPanel();
    case 'about':
      return buildSettingsAboutPanel();
    default:
      return buildSettingsPlaceholderPanel();
  }
}

function renderSettingsNavAside() {
  const aside = document.createElement('aside');
  aside.className = 'settings-shell__nav glass';

  for (const id of getSettingsSectionIds()) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn settings-nav-btn${state.settingsSection === id ? ' selected' : ''}`;
    b.dataset.i18n = `settings.section_${id}`;
    b.textContent = t(`settings.section_${id}`);
    b.addEventListener('click', () => {
      state.settingsSection = id;
      renderView('settings');
    });
    aside.appendChild(b);
  }
  return aside;
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

async function openChat(peerId) {
  const id = Number(peerId);
  if (!Number.isFinite(id)) return;

  if (isBlocked(id)) {
    showAppToast({ title: t('peers.blocked_chat'), durationMs: 5000 });
    return;
  }

  if (!isTrusted(id)) {
    const ok = await openConfirmDialog({
      title: t('peers.trust_title'),
      body: t('peers.trust_body').replace('{id}', String(id)),
      confirmLabel: t('peers.trust_confirm'),
    });
    if (!ok) return;
    trustPeer(id);
  }

  state.activePeer = id;
  state.activeGroup = null;
  state.view = 'chat';
  clearUnread(id);
  const chat = ensureChatView(id);
  chat.markRead?.();
  if (mainContent?.isConnected) {
    renderView('chat');
  } else {
    render();
  }
}

function renderChatHubView() {
  const wrap = document.createElement('div');
  wrap.className = 'view chat-hub-view';

  const title = document.createElement('h2');
  title.className = 'section-title';
  title.dataset.i18n = 'chat.title';
  title.textContent = t('chat.title');

  const list = document.createElement('div');
  list.className = 'chat-hub-list';

  getAllGroups().forEach((group) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'chat-hub-row glass chat-hub-row--group online';
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
    const badge = document.createElement('span');
    badge.className = 'chat-hub-group-tag';
    badge.textContent = 'GRP';
    item.appendChild(badge);
    item.appendChild(info);
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

  if (rows.length === 0 && getAllGroups().length === 0) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.dataset.i18n = 'chat.pick_peer';
    empty.textContent = t('chat.pick_peer');
    list.appendChild(empty);
  } else if (rows.length > 0) {
    rows.forEach((row) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `chat-hub-row glass ${row.online ? 'online' : 'offline'}`;

      const avatar = createAvatarElement(row.blipId, 2, { selfBlipId: state.config.blipId });
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
      const peer = state.peers.find((p) => p.blipId === row.blipId);
      dot.className = `status-dot ${peerPresenceClass(peer || { online: row.online })}`;

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
      item.addEventListener('click', () => openChat(row.blipId));
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
  state.view = viewName;
  mainContent.innerHTML = '';

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

  mainContent.appendChild(view);
  applyI18n(mainContent);

  updateNavActive();

  if (viewName === 'peers') {
    void runMeshPulseRound();
  }
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
    if (view === 'chat' && state.view === 'chat') {
      state.activePeer = null;
      state.activeGroup = null;
    }
    if (view === 'settings') {
      state.settingsSection = null;
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
  api = blipApi;
  state.config = config;
  initPeerTrust(config, blipApi);
  setLang(config.language || localStorage.getItem('blip_lang') || 'en');
  applySoundPrefsFromConfig(config);
  applyAppearance(state.config);
  appearanceListenerDispose?.();
  appearanceListenerDispose = listenReducedMotion(() => {});

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
    });
  }

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

  window.addEventListener('blip-peer-trust-changed', () => {
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

  window.addEventListener('blip-groups-changed', () => {
    if (state.view !== 'chat') return;
    if (state.activeGroup && !getGroup(state.activeGroup)) {
      closeGroupChatUi(state.activeGroup);
    }
    if (!state.activePeer && !state.activeGroup) {
      renderView('chat');
    } else if (state.activeGroup) {
      const g = getGroup(state.activeGroup);
      if (g) ensureGroupChatView(state.activeGroup)?.updateGroup?.(g);
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

  peers.forEach((p) => {
    if (p.online && !prevOnline.has(p.blipId)) {
      logPeerEvent(p.blipId, 'online');
      if (!state.config?.doNotDisturb) sounds.peerOnline();
    } else if (!p.online && prevOnline.has(p.blipId)) {
      logPeerEvent(p.blipId, 'offline');
      if (!state.config?.doNotDisturb) sounds.peerOffline();
    }
    const chat = state.chatViews.get(p.blipId);
    if (chat) chat.setPeerName(formatPeerDisplayName(p));
  });

  if (gridComponent) {
    gridComponent.updateOccupied(occupiedIds.filter((id) => id !== state.config.blipId));
  }

  migrateGroupsHost(getAllGroups(), nextOnline, api, state.config);

  /* Never full re-render during active conversation (fixes scroll jump + input focus loss) */
  if (state.view === 'chat' && (state.activePeer || state.activeGroup) && mainContent) {
    return;
  }

  if (state.view === 'peers' && mainContent) {
    renderView('peers');
  }
  if (state.view === 'chat' && !state.activePeer && mainContent) {
    renderView('chat');
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
  if (msg.type?.startsWith?.('file-')) {
    if (isBlocked(Number(msg.from))) return;
    handleFileTransferTcp(msg, {
      config: state.config,
      onProgress: () => {},
      onComplete: (peerId, payload) => {
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
    });
    return;
  }

  if (msg.type?.startsWith?.('group-')) {
    void handleGroupTcpMessage(msg, {
      api,
      config: state.config,
      statePeers: state.peers,
      getGroupChatView: (id) => state.groupChatViews.get(id),
      openGroupChat,
      bumpGroupUnread: (groupId) => {
        if (state.view === 'chat' && state.activeGroup === groupId) return;
        unreadByGroup.set(groupId, (unreadByGroup.get(groupId) || 0) + 1);
        if (state.view === 'chat' && !state.activePeer && !state.activeGroup) {
          renderView('chat');
        }
      },
      onGroupRemoved: (groupId) => {
        closeGroupChatUi(groupId);
        unreadByGroup.delete(groupId);
        if (state.view === 'chat') renderView('chat');
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

  if (msg.type === 'receipt') {
    if (applyReceiptToMessage(peerId, msg.messageId, msg.receipt)) {
      state.chatViews.get(peerId)?.renderMessages?.();
    }
    return;
  }

  if (msg.type === 'reaction') {
    state.chatViews.get(peerId)?.handleReaction?.(msg);
    return;
  }

  if (msg.type !== 'message') return;

  routePeerMessage(msg);
}

function routePeerMessage(msg) {
  const peerId = Number(msg.from === state.config.blipId ? msg.to : msg.from);
  if (!Number.isFinite(peerId) || isBlocked(peerId)) return;

  ensureChatView(peerId);
  state.chatViews.get(peerId)?.handleIncoming(msg);

  if (state.view === 'chat' && state.activePeer === peerId) {
    return;
  }

  bumpUnread(peerId);

  let preview = typeof msg.text === 'string' ? msg.text.slice(0, 120) : '';
  if (msg.attachment?.kind === 'file') {
    preview = t('chat.file_preview').replace('{name}', msg.attachment.name || 'file');
  } else if (msg.attachment?.kind === 'image') {
    preview = t('chat.image_preview');
  }
  showMessageToast(peerId, preview);

  const typingOther =
    state.view === 'chat' &&
    state.activePeer &&
    state.activePeer !== peerId &&
    document.activeElement?.closest?.('.chat-input-row');

  if (typingOther) {
    return;
  }

  state.view = 'chat';
  state.activePeer = peerId;
  clearUnread(peerId);
  if (mainContent?.isConnected) renderView('chat');
}

export function getCallUI() {
  return null;
}
