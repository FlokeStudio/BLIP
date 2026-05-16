const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('blip', {
  platform: process.platform,
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  getAppMetadata: () => ipcRenderer.invoke('get-app-metadata'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  getPeers: () => ipcRenderer.invoke('get-peers'),
  sendTcpMessage: (payload) => ipcRenderer.invoke('send-tcp-message', payload),
  initiateCall: (payload) => ipcRenderer.invoke('initiate-call', payload),
  callAccept: (payload) => ipcRenderer.invoke('call-accept', payload),
  callReject: (payload) => ipcRenderer.invoke('call-reject', payload),
  callCandidate: (payload) => ipcRenderer.invoke('call-candidate', payload),
  callHangup: (payload) => ipcRenderer.invoke('call-hangup', payload),
  pingPeer: (blipId) => ipcRenderer.invoke('ping-peer', blipId),
  checkIdConflict: (blipId) => ipcRenderer.invoke('check-id-conflict', blipId),
  openCallOutgoing: (payload) => ipcRenderer.invoke('open-call-outgoing', payload),
  closeCallWindow: () => ipcRenderer.invoke('close-call-window'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
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
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  callWindowMinimize: () => ipcRenderer.send('call-window-minimize'),
  callWindowClose: () => ipcRenderer.send('call-window-close'),
});
