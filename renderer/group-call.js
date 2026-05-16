import { t, applyI18n } from './i18n.js';
import { getGroup, saveGroup, amHost, isGroupMember, normalizeMemberIds, groupDisplayName } from './groups.js';
import { sounds } from './audio.js';
import { showAppToast } from './toasts.js';
import { createAvatarElement } from './avatar.js';

const ICE = [];
/** @type {Map<number, RTCPeerConnection>} */
const peers = new Map();
/** @type {Map<number, RTCIceCandidateInit[]>} */
const pendingCandidates = new Map();
/** @type {Map<number, HTMLAudioElement>} */
const remoteAudios = new Map();

let localStream = null;
let activeGroupId = null;
let apiRef = null;
let configRef = null;
let shell = null;
let muted = false;
let deafened = false;
let callStart = null;
let timerInterval = null;
let pendingInvite = null;

function peerNum(id) {
  return Number(id);
}

function wireFrom(msg) {
  return Number(msg.from);
}

function signalOrigin(msg) {
  const o = msg.originFrom ?? msg.from;
  return peerNum(o);
}

function normalizeSdp(sdp) {
  if (!sdp) return null;
  if (typeof sdp === 'string') return { type: 'offer', sdp };
  if (typeof sdp.type === 'string' && typeof sdp.sdp === 'string') return sdp;
  return null;
}

async function getMic() {
  return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(m)}:${pad(s % 60)}`;
}

function createGroupCallShell(config) {
  const overlay = document.createElement('div');
  overlay.className = 'call-overlay hidden';

  const inner = document.createElement('motion');
  inner.className = 'call-inner glass';

  const statusEl = document.createElement('div');
  statusEl.className = 'call-status';
  statusEl.dataset.i18n = 'group.call_active';
  statusEl.textContent = t('group.call_active');

  const titleEl = document.createElement('div');
  titleEl.className = 'group-call-name';

  const voiceWrap = document.createElement('div');
  voiceWrap.className = 'call-voice-wrap';
  const avatarGrid = document.createElement('div');
  avatarGrid.className = 'group-call-avatar-grid';
  const waveform = document.createElement('div');
  waveform.className = 'call-waveform';
  for (let i = 0; i < 8; i++) {
    const bar = document.createElement('div');
    bar.className = 'wave-bar';
    waveform.appendChild(bar);
  }
  voiceWrap.appendChild(avatarGrid);
  voiceWrap.appendChild(waveform);

  const timerEl = document.createElement('div');
  timerEl.className = 'call-timer';
  timerEl.textContent = '00:00';

  const controls = document.createElement('motion');
  controls.className = 'call-controls';

  const muteBtn = document.createElement('button');
  muteBtn.type = 'button';
  muteBtn.className = 'btn btn-accent';
  muteBtn.dataset.i18n = 'call.mute';
  muteBtn.textContent = t('call.mute');

  const deafenBtn = document.createElement('button');
  deafenBtn.type = 'button';
  deafenBtn.className = 'btn btn-accent';
  deafenBtn.dataset.i18n = 'call.deafen';
  deafenBtn.textContent = t('call.deafen');

  const acceptBtn = document.createElement('button');
  acceptBtn.type = 'button';
  acceptBtn.className = 'btn btn-accent hidden';
  acceptBtn.dataset.i18n = 'call.accept';
  acceptBtn.textContent = t('call.accept');

  const rejectBtn = document.createElement('button');
  rejectBtn.type = 'button';
  rejectBtn.className = 'btn btn-danger hidden';
  rejectBtn.dataset.i18n = 'call.reject';
  rejectBtn.textContent = t('call.reject');

  const endBtn = document.createElement('button');
  endBtn.type = 'button';
  endBtn.className = 'btn btn-danger';
  endBtn.dataset.i18n = 'group.leave_call';
  endBtn.textContent = t('group.leave_call');

  controls.appendChild(muteBtn);
  controls.appendChild(deafenBtn);
  controls.appendChild(acceptBtn);
  controls.appendChild(rejectBtn);
  controls.appendChild(endBtn);

  inner.appendChild(statusEl);
  inner.appendChild(titleEl);
  inner.appendChild(voiceWrap);
  inner.appendChild(timerEl);
  inner.appendChild(controls);
  overlay.appendChild(inner);
  document.body.appendChild(overlay);

  function setStatus(key) {
    statusEl.dataset.i18n = key;
    statusEl.textContent = t(key);
  }

  function show() {
    overlay.classList.remove('hidden');
  }

  function hide() {
    overlay.classList.add('hidden');
    acceptBtn.classList.add('hidden');
    rejectBtn.classList.add('hidden');
    endBtn.classList.remove('hidden');
    muteBtn.classList.remove('hidden');
    deafenBtn.classList.remove('hidden');
  }

  function showIncoming() {
    show();
    setStatus('group.call_incoming');
    acceptBtn.classList.remove('hidden');
    rejectBtn.classList.remove('hidden');
    endBtn.classList.add('hidden');
    muteBtn.classList.add('hidden');
    deafenBtn.classList.add('hidden');
  }

  function showActive() {
    show();
    setStatus('group.call_active');
    acceptBtn.classList.add('hidden');
    rejectBtn.classList.add('hidden');
    endBtn.classList.remove('hidden');
    muteBtn.classList.remove('hidden');
    deafenBtn.classList.remove('hidden');
  }

  function startTimer() {
    callStart = Date.now();
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      if (callStart) timerEl.textContent = formatDuration(Date.now() - callStart);
    }, 500);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    callStart = null;
    timerEl.textContent = '00:00';
  }

  function refreshAvatars(group) {
    avatarGrid.innerHTML = '';
    if (!group) return;
    const myId = peerNum(config.blipId);
    group.members.forEach((id) => {
      const n = peerNum(id);
      const cell = document.createElement('div');
      cell.className = 'group-call-member';
      const slot = document.createElement('div');
      slot.className = 'call-avatar-slot group-call-avatar-slot';
      slot.appendChild(createAvatarElement(n, 4, { selfBlipId: config.blipId }));
      const label = document.createElement('span');
      label.className = 'group-call-member-label';
      const connected = n === myId || peers.has(n);
      label.textContent = n === myId ? t('group.you') : `#${n}`;
      if (connected) {
        const dot = document.createElement('span');
        dot.className = 'group-call-member-on';
        dot.textContent = ' ON';
        label.appendChild(dot);
      }
      cell.appendChild(slot);
      cell.appendChild(label);
      avatarGrid.appendChild(cell);
    });
  }

  muteBtn.addEventListener('click', () => {
    muted = !muted;
    localStream?.getAudioTracks().forEach((tr) => {
      tr.enabled = !muted;
    });
    muteBtn.classList.toggle('active', muted);
    muteBtn.dataset.i18n = muted ? 'call.unmute' : 'call.mute';
    muteBtn.textContent = t(muted ? 'call.unmute' : 'call.mute');
  });

  deafenBtn.addEventListener('click', () => {
    deafened = !deafened;
    for (const audio of remoteAudios.values()) {
      audio.muted = deafened;
    }
    deafenBtn.classList.toggle('active', deafened);
    deafenBtn.dataset.i18n = deafened ? 'call.undeafen' : 'call.deafen';
    deafenBtn.textContent = t(deafened ? 'call.undeafen' : 'call.deafen');
  });

  endBtn.addEventListener('click', () => {
    void leaveGroupCall();
  });

  acceptBtn.addEventListener('click', () => {
    if (pendingInvite) {
      const { groupId, api } = pendingInvite;
      pendingInvite = null;
      void joinGroupCall(groupId, api, { skipInvite: true });
    }
  });

  rejectBtn.addEventListener('click', () => {
    pendingInvite = null;
    hide();
    stopTimer();
  });

  return {
    overlay,
    show,
    hide,
    showIncoming,
    showActive,
    setStatus,
    setTitle: (text) => {
      titleEl.textContent = text;
    },
    refreshAvatars,
    startTimer,
    stopTimer,
    refreshI18n: () => applyI18n(overlay),
  };
}

function ensureShell(config) {
  if (!shell) shell = createGroupCallShell(config);
  configRef = config;
  return shell;
}

async function sendSignal(groupId, targetId, payload) {
  const group = getGroup(groupId);
  if (!group || !apiRef) return;
  const myId = peerNum(apiRef.config?.blipId);
  const hostId = peerNum(group.hostId);
  const target = peerNum(targetId);
  const to = amHost(group, myId) ? target : hostId;
  try {
    const res = await apiRef.sendTcpMessage({
      type: 'group-call-signal',
      to,
      groupId,
      host: hostId,
      target,
      originFrom: myId,
      ...payload,
    });
    if (res?.ok === false) console.warn('[group-call] signal:', res.error);
  } catch (err) {
    console.warn('[group-call] signal:', err?.message || err);
  }
}

async function flushCandidates(remoteId, pc) {
  const pending = pendingCandidates.get(remoteId);
  if (!pending?.length || !pc?.remoteDescription) return;
  for (const c of pending) {
    try {
      await pc.addIceCandidate(c);
    } catch {
      /* ignore */
    }
  }
  pendingCandidates.delete(remoteId);
}

async function createPc(remoteId, groupId, initiator) {
  const rid = peerNum(remoteId);
  if (peers.has(rid)) return peers.get(rid);
  const pc = new RTCPeerConnection({ iceServers: ICE });
  peers.set(rid, pc);
  pendingCandidates.set(rid, []);

  if (localStream) {
    localStream.getTracks().forEach((tr) => pc.addTrack(tr, localStream));
  }

  pc.ontrack = (ev) => {
    let audio = remoteAudios.get(rid);
    if (!audio) {
      audio = document.createElement('audio');
      audio.autoplay = true;
      audio.dataset.peer = String(rid);
      remoteAudios.set(rid, audio);
      document.body.appendChild(audio);
    }
    audio.srcObject = ev.streams[0] || new MediaStream([ev.track]);
    audio.muted = deafened;
    shell?.refreshAvatars(getGroup(groupId));
  };

  pc.onicecandidate = (ev) => {
    if (!ev.candidate) return;
    void sendSignal(groupId, rid, {
      signalKind: 'candidate',
      candidate: ev.candidate.toJSON(),
    });
  };

  if (initiator) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await sendSignal(groupId, rid, {
      signalKind: 'offer',
      sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp },
    });
  }

  return pc;
}

function shouldInitiate(myId, remoteId) {
  return peerNum(myId) < peerNum(remoteId);
}

export function isInGroupCall() {
  return !!activeGroupId;
}

export async function joinGroupCall(groupId, api, opts = {}) {
  const config = api.config;
  ensureShell(config);

  if (activeGroupId === groupId && localStream) {
    apiRef = api;
    shell.showActive();
    shell.refreshAvatars(getGroup(groupId));
    return;
  }
  if (activeGroupId) await leaveGroupCall();

  const group = getGroup(groupId);
  if (!group) return;

  apiRef = api;
  configRef = config;
  activeGroupId = groupId;
  pendingInvite = null;

  try {
    localStream = await getMic();
  } catch (err) {
    console.error('[group-call] mic:', err);
    showAppToast({
      title: t('group.call_mic_failed'),
      variant: 'danger',
      durationMs: 5000,
    });
    activeGroupId = null;
    shell.hide();
    return;
  }

  shell.setTitle(groupDisplayName(group));
  shell.showActive();
  shell.startTimer();
  shell.refreshAvatars(group);
  sounds.outgoingCall();

  const myId = peerNum(config.blipId);
  const hostId = peerNum(group.hostId);

  for (const m of group.members) {
    const mid = peerNum(m);
    if (mid === myId) continue;
    if (shouldInitiate(myId, mid)) void createPc(mid, groupId, true);
  }

  if (!opts.skipInvite) {
    for (const m of group.members) {
      const mid = peerNum(m);
      if (mid === myId) continue;
      try {
        const res = await api.sendTcpMessage({
          type: 'group-call-start',
          to: mid,
          groupId,
          host: hostId,
          members: group.members,
        });
        if (res?.ok === false) console.warn('[group-call] invite', mid, res.error);
      } catch (err) {
        console.warn('[group-call] invite', mid, err?.message || err);
      }
    }
  }
}

export async function leaveGroupCall() {
  const gid = activeGroupId;
  const api = apiRef;
  if (gid && api) {
    const group = getGroup(gid);
    const myId = peerNum(api.config.blipId);
    if (group) {
      for (const m of group.members) {
        const mid = peerNum(m);
        if (mid === myId) continue;
        void api.sendTcpMessage({
          type: 'group-call-end',
          to: mid,
          groupId: gid,
          host: group.hostId,
        });
      }
    }
  }

  for (const pc of peers.values()) pc.close();
  peers.clear();
  pendingCandidates.clear();
  remoteAudios.forEach((a) => a.remove());
  remoteAudios.clear();
  localStream?.getTracks().forEach((tr) => tr.stop());
  localStream = null;
  activeGroupId = null;
  pendingInvite = null;
  muted = false;
  deafened = false;
  shell?.stopTimer();
  shell?.hide();
  sounds.callEnd();
}

export async function handleGroupCallSignal(msg, api) {
  const groupId = msg.groupId;
  const group = getGroup(groupId);
  if (!group) return;
  apiRef = api;
  ensureShell(api.config);

  const target = peerNum(msg.target);
  const origin = signalOrigin(msg);
  const myId = peerNum(api.config.blipId);

  if (target !== myId && origin !== myId) return;

  const remoteId = origin === myId ? target : origin;
  if (!isGroupMember(group, remoteId) || !isGroupMember(group, myId)) return;

  if (msg.signalKind === 'offer') {
    if (!localStream) {
      activeGroupId = groupId;
      try {
        localStream = await getMic();
      } catch (err) {
        console.error('[group-call] mic on offer:', err);
        showAppToast({
          title: t('group.call_mic_failed'),
          variant: 'danger',
          durationMs: 5000,
        });
        return;
      }
      shell.setTitle(groupDisplayName(group));
      shell.showActive();
      shell.startTimer();
    }
    const pc = await createPc(remoteId, groupId, false);
    const offer = normalizeSdp(msg.sdp);
    if (!offer) return;
    await pc.setRemoteDescription(offer);
    await flushCandidates(remoteId, pc);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await sendSignal(groupId, remoteId, {
      signalKind: 'answer',
      sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp },
    });
    shell.refreshAvatars(group);
    for (const m of group.members) {
      const mid = peerNum(m);
      if (mid === myId || mid === remoteId) continue;
      if (shouldInitiate(myId, mid)) void createPc(mid, groupId, true);
    }
    return;
  }

  if (msg.signalKind === 'answer') {
    const pc = peers.get(remoteId);
    const answer = normalizeSdp(msg.sdp);
    if (pc && answer) {
      await pc.setRemoteDescription(answer);
      await flushCandidates(remoteId, pc);
    }
    shell?.refreshAvatars(group);
    return;
  }

  if (msg.signalKind === 'candidate') {
    const pc = peers.get(remoteId);
    if (!pc || !msg.candidate) return;
    if (!pc.remoteDescription) {
      const q = pendingCandidates.get(remoteId) || [];
      q.push(msg.candidate);
      pendingCandidates.set(remoteId, q);
      return;
    }
    try {
      await pc.addIceCandidate(msg.candidate);
    } catch {
      /* ignore */
    }
  }
}

export async function handleGroupCallStart(msg, api) {
  let group = getGroup(msg.groupId);
  if (!group && Array.isArray(msg.members) && msg.members.length) {
    group = {
      id: msg.groupId,
      name: t('group.unnamed'),
      hostId: Number(msg.host),
      members: normalizeMemberIds(msg.members),
      messages: [],
    };
    saveGroup(group);
  }
  if (!group || !isGroupMember(group, api.config.blipId)) return;
  if (activeGroupId === msg.groupId && localStream) {
    shell?.refreshAvatars(group);
    return;
  }

  ensureShell(api.config);
  const starter = wireFrom(msg);
  shell.setTitle(groupDisplayName(group));
  shell.refreshAvatars(group);
  pendingInvite = { groupId: msg.groupId, api };
  shell.showIncoming();
  sounds.groupCallInvite();

  showAppToast({
    title: t('group.call_invite'),
    body: t('group.call_invite_body').replace('{id}', String(starter)),
    actions: [
      {
        label: t('group.join_call'),
        primary: true,
        onClick: () => void joinGroupCall(msg.groupId, api, { skipInvite: true }),
      },
    ],
    durationMs: 15000,
  });
}

export async function handleGroupCallEnd(msg) {
  if (msg.groupId !== activeGroupId) return;
  const remoteId = wireFrom(msg);
  const pc = peers.get(remoteId);
  if (pc) {
    pc.close();
    peers.delete(remoteId);
  }
  remoteAudios.get(remoteId)?.remove();
  remoteAudios.delete(remoteId);
  shell?.refreshAvatars(getGroup(msg.groupId));
}

export async function relayGroupCallSignal(msg, api) {
  const myId = peerNum(api.config.blipId);
  const group = getGroup(msg.groupId);
  if (!group || !amHost(group, myId)) return;
  const target = peerNum(msg.target);
  const origin = signalOrigin(msg);
  if (!target || target === myId) return;
  if (!isGroupMember(group, target) || !isGroupMember(group, origin)) return;
  try {
    await api.sendTcpMessage({
      type: 'group-call-signal',
      to: target,
      groupId: msg.groupId,
      host: group.hostId,
      target,
      originFrom: origin,
      signalKind: msg.signalKind,
      sdp: msg.sdp,
      candidate: msg.candidate,
    });
  } catch (err) {
    console.warn('[group-call] relay failed:', err?.message || err);
  }
}
