import { t } from './i18n.js';
import { sounds } from './audio.js';
import { createAvatarElement } from './avatar.js';

const STORAGE_KEY = 'blip_chat_v1';
const MAX_PER_PEER = 500;

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

export function clearPeerMessages(peerId) {
  messagesByPeer.delete(peerId);
  persist();
}

export function createChatView(peerId, config, onSend, onBack) {
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

  const headSpacer = document.createElement('div');
  headSpacer.style.flex = '1';
  header.appendChild(headSpacer);

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'btn btn-lang chat-clear-btn';
  clearBtn.dataset.i18n = 'chat.clear';
  clearBtn.textContent = t('chat.clear');
  clearBtn.addEventListener('click', () => {
    if (!confirm(t('chat.clear_confirm'))) return;
    clearPeerMessages(peerId);
    renderMessages();
  });
  header.appendChild(clearBtn);

  const messagesEl = document.createElement('div');
  messagesEl.className = 'chat-messages glass';

  const empty = document.createElement('p');
  empty.className = 'chat-empty';
  empty.dataset.i18n = 'chat.empty';
  empty.textContent = t('chat.empty');
  messagesEl.appendChild(empty);

  const inputRow = document.createElement('div');
  inputRow.className = 'chat-input-row';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'input';
  input.maxLength = 2000;
  input.placeholder = t('chat.input_placeholder');
  input.dataset.i18nPlaceholder = 'chat.input_placeholder';

  const sendBtn = document.createElement('button');
  sendBtn.type = 'button';
  sendBtn.className = 'btn btn-accent';
  sendBtn.dataset.i18n = 'chat.send';
  sendBtn.textContent = t('chat.send');

  async function send() {
    const text = input.value.trim();
    if (!text) return;
    const msg = {
      from: config.blipId,
      to: peerId,
      text,
      timestamp: Date.now(),
      outgoing: true,
    };
    addMessage(peerId, msg);
    renderMessages();
    input.value = '';
    sounds.messageSent();
    const result = await onSend?.(peerId, text);
    if (!result?.ok) {
      const list = getMessages(peerId);
      const last = list.pop();
      if (last === msg) persist();
      renderMessages();
    }
  }

  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  inputRow.appendChild(input);
  inputRow.appendChild(sendBtn);

  wrap.appendChild(header);
  wrap.appendChild(messagesEl);
  wrap.appendChild(inputRow);

  function renderMessages() {
    const msgs = getMessages(peerId);

    const hasFocus = document.activeElement === input;
    const cursorPos = hasFocus ? input.selectionStart : null;

    const scrollPos = messagesEl.scrollTop;
    const nearBottom =
      messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 80;

    messagesEl.innerHTML = '';
    if (msgs.length === 0) {
      const p = document.createElement('p');
      p.className = 'chat-empty';
      p.textContent = t('chat.empty');
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
      const text = document.createElement('span');
      text.className = 'chat-text';
      text.textContent = m.text;
      block.appendChild(text);
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
      addMessage(peerId, { ...msg, outgoing: false });
      renderMessages();
      flashNew();
      sounds.messageReceived();
    },
  };
}
