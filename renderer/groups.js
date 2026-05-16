const STORAGE_KEY = 'blip_groups_v1';

/** @type {Map<string, object>} */
const groups = new Map();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const o = JSON.parse(raw);
    for (const [id, g] of Object.entries(o)) {
      if (g && typeof g === 'object' && g.id) {
        if (g.hostId != null) g.hostId = Number(g.hostId);
        if (Array.isArray(g.members)) g.members = normalizeMemberIds(g.members);
        if (Array.isArray(g.messages)) g.messages = dedupeMessages(g.messages);
        groups.set(id, g);
      }
    }
  } catch (e) {
    console.warn('[BLIP groups] load', e);
  }
}

function persist() {
  try {
    const o = {};
    for (const [id, g] of groups) o[id] = g;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(o));
  } catch (e) {
    console.warn('[BLIP groups] persist', e);
  }
}

export function normalizeMemberIds(members) {
  return [...new Set((members || []).map((m) => Number(m)).filter(Number.isFinite))];
}

export function dedupeMessages(messages) {
  const seen = new Set();
  const out = [];
  for (const m of messages || []) {
    if (m?.id && seen.has(m.id)) continue;
    if (m?.id) seen.add(m.id);
    out.push(m);
  }
  return out;
}

export function isGroupMember(group, blipId) {
  if (!group?.members) return false;
  const id = Number(blipId);
  return group.members.some((m) => Number(m) === id);
}

load();

export function generateGroupId() {
  return Math.random().toString(36).slice(2, 10);
}

export function getAllGroups() {
  return [...groups.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function getGroup(groupId) {
  return groups.get(groupId) || null;
}

export function saveGroup(group) {
  const normalized = {
    ...group,
    hostId: Number(group.hostId),
    members: normalizeMemberIds(group.members),
    updatedAt: Date.now(),
  };
  if (Array.isArray(normalized.messages)) {
    normalized.messages = dedupeMessages(normalized.messages);
  }
  groups.set(normalized.id, normalized);
  persist();
  window.dispatchEvent(new CustomEvent('blip-groups-changed', { detail: { groupId: normalized.id } }));
}

export function deleteGroup(groupId) {
  groups.delete(groupId);
  persist();
  window.dispatchEvent(new CustomEvent('blip-groups-changed', { detail: { groupId } }));
}

export function removeMemberFromGroup(groupId, blipId) {
  const g = getGroup(groupId);
  if (!g) return null;
  const id = Number(blipId);
  g.members = g.members.filter((m) => Number(m) !== id);
  g.updatedAt = Date.now();
  if (!g.members.length) {
    deleteGroup(groupId);
    return null;
  }
  persist();
  window.dispatchEvent(new CustomEvent('blip-groups-changed', { detail: { groupId } }));
  return g;
}

export function amHost(group, blipId) {
  return group && Number(group.hostId) === Number(blipId);
}

export function pickNextHost(currentHost, members, onlineIds) {
  const sorted = normalizeMemberIds(members).sort((a, b) => a - b);
  const idx = sorted.indexOf(Number(currentHost));
  if (idx < 0) return sorted.find((id) => onlineIds.has(id)) ?? null;
  for (let i = 1; i <= sorted.length; i++) {
    const next = sorted[(idx + i) % sorted.length];
    if (onlineIds.has(next)) return next;
  }
  return null;
}

export function getGroupMessages(groupId) {
  const g = getGroup(groupId);
  if (!g.messages) g.messages = [];
  return g.messages;
}

/** @returns {boolean} true if message was stored */
export function addGroupMessage(groupId, msg) {
  const g = getGroup(groupId);
  if (!g) return false;
  if (!g.messages) g.messages = [];
  if (msg.id && g.messages.some((m) => m.id === msg.id)) return false;
  const fp = `${Number(msg.from)}:${msg.timestamp}:${(msg.text || '').slice(0, 80)}`;
  if (g.messages.some((m) => `${Number(m.from)}:${m.timestamp}:${(m.text || '').slice(0, 80)}` === fp)) {
    return false;
  }
  g.messages.push(msg);
  if (g.messages.length > 500) g.messages = g.messages.slice(-500);
  g.updatedAt = Date.now();
  persist();
  return true;
}

export function groupDisplayName(group) {
  if (group.name) return group.name;
  const ids = (group.members || []).slice(0, 4).join(',');
  return `MESH [${ids}${group.members?.length > 4 ? '…' : ''}]`;
}
