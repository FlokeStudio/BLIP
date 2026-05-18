const STORAGE_KEY = 'blip_pins_v1';

function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

function saveAll(o) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(o));
  } catch (e) {
    console.warn('[BLIP pins]', e);
  }
}

function key(peerId) {
  return String(peerId);
}

export function getPinnedMessageId(peerId) {
  const id = loadAll()[key(peerId)];
  return id ? String(id) : null;
}

export function setPinnedMessageId(peerId, messageId) {
  const o = loadAll();
  const k = key(peerId);
  if (!messageId) delete o[k];
  else o[k] = String(messageId);
  saveAll(o);
}
