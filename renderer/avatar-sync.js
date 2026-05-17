import { getLocalAvatarSyncPayload, setPeerAvatar } from './peer-avatars.js';

async function safeSend(api, payload) {
  try {
    const res = await api.sendTcpMessage(payload);
    return res?.ok !== false;
  } catch {
    return false;
  }
}

/** Push our custom avatar to one peer (or clear). */
export async function sendAvatarToPeer(api, peerId, dataUrl = null) {
  const to = Number(peerId);
  if (!Number.isFinite(to)) return false;
  return safeSend(api, {
    type: 'avatar-sync',
    to,
    dataUrl: dataUrl || null,
  });
}

/** Broadcast avatar to all online peers. */
export async function broadcastAvatarToPeers(api, peers) {
  const payload = getLocalAvatarSyncPayload();
  const list = (peers || []).filter((p) => p?.online && Number.isFinite(Number(p.blipId)));
  for (const p of list) {
    await safeSend(api, {
      type: 'avatar-sync',
      to: Number(p.blipId),
      dataUrl: payload,
    });
  }
}

export function handleAvatarSyncMessage(msg) {
  const from = Number(msg.from);
  if (!Number.isFinite(from)) return;
  const dataUrl = msg.dataUrl;
  if (dataUrl == null || dataUrl === '') {
    setPeerAvatar(from, null);
    return;
  }
  if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')) {
    setPeerAvatar(from, dataUrl);
  }
}
