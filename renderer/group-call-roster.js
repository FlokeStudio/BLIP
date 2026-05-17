/** Shared group voice roster (main + group-call window). */

/** @type {Map<string, Set<number>>} */
const voiceByGroup = new Map();
/** @type {Map<string, { active: boolean, participants: Set<number> }>} */
const ongoingByGroup = new Map();

function peerNum(id) {
  return Number(id);
}

export function dispatchCallState(groupId) {
  const snap = getOngoingGroupCall(groupId);
  window.dispatchEvent(
    new CustomEvent('blip-group-call-state', {
      detail: { groupId, ...snap },
    })
  );
}

export function getOngoingGroupCall(groupId) {
  const o = ongoingByGroup.get(groupId);
  if (!o?.active) return { active: false, participants: [], count: 0 };
  const participants = [...o.participants].sort((a, b) => a - b);
  return { active: true, participants, count: participants.length };
}

function setOngoing(groupId, participantIds, active) {
  if (!active || !participantIds?.length) {
    ongoingByGroup.delete(groupId);
  } else {
    ongoingByGroup.set(groupId, {
      active: true,
      participants: new Set(participantIds.map(peerNum).filter(Number.isFinite)),
    });
  }
  dispatchCallState(groupId);
}

export function applyVoiceRoster(groupId, participantIds, active) {
  if (!active || !participantIds?.length) {
    voiceByGroup.delete(groupId);
    setOngoing(groupId, [], false);
    return;
  }
  const set = new Set(participantIds.map(peerNum).filter(Number.isFinite));
  voiceByGroup.set(groupId, set);
  setOngoing(groupId, [...set], true);
}

export function addVoiceParticipant(groupId, id) {
  const n = peerNum(id);
  if (!Number.isFinite(n)) return;
  let set = voiceByGroup.get(groupId);
  if (!set) {
    set = new Set();
    voiceByGroup.set(groupId, set);
  }
  set.add(n);
  setOngoing(groupId, [...set], true);
}

export function removeVoiceParticipant(groupId, id) {
  const s = voiceByGroup.get(groupId);
  if (!s) return [];
  s.delete(peerNum(id));
  const list = [...s];
  if (list.length === 0) voiceByGroup.delete(groupId);
  setOngoing(groupId, list, list.length > 0);
  return list;
}

export function voiceParticipants(groupId) {
  return [...(voiceByGroup.get(groupId) || [])];
}

/** Apply incoming group-call-state TCP (roster only). */
export function applyGroupCallStateFromTcp(msg) {
  const participants = (msg.participants || []).map(peerNum).filter(Number.isFinite);

  if (!msg.active) {
    voiceByGroup.delete(msg.groupId);
    setOngoing(msg.groupId, [], false);
    return { participants: [], active: false };
  }

  applyVoiceRoster(msg.groupId, participants, true);
  return { participants, active: true };
}

/** group-call-start: mark call active with starter. */
export function noteGroupCallStarted(groupId, starterId) {
  const prev = getOngoingGroupCall(groupId).participants;
  const starter = peerNum(starterId);
  const merged = [...new Set([...prev, starter].filter(Number.isFinite))];
  applyVoiceRoster(groupId, merged, true);
}

export function clearGroupCallRoster(groupId) {
  voiceByGroup.delete(groupId);
  setOngoing(groupId, [], false);
}
