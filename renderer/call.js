import { t, applyI18n } from './i18n.js';
import { sounds } from './audio.js';
import { createAvatarElement } from './avatar.js';
import {
  getCameraVideoConstraints,
  applyScreenTrackConstraints,
  tuneVideoSender,
  trackLooksLikeScreen,
  applyCallFullscreenLayout,
} from './call-media.js';
import { openScreenPickerDialog } from './screen-picker-dialog.js';
import { captureDisplayStream } from './display-capture.js';

const ICE_SERVERS = [];

let activeCall = null;
let pendingCandidates = [];
let pendingOffer = null;

/** Plain SessionDescription for IPC / TCP (RTCSessionDescription may not JSON.stringify). */
export function toSdpWire(desc) {
  if (!desc) return null;
  if (typeof desc.type === 'string' && typeof desc.sdp === 'string' && desc.sdp.length > 0) {
    return { type: desc.type, sdp: desc.sdp };
  }
  return null;
}

function normalizeSdp(sdp) {
  if (!sdp) return null;
  if (typeof sdp === 'string') return { type: 'offer', sdp };
  let type = sdp.type;
  let body = sdp.sdp;
  if (body && typeof body === 'object' && typeof body.sdp === 'string') {
    type = body.type ?? type;
    body = body.sdp;
  }
  if (typeof type === 'string' && typeof body === 'string' && body.length > 0) {
    return { type, sdp: body };
  }
  return null;
}

function normalizeCandidate(candidate) {
  if (!candidate) return null;
  if (candidate.candidate !== undefined) return candidate;
  return null;
}

function createPeerConnection(onRemoteStream) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  pc.ontrack = (e) => {
    if (e.streams[0]) onRemoteStream(e.streams[0]);
  };

  pc.onicecandidate = (e) => {
    if (e.candidate && activeCall?.onCandidate) {
      const json = e.candidate.toJSON ? e.candidate.toJSON() : e.candidate;
      activeCall.onCandidate(json);
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') {
      console.error('[call] connection failed');
    }
  };

  return pc;
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const pad = (n) => String(n).padStart(2, '0');
  if (h > 0) return `${pad(h)}:${pad(m % 60)}:${pad(s % 60)}`;
  return `${pad(m)}:${pad(s % 60)}`;
}

export function createCallUI(config, api, options = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'call-overlay hidden';

  const inner = document.createElement('div');
  inner.className = 'call-inner glass';

  const statusEl = document.createElement('div');
  statusEl.className = 'call-status';

  const videoWrap = document.createElement('div');
  videoWrap.className = 'call-video-wrap hidden';
  const localVideo = document.createElement('video');
  localVideo.className = 'call-video local';
  localVideo.autoplay = true;
  localVideo.muted = true;
  localVideo.playsInline = true;
  const remoteVideo = document.createElement('video');
  remoteVideo.className = 'call-video remote';
  remoteVideo.autoplay = true;
  remoteVideo.playsInline = true;
  const gridOverlay = document.createElement('div');
  gridOverlay.className = 'video-pixel-grid';
  videoWrap.appendChild(remoteVideo);
  videoWrap.appendChild(localVideo);
  videoWrap.appendChild(gridOverlay);

  const fsBtn = document.createElement('button');
  fsBtn.type = 'button';
  fsBtn.className = 'call-video-fs-btn btn btn-accent hidden';
  fsBtn.dataset.i18n = 'call.fullscreen';
  fsBtn.textContent = t('call.fullscreen');
  fsBtn.title = t('call.fullscreen');
  videoWrap.appendChild(fsBtn);

  const voiceWrap = document.createElement('div');
  voiceWrap.className = 'call-voice-wrap hidden';
  const avatarSlot = document.createElement('div');
  avatarSlot.className = 'call-avatar-slot';

  function mountCallAvatar(id) {
    avatarSlot.innerHTML = '';
    avatarSlot.appendChild(createAvatarElement(id, 6, { selfBlipId: config?.blipId ?? null }));
  }
  const waveform = document.createElement('div');
  waveform.className = 'call-waveform';
  for (let i = 0; i < 8; i++) {
    const bar = document.createElement('div');
    bar.className = 'wave-bar';
    waveform.appendChild(bar);
  }
  voiceWrap.appendChild(avatarSlot);
  voiceWrap.appendChild(waveform);

  const peerStatus = document.createElement('div');
  peerStatus.className = 'call-peer-status hidden';
  const remoteMicBadge = document.createElement('span');
  remoteMicBadge.className = 'call-peer-badge call-peer-badge--mic hidden';
  remoteMicBadge.dataset.i18n = 'call.remote_muted';
  remoteMicBadge.textContent = t('call.remote_muted');
  const remoteDeafBadge = document.createElement('span');
  remoteDeafBadge.className = 'call-peer-badge call-peer-badge--deaf hidden';
  remoteDeafBadge.dataset.i18n = 'call.remote_deaf';
  remoteDeafBadge.textContent = t('call.remote_deaf');
  peerStatus.appendChild(remoteMicBadge);
  peerStatus.appendChild(remoteDeafBadge);

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

  const endBtn = document.createElement('button');
  endBtn.type = 'button';
  endBtn.className = 'btn btn-danger';
  endBtn.dataset.i18n = 'call.end';
  endBtn.textContent = t('call.end');

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

  controls.appendChild(muteBtn);
  controls.appendChild(deafenBtn);
  controls.appendChild(shareBtn);
  controls.appendChild(acceptBtn);
  controls.appendChild(rejectBtn);
  controls.appendChild(endBtn);

  inner.appendChild(statusEl);
  inner.appendChild(videoWrap);
  inner.appendChild(voiceWrap);
  inner.appendChild(peerStatus);
  inner.appendChild(timerEl);
  inner.appendChild(controls);
  overlay.appendChild(inner);

  let localStream = null;
  let pc = null;
  let peerId = null;
  let withVideo = false;
  let muted = false;
  let deafened = false;
  let sharingScreen = false;
  let screenStream = null;
  let savedCameraTrack = null;
  let remoteMuted = false;
  let remoteDeafened = false;
  let renegotiateAnswerResolve = null;
  let timerInterval = null;
  let callStart = null;
  let pulseTimer = null;
  let incomingOffer = null;
  let stageActive = false;
  let remotePeerScreenSharing = false;
  let pseudoFullscreen = false;

  /** @type {'off'|'local'|'remote'|'both'} */
  let stageMode = 'off';

  function setStageView(mode) {
    stageMode = mode;
    const active = mode !== 'off';
    stageActive = active;
    overlay.classList.toggle('call-overlay--theater', active);
    inner.classList.toggle('call-inner--stage', active);
    videoWrap.classList.toggle('call-video-wrap--stage', active);
    videoWrap.classList.toggle('call-video-wrap--camera', !active);
    videoWrap.classList.toggle('call-video-wrap--local-primary', mode === 'local');
    videoWrap.classList.toggle('call-video-wrap--remote-primary', mode === 'remote' || mode === 'both');
    gridOverlay.classList.add('hidden');
    fsBtn.classList.toggle('hidden', !active);

    remoteVideo.classList.toggle('hidden', mode === 'local');
    localVideo.classList.toggle('hidden', mode === 'remote');

    remoteVideo.classList.toggle('call-video--stage', mode === 'remote' || mode === 'both');
    remoteVideo.classList.toggle('call-video--camera', mode === 'off');
    localVideo.classList.toggle('call-video--stage', mode === 'local' || mode === 'both');
    localVideo.classList.toggle('call-video--camera', mode === 'off');

    if (mode === 'both') {
      localVideo.classList.remove('hidden');
    }
  }

  function refreshStageLayout() {
    const remoteTrack = remoteVideo.srcObject?.getVideoTracks?.()?.[0];
    const remoteScreen =
      remotePeerScreenSharing || (remoteTrack && trackLooksLikeScreen(remoteTrack));
    const anyScreen = sharingScreen || remoteScreen;

    if (!anyScreen) {
      const hadVideo = withVideo || remoteTrack;
      setStageView('off');
      if (hadVideo) {
        remoteVideo.classList.add('call-video--camera');
        localVideo.classList.add('call-video--camera');
      }
      return;
    }

    if (sharingScreen && remoteScreen) {
      setStageView('both');
    } else if (sharingScreen) {
      setStageView('local');
    } else {
      setStageView('remote');
    }
  }

  function getFullscreenTarget() {
    if (sharingScreen) return localVideo;
    if (stageActive && remoteVideo.srcObject) return remoteVideo;
    return remoteVideo.srcObject ? remoteVideo : localVideo;
  }

  function activeStageVideo() {
    if (sharingScreen) return localVideo;
    if (stageMode === 'remote' || stageMode === 'both') return remoteVideo;
    return remoteVideo.srcObject ? remoteVideo : localVideo;
  }

  async function exitPseudoFullscreen() {
    if (window.blip?.callWindowIsFullScreen) {
      try {
        if (await window.blip.callWindowIsFullScreen()) {
          await window.blip.callWindowToggleFullScreen();
        }
      } catch {
        /* ignore */
      }
    }
    if (!pseudoFullscreen && !document.fullscreenElement) return;
    pseudoFullscreen = false;
    document.getElementById('call-shell')?.classList.remove('call-shell--video-fs');
    videoWrap.classList.remove('call-video-wrap--fullscreen');
    overlay.classList.remove('call-overlay--theater-fs');
    applyCallFullscreenLayout(videoWrap, null, config, false);
    syncFullscreenButton();
  }

  async function toggleVideoFullscreen() {
    if (fsBtn.classList.contains('hidden')) return;
    if (window.blip?.callWindowToggleFullScreen) {
      try {
        pseudoFullscreen = !!(await window.blip.callWindowToggleFullScreen());
        const shell = document.getElementById('call-shell');
        shell?.classList.toggle('call-shell--video-fs', pseudoFullscreen);
        videoWrap.classList.toggle('call-video-wrap--fullscreen', pseudoFullscreen);
        overlay.classList.toggle('call-overlay--theater-fs', pseudoFullscreen);
        if (pseudoFullscreen) {
          applyCallFullscreenLayout(videoWrap, activeStageVideo(), config, true);
        } else {
          applyCallFullscreenLayout(videoWrap, null, config, false);
        }
        syncFullscreenButton();
        return;
      } catch (err) {
        console.warn('[call] window fullscreen:', err.message);
      }
    }
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      if (pseudoFullscreen) {
        exitPseudoFullscreen();
        return;
      }
      const host = videoWrap;
      if (host.requestFullscreen) {
        await host.requestFullscreen();
        applyCallFullscreenLayout(videoWrap, activeStageVideo(), config, true);
        return;
      }
      if (host.webkitRequestFullscreen) {
        host.webkitRequestFullscreen();
        return;
      }
    } catch (err) {
      console.warn('[call] native fullscreen:', err.message);
    }
    pseudoFullscreen = !pseudoFullscreen;
    const shell = document.getElementById('call-shell');
    shell?.classList.toggle('call-shell--video-fs', pseudoFullscreen);
    videoWrap.classList.toggle('call-video-wrap--fullscreen', pseudoFullscreen);
    overlay.classList.toggle('call-overlay--theater-fs', pseudoFullscreen);
    applyCallFullscreenLayout(videoWrap, pseudoFullscreen ? activeStageVideo() : null, config, pseudoFullscreen);
    syncFullscreenButton();
  }

  function syncFullscreenButton() {
    const on = !!document.fullscreenElement || pseudoFullscreen;
    fsBtn.dataset.i18n = on ? 'call.exit_fullscreen' : 'call.fullscreen';
    fsBtn.textContent = t(on ? 'call.exit_fullscreen' : 'call.fullscreen');
    fsBtn.title = fsBtn.textContent;
  }

  document.addEventListener('fullscreenchange', () => {
    const on = !!document.fullscreenElement;
    applyCallFullscreenLayout(videoWrap, on ? activeStageVideo() : null, config, on);
    if (!on) exitPseudoFullscreen();
    syncFullscreenButton();
  });

  function show() {
    overlay.classList.remove('hidden');
  }

  function setConnectedStatus() {
    statusEl.dataset.i18n = 'call.connected';
    statusEl.textContent = t('call.connected');
  }

  function hide() {
    overlay.classList.add('hidden');
    cleanup();
    options.onClosed?.();
  }

  function cleanup() {
    sounds.stopIncomingRing();
    sounds.stopOutgoingRing();
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    }
    exitPseudoFullscreen();
    setStageView('off');
    remotePeerScreenSharing = false;
    clearInterval(timerInterval);
    clearInterval(pulseTimer);
    pulseTimer = null;
    timerInterval = null;
    pendingCandidates = [];
    pendingOffer = null;
    incomingOffer = null;
    if (screenStream) {
      screenStream.getTracks().forEach((tr) => tr.stop());
      screenStream = null;
    }
    sharingScreen = false;
    savedCameraTrack = null;
    renegotiateAnswerResolve = null;
    if (localStream) {
      localStream.getTracks().forEach((tr) => tr.stop());
      localStream = null;
    }
    if (pc) {
      pc.close();
      pc = null;
    }
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    activeCall = null;
    inner.style.borderColor = '';
    acceptBtn.classList.add('hidden');
    rejectBtn.classList.add('hidden');
    endBtn.classList.remove('hidden');
    muteBtn.classList.remove('hidden');
    deafenBtn.classList.remove('hidden');
    shareBtn.classList.add('hidden');
    sharingScreen = false;
    screenStream = null;
    savedCameraTrack = null;
    remoteMuted = false;
    remoteDeafened = false;
    renegotiateAnswerResolve = null;
    setShareButton(false);
    peerStatus.classList.add('hidden');
    remoteMicBadge.classList.add('hidden');
    remoteDeafBadge.classList.add('hidden');
  }

  function updateRemoteBadges() {
    const active = !!pc && !incomingOffer;
    peerStatus.classList.toggle('hidden', !active);
    remoteMicBadge.classList.toggle('hidden', !remoteMuted);
    remoteDeafBadge.classList.toggle('hidden', !remoteDeafened);
  }

  function applyRemoteState(state) {
    remoteMuted = !!state?.muted;
    remoteDeafened = !!state?.deafened;
    if (typeof state?.screenSharing === 'boolean') {
      remotePeerScreenSharing = state.screenSharing;
      refreshStageLayout();
    }
    updateRemoteBadges();
  }

  function broadcastCallState() {
    if (!peerId || !pc || !api.callState) return;
    api
      .callState({
        to: peerId,
        muted,
        deafened,
        screenSharing: sharingScreen,
      })
      .catch(() => {});
  }

  function setShareButton(active) {
    shareBtn.classList.toggle('active', active);
    shareBtn.dataset.i18n = active ? 'call.share_stop' : 'call.share';
    shareBtn.textContent = t(active ? 'call.share_stop' : 'call.share');
  }

  function showInCallControls() {
    shareBtn.classList.remove('hidden');
    updateRemoteBadges();
    broadcastCallState();
  }

  async function waitRenegotiateAnswer() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        renegotiateAnswerResolve = null;
        reject(new Error('Renegotiation timeout'));
      }, 15000);
      renegotiateAnswerResolve = () => {
        clearTimeout(timer);
        renegotiateAnswerResolve = null;
        resolve();
      };
    });
  }

  async function renegotiateAsOffer() {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const offerWire = toSdpWire(pc.localDescription);
    if (!offerWire) throw new Error('Invalid local SDP');
    const wait = waitRenegotiateAnswer();
    const result = await api.callRenegotiate({ to: peerId, sdp: offerWire });
    if (!result?.ok) throw new Error(result?.error || 'Renegotiation failed');
    await wait;
  }

  function getVideoSender() {
    return pc?.getSenders().find((s) => s.track?.kind === 'video') ?? null;
  }

  async function applyOutgoingVideoTrack(track, { screenShare = false } = {}) {
    const sender = getVideoSender();
    if (sender) {
      await sender.replaceTrack(track);
      await tuneVideoSender(sender, { screenShare, config });
      return;
    }
    if (!track) return;
    const stream = new MediaStream([track]);
    pc.addTrack(track, stream);
    await renegotiateAsOffer();
    await tuneVideoSender(getVideoSender(), { screenShare, config });
  }

  async function removeOutgoingVideo() {
    const sender = getVideoSender();
    if (!sender) return;
    if (typeof pc.removeTrack === 'function') {
      pc.removeTrack(sender);
    } else {
      await sender.replaceTrack(null);
    }
    await renegotiateAsOffer();
  }

  async function stopScreenShare() {
    if (!sharingScreen) return;
    sharingScreen = false;
    setShareButton(false);

    if (screenStream) {
      screenStream.getTracks().forEach((tr) => tr.stop());
      screenStream = null;
    }

    const restore = savedCameraTrack;
    savedCameraTrack = null;

    try {
      if (withVideo && restore) {
        await applyOutgoingVideoTrack(restore, { screenShare: false });
        localVideo.srcObject = new MediaStream([restore]);
        refreshStageLayout();
        localVideo.classList.remove('hidden');
      } else if (!withVideo) {
        await removeOutgoingVideo();
        videoWrap.classList.add('hidden');
        voiceWrap.classList.remove('hidden');
        localVideo.srcObject = null;
        refreshStageLayout();
      } else {
        localVideo.srcObject = null;
        refreshStageLayout();
      }
    } catch (err) {
      console.warn('[call] stop share:', err.message);
    }

    broadcastCallState();
  }

  async function toggleScreenShare() {
    if (shareBtn.classList.contains('hidden') || !pc) return;
    if (sharingScreen) {
      await stopScreenShare();
      return;
    }

    try {
      const sourceId = await openScreenPickerDialog();
      if (!sourceId) return;

      const stream = await captureDisplayStream(sourceId, config);
      const screenTrack = stream.getVideoTracks()[0];
      if (!screenTrack) throw new Error('No screen track');

      await applyScreenTrackConstraints(screenTrack, config);

      screenStream = stream;
      sharingScreen = true;
      setShareButton(true);

      videoWrap.classList.remove('hidden');
      voiceWrap.classList.add('hidden');
      localVideo.srcObject = stream;

      const sender = getVideoSender();
      if (sender?.track?.kind === 'video' && !savedCameraTrack) {
        savedCameraTrack = sender.track;
      }

      if (!withVideo) {
        videoWrap.classList.remove('hidden');
        voiceWrap.classList.add('hidden');
      }

      await applyOutgoingVideoTrack(screenTrack, { screenShare: true });
      refreshStageLayout();

      screenTrack.onended = () => {
        void stopScreenShare();
      };
      screenTrack.onresize = () => refreshStageLayout();

      broadcastCallState();
    } catch (err) {
      if (err?.name !== 'NotAllowedError') {
        console.error('[call] screen share:', err);
      }
      sharingScreen = false;
      setShareButton(false);
      if (window.__blipShowToast) {
        window.__blipShowToast({
          title: t('call.share_failed'),
          variant: 'danger',
          durationMs: 5000,
        });
      }
    }
  }

  function isForCurrentPeer(data) {
    if (!peerId || !data?.from) return true;
    return Number(data.from) === Number(peerId);
  }

  async function resolveAudioDeviceId(kind) {
    const key = kind === 'output' ? 'audioOutputDeviceId' : 'audioInputDeviceId';
    try {
      const fresh = await api.getConfig?.();
      if (fresh?.[key]) return fresh[key];
    } catch {
      /* ignore */
    }
    return config?.[key] || '';
  }

  async function applyRemoteAudioSink() {
    const deviceId = await resolveAudioDeviceId('output');
    if (!deviceId || !remoteVideo.setSinkId) return;
    try {
      await remoteVideo.setSinkId(deviceId);
    } catch (err) {
      console.warn('[call] setSinkId:', err.message);
    }
  }

  function attachRemoteStream(stream) {
    remoteVideo.srcObject = stream;
    void applyRemoteAudioSink();
    setConnectedStatus();
    startTimer();
    showInCallControls();
    const vTrack = stream.getVideoTracks()[0];
    if (vTrack) {
      videoWrap.classList.remove('hidden');
      voiceWrap.classList.add('hidden');
      if (!trackLooksLikeScreen(vTrack)) {
        remotePeerScreenSharing = false;
      }
      refreshStageLayout();
      if (stageMode === 'off') {
        remoteVideo.classList.add('call-video--camera');
        localVideo.classList.add('call-video--camera');
      }
    }
  }

  async function getMedia(video) {
    const deviceId = await resolveAudioDeviceId('input');
    const audio =
      deviceId && deviceId !== 'default'
        ? { deviceId: { exact: deviceId } }
        : true;
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio,
        video: video ? getCameraVideoConstraints(config) : false,
      });
    } catch (err) {
      if (!deviceId) throw err;
      console.warn('[call] mic device failed, using default:', err.message);
      return navigator.mediaDevices.getUserMedia({
        audio: true,
        video: video ? getCameraVideoConstraints(config) : false,
      });
    }
  }

  function startTimer() {
    if (timerInterval) return;
    callStart = Date.now();
    timerInterval = setInterval(() => {
      timerEl.textContent = formatDuration(Date.now() - callStart);
    }, 1000);
  }

  function startIncomingPulse() {
    clearInterval(pulseTimer);
    pulseTimer = setInterval(() => {
      inner.style.borderColor = inner.style.borderColor === '#00ffc8' ? '#ff3366' : '#00ffc8';
    }, 200);
  }

  async function flushPendingCandidates() {
    if (!pc?.remoteDescription) return;
    for (const c of pendingCandidates) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      } catch (err) {
        console.warn('[call] ICE candidate:', err.message);
      }
    }
    pendingCandidates = [];
  }

  async function setRemoteDescription(sdp) {
    const desc = normalizeSdp(sdp);
    if (!desc?.type || !desc?.sdp) throw new Error('Invalid SDP');
    await pc.setRemoteDescription(desc);
    await flushPendingCandidates();
  }

  async function addIceCandidate(candidate) {
    const init = normalizeCandidate(candidate);
    if (!init?.candidate) return;
    if (!pc) {
      pendingCandidates.push(init);
      return;
    }
    if (!pc.remoteDescription) {
      pendingCandidates.push(init);
      return;
    }
    try {
      await pc.addIceCandidate(new RTCIceCandidate(init));
    } catch (err) {
      console.warn('[call] addIceCandidate:', err.message);
    }
  }

  function bindActiveCall(id) {
    activeCall = {
      peerId: id,
      pc,
      onCandidate: (candidate) => {
        api.callCandidate({ to: id, candidate });
      },
    };
  }

  async function startOutgoing(targetId, video) {
    peerId = targetId;
    withVideo = video;
    show();
    statusEl.dataset.i18n = 'call.outgoing';
    statusEl.textContent = t('call.outgoing');
    videoWrap.classList.toggle('hidden', !video);
    voiceWrap.classList.toggle('hidden', !video);
    mountCallAvatar(targetId);
    sounds.outgoingCall();

    try {
      localStream = await getMedia(video);
      if (video) {
        localVideo.srcObject = localStream;
        videoWrap.classList.add('call-video-wrap--camera');
        remoteVideo.classList.add('call-video--camera');
        localVideo.classList.add('call-video--camera');
      }

      pc = createPeerConnection((stream) => {
        attachRemoteStream(stream);
      });

      localStream.getTracks().forEach((tr) => pc.addTrack(tr, localStream));
      const camSender = getVideoSender();
      if (camSender) void tuneVideoSender(camSender, { screenShare: false, config });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      bindActiveCall(targetId);

      const offerWire = toSdpWire(pc.localDescription);
      if (!offerWire) throw new Error('Invalid local SDP');

      const result = await api.initiateCall({
        to: targetId,
        sdp: offerWire,
        video,
      });
      if (!result?.ok) throw new Error(result?.error || 'Call failed');
    } catch (err) {
      console.error('[call] outgoing:', err);
      hide();
    }
    
    // Очищаем входящий оффер при исходящем звонке
    incomingOffer = null;
  }

  function rollbackAcceptAttempt() {
    if (localStream) {
      localStream.getTracks().forEach((tr) => tr.stop());
      localStream = null;
    }
    if (pc) {
      pc.close();
      pc = null;
    }
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    activeCall = null;
  }

  async function acceptIncoming() {
    clearInterval(pulseTimer);
    inner.style.borderColor = '';

    const offer = normalizeSdp(incomingOffer);
    if (!offer) {
      console.error('[BLIP call] accept: missing or invalid offer SDP', incomingOffer);
      statusEl.textContent = t('call.signal_lost');
      statusEl.dataset.i18n = 'call.signal_lost';
      return;
    }

    acceptBtn.classList.add('hidden');
    rejectBtn.classList.add('hidden');
    endBtn.classList.remove('hidden');
    muteBtn.classList.remove('hidden');
    deafenBtn.classList.remove('hidden');

    try {
      localStream = await getMedia(withVideo);
      if (withVideo) {
        localVideo.srcObject = localStream;
        videoWrap.classList.add('call-video-wrap--camera');
        remoteVideo.classList.add('call-video--camera');
        localVideo.classList.add('call-video--camera');
      }

      pc = createPeerConnection((stream) => {
        attachRemoteStream(stream);
      });

      localStream.getTracks().forEach((tr) => pc.addTrack(tr, localStream));
      const camSender = getVideoSender();
      if (camSender) void tuneVideoSender(camSender, { screenShare: false, config });

      await setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      const answerWire = toSdpWire(pc.localDescription);
      if (!answerWire) throw new Error('Invalid local SDP');

      bindActiveCall(peerId);

      const result = await api.callAccept({ to: peerId, sdp: answerWire });
      if (!result?.ok) throw new Error(result?.error || 'Accept failed');

      incomingOffer = null;
      sounds.callConnected();
      statusEl.dataset.i18n = 'call.connected';
      showInCallControls();
    } catch (err) {
      console.error('[BLIP call] accept:', err);
      rollbackAcceptAttempt();
      incomingOffer = offer;
      statusEl.textContent = err?.message || t('call.signal_lost');
      statusEl.dataset.i18n = '';
      acceptBtn.classList.remove('hidden');
      rejectBtn.classList.remove('hidden');
      endBtn.classList.add('hidden');
      muteBtn.classList.add('hidden');
      deafenBtn.classList.add('hidden');
    }
  }

  async function handleIncoming(data) {
    const from = Number(data.from);
    if (!from) return;

    // Если уже есть активный звонок, игнорируем новый входящий
    if (pc || (incomingOffer && activeCall?.pending)) {
      return;
    }

    peerId = from;
    withVideo = data.video ?? false;
    const offer = normalizeSdp(data.sdp);
    if (!offer) {
      console.error('[BLIP call] incoming: invalid offer SDP', data.sdp);
      return;
    }
    incomingOffer = offer;
    pendingCandidates = [];

    show();
    sounds.incomingCall();
    statusEl.dataset.i18n = 'call.incoming';
    statusEl.textContent = t('call.incoming');
    startIncomingPulse();
    acceptBtn.classList.remove('hidden');
    rejectBtn.classList.remove('hidden');
    endBtn.classList.add('hidden');
    muteBtn.classList.add('hidden');
    deafenBtn.classList.add('hidden');
    shareBtn.classList.add('hidden');
    videoWrap.classList.toggle('hidden', !withVideo);
    voiceWrap.classList.toggle('hidden', withVideo);
    mountCallAvatar(peerId);

    activeCall = { peerId, pending: true };
  }

  acceptBtn.addEventListener('click', () => acceptIncoming());

  rejectBtn.addEventListener('click', async () => {
    if (peerId) await api.callReject({ to: peerId });
    sounds.callEnd();
    hide();
  });

  async function handleAnswer(data) {
    if (!pc) {
      console.warn('[BLIP call] handleAnswer: no peer connection', data);
      return;
    }
    const aid = Number(data?.from);
    if (aid && peerId && aid !== Number(peerId)) {
      console.warn('[BLIP call] answer ignored (wrong peer)', { aid, peerId, data });
      return;
    }
    const answer = normalizeSdp(data.sdp);
    if (!answer) {
      console.error('[BLIP call] answer: invalid SDP', data.sdp);
      return;
    }
    try {
      await setRemoteDescription(answer);
      sounds.callConnected();
      setConnectedStatus();
      startTimer();
      showInCallControls();
    } catch (err) {
      console.error('[BLIP call] answer', err);
    }
  }

  async function handleCallState(data) {
    if (!isForCurrentPeer(data)) return;
    applyRemoteState(data);
  }

  async function handleRenegotiateOffer(data) {
    if (!pc || !isForCurrentPeer(data)) return;
    const offer = normalizeSdp(data.sdp);
    if (!offer) return;
    try {
      await setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      const answerWire = toSdpWire(pc.localDescription);
      if (!answerWire) throw new Error('Invalid local SDP');
      await api.callRenegotiateAnswer({ to: peerId, sdp: answerWire });
      showInCallControls();
    } catch (err) {
      console.error('[BLIP call] renegotiate offer:', err);
    }
  }

  async function handleRenegotiateAnswer(data) {
    if (!pc || !isForCurrentPeer(data)) return;
    const answer = normalizeSdp(data.sdp);
    if (!answer) return;
    try {
      await setRemoteDescription(answer);
      renegotiateAnswerResolve?.();
    } catch (err) {
      console.error('[BLIP call] renegotiate answer:', err);
      renegotiateAnswerResolve = null;
    }
  }

  async function handleCandidate(data) {
    if (!isForCurrentPeer(data)) return;
    await addIceCandidate(data.candidate);
  }

  function handleRejected(data) {
    if (!isForCurrentPeer(data)) return;
    sounds.callEnd();
    hide();
  }

  function handleEnded(data) {
    if (!isForCurrentPeer(data)) return;
    sounds.callEnd();
    hide();
  }

  function toggleMute() {
    if (muteBtn.classList.contains('hidden')) return;
    muted = !muted;
    localStream?.getAudioTracks().forEach((tr) => {
      tr.enabled = !muted;
    });
    muteBtn.classList.toggle('active', muted);
    broadcastCallState();
  }

  function toggleDeafen() {
    if (deafenBtn.classList.contains('hidden')) return;
    deafened = !deafened;
    remoteVideo.muted = deafened;
    deafenBtn.classList.toggle('active', deafened);
    broadcastCallState();
  }

  function isIncomingRinging() {
    return !!incomingOffer && !pc;
  }

  muteBtn.addEventListener('click', () => toggleMute());
  deafenBtn.addEventListener('click', () => toggleDeafen());
  shareBtn.addEventListener('click', () => {
    void toggleScreenShare();
  });
  fsBtn.addEventListener('click', () => {
    void toggleVideoFullscreen();
  });

  async function hangupCall() {
    if (peerId) await api.callHangup({ to: peerId });
    sounds.callEnd();
    hide();
  }

  endBtn.addEventListener('click', () => hangupCall());

  return {
    el: overlay,
    startOutgoing,
    handleIncoming,
    handleAnswer,
    handleCandidate,
    handleRejected,
    handleEnded,
    handleCallState,
    handleRenegotiateOffer,
    handleRenegotiateAnswer,
    hangupCall,
    acceptIncoming,
    toggleMute,
    toggleDeafen,
    toggleScreenShare,
    toggleVideoFullscreen,
    isVideoFullscreen: () => !!document.fullscreenElement || pseudoFullscreen,
    isIncomingRinging,
    hide,
    end: hide,
    refreshI18n() {
      applyI18n(overlay);
      updateRemoteBadges();
    },
    isActive: () => !!pc || !!(incomingOffer && activeCall?.pending),
    getPeerId: () => peerId,
  };
}

export function showSignalLost(container) {
  const el = document.createElement('div');
  el.className = 'signal-lost glass';
  el.innerHTML = `
    <div class="skull-icon" aria-hidden="true"></div>
    <h2 data-i18n="call.signal_lost">${t('call.signal_lost')}</h2>
    <p data-i18n="call.signal_lost_hint">${t('call.signal_lost_hint')}</p>
  `;
  container.innerHTML = '';
  container.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}
