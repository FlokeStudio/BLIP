const CACHE_KEY = 'blip_peer_avatars_v1';
const CUSTOM_KEY = 'blip_avatar_custom_v1';
const MAX_SYNC_CHARS = 100_000;

/** @type {Map<number, string>} */
const cache = new Map();

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const o = JSON.parse(raw);
    for (const [k, v] of Object.entries(o)) {
      const id = Number(k);
      if (Number.isFinite(id) && typeof v === 'string' && v.startsWith('data:image/')) {
        cache.set(id, v);
      }
    }
  } catch {
    /* ignore */
  }
}

function persistCache() {
  try {
    const o = {};
    for (const [id, url] of cache) o[String(id)] = url;
    localStorage.setItem(CACHE_KEY, JSON.stringify(o));
  } catch {
    /* ignore */
  }
}

loadCache();

export function getPeerAvatarDataUrl(peerId) {
  return cache.get(Number(peerId)) || null;
}

export function setPeerAvatar(peerId, dataUrl) {
  const id = Number(peerId);
  if (!Number.isFinite(id)) return;
  if (!dataUrl) {
    cache.delete(id);
    persistCache();
    dispatchChanged(id);
    return;
  }
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return;
  if (dataUrl.length > MAX_SYNC_CHARS) return;
  cache.set(id, dataUrl);
  persistCache();
  dispatchChanged(id);
}

function dispatchChanged(peerId) {
  window.dispatchEvent(
    new CustomEvent('blip-peer-avatar-changed', { detail: { peerId: Number(peerId) } })
  );
}

function readOwnCustomAvatar() {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (raw && raw.startsWith('data:image/')) return raw;
  } catch {
    /* ignore */
  }
  return null;
}

/** Payload for avatar-sync TCP (own custom avatar). */
export function getLocalAvatarSyncPayload() {
  const url = readOwnCustomAvatar();
  if (!url || url.length > MAX_SYNC_CHARS) return null;
  return url;
}
