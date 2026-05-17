/**
 * Main-window bridge — WebRTC group calls run in group-call-window.
 */
import {
  getOngoingGroupCall,
  applyGroupCallStateFromTcp,
  noteGroupCallStarted,
  clearGroupCallRoster,
} from './group-call-roster.js';

export { getOngoingGroupCall };

export async function joinGroupCall(groupId, _api, opts = {}) {
  if (!window.blip?.openGroupCall) return;
  await window.blip.openGroupCall({
    groupId,
    skipInvite: !!opts.skipInvite,
  });
}

export async function leaveGroupCall() {
  if (window.blip?.leaveGroupCall) await window.blip.leaveGroupCall();
}

export function isInGroupCall() {
  return !!window.blip?.isGroupCallActiveSync?.();
}

export function getActiveGroupCallId() {
  return window.blip?.getActiveGroupCallIdSync?.() ?? null;
}

export async function handleGroupCallState(msg) {
  applyGroupCallStateFromTcp(msg);
}

export async function handleGroupCallStart(msg) {
  noteGroupCallStarted(msg.groupId, msg.from);
  if (window.blip?.openGroupCallIncoming) {
    await window.blip.openGroupCallIncoming({
      groupId: msg.groupId,
      from: msg.from,
      members: msg.members,
      host: msg.host,
    });
  }
}

export async function handleGroupCallEnd(msg) {
  if (msg.active === false) {
    clearGroupCallRoster(msg.groupId);
  }
}
