import { t, setLang, getLang, applyLangChange, onLangChange } from './i18n.js';
import { createIdGrid } from './grid.js';
import { createChatView, getMessages, addMessage } from './chat.js';
import { showSignalLost } from './call.js';
import {
  createAvatarElement,
  encodeAvatarFileToDataUrl,
  clearCustomAvatar,
  hasCustomAvatar,
  setCustomAvatarDataUrl,
} from './avatar.js';
import { sounds } from './audio.js';
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
  chatViews: new Map(),
  /** `null` = no subsection selected (placeholder in content column). */
  settingsSection: null,
};

/** Last payload from main `update-status` (auto-updater). */
let lastUpdateStatus = null;

let rootEl = null;
let mainContent = null;
let gridComponent = null;
let api = null;
let appearanceListenerDispose = null;

async function openCallOutgoing(peerId, video = false) {
  if (!window.blip?.openCallOutgoing) return;
  try {
    await window.blip.openCallOutgoing({ peerId, video });
  } catch (e) {
    console.error('[BLIP] openCallOutgoing', e);
  }
}

function showMessageToast(peerId, preview) {
  const el = document.createElement('div');
  el.className = 'app-toast glass';
  el.innerHTML = `<strong>${t('toast.new_message')} · #${peerId}</strong>
    <p class="toast-preview">${escapeHtml(preview || '')}</p>
    <button type="button" class="btn btn-accent toast-open">${t('toast.open_chat')}</button>`;
  el.querySelector('.toast-open')?.addEventListener('click', () => {
    el.remove();
    openChat(peerId);
  });
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('toast-out'), 8200);
  setTimeout(() => el.remove(), 9000);
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

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
    openCallOutgoing(id, false);
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

      const avatar = createAvatarElement(peer.blipId, 2, { selfBlipId: state.config.blipId });
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
    if (peer.online) openCallOutgoing(peer.blipId, false);
  });

  menu.appendChild(msgItem);
  menu.appendChild(callItem);
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
  fileInput.accept = 'image/png,image/webp,image/jpeg';
  fileInput.setAttribute('aria-hidden', 'true');
  fileInput.tabIndex = -1;
  fileInput.style.cssText = 'position:absolute;width:0;height:0;opacity:0;pointer-events:none';

  const uploadBtn = document.createElement('button');
  uploadBtn.type = 'button';
  uploadBtn.className = 'btn btn-accent';
  uploadBtn.dataset.i18n = 'settings.avatar_upload';
  uploadBtn.textContent = t('settings.avatar_upload');
  uploadBtn.addEventListener('click', () => fileInput.click());

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

  col.appendChild(uploadBtn);
  col.appendChild(removeBtn);
  col.appendChild(fileInput);
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
  const lang = getLang() === 'ru' ? 'ru' : 'en';
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
    btn.textContent = labelTheme(id, lang);
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
    btn.textContent = labelTheme(id, lang);
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
    btn.textContent = labelBg(id, lang);
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

function getSettingsSectionIds() {
  const ids = ['profile', 'appearance', 'system', 'updates', 'about'];
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

  frag.appendChild(nameLabel);
  frag.appendChild(nameInput);
  frag.appendChild(buildAvatarSettingsSection());
  frag.appendChild(idRow);
  frag.appendChild(langLabel);
  frag.appendChild(langRow);
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

  frag.appendChild(aboutLine);
  frag.appendChild(aboutVersion);
  frag.appendChild(githubBtn);
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
    case 'appearance':
      return buildAppearancePanelWithTitle();
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
  setLang(config.language || localStorage.getItem('blip_lang') || 'en');
  applyAppearance(state.config);
  appearanceListenerDispose?.();
  appearanceListenerDispose = listenReducedMotion(() => {});

  rootEl = document.getElementById('app');
  if (!rootEl) {
    throw new Error('#app element not found');
  }
  rootEl.innerHTML = '';
  mainContent = null;

  const titleBar = createTitleBar();
  rootEl.appendChild(titleBar);

  /* Calls use a separate BrowserWindow — see main/index.js + call-window.html */

  onLangChange(() => {
    applyI18n(rootEl);
    if (state.config.blipId) {
      renderView(state.view || 'dial');
    } else if (mainContent) {
      applyI18n(mainContent);
    }
  });

  if (typeof window.blip.onUpdateStatus === 'function') {
    window.blip.onUpdateStatus((payload) => {
      lastUpdateStatus = payload;
      if (state.view === 'settings' && state.settingsSection === 'updates') {
        renderView('settings');
      }
    });
  }

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

  /* Never full re-render during active conversation (fixes scroll jump + input focus loss) */
  if (state.view === 'chat' && state.activePeer && mainContent) {
    return;
  }

  if (state.view === 'peers' && mainContent) {
    renderView('peers');
  }
  if (state.view === 'chat' && !state.activePeer && mainContent) {
    renderView('chat');
  }
}

export function handleTcpMessage(msg) {
  const peerId = msg.from === state.config.blipId ? msg.to : msg.from;

  ensureChatView(peerId);
  state.chatViews.get(peerId)?.handleIncoming(msg);

  if (state.view === 'chat' && state.activePeer === peerId) {
    return;
  }

  const preview = typeof msg.text === 'string' ? msg.text.slice(0, 120) : '';
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
  if (mainContent?.isConnected) renderView('chat');
}

export function getCallUI() {
  return null;
}
