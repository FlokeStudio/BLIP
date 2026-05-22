import { t } from './i18n.js';
import { createAvatarElement } from './avatar.js';
import { formatPeerDisplayName } from './peer-labels.js';
import { getPeerPrivateNote, setPeerPrivateNote } from './peer-private-notes.js';
import { getPeerProfileGifDataUrl } from './peer-gif-cache.js';
import { appendMeshPlusBadgeToNameRow } from './mesh-plus.js';
import { computeGifFramePx } from './gif-frame-size.js';

const CLOUD_MAX_W = 88;
const CLOUD_MAX_H = 50;

function applyGifCloudSize(cloudEl, imgEl) {
  const nw = imgEl.naturalWidth || 160;
  const nh = imgEl.naturalHeight || 90;
  const { w, h } = computeGifFramePx(nw, nh, CLOUD_MAX_W, CLOUD_MAX_H);
  cloudEl.style.width = `${w}px`;
  cloudEl.style.height = `${h}px`;
}

/**
 * @param {object} peer
 * @param {object} hooks
 * @returns {{ el: HTMLElement, refresh: () => void, destroy: () => void }}
 */
export function buildProfileCard(peerInput, hooks = {}) {
  let peer = peerInput;
  const {
    selfBlipId = null,
    isBlocked = () => false,
    presenceClass = defaultPresenceClass,
    statusTooltip = defaultStatusTooltip,
    getProfileGifUrl,
    showPrivateNote = false,
    showActions = false,
    showBanner = true,
    onMessage,
    onCall,
    onBlock,
    onPing,
    isSelfPreview = false,
  } = hooks;

  if (isSelfPreview && hooks.meshPlusOnSelf) {
    peer = { ...peer, meshPlus: true };
  }

  const card = document.createElement('div');
  card.className = 'peer-profile-card glass';

  if (showBanner) {
    const banner = document.createElement('div');
    banner.className = 'peer-profile-banner';
    if (peer.meshPlus) banner.classList.add('peer-profile-banner--mesh-plus');
    if (peer.online) banner.classList.add('peer-profile-banner--online');
    banner.title = t('peers.profile_banner_future');
    banner.dataset.i18nTitle = 'peers.profile_banner_future';
    card.appendChild(banner);
  }

  const body = document.createElement('div');
  body.className = 'peer-profile-body';

  const layout = document.createElement('div');
  layout.className = 'peer-profile-layout';

  const aside = document.createElement('aside');
  aside.className = 'peer-profile-aside';

  const cloudWrap = document.createElement('div');
  cloudWrap.className = 'profile-gif-cloud-wrap hidden';
  const cloud = document.createElement('div');
  cloud.className = 'profile-gif-cloud';
  const cloudImg = document.createElement('img');
  cloudImg.className = 'profile-gif-cloud__img hidden';
  cloudImg.alt = '';
  cloud.appendChild(cloudImg);
  cloudWrap.appendChild(cloud);

  const avatarWrap = document.createElement('div');
  avatarWrap.className = 'peer-profile-avatar-large';
  avatarWrap.appendChild(
    createAvatarElement(peer.blipId, 8, { selfBlipId })
  );

  const asideStack = document.createElement('div');
  asideStack.className = 'peer-profile-aside-stack';
  asideStack.appendChild(cloudWrap);
  asideStack.appendChild(avatarWrap);
  aside.appendChild(asideStack);

  const main = document.createElement('div');
  main.className = 'peer-profile-main';

  const head = document.createElement('header');
  head.className = 'peer-profile-head';

  const nameRow = document.createElement('div');
  nameRow.className = 'peer-profile-name-row';
  const nameLine = document.createElement('div');
  nameLine.className = 'peer-profile-name-line';
  const nameEl = document.createElement('h1');
  nameEl.className = 'peer-profile-name';
  nameEl.textContent = formatPeerDisplayName(peer);
  const nameStatusDot = document.createElement('span');
  nameStatusDot.className = 'status-dot peer-profile-name-dot';
  nameStatusDot.title = statusTooltip(peer);
  nameLine.appendChild(nameEl);
  nameLine.appendChild(nameStatusDot);
  nameRow.appendChild(nameLine);
  appendMeshPlusBadgeToNameRow(nameRow, peer);
  if (peer.meshLegacy) {
    const leg = document.createElement('span');
    leg.className = 'peer-handshake-badge peer-handshake-badge--legacy';
    leg.title = t('peers.handshake_legacy');
    leg.textContent = '!';
    nameRow.appendChild(leg);
  }

  const idEl = document.createElement('div');
  idEl.className = 'peer-profile-id';
  idEl.textContent = `BLIP #${peer.blipId}`;

  const customStatusEl = document.createElement('div');
  customStatusEl.className = 'peer-profile-custom-status hidden';

  head.appendChild(nameRow);
  head.appendChild(idEl);
  head.appendChild(customStatusEl);
  main.appendChild(head);

  let noteInput = null;
  let noteSaveTimer = null;
  if (showPrivateNote && !isSelfPreview) {
    const noteSection = document.createElement('section');
    noteSection.className = 'peer-profile-note';
    const noteTitle = document.createElement('div');
    noteTitle.className = 'peer-profile-note-title';
    noteTitle.dataset.i18n = 'peers.profile_note_title';
    noteTitle.textContent = t('peers.profile_note_title');
    noteInput = document.createElement('textarea');
    noteInput.className = 'peer-profile-note-input input';
    noteInput.rows = 3;
    noteInput.maxLength = 500;
    noteInput.placeholder = t('peers.profile_note_placeholder');
    noteInput.value = getPeerPrivateNote(peer.blipId);
    noteInput.addEventListener('input', () => {
      if (noteSaveTimer) clearTimeout(noteSaveTimer);
      noteSaveTimer = setTimeout(() => {
        setPeerPrivateNote(peer.blipId, noteInput.value);
      }, 280);
    });
    noteInput.addEventListener('blur', () => {
      if (noteSaveTimer) clearTimeout(noteSaveTimer);
      setPeerPrivateNote(peer.blipId, noteInput.value);
    });
    noteSection.appendChild(noteTitle);
    noteSection.appendChild(noteInput);
    main.appendChild(noteSection);
  }

  let msgBtn;
  let callBtn;
  let blockBtn;
  if (showActions) {
    const actions = document.createElement('div');
    actions.className = 'peer-profile-actions';
    msgBtn = document.createElement('button');
    msgBtn.type = 'button';
    msgBtn.className = 'btn btn-accent peer-profile-action-btn';
    msgBtn.textContent = t('peers.profile_message');
    msgBtn.addEventListener('click', () => onMessage?.());
    callBtn = document.createElement('button');
    callBtn.type = 'button';
    callBtn.className = 'btn btn-lang peer-profile-action-btn';
    callBtn.textContent = t('peers.profile_call');
    callBtn.addEventListener('click', () => onCall?.());
    blockBtn = document.createElement('button');
    blockBtn.type = 'button';
    blockBtn.className = 'btn btn-danger peer-profile-action-btn';
    blockBtn.addEventListener('click', () => {
      onBlock?.();
      syncBlockBtn();
    });
    actions.appendChild(msgBtn);
    actions.appendChild(callBtn);
    actions.appendChild(blockBtn);
    main.appendChild(actions);
  }

  layout.appendChild(aside);
  layout.appendChild(main);
  body.appendChild(layout);
  card.appendChild(body);

  function syncBlockBtn() {
    if (!blockBtn) return;
    const blocked = isBlocked(peer.blipId);
    blockBtn.textContent = t(blocked ? 'peers.profile_unblock' : 'peers.profile_block');
  }

  async function resolveGifUrl() {
    if (getProfileGifUrl) {
      const u = await getProfileGifUrl(peer);
      return u || null;
    }
    if (selfBlipId != null && Number(peer.blipId) === Number(selfBlipId)) {
      return (await window.blip?.getProfileGifActiveUrl?.()) || null;
    }
    return getPeerProfileGifDataUrl(peer.blipId);
  }

  function setPeer(nextPeer) {
    if (!nextPeer || nextPeer.blipId == null) return;
    peer = nextPeer;
    if (peer.online && !pulseTimer) {
      pulseTimer = window.setInterval(refresh, 2000);
    } else if (!peer.online && pulseTimer) {
      clearInterval(pulseTimer);
      pulseTimer = null;
    }
  }

  function refresh() {
    const pClass = presenceClass(peer);
    const tip = statusTooltip(peer);
    nameStatusDot.className = `status-dot peer-profile-name-dot ${pClass}`;
    nameStatusDot.title = tip;
    nameEl.textContent = formatPeerDisplayName(peer);
    const custom = (peer.presenceText || '').trim();
    if (custom && peer.online) {
      customStatusEl.textContent = custom;
      customStatusEl.classList.remove('hidden');
    } else {
      customStatusEl.textContent = '';
      customStatusEl.classList.add('hidden');
    }
    if (callBtn) callBtn.disabled = !peer.online;
    syncBlockBtn();

    void resolveGifUrl()
      .then((url) => {
        if (url) {
          cloudWrap.classList.remove('hidden');
          cloudImg.onload = () => applyGifCloudSize(cloud, cloudImg);
          cloudImg.decoding = 'async';
          cloudImg.src = url;
          cloudImg.classList.remove('hidden');
          cloud.classList.add('profile-gif-cloud--active');
          if (cloudImg.complete && cloudImg.naturalWidth) {
            applyGifCloudSize(cloud, cloudImg);
          }
        } else {
          cloudWrap.classList.add('hidden');
          cloudImg.removeAttribute('src');
          cloudImg.onload = null;
          cloudImg.classList.add('hidden');
          cloud.classList.remove('profile-gif-cloud--active');
          cloud.style.width = '';
          cloud.style.height = '';
        }
      })
      .catch(() => {
        cloudWrap.classList.add('hidden');
        cloudImg.removeAttribute('src');
        cloudImg.onload = null;
        cloudImg.classList.add('hidden');
        cloud.classList.remove('profile-gif-cloud--active');
      });
  }

  refresh();
  let pulseTimer = null;
  if (peer.online) {
    pulseTimer = window.setInterval(refresh, 2000);
  }

  return {
    el: card,
    refresh,
    setPeer,
    destroy() {
      if (noteSaveTimer) clearTimeout(noteSaveTimer);
      if (noteInput) setPeerPrivateNote(peer.blipId, noteInput.value);
      if (pulseTimer) {
        clearInterval(pulseTimer);
        pulseTimer = null;
      }
    },
  };
}

function defaultPresenceClass(peer) {
  if (!peer?.online) return 'offline';
  if (peer.presence === 'away') return 'away';
  if (peer.presence === 'busy') return 'busy';
  return 'online';
}

function defaultStatusTooltip(peer) {
  const base =
    defaultPresenceClass(peer) === 'away'
      ? t('peers.away')
      : defaultPresenceClass(peer) === 'busy'
        ? t('peers.busy')
        : peer?.online
          ? t('peers.online')
          : t('peers.offline');
  const custom = (peer?.presenceText || '').trim();
  return custom && peer?.online ? `${base} · ${custom}` : base;
}
