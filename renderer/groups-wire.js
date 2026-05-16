import { t } from './i18n.js';
import {
  getGroup,
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
} from './groups.js';
import { showAppToast } from './toasts.js';
import { sounds } from './audio.js';
import { openConfirmDialog } from './confirm-dialog.js';
import { createMessageId } from './message-id.js';
import {
  joinGroupCall,
  leaveGroupCall,
  handleGroupCallSignal,
  handleGroupCallStart,
  handleGroupCallEnd,
  relayGroupCallSignal,
  isInGroupCall,
} from './group-call.js';

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

  for (const m of group.members) {
    if (Number(m) === myId) continue;
    await safeSendTcp(api, {
      type: 'group-leave',
      to: m,
      groupId,
      host: group.hostId,
    });
  }

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

export function migrateGroupsHost(groups, onlineIds, api, config) {
  const myId = Number(config.blipId);
  for (const group of groups) {
    if (!isGroupMember(group, myId)) continue;
    if (onlineIds.has(Number(group.hostId))) continue;
    const next = pickNextHost(group.hostId, group.members, onlineIds);
    if (!next) continue;
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

export async function sendGroupChatMessage(api, config, groupId, msg) {
  const group = getGroup(groupId);
  if (!group) return { ok: false };
  const hostId = Number(group.hostId);
  const myId = Number(config.blipId);
  const author = myId;

  if (amHost(group, myId)) {
    for (const m of group.members) {
      if (Number(m) === myId) continue;
      await safeSendTcp(api, {
        type: 'group-msg',
        to: m,
        groupId,
        host: hostId,
        author,
        text: msg.text,
        id: msg.id,
        timestamp: msg.timestamp,
        attachment: msg.attachment,
      });
    }
    return { ok: true };
  }

  return api.sendTcpMessage({
    type: 'group-msg',
    to: hostId,
    groupId,
    host: hostId,
    author,
    text: msg.text,
    id: msg.id,
    timestamp: msg.timestamp,
    attachment: msg.attachment,
  });
}

export async function handleGroupTcpMessage(msg, ctx) {
  const { api, config, getGroupChatView, bumpGroupUnread } = ctx;
  const myId = Number(config.blipId);
  const type = msg.type;
  const tcpPeer = wireFrom(msg);

  if (type === 'group-invite') {
    if (!config.doNotDisturb) sounds.groupInvite();
    const ok = await openConfirmDialog({
      title: t('group.invite_title'),
      body: t('group.invite_body')
        .replace('{name}', msg.name || t('group.unnamed'))
        .replace('{host}', String(msg.host)),
      confirmLabel: t('group.invite_join'),
    });
    if (ok) {
      const group = {
        id: msg.groupId,
        name: msg.name || t('group.unnamed'),
        hostId: Number(msg.host),
        members: normalizeMemberIds(msg.members || []),
        messages: [],
      };
      saveGroup(group);
      await safeSendTcp(api, {
        type: 'group-invite-ack',
        to: msg.host,
        groupId: msg.groupId,
        host: msg.host,
        accept: true,
      });
      showAppToast({ title: t('group.joined'), body: group.name, durationMs: 4000 });
    } else {
      await safeSendTcp(api, {
        type: 'group-invite-ack',
        to: msg.host,
        groupId: msg.groupId,
        host: msg.host,
        accept: false,
      });
    }
    return true;
  }

  if (type === 'group-invite-ack') {
    return true;
  }

  if (type === 'group-host' || type === 'group-sync') {
    const group = getGroup(msg.groupId);
    if (!group) return true;
    group.hostId = Number(msg.host);
    if (msg.members) group.members = normalizeMemberIds(msg.members);
    saveGroup(group);
    getGroupChatView(msg.groupId)?.updateGroup?.(group);
    return true;
  }

  if (type === 'group-msg') {
    const group = getGroup(msg.groupId);
    if (!group || !isGroupMember(group, myId)) return true;

    const hostId = Number(group.hostId);
    const author = messageAuthor(msg);
    const incoming = {
      id: msg.id,
      from: author,
      text: msg.text,
      timestamp: msg.timestamp || Date.now(),
      attachment: msg.attachment,
    };

    if (amHost(group, myId)) {
      // Host accepts only direct uploads from members (TCP peer = author).
      if (msg.relayed) return true;
      if (tcpPeer !== author || !isGroupMember(group, author)) return true;
      if (author === myId) return true;

      deliverGroupMessage(msg.groupId, incoming, ctx);
      for (const m of group.members) {
        if (Number(m) === myId || Number(m) === author) continue;
        await safeSendTcp(api, {
          type: 'group-msg',
          to: m,
          groupId: msg.groupId,
          host: hostId,
          author,
          relayed: true,
          text: msg.text,
          id: msg.id,
          timestamp: msg.timestamp,
          attachment: msg.attachment,
        });
      }
    } else {
      // Members only trust relayed traffic from the designated host.
      if (tcpPeer !== hostId) return true;
      deliverGroupMessage(msg.groupId, incoming, ctx, { bumpUnread: true });
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

  if (type === 'group-call-signal') {
    const group = getGroup(msg.groupId);
    const target = Number(msg.target);
    if (group && amHost(group, myId) && target && target !== myId) {
      await relayGroupCallSignal(msg, api);
    } else {
      await handleGroupCallSignal(msg, api);
    }
    return true;
  }

  if (type === 'group-call-start') {
    await handleGroupCallStart(msg, api);
    return true;
  }

  if (type === 'group-call-end') {
    await handleGroupCallEnd(msg);
    return true;
  }

  return false;
}

export { isInGroupCall, joinGroupCall, leaveGroupCall } from './group-call.js';
