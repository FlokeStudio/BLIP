import { t } from './i18n.js';
import { createMessageId } from './message-id.js';
import {
  encodeChatImageAttachment,
  encodeInlineFileAttachment,
  isImageFile,
  validateChatFile,
  INLINE_FILE_BYTES,
} from './chat-attachments.js';
import { sendChatFile, fileToDataUrl } from './file-transfer.js';
import { addGroupMessage, updateGroupMessageAttachment } from './groups.js';

/** @type {Map<string, object>} */
const stashedReady = new Map();

function stashKey(groupId, msgId) {
  return `${groupId}:${msgId}`;
}

export function stashGroupFileReady(groupId, msgId, attachment) {
  stashedReady.set(stashKey(groupId, msgId), attachment);
}

export function applyStashedGroupFile(groupId, msgId) {
  const key = stashKey(groupId, msgId);
  const att = stashedReady.get(key);
  if (!att) return false;
  stashedReady.delete(key);
  return updateGroupMessageAttachment(groupId, msgId, { ...att, pending: false });
}

export function completeIncomingGroupFile(groupId, msgId, attachment) {
  const ok = updateGroupMessageAttachment(groupId, msgId, { ...attachment, pending: false });
  if (!ok) stashGroupFileReady(groupId, msgId, attachment);
  return ok;
}

/**
 * Send a file in a group (inline in group-msg or chunked P2P to each member).
 * @param {(msg: object) => Promise<void>} broadcastMsg
 */
export async function sendGroupChatFile(api, config, group, file, broadcastMsg, hooks = {}) {
  const { onProgress, onPeerStart, onPeerEnd } = hooks;
  if (!group || !file) return { ok: false };

  if (isImageFile(file)) {
    const attachment = await encodeChatImageAttachment(file);
    const msg = {
      id: createMessageId(),
      from: config.blipId,
      text: t('chat.image_sent'),
      timestamp: Date.now(),
      outgoing: true,
      attachment,
    };
    addGroupMessage(group.id, msg);
    await broadcastMsg(msg);
    return { ok: true, inline: true, msg };
  }

  validateChatFile(file, config);

  if (file.size <= INLINE_FILE_BYTES) {
    const attachment = await encodeInlineFileAttachment(file, config);
    const msg = {
      id: createMessageId(),
      from: config.blipId,
      text: t('chat.file_sent'),
      timestamp: Date.now(),
      outgoing: true,
      attachment,
    };
    addGroupMessage(group.id, msg);
    await broadcastMsg(msg);
    return { ok: true, inline: true, msg };
  }

  const msgId = createMessageId();
  const transferId = createMessageId();
  const msg = {
    id: msgId,
    from: config.blipId,
    text: t('chat.file_sent'),
    timestamp: Date.now(),
    outgoing: true,
    attachment: {
      kind: 'file',
      name: file.name || 'file',
      mime: file.type || 'application/octet-stream',
      size: file.size,
      transferId,
      pending: true,
      progress: 0,
    },
  };
  addGroupMessage(group.id, msg);
  await broadcastMsg(msg);

  const myId = Number(config.blipId);
  const targets = (group.members || []).map(Number).filter((m) => Number.isFinite(m) && m !== myId);

  let lastPct = 0;
  try {
    for (const to of targets) {
      onPeerStart?.(to, transferId);
      try {
        await sendChatFile(
          api,
          config,
          to,
          file,
          (pct) => {
            lastPct = pct;
            onProgress?.(pct, to, transferId);
            updateGroupMessageAttachment(group.id, msgId, { progress: pct, pending: true });
          },
          { transferId, groupId: group.id, msgId }
        );
      } finally {
        onPeerEnd?.(to, transferId);
      }
    }
    const dataUrl = await fileToDataUrl(file);
    updateGroupMessageAttachment(group.id, msgId, {
      dataUrl,
      pending: false,
      progress: 100,
    });
    return {
      ok: true,
      chunked: true,
      msgId,
      transferId,
      progress: lastPct,
      attachment: { ...msg.attachment, dataUrl, pending: false },
    };
  } catch (err) {
    if (err?.message === 'cancelled') {
      updateGroupMessageAttachment(group.id, msgId, { pending: false, cancelled: true });
      throw err;
    }
    throw err;
  }
}
