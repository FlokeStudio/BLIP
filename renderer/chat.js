import { t } from './i18n.js';
import { sounds } from './audio.js';
import { createAvatarElement } from './avatar.js';
import { attachEmojiPicker } from './emoji-picker.js';
import {
  encodeChatImageAttachment,
  isImageFile,
  isVideoFile,
  validateChatFile,
  registerMediaPlaceholder,
} from './chat-attachments.js';
import {
  appendChatMessageBody,
  buildReplyPreview,
  formatReplyFromLabel,
} from './chat-message-content.js';
import { normalizeFileLimitGb } from './file-transfer-limits.js';

function formatFileLimitLabelForChat(config) {
  return `${normalizeFileLimitGb(config?.maxFileTransferGb)} GB`;
}
import { createMessageId } from './message-id.js';
import { getPinnedMessageId, setPinnedMessageId } from './chat-pins.js';
import { exportPeerChatJson, exportPeerChatPdf } from './chat-export.js';

const STORAGE_KEY = 'blip_chat_v1';
const MAX_PER_PEER = 500;
const DEFAULT_REACTION = '➕';

export function getDefaultReactionEmoji(config) {
  const e = config?.defaultReactionEmoji;
  return typeof e === 'string' && e.trim() ? e.trim() : DEFAULT_REACTION;
}

const messagesByPeer = new Map();

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const o = JSON.parse(raw);
    for (const [k, arr] of Object.entries(o)) {
      const id = Number(k);
      if (Number.isFinite(id) && Array.isArray(arr)) {
        messagesByPeer.set(id, arr.slice(-MAX_PER_PEER));
      }
    }
  } catch (e) {
    console.warn('[BLIP chat] load history', e);
  }
}

function persist() {
  try {
    const o = {};
    for (const [k, msgs] of messagesByPeer) {
      o[k] = msgs.slice(-MAX_PER_PEER);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(o));
  } catch (e) {
    console.warn('[BLIP chat] persist', e);
  }
}

loadFromStorage();

function formatChatTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function getMessages(peerId) {
  if (!messagesByPeer.has(peerId)) messagesByPeer.set(peerId, []);
  return messagesByPeer.get(peerId);
}

export function addMessage(peerId, msg) {
  const list = getMessages(peerId);
  list.push(msg);
  persist();
  return list;
}

export function findMessage(peerId, messageId) {
  if (!messageId) return null;
  return getMessages(peerId).find((m) => m.id === messageId) || null;
}

export function toggleReactionOnMessage(peerId, messageId, emoji, fromPeerId) {
  const m = findMessage(peerId, messageId);
  if (!m || !emoji) return false;
  if (!m.reactions) m.reactions = {};
  const list = m.reactions[emoji] || [];
  const idx = list.indexOf(fromPeerId);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(fromPeerId);
  if (list.length) m.reactions[emoji] = list;
  else delete m.reactions[emoji];
  persist();
  return true;
}

export function clearPeerMessages(peerId) {
  messagesByPeer.delete(peerId);
  setPinnedMessageId(peerId, null);
  persist();
}

export function applyMessageEdit(peerId, messageId, text, editedAt) {
  const m = findMessage(peerId, messageId);
  if (!m) return false;
  m.text = String(text ?? '');
  m.editedAt = editedAt || Date.now();
  persist();
  return true;
}

export function exportPeerChat(peerId, displayName) {
  const msgs = getMessages(peerId);
  const label = displayName || `BLIP-${peerId}`;
  const lines = msgs.map((m) => {
    const who = m.outgoing ? 'You' : label;
    const time = new Date(m.timestamp || Date.now()).toLocaleString();
    let body = m.text || '';
    if (m.attachment?.kind === 'image') body = `[image] ${body}`.trim();
    else if (m.attachment?.kind === 'file') body = `[file] ${m.attachment.name || ''} ${body}`.trim();
    return `[${time}] ${who}: ${body}`;
  });
  const body = lines.length ? `${lines.join('\n')}\n` : '';
  const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `blip-${peerId}-chat.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export function createChatView(
  peerId,
  getConfig,
  onSend,
  onBack,
  onTyping,
  onReaction,
  onSendFile,
  onPeerMenu,
  onPin,
  onEdit
) {
  registerMediaPlaceholder(t('chat.image_sent'));
  registerMediaPlaceholder(t('chat.file_sent'));
  registerMediaPlaceholder(t('chat.file_received'));

  const wrap = document.createElement('div');
  wrap.className = 'chat-view';

  const header = document.createElement('div');
  header.className = 'chat-header glass';

  if (onBack) {
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'btn btn-accent chat-back-btn';
    backBtn.textContent = '←';
    backBtn.addEventListener('click', onBack);
    header.appendChild(backBtn);
  }

  const avatarMount = document.createElement('div');
  avatarMount.className = 'chat-avatar-mount';
  function mountHeaderAvatar() {
    avatarMount.innerHTML = '';
    avatarMount.appendChild(
      createAvatarElement(peerId, 2, { selfBlipId: getConfig()?.blipId ?? null })
    );
  }
  mountHeaderAvatar();
  const meta = document.createElement('div');
  meta.className = 'chat-peer-meta';
  const name = document.createElement('span');
  name.className = 'chat-peer-name';
  name.textContent = `BLIP-${peerId}`;
  meta.appendChild(name);
  header.appendChild(avatarMount);
  header.appendChild(meta);
  if (onPeerMenu) {
    const openPeerMenu = (e) => {
      e.preventDefault();
      onPeerMenu(e, peerId);
    };
    header.addEventListener('contextmenu', openPeerMenu);
    meta.addEventListener('contextmenu', openPeerMenu);
    avatarMount.addEventListener('contextmenu', openPeerMenu);
    meta.classList.add('chat-peer-meta--menu');
  }

  const headActions = document.createElement("div");
  headActions.className = 'chat-header-actions';

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'input chat-search-input';
  searchInput.maxLength = 120;
  searchInput.placeholder = t('chat.search_placeholder');
  searchInput.dataset.i18nPlaceholder = 'chat.search_placeholder';
  let searchQuery = '';
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim().toLowerCase();
    renderMessages();
  });

  const menuWrap = document.createElement('div');
  menuWrap.className = 'chat-menu-wrap';

  const menuBtn = document.createElement('button');
  menuBtn.type = 'button';
  menuBtn.className = 'btn btn-lang chat-menu-btn';
  menuBtn.setAttribute('aria-label', t('chat.menu'));
  menuBtn.title = t('chat.menu');
  menuBtn.textContent = '⋮';

  const menu = document.createElement('div');
  menu.className = 'chat-menu-dropdown hidden';

  const exportItem = document.createElement('button');
  exportItem.type = 'button';
  exportItem.className = 'chat-menu-item';
  exportItem.dataset.i18n = 'chat.export';
  exportItem.textContent = t('chat.export');
  exportItem.addEventListener('click', () => {
    menu.classList.add('hidden');
    exportPeerChat(peerId, name.textContent);
  });

  const exportJsonItem = document.createElement('button');
  exportJsonItem.type = 'button';
  exportJsonItem.className = 'chat-menu-item';
  exportJsonItem.dataset.i18n = 'chat.export_json';
  exportJsonItem.textContent = t('chat.export_json');
  exportJsonItem.addEventListener('click', () => {
    menu.classList.add('hidden');
    exportPeerChatJson(peerId, name.textContent);
  });

  const exportPdfItem = document.createElement('button');
  exportPdfItem.type = 'button';
  exportPdfItem.className = 'chat-menu-item';
  exportPdfItem.dataset.i18n = 'chat.export_pdf';
  exportPdfItem.textContent = t('chat.export_pdf');
  exportPdfItem.addEventListener('click', () => {
    menu.classList.add('hidden');
    void exportPeerChatPdf(peerId, name.textContent);
  });

  const clearItem = document.createElement('button');
  clearItem.type = 'button';
  clearItem.className = 'chat-menu-item chat-menu-item--danger';
  clearItem.dataset.i18n = 'chat.clear';
  clearItem.textContent = t('chat.clear');
  clearItem.addEventListener('click', () => {
    menu.classList.add('hidden');
    if (!confirm(t('chat.clear_confirm'))) return;
    clearPeerMessages(peerId);
    renderMessages();
  });

  menu.appendChild(exportItem);
  menu.appendChild(exportJsonItem);
  menu.appendChild(exportPdfItem);
  menu.appendChild(clearItem);
  menuWrap.appendChild(menuBtn);
  menuWrap.appendChild(menu);

  function closeMenu() {
    menu.classList.add('hidden');
    if (menu.parentElement === document.body) {
      menuWrap.appendChild(menu);
      menu.style.position = '';
      menu.style.top = '';
      menu.style.right = '';
      menu.style.left = '';
      menu.style.zIndex = '';
    }
  }

  function openMenu() {
    menu.classList.remove('hidden');
    document.body.appendChild(menu);
    const rect = menuBtn.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.right = `${window.innerWidth - rect.right}px`;
    menu.style.left = 'auto';
    menu.style.zIndex = '500';
    requestAnimationFrame(() => {
      document.addEventListener('click', closeMenu, { once: true });
    });
  }

  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menu.classList.contains('hidden')) openMenu();
    else closeMenu();
  });

  headActions.appendChild(searchInput);
  headActions.appendChild(menuWrap);
  header.appendChild(headActions);

  const pinBar = document.createElement('div');
  pinBar.className = 'chat-pin-bar glass hidden';
  const pinLabel = document.createElement('span');
  pinLabel.className = 'chat-pin-label';
  pinLabel.dataset.i18n = 'chat.pinned';
  pinLabel.textContent = t('chat.pinned');
  const pinPreview = document.createElement('button');
  pinPreview.type = 'button';
  pinPreview.className = 'chat-pin-preview btn btn-lang';
  const pinUnpin = document.createElement('button');
  pinUnpin.type = 'button';
  pinUnpin.className = 'chat-pin-unpin btn btn-lang chat-reply-btn--pixel';
  pinUnpin.title = t('chat.unpin');
  pinUnpin.textContent = '×';
  pinBar.appendChild(pinLabel);
  pinBar.appendChild(pinPreview);
  pinBar.appendChild(pinUnpin);

  const messagesEl = document.createElement('div');
  messagesEl.className = 'chat-messages glass';

  let stickToBottom = true;
  messagesEl.addEventListener('scroll', () => {
    const gap =
      messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight;
    stickToBottom = gap < 80;
  });

  const typingBar = document.createElement('div');
  typingBar.className = 'chat-typing hidden';
  const typingDots = document.createElement('span');
  typingDots.className = 'chat-typing-dots';
  typingDots.setAttribute('aria-hidden', 'true');
  typingDots.textContent = '···';
  const typingText = document.createElement('span');
  typingText.className = 'chat-typing-text';
  typingBar.appendChild(typingDots);
  typingBar.appendChild(typingText);

  const inputRow = document.createElement('div');
  inputRow.className = 'chat-input-row';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.className = 'chat-attach-input';
  fileInput.hidden = true;

  const fileBtn = document.createElement('button');
  fileBtn.type = 'button';
  fileBtn.className = 'btn btn-accent chat-tool-btn chat-file-btn';
  fileBtn.title = t('chat.attach_file');
  fileBtn.dataset.i18n = 'chat.file_btn';
  fileBtn.textContent = t('chat.file_btn');
  fileBtn.addEventListener('click', () => fileInput.click());

  const emojiBtn = document.createElement('button');
  emojiBtn.type = 'button';
  emojiBtn.className = 'btn btn-lang chat-tool-btn chat-emoji-btn';
  emojiBtn.title = t('chat.emoji');
  emojiBtn.dataset.i18n = 'chat.emoji_btn';
  emojiBtn.textContent = t('chat.emoji_btn');

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'input chat-text-input';
  input.maxLength = 2000;
  input.placeholder = t('chat.input_placeholder');
  input.dataset.i18nPlaceholder = 'chat.input_placeholder';
  attachEmojiPicker(emojiBtn, input);

  const sendBtn = document.createElement('button');
  sendBtn.type = 'button';
  sendBtn.className = 'btn btn-accent';
  sendBtn.dataset.i18n = 'chat.send';
  sendBtn.textContent = t('chat.send');

  let typingEmitTimer = null;
  let typingStopTimer = null;
  let lastTypingEmit = 0;

  function emitTyping(active) {
    onTyping?.(peerId, active);
  }

  function stopTypingSignal() {
    clearTimeout(typingEmitTimer);
    clearTimeout(typingStopTimer);
    typingEmitTimer = null;
    typingStopTimer = null;
    if (lastTypingEmit) {
      lastTypingEmit = 0;
      emitTyping(false);
    }
  }

  function onInputTyping() {
    const text = input.value.trim();
    if (!text) {
      stopTypingSignal();
      return;
    }
    const now = Date.now();
    if (!lastTypingEmit || now - lastTypingEmit > 1800) {
      lastTypingEmit = now;
      emitTyping(true);
    }
    clearTimeout(typingStopTimer);
    typingStopTimer = setTimeout(() => {
      lastTypingEmit = 0;
      emitTyping(false);
    }, 2800);
  }

  let hideTypingUiTimer = null;

  function setTyping(active, displayName) {
    clearTimeout(hideTypingUiTimer);
    if (!active) {
      typingBar.classList.add('hidden');
      return;
    }
    const label = displayName || `BLIP-${peerId}`;
    typingText.textContent = t('chat.typing').replace('{name}', label);
    typingBar.classList.remove('hidden');
    hideTypingUiTimer = setTimeout(() => {
      typingBar.classList.add('hidden');
    }, 4500);
  }

  let pendingReply = null;

  const replyBar = document.createElement('div');
  replyBar.className = 'chat-reply-bar hidden';
  const replyLabel = document.createElement('span');
  replyLabel.className = 'chat-reply-label';
  replyLabel.dataset.i18n = 'chat.replying';
  replyLabel.textContent = t('chat.replying');
  const replyPreview = document.createElement('span');
  replyPreview.className = 'chat-reply-preview';
  const replyCancel = document.createElement('button');
  replyCancel.type = 'button';
  replyCancel.className = 'btn btn-lang chat-reply-cancel chat-reply-btn--pixel';
  replyCancel.textContent = '×';
  replyBar.appendChild(replyLabel);
  replyBar.appendChild(replyPreview);
  replyBar.appendChild(replyCancel);

  function clearReplyTarget() {
    pendingReply = null;
    replyBar.classList.add('hidden');
  }

  function setReplyTarget(m) {
    if (!m?.id) return;
    pendingReply = {
      id: m.id,
      from: m.outgoing ? getConfig().blipId : peerId,
      fromLabel: m.outgoing ? t('chat.reply_you') : formatReplyFromLabel(peerId, name.textContent),
      preview: buildReplyPreview(m, peerId),
      text: m.text || '',
    };
    replyPreview.textContent = pendingReply.preview;
    replyBar.classList.remove('hidden');
    input.focus();
  }

  replyCancel.addEventListener('click', clearReplyTarget);

  async function sendPayload(payload) {
    const msg = {
      id: payload.id || createMessageId(),
      from: getConfig().blipId,
      to: peerId,
      text: payload.text || '',
      timestamp: payload.timestamp || Date.now(),
      outgoing: true,
      attachment: payload.attachment,
      replyTo: pendingReply ? { ...pendingReply } : undefined,
    };
    clearReplyTarget();
    addMessage(peerId, msg);
    renderMessages();
    sounds.messageSent();
    const result = await onSend?.(peerId, msg);
    if (!result?.ok) {
      const list = getMessages(peerId);
      const last = list.pop();
      if (last?.id === msg.id) persist();
      renderMessages();
    }
    return result;
  }

  async function send() {
    stopTypingSignal();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    await sendPayload({ text });
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    await sendGenericFile(file);
  });

  sendBtn.addEventListener('click', send);
  input.addEventListener('input', onInputTyping);
  input.addEventListener('blur', stopTypingSignal);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  wrap.appendChild(replyBar);

    inputRow.appendChild(fileBtn);
  inputRow.appendChild(emojiBtn);
  inputRow.appendChild(input);
  inputRow.appendChild(sendBtn);
  inputRow.appendChild(fileInput);

  async function sendImageFile(file) {
    if (!file) return;
    try {
      const attachment = await encodeChatImageAttachment(file);
      await sendPayload({ text: '', attachment });
    } catch (err) {
      const key = err?.message === 'file_too_big' ? 'chat.attach_too_big' : 'chat.attach_failed';
      alert(t(key));
    }
  }

  async function sendGenericFile(file) {
    if (!file) return;
    if (isImageFile(file)) {
      await sendImageFile(file);
      return;
    }
    if (!onSendFile) return;
    try {
      validateChatFile(file, getConfig());
    } catch (err) {
      const limitKey =
        err?.message === 'file_too_big' ? 'chat.file_too_big_dynamic' : 'chat.attach_failed';
      alert(
        err?.message === 'file_too_big'
          ? t(limitKey).replace('{limit}', formatFileLimitLabelForChat(getConfig()))
          : t('chat.attach_failed')
      );
      return;
    }
    const pendingId = createMessageId();
    const pendingMsg = {
      id: pendingId,
      text: t('chat.file_sent'),
      timestamp: Date.now(),
      outgoing: true,
      attachment: {
        kind: 'file',
        name: file.name,
        size: file.size,
        pending: true,
        progress: 0,
      },
    };
    addMessage(peerId, pendingMsg);
    renderMessages();
    try {
      const result = await onSendFile(peerId, file, (pct, extra) => {
        pendingMsg.attachment.progress = pct;
        if (extra?.speedBps) pendingMsg.attachment.speedBps = extra.speedBps;
        renderMessages();
      });
      const attachment = result.attachment;
      pendingMsg.attachment = { ...attachment, pending: false };
      pendingMsg.pending = false;
      persist();
      renderMessages();
      if (result.inline) {
        await onSend(peerId, {
          id: pendingId,
          text: t('chat.file_sent'),
          timestamp: pendingMsg.timestamp,
          attachment,
        });
      }
      sounds.messageSent();
    } catch (err) {
      const list = getMessages(peerId);
      const idx = list.findIndex((m) => m.id === pendingId);
      if (idx >= 0) list.splice(idx, 1);
      persist();
      renderMessages();
      alert(t('chat.attach_failed'));
    }
  }

  let dragDepth = 0;
  const dropOverlay = document.createElement('div');
  dropOverlay.className = 'chat-drop-overlay hidden';
  dropOverlay.textContent = t('chat.drop_hint');
  dropOverlay.dataset.i18n = 'chat.drop_hint';

  function setDropActive(on) {
    dropOverlay.classList.toggle('hidden', !on);
    wrap.classList.toggle('chat-view--drag', on);
  }

  function hasDropFiles(dt) {
    return !!(dt?.files?.length);
  }

  function onDragEnter(e) {
    e.preventDefault();
    dragDepth += 1;
    if (hasDropFiles(e.dataTransfer)) setDropActive(true);
  }

  function onDragLeave(e) {
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) setDropActive(false);
  }

  function onDragOver(e) {
    e.preventDefault();
    if (hasDropFiles(e.dataTransfer)) e.dataTransfer.dropEffect = 'copy';
  }

  async function onDrop(e) {
    e.preventDefault();
    dragDepth = 0;
    setDropActive(false);
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length) return;
    for (const file of files) {
      if (isImageFile(file)) await sendImageFile(file);
      else await sendGenericFile(file);
    }
  }

  wrap.addEventListener('dragenter', onDragEnter);
  wrap.addEventListener('dragleave', onDragLeave);
  wrap.addEventListener('dragover', onDragOver);
  wrap.addEventListener('drop', onDrop);

  function scrollToMessageId(messageId) {
    if (!messageId) return;
    const el = messagesEl.querySelector(`[data-message-id="${messageId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('chat-block--highlight');
    setTimeout(() => el.classList.remove('chat-block--highlight'), 1600);
  }

  function renderPinBar() {
    const pinId = getPinnedMessageId(peerId);
    const pinned = pinId ? findMessage(peerId, pinId) : null;
    if (!pinned) {
      pinBar.classList.add('hidden');
      return;
    }
    pinBar.classList.remove('hidden');
    pinPreview.textContent = buildReplyPreview(pinned, peerId).slice(0, 96);
    pinPreview.onclick = () => scrollToMessageId(pinId);
  }

  pinUnpin.addEventListener('click', () => {
    setPinnedMessageId(peerId, null);
    void onPin?.(peerId, { messageId: null, pinned: false });
    renderPinBar();
  });

  function setPinMessage(m) {
    if (!m?.id) return;
    setPinnedMessageId(peerId, m.id);
    void onPin?.(peerId, { messageId: m.id, pinned: true });
    renderPinBar();
  }

  function openEditMessageDialog(m) {
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'blip-modal-backdrop';
      const modal = document.createElement('div');
      modal.className = 'blip-modal glass';
      const title = document.createElement('h3');
      title.className = 'blip-modal-title';
      title.dataset.i18n = 'chat.edit_title';
      title.textContent = t('chat.edit_title');
      const area = document.createElement('textarea');
      area.className = 'input blip-modal-input chat-edit-area';
      area.value = m.text || '';
      area.maxLength = 4000;
      const actions = document.createElement('div');
      actions.className = 'blip-modal-actions';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn btn-lang';
      cancelBtn.textContent = t('dialog.cancel');
      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'btn btn-accent';
      saveBtn.textContent = t('dialog.save');
      let done = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        backdrop.remove();
        resolve(v);
      };
      cancelBtn.addEventListener('click', () => finish(null));
      saveBtn.addEventListener('click', () => finish(area.value));
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) finish(null);
      });
      area.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          finish(null);
        }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          finish(area.value);
        }
      });
      actions.appendChild(cancelBtn);
      actions.appendChild(saveBtn);
      modal.appendChild(title);
      modal.appendChild(area);
      modal.appendChild(actions);
      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);
      requestAnimationFrame(() => {
        area.focus();
        area.setSelectionRange(area.value.length, area.value.length);
      });
    });
  }

  async function startEditMessage(m) {
    if (!m?.id || !m.outgoing) return;
    const next = await openEditMessageDialog(m);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === (m.text || '').trim()) return;
    const editedAt = Date.now();
    applyMessageEdit(peerId, m.id, trimmed, editedAt);
    void onEdit?.(peerId, { messageId: m.id, text: trimmed, editedAt });
    renderMessages();
    renderPinBar();
  }

  function openMessageMenu(e, m) {
    e.preventDefault();
    const menuEl = document.createElement('div');
    menuEl.className = 'chat-msg-menu';
    const add = (key, fn) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chat-menu-item';
      btn.dataset.i18n = key;
      btn.textContent = t(key);
      btn.addEventListener('click', () => {
        menuEl.remove();
        fn();
      });
      menuEl.appendChild(btn);
    };
    if (m.id) {
      add('chat.pin', () => setPinMessage(m));
      if (m.outgoing && (m.text || '').trim()) {
        add('chat.edit', () => void startEditMessage(m));
      }
      if (m.replyTo?.id) {
        add('chat.jump_reply', () => scrollToMessageId(m.replyTo.id));
      }
    }
    if (!menuEl.childElementCount) return;
    document.body.appendChild(menuEl);
    menuEl.style.position = 'fixed';
    menuEl.style.left = `${Math.min(e.clientX, window.innerWidth - 180)}px`;
    menuEl.style.top = `${Math.min(e.clientY, window.innerHeight - 120)}px`;
    menuEl.style.zIndex = '600';
    requestAnimationFrame(() => {
      document.addEventListener(
        'click',
        () => menuEl.remove(),
        { once: true }
      );
    });
  }

  wrap.appendChild(header);
  wrap.appendChild(pinBar);
  wrap.appendChild(messagesEl);
  wrap.appendChild(dropOverlay);
  wrap.appendChild(typingBar);
  wrap.appendChild(inputRow);

  function buildReactionRow(m) {
    const row = document.createElement('div');
    row.className = 'chat-reactions';
    const config = getConfig();
    const selfId = config?.blipId;

    const chips = Object.entries(m.reactions || {}).filter(([, ids]) => ids?.length);
    chips.forEach(([emoji, ids]) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chat-reaction-chip';
      if (ids.includes(selfId)) chip.classList.add('chat-reaction-chip--mine');
      chip.textContent = `${emoji} ${ids.length}`;
      chip.addEventListener('click', () => {
        const add = !ids.includes(selfId);
        toggleReactionOnMessage(peerId, m.id, emoji, selfId);
        void onReaction?.(peerId, { messageId: m.id, emoji, add });
        renderMessages();
      });
      row.appendChild(chip);
    });

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'chat-reaction-add';
    addBtn.title = t('chat.react');
    addBtn.textContent = getDefaultReactionEmoji(config);
    addBtn.addEventListener('click', () => {
      const emoji = getDefaultReactionEmoji(config);
      toggleReactionOnMessage(peerId, m.id, emoji, selfId);
      void onReaction?.(peerId, { messageId: m.id, emoji, add: true });
      renderMessages();
    });
    row.appendChild(addBtn);
    return row;
  }

  function renderMessages() {
    const msgs = getMessages(peerId).filter((m) => {
      if (!searchQuery) return true;
      const hay = `${m.text || ''} ${m.attachment?.name || ''}`.toLowerCase();
      return hay.includes(searchQuery);
    });

    const hasFocus = document.activeElement === input;
    const cursorPos = hasFocus ? input.selectionStart : null;

    const scrollPos = messagesEl.scrollTop;

    messagesEl.innerHTML = '';
    if (msgs.length === 0) {
      const p = document.createElement('p');
      p.className = 'chat-empty';
      p.textContent = searchQuery ? t('chat.search_empty') : t('chat.empty');
      messagesEl.appendChild(p);
      if (hasFocus) {
        requestAnimationFrame(() => {
          input.focus();
          if (cursorPos !== null) input.setSelectionRange(cursorPos, cursorPos);
        });
      }
      return;
    }

    msgs.forEach((m) => {
      const block = document.createElement('div');
      block.className = `chat-block ${m.outgoing ? 'outgoing' : 'incoming'}`;
      block.dataset.messageId = m.id || '';

      appendChatMessageBody(block, m, { onQuoteClick: (id) => scrollToMessageId(id) });

      if (m.editedAt) {
        const edited = document.createElement('span');
        edited.className = 'chat-edited';
        edited.dataset.i18n = 'chat.edited';
        edited.textContent = t('chat.edited');
        block.appendChild(edited);
      }

      block.addEventListener('contextmenu', (e) => openMessageMenu(e, m));

      const actions = document.createElement('div');
      actions.className = 'chat-block-actions';
      if (m.id) {
        const replyBtn = document.createElement('button');
        replyBtn.type = 'button';
        replyBtn.className = 'btn btn-lang chat-reply-btn chat-reply-btn--pixel';
        replyBtn.title = t('chat.reply');
        replyBtn.innerHTML = '<span class="pixel-glyph pixel-glyph--reply"></span>';
        replyBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          setReplyTarget(m);
        });
        actions.appendChild(replyBtn);
      }

      const metaRow = document.createElement('div');
      metaRow.className = 'chat-meta-row';
      if (m.timestamp) {
        const time = document.createElement('span');
        time.className = 'chat-time';
        time.textContent = formatChatTime(m.timestamp);
        time.title = new Date(m.timestamp).toLocaleString();
        metaRow.appendChild(time);
      }
      if (actions.childElementCount) block.appendChild(actions);
      block.appendChild(metaRow);

      if (m.id) block.appendChild(buildReactionRow(m));

      messagesEl.appendChild(block);
    });

    if (hasFocus) {
      requestAnimationFrame(() => {
        input.focus();
        if (cursorPos !== null) input.setSelectionRange(cursorPos, cursorPos);
      });
    }

    if (stickToBottom) {
      requestAnimationFrame(() => {
        messagesEl.scrollTop = messagesEl.scrollHeight;
      });
    } else {
      messagesEl.scrollTop = scrollPos;
    }
    renderPinBar();
  }

  function scrollToBottom() {
    stickToBottom = true;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function flashNew() {
    messagesEl.classList.remove('flash');
    void messagesEl.offsetWidth;
    messagesEl.classList.add('flash');
  }

  renderMessages();

  return {
    el: wrap,
    renderMessages,
    scrollToBottom,
    flashNew,
    setPeerName(displayName) {
      name.textContent = displayName || `BLIP-${peerId}`;
    },
    refreshHeaderAvatar() {
      mountHeaderAvatar();
    },
    handleIncoming(msg) {
      setTyping(false);
      const incoming = {
        id: msg.id || createMessageId(),
        from: msg.from,
        to: msg.to,
        text: msg.text,
        timestamp: msg.timestamp || Date.now(),
        outgoing: false,
        attachment: msg.attachment,
        reactions: msg.reactions,
        replyTo: msg.replyTo,
        editedAt: msg.editedAt,
      };
      addMessage(peerId, incoming);
      renderMessages();
      flashNew();
      sounds.messageReceived();
    },
    handlePin(msg) {
      if (msg.pinned === false || !msg.messageId) {
        setPinnedMessageId(peerId, null);
      } else {
        setPinnedMessageId(peerId, msg.messageId);
      }
      renderPinBar();
      renderMessages();
    },
    handleEdit(msg) {
      if (!msg.messageId) return;
      applyMessageEdit(peerId, msg.messageId, msg.text, msg.editedAt);
      renderMessages();
      renderPinBar();
    },
    handleReaction(msg) {
      const from = Number(msg.from);
      if (!Number.isFinite(from)) return;
      const add = msg.add !== false;
      if (add) toggleReactionOnMessage(peerId, msg.messageId, msg.emoji, from);
      else {
        const m = findMessage(peerId, msg.messageId);
        if (m?.reactions?.[msg.emoji]) {
          const list = m.reactions[msg.emoji];
          const idx = list.indexOf(from);
          if (idx >= 0) list.splice(idx, 1);
          if (!list.length) delete m.reactions[msg.emoji];
          persist();
        }
      }
      renderMessages();
    },
    markRead() {},
    setTyping,
  };
}
