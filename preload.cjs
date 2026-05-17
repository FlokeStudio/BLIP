const { contextBridge, ipcRenderer } = require('electron');

let groupCallActive = false;
let groupCallGroupId = null;

contextBridge.exposeInMainWorld('blip', {
  platform: process.platform,
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  getAppMetadata: () => ipcRenderer.invoke('get-app-metadata'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  listDisplaySources: () => ipcRenderer.invoke('list-display-sources'),
  prepareDisplayCapture: (sourceId) => ipcRenderer.invoke('prepare-display-capture', sourceId),
  getPeers: () => ipcRenderer.invoke('get-peers'),
  getNetworkDiagnostics: () => ipcRenderer.invoke('get-network-diagnostics'),
  getGithubReleases: (limit) => ipcRenderer.invoke('get-github-releases', limit),
  sendTcpMessage: (payload) => ipcRenderer.invoke('send-tcp-message', payload),
  initiateCall: (payload) => ipcRenderer.invoke('initiate-call', payload),
  callAccept: (payload) => ipcRenderer.invoke('call-accept', payload),
  callReject: (payload) => ipcRenderer.invoke('call-reject', payload),
  callCandidate: (payload) => ipcRenderer.invoke('call-candidate', payload),
  callHangup: (payload) => ipcRenderer.invoke('call-hangup', payload),
  callState: (payload) => ipcRenderer.invoke('call-state', payload),
  callRenegotiate: (payload) => ipcRenderer.invoke('call-renegotiate', payload),
  callRenegotiateAnswer: (payload) => ipcRenderer.invoke('call-renegotiate-answer', payload),
  pingPeer: (blipId) => ipcRenderer.invoke('ping-peer', blipId),
  checkIdConflict: (blipId) => ipcRenderer.invoke('check-id-conflict', blipId),
  openCallOutgoing: (payload) => ipcRenderer.invoke('open-call-outgoing', payload),
  closeCallWindow: () => ipcRenderer.invoke('close-call-window'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
  showMessageNotification: (payload) => ipcRenderer.invoke('show-message-notification', payload),
  onUpdateStatus: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('update-status', handler);
    return () => ipcRenderer.removeListener('update-status', handler);
  },
  onPeersUpdated: (cb) => {
    const handler = (_, peers) => cb(peers);
    ipcRenderer.on('peers-updated', handler);
    return () => ipcRenderer.removeListener('peers-updated', handler);
  },
  onTcpMessage: (cb) => {
    const handler = (_, msg) => cb(msg);
    ipcRenderer.on('tcp-message', handler);
    return () => ipcRenderer.removeListener('tcp-message', handler);
  },
  onNotificationOpenChat: (cb) => {
    const handler = (_, peerId) => cb(peerId);
    ipcRenderer.on('notification-open-chat', handler);
    return () => ipcRenderer.removeListener('notification-open-chat', handler);
  },
  onIncomingCall: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('incoming-call', handler);
    return () => ipcRenderer.removeListener('incoming-call', handler);
  },
  onCallOutgoing: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('call-outgoing', handler);
    return () => ipcRenderer.removeListener('call-outgoing', handler);
  },
  onCallAnswer: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('call-answer', handler);
    return () => ipcRenderer.removeListener('call-answer', handler);
  },
  onCallCandidate: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('call-candidate', handler);
    return () => ipcRenderer.removeListener('call-candidate', handler);
  },
  onCallRejected: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('call-rejected', handler);
    return () => ipcRenderer.removeListener('call-rejected', handler);
  },
  onCallEnded: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('call-ended', handler);
    return () => ipcRenderer.removeListener('call-ended', handler);
  },
  onCallState: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('call-state', handler);
    return () => ipcRenderer.removeListener('call-state', handler);
  },
  onCallRenegotiate: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('call-renegotiate', handler);
    return () => ipcRenderer.removeListener('call-renegotiate', handler);
  },
  onCallRenegotiateAnswer: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('call-renegotiate-answer', handler);
    return () => ipcRenderer.removeListener('call-renegotiate-answer', handler);
  },
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  callWindowMinimize: () => ipcRenderer.send('call-window-minimize'),
  callWindowMaximize: () => ipcRenderer.send('call-window-maximize'),
  callWindowClose: () => ipcRenderer.send('call-window-close'),
  callWindowToggleFullScreen: () => ipcRenderer.invoke('call-window-toggle-fullscreen'),
  callWindowIsFullScreen: () => ipcRenderer.invoke('call-window-is-fullscreen'),
  onConfigUpdated: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('config-updated', handler);
    return () => ipcRenderer.removeListener('config-updated', handler);
  },
  onGlobalNavigate: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('global-navigate', handler);
    return () => ipcRenderer.removeListener('global-navigate', handler);
  },
  onGlobalToggleDnd: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('global-toggle-dnd', handler);
    return () => ipcRenderer.removeListener('global-toggle-dnd', handler);
  },
  onGlobalHangup: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('global-hangup', handler);
    return () => ipcRenderer.removeListener('global-hangup', handler);
  },
  openGroupCall: (payload) => ipcRenderer.invoke('open-group-call', payload),
  openGroupCallIncoming: (payload) => ipcRenderer.invoke('open-group-call-incoming', payload),
  leaveGroupCall: () => ipcRenderer.invoke('leave-group-call'),
  closeGroupCallWindow: () => ipcRenderer.invoke('close-group-call-window'),
  reportGroupCallActive: (data) => ipcRenderer.send('group-call-active', data),
  isGroupCallActiveSync: () => groupCallActive,
  getActiveGroupCallIdSync: () => groupCallGroupId,
  onGroupCallActive: (cb) => {
    const handler = (_, data) => {
      groupCallActive = !!data?.active;
      groupCallGroupId = data?.groupId ?? null;
      cb(data);
    };
    ipcRenderer.on('group-call-active', handler);
    return () => ipcRenderer.removeListener('group-call-active', handler);
  },
  onGroupCallJoin: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('group-call-join', handler);
    return () => ipcRenderer.removeListener('group-call-join', handler);
  },
  onGroupCallIncoming: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('group-call-incoming', handler);
    return () => ipcRenderer.removeListener('group-call-incoming', handler);
  },
  onGroupCallTcp: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('group-call-tcp', handler);
    return () => ipcRenderer.removeListener('group-call-tcp', handler);
  },
  onGroupCallLeave: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('group-call-leave', handler);
    return () => ipcRenderer.removeListener('group-call-leave', handler);
  },
  groupCallWindowMinimize: () => ipcRenderer.send('group-call-window-minimize'),
  groupCallWindowMaximize: () => ipcRenderer.send('group-call-window-maximize'),
  groupCallWindowClose: () => ipcRenderer.send('group-call-window-close'),
});
