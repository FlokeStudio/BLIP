import { t } from './i18n.js';
import { sounds } from './audio.js';
import { appendLinkifiedText } from './linkify.js';
import { attachEmojiPicker } from './emoji-picker.js';
import {
  encodeChatImageAttachment,
  encodeInlineFileAttachment,
  isImageFile,
  validateChatFile,
  INLINE_FILE_BYTES,
} from './chat-attachments.js';
import { formatFileSize } from './file-transfer.js';
import { getMaxFileBytes } from './file-transfer-limits.js';
import { createMessageId } from './message-id.js';
import { addGroupMessage, getGroupMessages, groupDisplayName, amHost } from './groups.js';
import { getOngoingGroupCall } from './group-call-roster.js';
import { isInGroupCall, getActiveGroupCallId } from './group-call-client.js';

function formatChatTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function appendFileCard(block, attachment) {
  const card = document.createElement("div");
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
    const pendingLbl = document.createElement('span');
    pendingLbl.className = 'chat-file-pending';
    pendingLbl.textContent = t('chat.file_sending').replace('{pct}', String(pct));
    prog.appendChild(pendingLbl);
    card.appendChild(prog);
  } else if (attachment.cancelled) {
    const cancelledLbl = document.createElement('span');
    cancelledLbl.className = 'chat-file-pending';
    cancelledLbl.dataset.i18n = 'chat.file_cancelled';
    cancelledLbl.textContent = t('chat.file_cancelled');
    card.appendChild(cancelledLbl);
  }
  block.appendChild(card);
}

function formatGroupFileLimit(config) {
  const gb = getMaxFileBytes(config) / (1024 * 1024 * 1024);
  return `${gb} GB`;
}

export function createGroupChatView(
  group,
  config,
  onSend,
  onBack,
  onGroupCall,
  onGroupMenu,
  onJoinOngoingCall,
  onSendFile
) {
  const wrap = document.createElement('div');
  wrap.className = 'chat-view group-chat-view';

  const header = document.createElement("div");
  header.className = 'chat-header glass';

  if (onBack) {
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'btn btn-accent chat-back-btn';
    backBtn.textContent = '←';
    backBtn.addEventListener('click', onBack);
    header.appendChild(backBtn);
  }

  const meta = document.createElement("div");
  meta.className = 'chat-peer-meta';
  const name = document.createElement('span');
  name.className = 'chat-peer-name';
  name.textContent = groupDisplayName(group);
  const sub = document.createElement('span');
  sub.className = 'chat-peer-id';
  const hostLabel = amHost(group, config.blipId) ? t('group.you_host') : t('group.host_line').replace('{id}', String(group.hostId));
  sub.textContent = `${t('group.members')}: ${group.members.length} · ${hostLabel}`;
  meta.appendChild(name);
  meta.appendChild(sub);
  header.appendChild(meta);

  if (onGroupMenu) {
    const openMenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      onGroupMenu(e, group);
    };
    header.addEventListener('contextmenu', openMenu);
    meta.addEventListener('contextmenu', openMenu);
    name.addEventListener('contextmenu', openMenu);
  }

  const callBtn = document.createElement('button');
  callBtn.type = 'button';
  callBtn.className = 'btn btn-accent';
  callBtn.dataset.i18n = 'group.call';
  callBtn.textContent = t('group.call');
  callBtn.addEventListener('click', () => onGroupCall?.(group.id));
  header.appendChild(callBtn);

  const ongoingBar = document.createElement('div');
  ongoingBar.className = 'group-call-ongoing glass hidden';
  const ongoingPulse = document.createElement('span');
  ongoingPulse.className = 'group-call-ongoing-pulse';
  const ongoingText = document.createElement('span');
  ongoingText.className = 'group-call-ongoing-text';
  const ongoingJoin = document.createElement('button');
  ongoingJoin.type = 'button';
  ongoingJoin.className = 'btn btn-accent group-call-ongoing-join';
  ongoingJoin.dataset.i18n = 'group.join_call';
  ongoingJoin.textContent = t('group.join_call');
  ongoingJoin.addEventListener('click', () => onJoinOngoingCall?.(group.id));
  ongoingBar.appendChild(ongoingPulse);
  ongoingBar.appendChild(ongoingText);
  ongoingBar.appendChild(ongoingJoin);

  const messagesEl = document.createElement('div');
  messagesEl.className = 'chat-messages glass';

  const inputRow = document.createElement("div");
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
  emojiBtn.className = 'btn btn-lang chat-tool-btn';
  emojiBtn.textContent = t('chat.emoji_btn');

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'input chat-text-input';
  input.maxLength = 2000;
  input.placeholder = t('chat.input_placeholder');
  attachEmojiPicker(emojiBtn, input);

  const sendBtn = document.createElement('button');
  sendBtn.type = 'button';
  sendBtn.className = 'btn btn-accent';
  sendBtn.textContent = t('chat.send');

  async function publish(msg) {
    addGroupMessage(group.id, msg);
    renderMessages();
    sounds.messageSent();
    await onSend?.(group.id, msg);
  }

  async function send() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    await publish({
      id: createMessageId(),
      from: config.blipId,
      text,
      timestamp: Date.now(),
      outgoing: true,
    });
  }

  async function sendAttachment(file) {
    if (!file) return;
    if (!isImageFile(file) && file.size > INLINE_FILE_BYTES && onSendFile) {
      try {
        await onSendFile(group.id, file, () => renderMessages());
      } catch (err) {
        if (err?.message === 'cancelled') return;
        const key =
          err?.message === 'file_too_big'
            ? 'chat.file_too_big_dynamic'
            : 'chat.attach_failed';
        alert(
          err?.message === 'file_too_big'
            ? t(key).replace('{limit}', formatGroupFileLimit(config))
            : t('chat.attach_failed')
        );
      }
      return;
    }
    try {
      let attachment;
      let text;
      if (isImageFile(file)) {
        attachment = await encodeChatImageAttachment(file);
        text = t('chat.image_sent');
      } else {
        validateChatFile(file, config);
        attachment = await encodeInlineFileAttachment(file, config);
        text = t('chat.file_sent');
      }
      await publish({
        id: createMessageId(),
        from: config.blipId,
        text,
        timestamp: Date.now(),
        outgoing: true,
        attachment,
      });
    } catch (err) {
      const key =
        err?.message === 'file_too_big'
          ? 'chat.file_too_big_dynamic'
          : 'chat.attach_failed';
      alert(
        err?.message === 'file_too_big'
          ? t(key).replace('{limit}', formatGroupFileLimit(config))
          : t('chat.attach_failed')
      );
    }
  }

  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    fileInput.value = '';
    await sendAttachment(f);
  });

  sendBtn.addEventListener('click', send);
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

  function refreshOngoingBar() {
    const snap = getOngoingGroupCall(group.id);
    const inThisCall = isInGroupCall() && activeGroupMatches();
    if (!snap.active || snap.count === 0 || inThisCall) {
      ongoingBar.classList.add('hidden');
      return;
    }
    ongoingBar.classList.remove('hidden');
    ongoingText.textContent = t('group.call_ongoing_bar').replace('{n}', String(snap.count));
  }

  function activeGroupMatches() {
    return getActiveGroupCallId() === group.id;
  }

  const onCallState = (ev) => {
    if (ev.detail?.groupId === group.id) refreshOngoingBar();
  };
  const onGroupsChanged = (ev) => {
    if (ev.detail?.groupId === group.id) renderMessages();
  };
  window.addEventListener('blip-group-call-state', onCallState);
  window.addEventListener('blip-groups-changed', onGroupsChanged);
  refreshOngoingBar();

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
    for (const file of files) {
      await sendAttachment(file);
    }
  }

  wrap.addEventListener('dragenter', onDragEnter);
  wrap.addEventListener('dragleave', onDragLeave);
  wrap.addEventListener('dragover', onDragOver);
  wrap.addEventListener('drop', onDrop);

  wrap.appendChild(header);
  wrap.appendChild(ongoingBar);
  wrap.appendChild(messagesEl);
  wrap.appendChild(dropOverlay);
  wrap.appendChild(inputRow);

  function renderMessages() {
    const msgs = getGroupMessages(group.id);
    messagesEl.innerHTML = '';
    if (!msgs.length) {
      const p = document.createElement('p');
      p.className = 'chat-empty';
      p.textContent = t('chat.empty');
      messagesEl.appendChild(p);
      return;
    }
    msgs.forEach((m) => {
      const block = document.createElement("div");
      const mine = Number(m.from) === Number(config.blipId);
      block.className = `chat-block ${mine ? 'outgoing' : 'incoming'}`;
      const who = document.createElement('span');
      who.className = 'group-msg-from';
      who.textContent = mine ? t('group.you') : `#${m.from}`;
      block.appendChild(who);
      if (m.attachment?.kind === 'image' && m.attachment.dataUrl) {
        const img = document.createElement('img');
        img.className = 'chat-image';
        img.src = m.attachment.dataUrl;
        img.alt = m.attachment.name || 'image';
        img.loading = 'lazy';
        block.appendChild(img);
      } else if (m.attachment?.kind === 'file') {
        appendFileCard(block, m.attachment);
      }
      if (m.text) {
        const text = document.createElement('span');
        text.className = 'chat-text';
        appendLinkifiedText(text, m.text, (url) => window.blip?.openExternal?.(url));
        block.appendChild(text);
      }
      if (m.timestamp) {
        const time = document.createElement('span');
        time.className = 'chat-time';
        time.textContent = formatChatTime(m.timestamp);
        block.appendChild(time);
      }
      messagesEl.appendChild(block);
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  renderMessages();

  return {
    el: wrap,
    renderMessages,
    handleIncoming(msg) {
      const stored = addGroupMessage(group.id, { ...msg, outgoing: false });
      if (!stored) return;
      renderMessages();
      sounds.messageReceived();
    },
    updateGroup(next) {
      group.hostId = next.hostId;
      group.members = next.members;
      sub.textContent = `${t('group.members')}: ${group.members.length} · ${
        amHost(group, config.blipId) ? t('group.you_host') : t('group.host_line').replace('{id}', String(group.hostId))
      }`;
      refreshOngoingBar();
    },
    refreshOngoingCall: refreshOngoingBar,
    destroy() {
      window.removeEventListener('blip-group-call-state', onCallState);
      window.removeEventListener('blip-groups-changed', onGroupsChanged);
    },
  };
}
