import { t, setLang, getLang, applyLangChange, onLangChange } from './i18n.js';
import { createIdGrid } from './grid.js';
import { createChatView, getMessages, addMessage } from './chat.js';
import { createCallUI, showSignalLost } from './call.js';
import { createAvatarElement } from './avatar.js';
import { sounds } from './audio.js';

let state = {
  config: null,
  peers: [],
  occupiedIds: [],
  view: 'grid',
  activePeer: null,
  chatViews: new Map(),
};

let rootEl = null;
let mainContent = null;
let callUI = null;
let gridComponent = null;
let api = null;

function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    if (key) el.textContent = t(key);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    if (key) el.placeholder = t(key);
  });
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

function ensureChatView(peerId) {
  if (!state.chatViews.has(peerId)) {
    const peer = state.peers.find((p) => p.blipId === peerId);
    const chat = createChatView(
      peerId,
      state.config,
      (to, text) => api.sendTcpMessage({ to, text }),
      () => {
        state.activePeer = null;
        renderView('chat');
      }
    );
    if (peer) chat.setPeerName(peer.displayName);
    state.chatViews.set(peerId, chat);
  }
  return state.chatViews.get(peerId);
}

function updateNavActive() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    const view = btn.dataset.view;
    let active = view === state.view;
    if (view === 'chat' && state.view === 'chat') active = true;
    btn.classList.toggle('active', active);
  });
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

  const title = document.createElement('h2');
  title.className = 'section-title';
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
    callUI?.startOutgoing(id, false);
  });

  actions.appendChild(msgBtn);
  actions.appendChild(callBtn);
  wrap.appendChild(title);
  wrap.appendChild(input);
  wrap.appendChild(actions);
  return wrap;
}

function renderPeersView() {
  const wrap = document.createElement('div');
  wrap.className = 'view peers-view';

  const title = document.createElement('h2');
  title.className = 'section-title';
  title.dataset.i18n = 'peers.title';
  title.textContent = t('peers.title');

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
    state.peers.forEach((peer) => {
      const row = document.createElement('div');
      row.className = `peer-row glass ${peer.online ? 'online' : 'offline'}`;

      const avatar = createAvatarElement(peer.blipId, 2);
      const info = document.createElement('div');
      info.className = 'peer-info';
      const name = document.createElement('span');
      name.className = 'peer-name';
      name.textContent = peer.displayName;
      const idSpan = document.createElement('span');
      idSpan.className = 'peer-id';
      idSpan.textContent = `#${peer.blipId}`;
      info.appendChild(name);
      info.appendChild(idSpan);

      const dot = document.createElement('span');
      dot.className = `status-dot ${peer.online ? 'online' : 'offline'}`;
      dot.title = peer.online ? t('peers.online') : t('peers.offline');

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
  wrap.appendChild(list);
  return wrap;
}

function showPeerContextMenu(e, peer) {
  const menu = document.createElement('div');
  menu.className = 'context-menu glass';
  menu.style.left = `${e.clientX}px`;
  menu.style.top = `${e.clientY}px`;

  const msgItem = document.createElement('button');
  msgItem.type = 'button';
  msgItem.textContent = t('dial.message');
  msgItem.addEventListener('click', () => {
    menu.remove();
    openChat(peer.blipId);
  });

  const callItem = document.createElement('button');
  callItem.type = 'button';
  callItem.textContent = t('dial.call');
  callItem.addEventListener('click', () => {
    menu.remove();
    if (peer.online) callUI?.startOutgoing(peer.blipId, false);
  });

  menu.appendChild(msgItem);
  menu.appendChild(callItem);
  document.body.appendChild(menu);

  const close = () => menu.remove();
  setTimeout(() => {
    document.addEventListener('click', close, { once: true });
  }, 0);
}

function renderSettingsView() {
  const wrap = document.createElement('div');
  wrap.className = 'view settings-view';

  const title = document.createElement('h2');
  title.className = 'section-title';
  title.dataset.i18n = 'settings.title';
  title.textContent = t('settings.title');

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
  idRow.appendChild(idLabel);
  idRow.appendChild(changeIdBtn);

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
      renderView('settings');
    });
    langRow.appendChild(btn);
  });

  nameInput.addEventListener('change', async () => {
    const name = nameInput.value.trim() || 'Anonymous';
    state.config.displayName = name;
    await api.saveConfig({ displayName: name });
  });

  wrap.appendChild(title);
  wrap.appendChild(nameLabel);
  wrap.appendChild(nameInput);
  wrap.appendChild(idRow);
  wrap.appendChild(langLabel);
  wrap.appendChild(langRow);
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

function openChat(peerId) {
  state.activePeer = peerId;
  state.view = 'chat';
  ensureChatView(peerId);
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

  const peerIds = new Set();
  state.peers.forEach((p) => peerIds.add(p.blipId));
  for (const id of state.chatViews.keys()) peerIds.add(id);

  const rows = [...peerIds]
    .map((id) => {
      const peer = state.peers.find((p) => p.blipId === id);
      const msgs = getMessages(id);
      return {
        blipId: id,
        displayName: peer?.displayName || `BLIP-${id}`,
        online: peer?.online ?? false,
        lastMsg: msgs[msgs.length - 1],
      };
    })
    .sort((a, b) => {
      const ta = a.lastMsg?.timestamp ?? 0;
      const tb = b.lastMsg?.timestamp ?? 0;
      if (tb !== ta) return tb - ta;
      if (a.online !== b.online) return a.online ? -1 : 1;
      return a.blipId - b.blipId;
    });

  if (rows.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.dataset.i18n = 'chat.pick_peer';
    empty.textContent = t('chat.pick_peer');
    list.appendChild(empty);
  } else {
    rows.forEach((row) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `chat-hub-row glass ${row.online ? 'online' : 'offline'}`;

      const avatar = createAvatarElement(row.blipId, 2);
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
        preview.textContent = row.lastMsg.text.slice(0, 48);
        info.appendChild(preview);
      }

      const dot = document.createElement('span');
      dot.className = `status-dot ${row.online ? 'online' : 'offline'}`;

      item.appendChild(avatar);
      item.appendChild(info);
      item.appendChild(dot);
      item.addEventListener('click', () => openChat(row.blipId));
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
      if (state.activePeer) {
        const chat = ensureChatView(state.activePeer);
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
}

function render() {
  if (!state.config.blipId) {
    showGridView();
    return;
  }

  const layout = document.createElement('div');
  layout.className = 'app-layout';

  const nav = createNav((view) => {
    if (view === 'chat' && state.view === 'chat' && state.activePeer) {
      state.activePeer = null;
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
  setLang(config.language || localStorage.getItem('blip_lang') || 'en');

  rootEl = document.getElementById('app');
  if (!rootEl) {
    throw new Error('#app element not found');
  }
  rootEl.innerHTML = '';
  mainContent = null;

  const titleBar = createTitleBar();
  rootEl.appendChild(titleBar);

  callUI = createCallUI(config, blipApi);
  rootEl.appendChild(callUI.el);

  onLangChange(() => {
    applyI18n(rootEl);
    if (state.config.blipId) {
      renderView(state.view || 'dial');
    } else if (mainContent) {
      applyI18n(mainContent);
    }
  });

  render();
}

export function updatePeers({ peers, occupiedIds }) {
  const prevOnline = new Set(state.peers.filter((p) => p.online).map((p) => p.blipId));
  state.peers = peers;
  state.occupiedIds = occupiedIds;

  peers.forEach((p) => {
    if (p.online && !prevOnline.has(p.blipId)) {
      sounds.peerOnline();
    }
    const chat = state.chatViews.get(p.blipId);
    if (chat) chat.setPeerName(p.displayName);
  });

  if (gridComponent) {
    gridComponent.updateOccupied(occupiedIds.filter((id) => id !== state.config.blipId));
  }

  if ((state.view === 'peers' || state.view === 'chat') && mainContent) {
    renderView(state.view);
  }
}

export function handleTcpMessage(msg) {
  const peerId = msg.from === state.config.blipId ? msg.to : msg.from;
  ensureChatView(peerId);
  state.chatViews.get(peerId)?.handleIncoming(msg);

  if (state.view !== 'chat' || state.activePeer !== peerId) {
    state.view = 'chat';
    state.activePeer = peerId;
    if (mainContent?.isConnected) renderView('chat');
  }
}

export function getCallUI() {
  return callUI;
}
