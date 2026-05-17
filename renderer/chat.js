import { t } from './i18n.js';
import { sounds } from './audio.js';
import { createAvatarElement } from './avatar.js';
import { appendLinkifiedText } from './linkify.js';
import { attachEmojiPicker } from './emoji-picker.js';
import {
  encodeChatImageAttachment,
  isImageFile,
  validateChatFile,
} from './chat-attachments.js';
import { normalizeFileLimitGb } from './file-transfer-limits.js';
import { formatFileSize } from './file-transfer.js';

function formatFileLimitLabelForChat(config) {
  return `${normalizeFileLimitGb(config?.maxFileTransferGb)} GB`;
}
import { createMessageId } from './message-id.js';

const STORAGE_KEY = 'blip_chat_v1';
const MAX_PER_PEER = 500;
const REACTION_EMOJI = '❤️';

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

export function applyReceiptToMessage(peerId, messageId, receipt) {
  const m = findMessage(peerId, messageId);
  if (!m || !m.outgoing) return false;
  if (receipt === 'read') {
    m.delivered = true;
    m.read = true;
  } else if (receipt === 'delivered') {
    m.delivered = true;
  } else {
    return false;
  }
  persist();
  return true;
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
  persist();
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

function openExternalUrl(url) {
  if (window.blip?.openExternal) void window.blip.openExternal(url);
}

function receiptLabel(m) {
  if (!m.outgoing) return '';
  if (m.read) return '✓✓';
  if (m.delivered) return '✓';
  return '';
}

function appendFileAttachment(block, attachment, openExternalUrl) {
  if (attachment?.kind !== 'file') return;
  const card = document.createElement('div');
  card.className = 'chat-file-card';
  const label = document.createElement('span');
  label.className = 'chat-file-name';
  label.textContent = attachment.name || 'file';
  const meta = document.createElement('span');
  meta.className = 'chat-file-meta';
  meta.textContent = formatFileSize(attachment.size);
  card.appendChild(label);
  card.appendChild(meta);
  if (attachment.dataUrl) {
    const dl = document.createElement('a');
    dl.className = 'btn btn-lang chat-file-dl';
    dl.href = attachment.dataUrl;
    dl.download = attachment.name || 'download';
    dl.textContent = t('chat.file_download');
    dl.dataset.i18n = 'chat.file_download';
    dl.addEventListener('click', (e) => e.stopPropagation());
    card.appendChild(dl);
  } else if (attachment.pending) {
    const pct = Math.min(100, Math.max(0, Number(attachment.progress) || 0));
    const prog = document.createElement('div');
    prog.className = 'chat-file-progress';
    const track = document.createElement('div');
    track.className = 'chat-file-progress-track';
    const fill = document.createElement('div');
    fill.className = 'chat-file-progress-fill';
    fill.style.width = `${pct}%`;
    track.appendChild(fill);
    prog.appendChild(track);
    const label = document.createElement('span');
    label.className = 'chat-file-pending';
    label.textContent = t('chat.file_sending').replace('{pct}', String(pct));
    prog.appendChild(label);
    card.appendChild(prog);
  }
  block.appendChild(card);
}

export function createChatView(
  peerId,
  config,
  onSend,
  onBack,
  onTyping,
  onReceipt,
  onReaction,
  onSendFile,
  onPeerMenu
) {
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
      createAvatarElement(peerId, 3, { selfBlipId: config?.blipId ?? null })
    );
  }
  mountHeaderAvatar();
  const meta = document.createElement('div');
  meta.className = 'chat-peer-meta';
  const name = document.createElement('span');
  name.className = 'chat-peer-name';
  name.textContent = `BLIP-${peerId}`;
  const idLabel = document.createElement('span');
  idLabel.className = 'chat-peer-id';
  idLabel.textContent = `#${peerId}`;
  meta.appendChild(name);
  meta.appendChild(idLabel);
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

  const messagesEl = document.createElement('div');
  messagesEl.className = 'chat-messages glass';

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

  async function sendPayload(payload) {
    const msg = {
      id: payload.id || createMessageId(),
      from: config.blipId,
      to: peerId,
      text: payload.text || '',
      timestamp: payload.timestamp || Date.now(),
      outgoing: true,
      attachment: payload.attachment,
    };
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

  inputRow.appendChild(fileBtn);
  inputRow.appendChild(emojiBtn);
  inputRow.appendChild(input);
  inputRow.appendChild(sendBtn);
  inputRow.appendChild(fileInput);

  async function sendImageFile(file) {
    if (!file) return;
    try {
      const attachment = await encodeChatImageAttachment(file);
      await sendPayload({ text: t('chat.image_sent'), attachment });
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
      validateChatFile(file, config);
    } catch (err) {
      const limitKey =
        err?.message === 'file_too_big' ? 'chat.file_too_big_dynamic' : 'chat.attach_failed';
      alert(
        err?.message === 'file_too_big'
          ? t(limitKey).replace('{limit}', formatFileLimitLabelForChat(config))
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
      const result = await onSendFile(peerId, file, (pct) => {
        pendingMsg.attachment.progress = pct;
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

  wrap.appendChild(header);
  wrap.appendChild(messagesEl);
  wrap.appendChild(dropOverlay);
  wrap.appendChild(typingBar);
  wrap.appendChild(inputRow);

  function buildReactionRow(m) {
    const row = document.createElement('div');
    row.className = 'chat-reactions';
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
    addBtn.textContent = REACTION_EMOJI;
    addBtn.addEventListener('click', () => {
      const emoji = REACTION_EMOJI;
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
    const nearBottom =
      messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 80;

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

      if (m.attachment?.kind === 'image' && m.attachment.dataUrl) {
        const img = document.createElement('img');
        img.className = 'chat-image';
        img.src = m.attachment.dataUrl;
        img.alt = m.attachment.name || 'image';
        img.loading = 'lazy';
        block.appendChild(img);
      } else if (m.attachment?.kind === 'file') {
        appendFileAttachment(block, m.attachment, openExternalUrl);
      }

      if (m.text && !(m.attachment?.pending && !m.text.trim())) {
        const text = document.createElement('span');
        text.className = 'chat-text';
        appendLinkifiedText(text, m.text, openExternalUrl);
        block.appendChild(text);
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
      const rcpt = receiptLabel(m);
      if (rcpt) {
        const r = document.createElement('span');
        r.className = 'chat-receipt';
        r.textContent = rcpt;
        r.title = m.read ? t('chat.read') : m.delivered ? t('chat.delivered') : '';
        metaRow.appendChild(r);
      }
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

    if (nearBottom || !hasFocus) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    } else {
      messagesEl.scrollTop = scrollPos;
    }
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
      };
      addMessage(peerId, incoming);
      renderMessages();
      flashNew();
      sounds.messageReceived();
      if (incoming.id) {
        void onReceipt?.(peerId, { messageId: incoming.id, receipt: 'delivered' });
      }
    },
    handleReceipt(msg) {
      if (applyReceiptToMessage(peerId, msg.messageId, msg.receipt)) renderMessages();
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
    markRead() {
      const selfId = config?.blipId;
      for (const m of getMessages(peerId)) {
        if (!m.outgoing && m.id && !m._readAcked) {
          m._readAcked = true;
          void onReceipt?.(peerId, { messageId: m.id, receipt: 'read' });
        }
      }
    },
    setTyping,
  };
}
