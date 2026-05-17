import { t, applyI18n } from './i18n.js';
import {
  getGroup,
  saveGroup,
  isGroupMember,
  normalizeMemberIds,
  groupDisplayName,
  isInviteDeclined,
} from './groups.js';
import { sounds } from './audio.js';
import { showAppToast } from './toasts.js';
import { createAvatarElement } from './avatar.js';
import { openScreenPickerDialog } from './screen-picker-dialog.js';
import { captureDisplayStream } from './display-capture.js';
import {
  applyScreenTrackConstraints,
  tuneVideoSender,
  trackLooksLikeScreen,
  applyCallFullscreenLayout,
} from './call-media.js';
import {
  getOngoingGroupCall,
  applyVoiceRoster,
  addVoiceParticipant,
  removeVoiceParticipant,
  voiceParticipants,
  applyGroupCallStateFromTcp,
  noteGroupCallStarted,
  clearGroupCallRoster,
} from './group-call-roster.js';

export { getOngoingGroupCall };

const ICE = [];
/** @type {Map<number, RTCPeerConnection>} */
const peers = new Map();
/** @type {Map<number, RTCIceCandidateInit[]>} */
const pendingCandidates = new Map();
/** @type {Map<number, HTMLAudioElement>} */
const remoteAudios = new Map();
/** @type {Map<number, HTMLVideoElement>} */
const remoteVideos = new Map();
/** @type {Map<number, { msg: object, groupId: string }>} */
const pendingOffers = new Map();

const dismissedRing = new Set();

let localStream = null;
let screenStream = null;
let sharingScreen = false;
let activeGroupId = null;
let apiRef = null;
let configRef = null;
let shell = null;
let muted = false;
let deafened = false;
/** @type {Map<number, { muted: boolean, deafened: boolean, screenSharing: boolean }>} */
const peerMediaState = new Map();
let groupFsOverlay = null;
let groupFsWrap = null;
let groupFsVideo = null;
let callStart = null;
let timerInterval = null;
let heartbeatTimer = null;
let pendingInvite = null;

function peerNum(id) {
  return Number(id);
}

function callConfig(api) {
  return api?.config ?? configRef;
}

function myBlipId(api) {
  return peerNum(callConfig(api)?.blipId);
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

function reportActiveToMain() {
  window.blip?.reportGroupCallActive?.({
    active: !!activeGroupId && !!localStream,
    groupId: activeGroupId,
  });
}

function dismissIncomingUi(groupId) {
  sounds.stopOutgoingRing();
  if (pendingInvite?.groupId === groupId) pendingInvite = null;
  if (activeGroupId === groupId && localStream) shell?.showActive();
}

function myMediaState() {
  return { muted, deafened, screenSharing: sharingScreen };
}

function getParticipantMediaState(peerId) {
  const n = peerNum(peerId);
  const myId = peerNum(configRef?.blipId);
  if (n === myId) return myMediaState();
  return (
    peerMediaState.get(n) || { muted: false, deafened: false, screenSharing: false }
  );
}

function buildStatesPayload(participants, myId) {
  const states = {};
  for (const pid of participants) {
    states[String(pid)] = getParticipantMediaState(pid);
  }
  if (Number.isFinite(myId)) states[String(myId)] = myMediaState();
  return states;
}

async function broadcastCallState(groupId, { end = false } = {}) {
  const group = getGroup(groupId);
  if (!group || !apiRef) return;
  const myId = myBlipId(apiRef);
  let participants = [];
  if (end) {
    applyVoiceRoster(groupId, [], false);
    peerMediaState.clear();
  } else {
    if (localStream && Number.isFinite(myId)) addVoiceParticipant(groupId, myId);
    participants = voiceParticipants(groupId);
  }

  const states = end ? {} : buildStatesPayload(participants, myId);

  for (const m of group.members) {
    const mid = peerNum(m);
    if (mid === myId) continue;
    try {
      await apiRef.sendTcpMessage({
        type: 'group-call-state',
        to: mid,
        groupId,
        host: group.hostId,
        members: group.members,
        active: !end,
        participants,
        states,
      });
    } catch (err) {
      console.warn('[group-call] state:', err?.message || err);
    }
  }
}

function ensureGroupFsOverlay(config) {
  if (groupFsOverlay?.isConnected) return;
  groupFsOverlay = document.createElement('div');
  groupFsOverlay.className = 'group-call-fs-overlay hidden';
  groupFsWrap = document.createElement('div');
  groupFsWrap.className = 'group-call-fs-wrap call-video-wrap--fs-sized';
  groupFsVideo = document.createElement('video');
  groupFsVideo.className = 'group-call-fs-video call-video--stage';
  groupFsVideo.autoplay = true;
  groupFsVideo.playsInline = true;
  groupFsVideo.muted = true;
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn-accent group-call-fs-close';
  closeBtn.dataset.i18n = 'call.exit_fullscreen';
  closeBtn.textContent = t('call.exit_fullscreen');
  closeBtn.addEventListener('click', () => closeGroupVideoFs(config));
  groupFsWrap.appendChild(groupFsVideo);
  groupFsOverlay.appendChild(groupFsWrap);
  groupFsOverlay.appendChild(closeBtn);
  groupFsOverlay.addEventListener('click', (e) => {
    if (e.target === groupFsOverlay) closeGroupVideoFs(config);
  });
  document.body.appendChild(groupFsOverlay);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && groupFsOverlay && !groupFsOverlay.classList.contains('hidden')) {
      closeGroupVideoFs(config);
    }
  });
}

function closeGroupVideoFs(config) {
  if (!groupFsOverlay) return;
  groupFsOverlay.classList.add('hidden');
  applyCallFullscreenLayout(groupFsWrap, null, config, false);
  if (groupFsVideo) groupFsVideo.srcObject = null;
}

function openGroupVideoFs(peerId, config) {
  const n = peerNum(peerId);
  const myId = peerNum(config.blipId);
  let stream = null;
  if (n === myId && sharingScreen && screenStream) {
    stream = screenStream;
  } else {
    stream = remoteVideos.get(n)?.srcObject || null;
  }
  if (!stream) return;
  ensureGroupFsOverlay(config);
  groupFsVideo.srcObject = stream;
  applyCallFullscreenLayout(groupFsWrap, groupFsVideo, config, true);
  groupFsOverlay.classList.remove('hidden');
}

function startHeartbeat(groupId) {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (activeGroupId === groupId && localStream) void broadcastCallState(groupId);
  }, 12000);
}

function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

async function meshNewParticipants(groupId, participantIds) {
  if (!localStream || activeGroupId !== groupId) return;
  const myId = peerNum(configRef?.blipId);
  for (const pid of participantIds) {
    const mid = peerNum(pid);
    if (mid === myId || peers.has(mid)) continue;
    if (shouldInitiate(myId, mid)) void createPc(mid, groupId, true);
  }
}

function createGroupCallShell(config) {
  const overlay = document.createElement('div');
  overlay.className = 'call-overlay hidden group-call-overlay';

  const inner = document.createElement('div');
  inner.className = 'call-inner glass group-call-inner';

  const statusEl = document.createElement('div');
  statusEl.className = 'call-status';
  statusEl.dataset.i18n = 'group.call_active';
  statusEl.textContent = t('group.call_active');

  const titleEl = document.createElement('div');
  titleEl.className = 'group-call-title-line';

  const stage = document.createElement('div');
  stage.className = 'group-call-stage';

  const avatarGrid = document.createElement('div');
  avatarGrid.className = 'group-call-avatar-grid';

  const waveform = document.createElement('div');
  waveform.className = 'call-waveform group-call-waveform';
  for (let i = 0; i < 8; i++) {
    const bar = document.createElement('div');
    bar.className = 'wave-bar';
    waveform.appendChild(bar);
  }

  stage.appendChild(avatarGrid);
  stage.appendChild(waveform);

  const timerEl = document.createElement('div');
  timerEl.className = 'call-timer';
  timerEl.textContent = '00:00';

  const controls = document.createElement('div');
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

  const shareBtn = document.createElement('button');
  shareBtn.type = 'button';
  shareBtn.className = 'btn btn-accent hidden';
  shareBtn.dataset.i18n = 'call.share';
  shareBtn.textContent = t('call.share');

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
  controls.appendChild(shareBtn);
  controls.appendChild(acceptBtn);
  controls.appendChild(rejectBtn);
  controls.appendChild(endBtn);

  inner.appendChild(statusEl);
  inner.appendChild(titleEl);
  inner.appendChild(stage);
  inner.appendChild(timerEl);
  inner.appendChild(controls);
  overlay.appendChild(inner);
  const mount = document.getElementById('group-call-root') || document.body;
  mount.appendChild(overlay);

  function setStatus(key) {
    statusEl.dataset.i18n = key;
    statusEl.textContent = t(key);
  }

  function show() {
    overlay.classList.remove('hidden');
    inner.classList.add('group-call-inner--live');
  }

  function hide() {
    overlay.classList.add('hidden');
    inner.classList.remove('group-call-inner--live', 'group-call-inner--incoming');
    acceptBtn.classList.add('hidden');
    rejectBtn.classList.add('hidden');
    endBtn.classList.remove('hidden');
    muteBtn.classList.remove('hidden');
    deafenBtn.classList.remove('hidden');
  }

  function showIncoming() {
    show();
    inner.classList.add('group-call-inner--incoming');
    setStatus('group.call_incoming');
    acceptBtn.classList.remove('hidden');
    rejectBtn.classList.remove('hidden');
    endBtn.classList.add('hidden');
    muteBtn.classList.add('hidden');
    deafenBtn.classList.add('hidden');
    shareBtn.classList.add('hidden');
  }

  function showActive() {
    show();
    inner.classList.remove('group-call-inner--incoming');
    setStatus('group.call_active');
    acceptBtn.classList.add('hidden');
    rejectBtn.classList.add('hidden');
    endBtn.classList.remove('hidden');
    muteBtn.classList.remove('hidden');
    deafenBtn.classList.remove('hidden');
    setShareButton(false);
    shareBtn.classList.remove('hidden');
  }

  function setShareButton(active) {
    shareBtn.classList.toggle('active', active);
    shareBtn.dataset.i18n = active ? 'call.share_stop' : 'call.share';
    shareBtn.textContent = t(active ? 'call.share_stop' : 'call.share');
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
    const ongoing = getOngoingGroupCall(group.id);
    const inVoice = new Set(ongoing.participants);

    group.members.forEach((id) => {
      const n = peerNum(id);
      const cell = document.createElement('div');
      cell.className = 'group-call-member';
      const tile = document.createElement('div');
      const connected = n === myId ? !!localStream : peers.has(n);
      const inCall = inVoice.has(n) || connected;
      tile.className = `group-call-tile glass${inCall ? ' group-call-tile--live' : ''}${connected ? ' group-call-tile--linked' : ''}`;

      const slot = document.createElement('div');
      slot.className = 'call-avatar-slot group-call-avatar-slot';
      if (n === myId && sharingScreen && screenStream) {
        const v = document.createElement('video');
        v.className = 'group-call-remote-video';
        v.autoplay = true;
        v.playsInline = true;
        v.muted = true;
        v.srcObject = screenStream;
        slot.appendChild(v);
      } else {
      const remoteVid = remoteVideos.get(n);
      if (remoteVid?.srcObject) {
        const v = document.createElement('video');
        v.className = 'group-call-remote-video';
        v.autoplay = true;
        v.playsInline = true;
        v.muted = true;
        v.srcObject = remoteVid.srcObject;
        slot.appendChild(v);
      } else {
        slot.appendChild(createAvatarElement(n, 4, { selfBlipId: config.blipId }));
      }
      }
      tile.appendChild(slot);

      if (connected) {
        const ring = document.createElement('div');
        ring.className = 'group-call-tile-ring';
        tile.appendChild(ring);
      }

      const media = getParticipantMediaState(n);
      const badges = document.createElement('div');
      badges.className = 'group-call-tile-badges';
      if (media.muted) {
        const micBadge = document.createElement('span');
        micBadge.className = 'call-peer-badge call-peer-badge--mic';
        micBadge.dataset.i18n = 'call.remote_muted';
        micBadge.textContent = t('call.remote_muted');
        badges.appendChild(micBadge);
      }
      if (media.deafened) {
        const deafBadge = document.createElement('span');
        deafBadge.className = 'call-peer-badge call-peer-badge--deaf';
        deafBadge.dataset.i18n = 'call.remote_deaf';
        deafBadge.textContent = t('call.remote_deaf');
        badges.appendChild(deafBadge);
      }
      if (badges.childElementCount) tile.appendChild(badges);

      const videoStream =
        n === myId && sharingScreen && screenStream
          ? screenStream
          : remoteVideos.get(n)?.srcObject || null;
      const vTrack = videoStream?.getVideoTracks?.()?.[0];
      const isScreen = media.screenSharing || (vTrack && trackLooksLikeScreen(vTrack));
      if (videoStream && inCall && isScreen) {
        tile.classList.add('group-call-tile--expandable');
        tile.title = t('call.fullscreen');
        tile.addEventListener('click', () => openGroupVideoFs(n, config));
      }

      const label = document.createElement('span');
      label.className = 'group-call-member-label';
      label.textContent = n === myId ? t('group.you') : `#${n}`;
      if (inCall) {
        const live = document.createElement('span');
        live.className = 'group-call-member-live';
        live.textContent = connected ? t('group.call_linked') : t('group.call_voice');
        label.appendChild(live);
      }

      cell.appendChild(tile);
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
    if (activeGroupId) {
      void broadcastCallState(activeGroupId);
      shell?.refreshAvatars(getGroup(activeGroupId));
    }
  });

  deafenBtn.addEventListener('click', () => {
    deafened = !deafened;
    for (const audio of remoteAudios.values()) audio.muted = deafened;
    deafenBtn.classList.toggle('active', deafened);
    deafenBtn.dataset.i18n = deafened ? 'call.undeafen' : 'call.deafen';
    deafenBtn.textContent = t(deafened ? 'call.undeafen' : 'call.deafen');
    if (activeGroupId) {
      void broadcastCallState(activeGroupId);
      shell?.refreshAvatars(getGroup(activeGroupId));
    }
  });

  shareBtn.addEventListener('click', () => {
    void toggleGroupScreenShare(setShareButton);
  });

  endBtn.addEventListener('click', () => {
    void leaveGroupCall();
  });

  acceptBtn.addEventListener('click', () => {
    if (pendingInvite) {
      const { groupId, api } = pendingInvite;
      pendingInvite = null;
      dismissedRing.delete(groupId);
      void joinGroupCall(groupId, api, { skipInvite: true });
    }
  });

  rejectBtn.addEventListener('click', () => {
    if (pendingInvite?.groupId) dismissedRing.add(pendingInvite.groupId);
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
  const myId = myBlipId(apiRef);
  const target = peerNum(targetId);
  try {
    const res = await apiRef.sendTcpMessage({
      type: 'group-call-signal',
      to: target,
      groupId,
      host: group.hostId,
      target,
      originFrom: myId,
      ...payload,
    });
    if (res?.ok === false) console.warn('[group-call] signal:', res.error);
  } catch (err) {
    console.warn('[group-call] signal:', err?.message || err);
  }
}

function getVideoSender(pc) {
  return pc?.getSenders().find((s) => s.track?.kind === 'video') ?? null;
}

async function applyVideoToPeer(rid, groupId, track, screenShare) {
  const pc = peers.get(rid);
  if (!pc) return;
  const sender = getVideoSender(pc);
  if (sender) {
    await sender.replaceTrack(track);
    if (track) await tuneVideoSender(sender, { screenShare, config: configRef });
    return;
  }
  if (!track) return;
  const stream = screenStream || new MediaStream([track]);
  pc.addTrack(track, stream);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await sendSignal(groupId, rid, {
    signalKind: 'offer',
    sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp },
  });
}

async function applyVideoToAllPeers(groupId, track, screenShare) {
  for (const rid of peers.keys()) {
    await applyVideoToPeer(rid, groupId, track, screenShare);
  }
}

async function stopGroupScreenShare(syncShareBtn) {
  if (!sharingScreen && !screenStream) return;
  screenStream?.getTracks().forEach((tr) => tr.stop());
  screenStream = null;
  sharingScreen = false;
  syncShareBtn?.(false);
  if (activeGroupId) {
    await applyVideoToAllPeers(activeGroupId, null, false);
    void broadcastCallState(activeGroupId);
    shell?.refreshAvatars(getGroup(activeGroupId));
  }
}

async function toggleGroupScreenShare(syncShareBtn) {
  if (!localStream || !activeGroupId) return;
  if (sharingScreen) {
    await stopGroupScreenShare(syncShareBtn);
    return;
  }
  try {
    const sourceId = await openScreenPickerDialog();
    if (!sourceId) return;
    const stream = await captureDisplayStream(sourceId, configRef);
    const screenTrack = stream.getVideoTracks()[0];
    if (!screenTrack) throw new Error('No screen track');
    await applyScreenTrackConstraints(screenTrack, configRef);
    screenStream = stream;
    sharingScreen = true;
    syncShareBtn?.(true);
    await applyVideoToAllPeers(activeGroupId, screenTrack, true);
    screenTrack.onended = () => {
      void stopGroupScreenShare(syncShareBtn);
    };
    shell?.refreshAvatars(getGroup(activeGroupId));
    void broadcastCallState(activeGroupId);
  } catch (err) {
    console.error('[group-call] screen share:', err);
    showAppToast({
      title: t('call.share_failed'),
      variant: 'danger',
      durationMs: 5000,
    });
  }
}

async function processPendingOffers(groupId) {
  if (!apiRef) return;
  for (const [rid, pending] of [...pendingOffers.entries()]) {
    if (pending.groupId !== groupId) continue;
    pendingOffers.delete(rid);
    await handleGroupCallSignal(pending.msg, apiRef);
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
    const track = ev.track;
    if (track.kind === 'video') {
      let video = remoteVideos.get(rid);
      if (!video) {
        video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        remoteVideos.set(rid, video);
      }
      video.srcObject = ev.streams[0] || new MediaStream([track]);
      shell?.refreshAvatars(getGroup(groupId));
      return;
    }
    let audio = remoteAudios.get(rid);
    if (!audio) {
      audio = document.createElement('audio');
      audio.autoplay = true;
      audio.dataset.peer = String(rid);
      remoteAudios.set(rid, audio);
      document.body.appendChild(audio);
    }
    audio.srcObject = ev.streams[0] || new MediaStream([track]);
    audio.muted = deafened;
    shell?.refreshAvatars(getGroup(groupId));
    void broadcastCallState(groupId);
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') {
      sounds.stopOutgoingRing();
      void broadcastCallState(groupId);
    }
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

export function getActiveGroupCallId() {
  return activeGroupId;
}

export async function joinGroupCall(groupId, api, opts = {}) {
  const config = callConfig(api);
  if (!config?.blipId) {
    console.error('[group-call] missing config.blipId');
    return;
  }
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
  reportActiveToMain();
  pendingInvite = null;
  dismissedRing.delete(groupId);

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
  dismissIncomingUi(groupId);
  sounds.stopOutgoingRing();
  if (!opts.skipInvite) sounds.outgoingCall();
  else sounds.callConnected();

  const myId = peerNum(config.blipId);
  addVoiceParticipant(groupId, myId);
  const ongoing = getOngoingGroupCall(groupId);

  for (const pid of ongoing.participants) {
    if (peerNum(pid) === myId) continue;
    if (shouldInitiate(myId, pid)) void createPc(pid, groupId, true);
  }

  for (const m of group.members) {
    const mid = peerNum(m);
    if (mid === myId) continue;
    if (shouldInitiate(myId, mid)) void createPc(mid, groupId, true);
  }

  await processPendingOffers(groupId);
  await broadcastCallState(groupId);
  startHeartbeat(groupId);

  if (!opts.skipInvite) {
    for (const m of group.members) {
      const mid = peerNum(m);
      if (mid === myId) continue;
      try {
        await api.sendTcpMessage({
          type: 'group-call-start',
          to: mid,
          groupId,
          host: group.hostId,
          members: group.members,
        });
      } catch (err) {
        console.warn('[group-call] invite', mid, err?.message || err);
      }
    }
  }
}

export async function leaveGroupCall() {
  const gid = activeGroupId;
  const api = apiRef;
  const hadStream = !!localStream;
  const myId = myBlipId(api);

  stopHeartbeat();

  try {
    if (gid && api && hadStream && Number.isFinite(myId)) {
      const group = getGroup(gid);
      const participants = removeVoiceParticipant(gid, myId);
      if (group) {
        for (const m of group.members) {
          const mid = peerNum(m);
          if (mid === myId) continue;
          void api.sendTcpMessage({
            type: 'group-call-state',
            to: mid,
            groupId: gid,
            host: group.hostId,
            members: group.members,
            active: participants.length > 0,
            participants,
          });
        }
        if (participants.length === 0) {
          for (const m of group.members) {
            const mid = peerNum(m);
            if (mid === myId) continue;
            void api.sendTcpMessage({
              type: 'group-call-end',
              to: mid,
              groupId: gid,
              host: group.hostId,
              active: false,
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn('[group-call] leave:', err?.message || err);
  } finally {
  await stopGroupScreenShare();
  for (const pc of peers.values()) pc.close();
  peers.clear();
  pendingCandidates.clear();
  pendingOffers.clear();
  remoteAudios.forEach((a) => a.remove());
  remoteAudios.clear();
  remoteVideos.clear();
  localStream?.getTracks().forEach((tr) => tr.stop());
  localStream = null;
  sharingScreen = false;
  screenStream = null;
  activeGroupId = null;
  reportActiveToMain();
  pendingInvite = null;
  muted = false;
  deafened = false;
  peerMediaState.clear();
  closeGroupVideoFs(configRef);
  shell?.stopTimer();
  shell?.hide();
  if (hadStream) sounds.callEnd();
  window.blip?.closeGroupCallWindow?.();
  }
}

/** Boot group-call BrowserWindow (group-call-window.html). */
export function initGroupCallWindow(api) {
  apiRef = api;
  const config = callConfig(api);
  ensureShell(config);
  applyI18n(document);
}

export async function handleGroupCallSignal(msg, api) {
  const groupId = msg.groupId;
  const group = getGroup(groupId);
  if (!group) return;
  apiRef = api;
  const config = callConfig(api);
  ensureShell(config);

  const target = peerNum(msg.target);
  const origin = signalOrigin(msg);
  const myId = myBlipId(api);

  if (target !== myId && origin !== myId) return;

  const remoteId = origin === myId ? target : origin;
  if (!isGroupMember(group, remoteId) || !isGroupMember(group, myId)) return;

  if (msg.signalKind === 'offer') {
    const offer = normalizeSdp(msg.sdp);
    if (!offer) return;

    if (!localStream) {
      pendingOffers.set(remoteId, { msg, groupId });
      return;
    }

    dismissIncomingUi(groupId);
    let pc = peers.get(remoteId);
    if (!pc) pc = await createPc(remoteId, groupId, false);

    await pc.setRemoteDescription(offer);
    await flushCandidates(remoteId, pc);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await sendSignal(groupId, remoteId, {
      signalKind: 'answer',
      sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp },
    });
    shell.refreshAvatars(group);
    sounds.stopOutgoingRing();
    await meshNewParticipants(groupId, voiceParticipants(groupId));
    await broadcastCallState(groupId);
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

export async function handleGroupCallState(msg, api) {
  const group = getGroup(msg.groupId);
  const myId = myBlipId(api);
  if (!group || !isGroupMember(group, myId) || isInviteDeclined(msg.groupId)) return;

  const participants = (msg.participants || []).map(peerNum).filter(Number.isFinite);

  if (!msg.active) {
    applyGroupCallStateFromTcp(msg);
    if (activeGroupId === msg.groupId && !localStream) {
      shell?.hide();
      pendingInvite = null;
    }
    return;
  }

  applyGroupCallStateFromTcp(msg);

  if (msg.states && typeof msg.states === 'object') {
    for (const [id, st] of Object.entries(msg.states)) {
      const n = peerNum(id);
      if (!Number.isFinite(n)) continue;
      peerMediaState.set(n, {
        muted: !!st.muted,
        deafened: !!st.deafened,
        screenSharing: !!st.screenSharing,
      });
    }
  }

  if (activeGroupId === msg.groupId && localStream) {
    await meshNewParticipants(msg.groupId, participants);
    shell?.refreshAvatars(group);
    return;
  }

  if (shell && getGroup(msg.groupId)) {
    shell.refreshAvatars(getGroup(msg.groupId));
  }
}

export async function handleGroupCallStart(msg, api) {
  const group = getGroup(msg.groupId);
  const myId = myBlipId(api);
  if (!group || !isGroupMember(group, myId) || isInviteDeclined(msg.groupId)) return;

  noteGroupCallStarted(msg.groupId, wireFrom(msg));

  if (activeGroupId === msg.groupId && localStream) {
    dismissIncomingUi(msg.groupId);
    shell?.refreshAvatars(group);
    return;
  }

  if (dismissedRing.has(msg.groupId)) return;

  ensureShell(callConfig(api));
  shell.setTitle(groupDisplayName(group));
  shell.refreshAvatars(group);
  pendingInvite = { groupId: msg.groupId, api: { ...api, config: callConfig(api) } };
  shell.showIncoming();
  sounds.groupCallInvite();
}

export async function handleGroupCallEnd(msg) {
  const groupId = msg.groupId;

  if (msg.active === false) {
    clearGroupCallRoster(groupId);
    if (activeGroupId === groupId && !localStream) {
      shell?.hide();
      pendingInvite = null;
    }
    return;
  }

  if (activeGroupId !== groupId || !localStream) return;

  const remoteId = wireFrom(msg);
  const pc = peers.get(remoteId);
  if (pc) {
    pc.close();
    peers.delete(remoteId);
  }
  remoteAudios.get(remoteId)?.remove();
  remoteAudios.delete(remoteId);
  remoteVideos.delete(remoteId);
  shell?.refreshAvatars(getGroup(groupId));
  void broadcastCallState(groupId);
}
