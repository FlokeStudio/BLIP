import { t } from './i18n.js';
import { sounds } from './audio.js';
import { createAvatarElement } from './avatar.js';

const messagesByPeer = new Map();

export function getMessages(peerId) {
  if (!messagesByPeer.has(peerId)) messagesByPeer.set(peerId, []);
  return messagesByPeer.get(peerId);
}

export function addMessage(peerId, msg) {
  const list = getMessages(peerId);
  list.push(msg);
  return list;
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

  const avatar = createAvatarElement(peerId, 3);
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
  header.appendChild(avatar);
  header.appendChild(meta);

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
      const last = getMessages(peerId).pop();
      if (last === msg) getMessages(peerId).pop();
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
    messagesEl.innerHTML = '';
    if (msgs.length === 0) {
      const p = document.createElement('p');
      p.className = 'chat-empty';
      p.textContent = t('chat.empty');
      messagesEl.appendChild(p);
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
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function flashNew() {
    messagesEl.classList.remove('flash');
    void messagesEl.offsetWidth;
    messagesEl.classList.add('flash');
  }

  return {
    el: wrap,
    renderMessages,
    flashNew,
    setPeerName(displayName) {
      name.textContent = displayName || `BLIP-${peerId}`;
    },
    handleIncoming(msg) {
      addMessage(peerId, { ...msg, outgoing: false });
      renderMessages();
      flashNew();
      sounds.messageReceived();
    },
  };
}
