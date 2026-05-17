import { t } from './i18n.js';
import {
  getGroup,
  getGroupsFor,
  saveGroup,
  deleteGroup,
  amHost,
  pickNextHost,
  addGroupMessage,
  generateGroupId,
  groupDisplayName,
  removeMemberFromGroup,
  isGroupMember,
  normalizeMemberIds,
  isInviteDeclined,
  declineGroupInvite,
  clearDeclinedInvite,
  purgeGroupsFor,
} from './groups.js';
import { applyStashedGroupFile } from './group-file-transfer.js';
import { showAppToast } from './toasts.js';
import { sounds } from './audio.js';
import { openConfirmDialog } from './confirm-dialog.js';
import { createMessageId } from './message-id.js';
import {
  joinGroupCall,
  leaveGroupCall,
  handleGroupCallStart,
  handleGroupCallEnd,
  handleGroupCallState,
  isInGroupCall,
} from './group-call-client.js';

function onlineMemberIds(statePeers) {
  return new Set(
    (statePeers || [])
      .filter((p) => p.online)
      .map((p) => Number(p.blipId))
      .filter(Number.isFinite)
  );
}

function wireFrom(msg) {
  return Number(msg.from);
}

function resolveGroupHost(msg) {
  const h = Number(msg.host);
  if (Number.isFinite(h) && h > 0) return h;
  return wireFrom(msg);
}

/** Original author (TCP `from` is always the socket peer after Handshake). */
function messageAuthor(msg) {
  const a = msg.author ?? msg.originFrom;
  if (a != null && Number.isFinite(Number(a))) return Number(a);
  return wireFrom(msg);
}

async function safeSendTcp(api, payload) {
  try {
    const res = await api.sendTcpMessage(payload);
    if (res && res.ok === false) {
      console.warn('[groups-wire] tcp:', payload.type, res.error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[groups-wire] tcp:', payload.type, err?.message || err);
    return false;
  }
}

function deliverGroupMessage(groupId, incoming, ctx, { bumpUnread = false } = {}) {
  const myId = Number(ctx.config.blipId);
  const group = getGroup(groupId);
  if (!group || !isGroupMember(group, myId)) return false;

  if (!incoming.id) incoming.id = createMessageId();

  const outgoing = Number(incoming.from) === myId;
  const stored = addGroupMessage(groupId, { ...incoming, outgoing });
  if (!stored) return false;

  const view = ctx.getGroupChatView?.(groupId);
  view?.renderMessages?.();
  if (!outgoing) sounds.messageReceived();
  if (bumpUnread && !outgoing) ctx.bumpGroupUnread?.(groupId);
  return true;
}

/** Leave group locally and notify mesh. */
export async function leaveGroup(api, config, groupId, statePeers) {
  const group = getGroup(groupId);
  if (!group) return { ok: false, error: 'not_found' };
  const myId = Number(config.blipId);
  if (!isGroupMember(group, myId)) return { ok: false, error: 'not_member' };

  if (isInGroupCall()) await leaveGroupCall();

  const wasHost = amHost(group, myId);
  const online = onlineMemberIds(statePeers);
  const notify = [...group.members];

  const updated = removeMemberFromGroup(groupId, myId);

  if (updated && wasHost) {
    const next = pickNextHost(myId, updated.members, online) ?? updated.members[0];
    updated.hostId = next;
    saveGroup(updated);
    for (const m of updated.members) {
      await safeSendTcp(api, {
        type: 'group-host',
        to: m,
        groupId,
        host: next,
        members: updated.members,
      });
    }
  }

  for (const m of notify) {
    if (Number(m) === myId) continue;
    await safeSendTcp(api, {
      type: 'group-leave',
      to: m,
      groupId,
      host: group.hostId,
    });
  }

  return { ok: true };
}

/** Dissolve group (host only). */
export async function dissolveGroup(api, config, groupId) {
  const group = getGroup(groupId);
  if (!group) return { ok: false, error: 'not_found' };
  const myId = Number(config.blipId);
  if (!amHost(group, myId)) return { ok: false, error: 'not_host' };

  if (isInGroupCall()) await leaveGroupCall();

  for (const m of group.members) {
    if (Number(m) === myId) continue;
    await safeSendTcp(api, {
      type: 'group-disband',
      to: m,
      groupId,
      host: myId,
    });
  }
  deleteGroup(groupId);
  return { ok: true };
}

export async function createGroupFromUi(api, config, memberIds, name, seedPeerId) {
  const myId = Number(config.blipId);
  const groupId = generateGroupId();
  const members = normalizeMemberIds([myId, ...memberIds.filter((id) => Number(id) !== myId)]);
  const group = {
    id: groupId,
    name: name || t('group.unnamed'),
    hostId: myId,
    members,
    messages: [],
    creatorId: myId,
  };
  saveGroup(group);

  for (const m of members) {
    if (Number(m) === myId) continue;
    await safeSendTcp(api, {
      type: 'group-invite',
      to: m,
      groupId,
      host: myId,
      name: group.name,
      members,
    });
  }

  showAppToast({
    title: t('group.created'),
    body: groupDisplayName(group),
    durationMs: 4000,
  });

  return group;
}

/** Host failover only when the current host peer goes offline (not on every mesh pulse). */
export function migrateGroupsHostOnPeerOffline(offlinePeerId, onlineIds, api, config) {
  const myId = Number(config.blipId);
  const offline = Number(offlinePeerId);
  if (!Number.isFinite(offline)) return;

  for (const group of getGroupsFor(myId)) {
    if (Number(group.hostId) !== offline) continue;
    const next = pickNextHost(group.hostId, group.members, onlineIds);
    if (!next || next === group.hostId) continue;
    group.hostId = next;
    saveGroup(group);
    if (next === myId) {
      for (const m of group.members) {
        if (Number(m) === myId) continue;
        void safeSendTcp(api, {
          type: 'group-host',
          to: m,
          groupId: group.id,
          host: next,
          members: group.members,
        });
      }
    }
  }
}

/** Full mesh: sender pushes to every other member on existing TCP sockets. */
export async function sendGroupChatMessage(api, config, groupId, msg) {
  const group = getGroup(groupId);
  if (!group) return { ok: false };
  const myId = Number(config.blipId);
  const author = myId;
  const members = group.members;

  for (const m of members) {
    if (Number(m) === myId) continue;
    await safeSendTcp(api, {
      type: 'group-msg',
      to: m,
      groupId,
      host: group.hostId,
      author,
      members,
      text: msg.text,
      id: msg.id,
      timestamp: msg.timestamp,
      attachment: msg.attachment,
    });
  }
  return { ok: true };
}

export async function handleGroupTcpMessage(msg, ctx) {
  const { api, config, getGroupChatView, bumpGroupUnread } = ctx;
  const callApi = { ...api, config };
  const myId = Number(config.blipId);
  const type = msg.type;
  const tcpPeer = wireFrom(msg);

  if (type === 'group-invite') {
    if (isInviteDeclined(msg.groupId)) return true;
    if (!config.doNotDisturb) sounds.groupInvite();
    const hostId = resolveGroupHost(msg);
    const ok = await openConfirmDialog({
      title: t('group.invite_title'),
      body: t('group.invite_body')
        .replace('{name}', msg.name || t('group.unnamed'))
        .replace('{host}', String(hostId)),
      confirmLabel: t('group.invite_join'),
      cancelLabel: t('group.invite_decline'),
    });
    if (ok) {
      clearDeclinedInvite(msg.groupId);
      const group = {
        id: msg.groupId,
        name: msg.name || t('group.unnamed'),
        hostId,
        members: normalizeMemberIds(msg.members || []),
        messages: [],
      };
      saveGroup(group);
      await safeSendTcp(api, {
        type: 'group-invite-ack',
        to: hostId,
        groupId: msg.groupId,
        host: hostId,
        accept: true,
      });
      showAppToast({ title: t('group.joined'), body: group.name, durationMs: 4000 });
    } else {
      declineGroupInvite(msg.groupId);
      const ghost = getGroup(msg.groupId);
      if (ghost && isGroupMember(ghost, myId)) {
        removeMemberFromGroup(msg.groupId, myId);
      } else if (ghost) {
        deleteGroup(msg.groupId);
      }
      await safeSendTcp(api, {
        type: 'group-invite-ack',
        to: hostId,
        groupId: msg.groupId,
        host: hostId,
        accept: false,
      });
    }
    return true;
  }

  if (type === 'group-invite-ack') {
    const group = getGroup(msg.groupId);
    if (!group) return true;
    const peer = wireFrom(msg);
    if (msg.accept === false) {
      if (isGroupMember(group, peer)) removeMemberFromGroup(msg.groupId, peer);
      return true;
    }
    if (!isGroupMember(group, peer)) {
      group.members = normalizeMemberIds([...group.members, peer]);
      saveGroup(group);
    }
    return true;
  }

  if (type === 'group-host' || type === 'group-sync') {
    const group = getGroup(msg.groupId);
    if (!group) return true;
    group.hostId = resolveGroupHost(msg);
    if (msg.members) group.members = normalizeMemberIds(msg.members);
    saveGroup(group);
    getGroupChatView(msg.groupId)?.updateGroup?.(group);
    return true;
  }

  if (type === 'group-msg') {
    const group = getGroup(msg.groupId);
    const author = messageAuthor(msg);

    if (!group || !isGroupMember(group, myId)) return true;
    if (isInviteDeclined(msg.groupId)) return true;

    if (msg.members?.length) {
      group.members = normalizeMemberIds(msg.members);
      const host = resolveGroupHost(msg);
      if (Number.isFinite(host)) group.hostId = host;
      saveGroup(group);
    }
    if (tcpPeer !== author || !isGroupMember(group, author)) return true;
    if (author === myId) return true;

    const incoming = {
      id: msg.id,
      from: author,
      text: msg.text,
      timestamp: msg.timestamp || Date.now(),
      attachment: msg.attachment,
    };

    deliverGroupMessage(msg.groupId, incoming, ctx, { bumpUnread: true });
    if (incoming.attachment?.transferId) {
      applyStashedGroupFile(msg.groupId, incoming.id);
      getGroupChatView(msg.groupId)?.renderMessages?.();
    }
    return true;
  }

  if (type === 'group-leave') {
    const group = getGroup(msg.groupId);
    if (!group) return true;
    const leaverId = tcpPeer;
    if (!isGroupMember(group, leaverId)) return true;
    const wasHost = Number(group.hostId) === leaverId;
    removeMemberFromGroup(msg.groupId, leaverId);
    const updated = getGroup(msg.groupId);
    if (!updated) {
      ctx.onGroupRemoved?.(msg.groupId);
      return true;
    }
    getGroupChatView(msg.groupId)?.updateGroup?.(updated);
    if (wasHost) {
      const online = onlineMemberIds(ctx.statePeers);
      const next = pickNextHost(leaverId, updated.members, online) ?? updated.members[0];
      updated.hostId = next;
      saveGroup(updated);
      if (amHost(updated, myId)) {
        for (const m of updated.members) {
          if (Number(m) === myId) continue;
          await safeSendTcp(api, {
            type: 'group-host',
            to: m,
            groupId: msg.groupId,
            host: next,
            members: updated.members,
          });
        }
      }
    }
    ctx.onMemberLeft?.(msg.groupId, leaverId);
    return true;
  }

  if (type === 'group-disband') {
    deleteGroup(msg.groupId);
    ctx.onGroupRemoved?.(msg.groupId);
    showAppToast({ title: t('group.disbanded'), durationMs: 4000 });
    return true;
  }

  if (type === 'group-call-state') {
    await handleGroupCallState(msg, callApi);
    return true;
  }

  if (type === 'group-call-start') {
    await handleGroupCallStart(msg, callApi);
    return true;
  }

  if (type === 'group-call-end') {
    await handleGroupCallEnd(msg);
    return true;
  }

  return false;
}

export {
  isInGroupCall,
  joinGroupCall,
  leaveGroupCall,
  getOngoingGroupCall,
  getActiveGroupCallId,
} from './group-call-client.js';
