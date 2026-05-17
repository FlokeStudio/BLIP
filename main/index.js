import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell, Notification, session } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';
import { Discovery } from './discovery.js';
import { createTcpServer } from './tcp-server.js';
import { connectToPeer, sendOnSocket, pingPeer } from './tcp-client.js';
import { createTcpLineReader } from './tcp-framing.js';
import { loadConfig, saveConfig, initConfigPath, getLocalIp, getLocalIpv4Set } from './config.js';
import { ensureMeshIdentity } from './mesh-identity.js';
import {
  handleMeshHandshakeMessage,
  assertAuthenticated,
  isSocketAuthenticated,
  performOutboundHandshake,
  clearSocketSession,
  initInboundSession,
} from './mesh-handshake.js';
import { isPeerBlocked } from './trust-policy.js';
import { createTray, destroyTray } from './tray.js';
import { setupAutoUpdater, checkForUpdatesNow, quitAndInstallUpdater } from './updater.js';
import { resolveBuildAsset } from './paths.js';
import { resolvePorts } from './ports.js';
import { serializeSdp, sendCallPayload } from './call-wire.js';
import { fetchGithubReleases } from './github-releases.js';
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from './global-shortcuts.js';
import {
  listDisplaySources,
  resolveDisplaySourceForCallback,
  setPendingDisplaySource,
} from './display-capture.js';
import os from 'os';

if (process.env.BLIP_USER_DATA_DIR) {
  app.setPath('userData', process.env.BLIP_USER_DATA_DIR);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const useViteDev = process.env.BLIP_VITE_DEV === '1';
const distIndex = join(rootDir, 'dist/index.html');
const preloadPath = join(rootDir, 'preload.cjs');
const appMetaPath = join(rootDir, 'app-metadata.json');

function loadAppMetadata() {
  try {
    if (existsSync(appMetaPath)) {
      return JSON.parse(readFileSync(appMetaPath, 'utf8'));
    }
  } catch (e) {
    console.warn('[BLIP] app-metadata', e);
  }
  return {
    displayName: 'BLIP',
    codename: '',
    version: app.getVersion(),
    githubUrl: '',
  };
}

let mainWindow = null;
let callWindow = null;
let groupCallWindow = null;
let discovery = null;
let tcpServer = null;
let config = null;
const peerSockets = new Map();
/** Set in `before-quit` so the main window can distinguish Quit from close-to-tray hide. */
let appIsQuitting = false;

function getRendererUrl() {
  if (useViteDev) return 'http://localhost:5173';
  if (existsSync(distIndex)) return distIndex;
  return 'http://localhost:5173';
}

function getWindowIcon() {
  const iconPath = resolveBuildAsset('icon.png');
  if (existsSync(iconPath)) return nativeImage.createFromPath(iconPath);
  return undefined;
}

function createWindow() {
  const icon = getWindowIcon();
  mainWindow = new BrowserWindow({
    width: 960,
    height: 640,
    minWidth: 640,
    minHeight: 480,
    frame: false,
    icon,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const url = getRendererUrl();
  console.log('[BLIP] Loading UI:', url);
  if (url.startsWith('http')) {
    mainWindow.loadURL(url);
  } else {
    mainWindow.loadFile(url);
  }

  mainWindow.webContents.on('did-fail-load', (_event, code, desc, validatedURL) => {
    console.error('[BLIP] did-fail-load:', code, desc, validatedURL);
    if (!app.isPackaged) mainWindow.webContents.openDevTools({ mode: 'detach' });
  });

  mainWindow.webContents.on('preload-error', (_event, path, error) => {
    console.error('[BLIP] preload-error:', path, error);
  });

  if (!app.isPackaged && process.env.BLIP_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('close', (e) => {
    if (appIsQuitting) return;
    if (config?.closeToTray) {
      e.preventDefault();
      if (!mainWindow.isDestroyed()) mainWindow.hide();
      return;
    }
    try {
      if (callWindow && !callWindow.isDestroyed()) {
        callWindow.destroy();
        callWindow = null;
      }
    } catch {
      /* ignore */
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    unregisterGlobalShortcuts();
  });

  mainWindow.webContents.once('did-finish-load', () => {
    refreshGlobalShortcuts();
  });
}

function refreshGlobalShortcuts() {
  if (!config?.blipId) {
    unregisterGlobalShortcuts();
    return;
  }
  registerGlobalShortcuts({
    enabled: config.globalShortcutsEnabled !== false,
    getMainWindow: () => mainWindow,
    getCallWindow: () => callWindow,
  });
}

function getCallWindowUrl() {
  if (useViteDev) return 'http://localhost:5173/call-window.html';
  const p = join(rootDir, 'dist/call-window.html');
  if (existsSync(p)) return p;
  return `http://localhost:5173/call-window.html`;
}

async function ensureCallWindow() {
  if (callWindow && !callWindow.isDestroyed()) return callWindow;

  const icon = getWindowIcon();
  callWindow = new BrowserWindow({
    width: 440,
    height: 560,
    minWidth: 400,
    minHeight: 500,
    frame: false,
    show: false,
    icon,
    title: 'BLIP — Call',
    backgroundColor: '#0a0a0a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  callWindow.setMenuBarVisibility(false);

  const url = getCallWindowUrl();
  console.log('[BLIP] Call window load:', url);
  if (url.startsWith('http')) {
    await callWindow.loadURL(url);
  } else {
    await callWindow.loadFile(url);
  }

  callWindow.on('closed', () => {
    callWindow = null;
  });

  return callWindow;
}

function getGroupCallWindowUrl() {
  if (useViteDev) return 'http://localhost:5173/group-call-window.html';
  const p = join(rootDir, 'dist/group-call-window.html');
  if (existsSync(p)) return p;
  return 'http://localhost:5173/group-call-window.html';
}

async function ensureGroupCallWindow() {
  if (groupCallWindow && !groupCallWindow.isDestroyed()) return groupCallWindow;

  const icon = getWindowIcon();
  groupCallWindow = new BrowserWindow({
    width: 720,
    height: 520,
    minWidth: 560,
    minHeight: 420,
    frame: false,
    show: false,
    icon,
    title: 'BLIP — Group call',
    backgroundColor: '#0a0a0a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  groupCallWindow.setMenuBarVisibility(false);

  const url = getGroupCallWindowUrl();
  console.log('[BLIP] Group call window load:', url);
  if (url.startsWith('http')) {
    await groupCallWindow.loadURL(url);
  } else {
    await groupCallWindow.loadFile(url);
  }

  groupCallWindow.on('closed', () => {
    groupCallWindow = null;
  });

  return groupCallWindow;
}

async function sendToGroupCallWindow(channel, data, { focus = true } = {}) {
  try {
    const win = await ensureGroupCallWindow();
    if (!win || win.isDestroyed()) return;
    if (focus) {
      win.show();
      win.focus();
    }
    win.webContents.send(channel, data);
  } catch (e) {
    console.error('[BLIP] sendToGroupCallWindow', channel, e);
  }
}

function applyLaunchAtLogin(enabled) {
  if (process.platform !== 'win32' && process.platform !== 'darwin' && process.platform !== 'linux') {
    return;
  }
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      openAsHidden: false,
    });
  } catch (e) {
    console.warn('[BLIP] launchAtLogin', e?.message || e);
  }
}

async function sendToCallWindow(channel, data, { focus = true } = {}) {
  try {
    const win = await ensureCallWindow();
    if (!win || win.isDestroyed()) return;
    if (focus) {
      win.show();
      win.focus();
    }
    win.webContents.send(channel, data);
    console.log('[BLIP] → call-window', channel, focus ? '+focus' : '');
  } catch (e) {
    console.error('[BLIP] sendToCallWindow', channel, e);
  }
}

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function patchConfig(updates) {
  config = saveConfig(updates);
  discovery?.updateConfig(config);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('config-updated', config);
  }
  if (callWindow && !callWindow.isDestroyed()) {
    callWindow.webContents.send('config-updated', config);
  }
  if (groupCallWindow && !groupCallWindow.isDestroyed()) {
    groupCallWindow.webContents.send('config-updated', config);
  }
  if (updates?.launchAtLogin !== undefined) {
    applyLaunchAtLogin(config.launchAtLogin);
  }
  return config;
}

function meshHandshakeContext() {
  return {
    config,
    discovery,
    tcpServer,
    onConfigPatch: (updates) => patchConfig(updates),
  };
}

function showDesktopNotification(payload) {
  if (!Notification.isSupported()) return { ok: false, reason: 'unsupported' };
  const peerId = Number(payload?.peerId);
  const kind = payload?.kind === 'call' ? 'call' : 'chat';
  const title =
    typeof payload?.title === 'string' ? payload.title.trim().slice(0, 128) : 'BLIP';
  let body = typeof payload?.body === 'string' ? payload.body.replace(/\s+/g, ' ').trim() : '';
  body = body.slice(0, 256);
  if (!body) body = ' ';
  try {
    const n = new Notification({ title: title || 'BLIP', body, silent: false });
    n.on('click', () => {
      if (kind === 'call') {
        void ensureCallWindow().then((win) => {
          if (win && !win.isDestroyed()) {
            win.show();
            win.focus();
          }
        });
        return;
      }
      if (Number.isFinite(peerId) && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send('notification-open-chat', peerId);
      }
    });
    n.show();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

function findPeer(blipId) {
  const peers = discovery?.getPeers() || [];
  return peers.find((p) => p.blipId === blipId && p.online) || null;
}

async function ensurePeerSocket(blipId) {
  const peer = findPeer(blipId);
  if (!peer) throw new Error('Peer not found');

  const tcpPort = peer.tcpPort || resolvePorts(config).tcpPort;
  const socketKey = `${peer.ip}:${blipId}:${tcpPort}`;

  if (peerSockets.has(socketKey)) {
    const s = peerSockets.get(socketKey);
    if (!s.destroyed) return s;
    peerSockets.delete(socketKey);
  }

  const socket = await connectToPeer(peer.ip, blipId, tcpPort);
  initInboundSession(socket, peer.ip);

  const reader = createTcpLineReader(() => {
    try {
      socket.destroy();
    } catch {
      /* ignore */
    }
  });

  const onSocketLine = (msg) => {
    if (msg.type === 'ping') return;
    if (handleMeshHandshakeMessage(msg, socket, meshHandshakeContext())) return;
    if (!isSocketAuthenticated(socket)) return;
    const auth = assertAuthenticated(socket, msg);
    if (!auth.ok) return;
    if (isPeerBlocked(config, auth.from)) return;
    handleTcpPayload(msg, auth.from);
  };

  socket.on('data', (chunk) => {
    try {
      for (const line of reader.push(chunk)) {
        try {
          onSocketLine(JSON.parse(line));
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      if (e?.code === 'LINE_TOO_LARGE') socket.destroy();
    }
  });

  socket.on('close', () => {
    clearSocketSession(socket);
    peerSockets.delete(socketKey);
  });

  await performOutboundHandshake(socket, config, blipId, discovery);
  peerSockets.set(socketKey, socket);
  return socket;
}

function handleTcpPayload(msg, fromBlipId) {
  if (isPeerBlocked(config, fromBlipId)) return;

  switch (msg.type) {
    case 'ping':
      return;
    case 'mesh-handshake':
    case 'mesh-handshake-ack':
      return;
    case 'message':
    case 'typing':
    case 'receipt':
    case 'reaction':
    case 'group-invite':
    case 'group-invite-ack':
    case 'group-msg':
    case 'group-host':
    case 'group-sync':
    case 'group-leave':
    case 'group-disband':
    case 'avatar-sync':
      sendToRenderer('tcp-message', msg);
      break;
    case 'group-call-signal':
      void sendToGroupCallWindow('group-call-tcp', msg, { focus: false });
      break;
    case 'group-call-start':
      sendToRenderer('tcp-message', msg);
      break;
    case 'group-call-state':
    case 'group-call-end':
      sendToRenderer('tcp-message', msg);
      void sendToGroupCallWindow('group-call-tcp', msg, { focus: false });
      break;
    case 'file-offer':
    case 'file-chunk':
    case 'file-done':
    case 'file-abort':
    case 'clipboard-push':
      sendToRenderer('tcp-message', msg);
      break;
    case 'call-offer': {
      const callerId = msg.from ?? fromBlipId;
      if (config?.desktopCallNotifications !== false && !config?.doNotDisturb) {
        showDesktopNotification({
          kind: 'call',
          peerId: callerId,
          title: 'BLIP',
          body: `Incoming call · #${callerId}`,
        });
      }
      void sendToCallWindow(
        'incoming-call',
        {
          ...msg,
          from: callerId,
          sdp: msg.sdp,
          video: msg.video,
        },
        { focus: true }
      );
      break;
    }
    case 'call-answer':
      void sendToCallWindow('call-answer', { ...msg, from: msg.from ?? fromBlipId }, { focus: false });
      break;
    case 'call-candidate':
      void sendToCallWindow('call-candidate', { ...msg, from: msg.from ?? fromBlipId }, { focus: false });
      break;
    case 'call-reject':
      void sendToCallWindow('call-rejected', { ...msg, from: msg.from ?? fromBlipId }, { focus: false });
      break;
    case 'call-hangup':
      void sendToCallWindow('call-ended', { ...msg, from: msg.from ?? fromBlipId }, { focus: false });
      break;
    case 'call-state':
      void sendToCallWindow('call-state', { ...msg, from: msg.from ?? fromBlipId }, { focus: false });
      break;
    case 'call-renegotiate':
      void sendToCallWindow('call-renegotiate', { ...msg, from: msg.from ?? fromBlipId }, { focus: false });
      break;
    case 'call-renegotiate-answer':
      void sendToCallWindow(
        'call-renegotiate-answer',
        { ...msg, from: msg.from ?? fromBlipId },
        { focus: false }
      );
      break;
    default:
      break;
  }
}

function createTcpHandlers() {
  return {
    onMessage: (msg, socket, remoteIp) => {
      if (msg.type === 'ping') {
        socket.write(JSON.stringify({ type: 'pong' }) + '\n');
        return;
      }

      if (handleMeshHandshakeMessage(msg, socket, meshHandshakeContext())) return;

      if (!isSocketAuthenticated(socket)) {
        return;
      }

      const auth = assertAuthenticated(socket, msg);
      if (!auth.ok) {
        try {
          socket.destroy();
        } catch {
          /* ignore */
        }
        return;
      }

      if (isPeerBlocked(config, auth.from)) return;

      handleTcpPayload(msg, auth.from);
    },
  };
}

async function rollbackNetworking(reasonErr) {
  if (reasonErr) console.error('[BLIP] network bootstrap failed:', reasonErr.message || reasonErr);
  try {
    discovery?.stop();
  } catch {
    /* ignore */
  }
  discovery = null;
  if (tcpServer) {
    try {
      await tcpServer.close();
    } catch {
      /* ignore */
    }
    tcpServer = null;
  }
}

async function bootstrapNetworking() {
  const { tcpPort } = resolvePorts(config);
  tcpServer = await createTcpServer(createTcpHandlers(), tcpPort);
  discovery = new Discovery(config, (peers, occupiedIds) => {
    sendToRenderer('peers-updated', { peers, occupiedIds });
  });
  await discovery.start();
}

async function stopNetwork() {
  discovery?.stop();
  discovery = null;
  for (const s of peerSockets.values()) {
    if (!s.destroyed) s.destroy();
  }
  peerSockets.clear();
  if (tcpServer) {
    await tcpServer.close();
    tcpServer = null;
  }
}

async function restartNetwork() {
  await stopNetwork();
  await bootstrapNetworking();
}

function installTray() {
  const meta = loadAppMetadata();
  const trayLabels =
    config.language === 'ru'
      ? { show: 'Показать', quit: 'Выход' }
      : { show: 'Show', quit: 'Quit' };
  createTray({
    getMainWindow: () => mainWindow,
    tooltip: `${meta.displayName || 'BLIP'} — local network`,
    labels: trayLabels,
    onQuit: async () => {
      await stopNetwork();
      app.quit();
    },
  });
}

function setupIpc() {
  ipcMain.handle('get-config', () => config);
  ipcMain.handle('save-config', (_, updates) => {
    const prevLang = config?.language;
    config = saveConfig(updates);
    discovery?.updateConfig(config);
    discovery?.announce();
    if (typeof updates?.language === 'string' && updates.language !== prevLang) {
      installTray();
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('config-updated', config);
    }
    if (callWindow && !callWindow.isDestroyed()) {
      callWindow.webContents.send('config-updated', config);
    }
    if (groupCallWindow && !groupCallWindow.isDestroyed()) {
      groupCallWindow.webContents.send('config-updated', config);
    }
    if (updates?.launchAtLogin !== undefined) {
      applyLaunchAtLogin(config.launchAtLogin);
    }
    if (
      updates?.globalShortcutsEnabled !== undefined ||
      updates?.blipId !== undefined
    ) {
      refreshGlobalShortcuts();
    }
    return config;
  });

  ipcMain.handle('get-github-releases', async (_, limit) => fetchGithubReleases(limit ?? 8));
  ipcMain.handle('get-peers', () => ({
    peers: discovery?.getPeers() || [],
    occupiedIds: discovery?.getOccupiedIds() || [],
  }));

  ipcMain.handle('get-network-diagnostics', () => {
    const { tcpPort, udpPort } = resolvePorts(config);
    const peers = discovery?.getPeers() || [];
    return {
      blipId: config.blipId,
      hostname: os.hostname(),
      localIp: getLocalIp(),
      localIpv4s: [...getLocalIpv4Set()],
      tcpPort,
      udpPort,
      discoveryActive: !!discovery?.socket,
      onlinePeers: peers.filter((p) => p.online).length,
      totalPeers: peers.length,
    };
  });

  ipcMain.handle('send-tcp-message', async (_, payload) => {
    try {
      const socket = await ensurePeerSocket(payload.to);
      const type = payload.type || 'message';
      const packet = {
        type,
        from: config.blipId,
        to: payload.to,
      };
      const skip = new Set(['to', 'type']);
      for (const [key, val] of Object.entries(payload)) {
        if (skip.has(key) || val === undefined) continue;
        packet[key] = val;
      }
      packet.from = config.blipId;
      packet.to = payload.to;
      packet.type = type;

      if (type === 'message' && packet.text === undefined) {
        packet.text = '';
        packet.timestamp = payload.timestamp ?? Date.now();
      }
      if (type === 'typing' && packet.active === undefined) {
        packet.active = !!payload.active;
      }
      await sendOnSocket(socket, packet);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('initiate-call', async (_, payload) => {
    try {
      const sdp = serializeSdp(payload.sdp);
      if (!sdp) return { ok: false, error: 'Invalid local SDP' };
      await sendCallPayload(tcpServer, ensurePeerSocket, payload.to, {
        type: 'call-offer',
        from: config.blipId,
        to: payload.to,
        sdp,
        video: payload.video ?? false,
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('call-accept', async (_, payload) => {
    try {
      const sdp = serializeSdp(payload.sdp);
      if (!sdp) return { ok: false, error: 'Invalid local SDP' };
      await sendCallPayload(tcpServer, ensurePeerSocket, payload.to, {
        type: 'call-answer',
        from: config.blipId,
        to: payload.to,
        sdp,
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('call-reject', async (_, payload) => {
    try {
      await sendCallPayload(tcpServer, ensurePeerSocket, payload.to, {
        type: 'call-reject',
        from: config.blipId,
        to: payload.to,
      });
      return { ok: true };
    } catch {
      return { ok: true };
    }
  });

  ipcMain.handle('call-candidate', async (_, payload) => {
    try {
      await sendCallPayload(tcpServer, ensurePeerSocket, payload.to, {
        type: 'call-candidate',
        from: config.blipId,
        to: payload.to,
        candidate: payload.candidate,
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('call-hangup', async (_, payload) => {
    try {
      await sendCallPayload(tcpServer, ensurePeerSocket, payload.to, {
        type: 'call-hangup',
        from: config.blipId,
        to: payload.to,
      });
      return { ok: true };
    } catch {
      return { ok: true };
    }
  });

  ipcMain.handle('call-state', async (_, payload) => {
    try {
      await sendCallPayload(tcpServer, ensurePeerSocket, payload.to, {
        type: 'call-state',
        from: config.blipId,
        to: payload.to,
        muted: !!payload.muted,
        deafened: !!payload.deafened,
        screenSharing: !!payload.screenSharing,
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('call-renegotiate', async (_, payload) => {
    try {
      const sdp = serializeSdp(payload.sdp);
      if (!sdp) return { ok: false, error: 'Invalid local SDP' };
      await sendCallPayload(tcpServer, ensurePeerSocket, payload.to, {
        type: 'call-renegotiate',
        from: config.blipId,
        to: payload.to,
        sdp,
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('call-renegotiate-answer', async (_, payload) => {
    try {
      const sdp = serializeSdp(payload.sdp);
      if (!sdp) return { ok: false, error: 'Invalid local SDP' };
      await sendCallPayload(tcpServer, ensurePeerSocket, payload.to, {
        type: 'call-renegotiate-answer',
        from: config.blipId,
        to: payload.to,
        sdp,
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('ping-peer', async (_, blipId) => {
    const peer = findPeer(blipId);
    if (!peer) return false;
    return pingPeer(peer.ip, peer.tcpPort || resolvePorts(config).tcpPort);
  });

  ipcMain.handle('check-id-conflict', async (_, blipId) => {
    const peers = discovery?.getPeers() || [];
    const conflict = peers.find((p) => p.blipId === blipId && p.online);
    if (!conflict) return { taken: false };
    const responds = await pingPeer(
      conflict.ip,
      conflict.tcpPort || resolvePorts(config).tcpPort
    );
    return { taken: responds.ok };
  });

  ipcMain.handle('get-app-metadata', () => ({
    ...loadAppMetadata(),
    isPackaged: app.isPackaged,
  }));

  ipcMain.handle('check-for-updates', () => checkForUpdatesNow());
  ipcMain.handle('quit-and-install', () => {
    quitAndInstallUpdater();
    return { ok: true };
  });

  ipcMain.handle('show-message-notification', (_, payload) => {
    if (config?.doNotDisturb) return { ok: false, reason: 'dnd' };
    return showDesktopNotification(payload);
  });

  ipcMain.handle('list-display-sources', () => listDisplaySources());

  ipcMain.handle('prepare-display-capture', (_, sourceId) => {
    if (typeof sourceId !== 'string' || !sourceId) return { ok: false };
    setPendingDisplaySource(sourceId);
    return { ok: true };
  });

  ipcMain.handle('open-external', async (_, url) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return { ok: false };
    await shell.openExternal(url);
    return { ok: true };
  });

  ipcMain.handle('open-call-outgoing', async (_, payload) => {
    await sendToCallWindow(
      'call-outgoing',
      { peerId: payload.peerId, video: payload.video ?? false },
      { focus: true }
    );
    return { ok: true };
  });

  ipcMain.handle('close-call-window', () => {
    if (callWindow && !callWindow.isDestroyed()) {
      callWindow.hide();
    }
    return true;
  });

  ipcMain.handle('open-group-call', async (_, payload) => {
    await sendToGroupCallWindow(
      'group-call-join',
      { groupId: payload?.groupId, skipInvite: !!payload?.skipInvite },
      { focus: true }
    );
    return { ok: true };
  });

  ipcMain.handle('open-group-call-incoming', async (_, payload) => {
    await sendToGroupCallWindow('group-call-incoming', payload || {}, { focus: true });
    return { ok: true };
  });

  ipcMain.handle('leave-group-call', async () => {
    await sendToGroupCallWindow('group-call-leave', {}, { focus: false });
    return { ok: true };
  });

  ipcMain.handle('close-group-call-window', () => {
    if (groupCallWindow && !groupCallWindow.isDestroyed()) {
      groupCallWindow.hide();
    }
    return true;
  });

  ipcMain.on('group-call-active', (_, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('group-call-active', data);
    }
  });

  ipcMain.on('window-minimize', () => mainWindow?.minimize());
  ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on('window-close', () => mainWindow?.close());
  ipcMain.on('call-window-minimize', () => callWindow?.minimize());
  ipcMain.on('call-window-maximize', () => {
    if (!callWindow || callWindow.isDestroyed()) return;
    if (callWindow.isMaximized()) callWindow.unmaximize();
    else callWindow.maximize();
  });
  ipcMain.on('call-window-close', () => {
    if (callWindow && !callWindow.isDestroyed()) callWindow.hide();
  });
  ipcMain.handle('call-window-toggle-fullscreen', () => {
    if (!callWindow || callWindow.isDestroyed()) return false;
    const next = !callWindow.isFullScreen();
    callWindow.setFullScreen(next);
    return next;
  });
  ipcMain.handle('call-window-is-fullscreen', () => {
    if (!callWindow || callWindow.isDestroyed()) return false;
    return callWindow.isFullScreen();
  });

  ipcMain.on('group-call-window-minimize', () => groupCallWindow?.minimize());
  ipcMain.on('group-call-window-maximize', () => {
    if (!groupCallWindow || groupCallWindow.isDestroyed()) return;
    if (groupCallWindow.isMaximized()) groupCallWindow.unmaximize();
    else groupCallWindow.maximize();
  });
  ipcMain.on('group-call-window-close', () => {
    void sendToGroupCallWindow('group-call-leave', {}, { focus: false });
    if (groupCallWindow && !groupCallWindow.isDestroyed()) groupCallWindow.hide();
  });
}

function showFatalPortDialog(err) {
  const { tcpPort, udpPort } = resolvePorts(config);
  const extra =
    err?.code === 'EADDRINUSE'
      ? 'Another BLIP window or another program is probably already listening on those ports.'
      : 'Check firewall settings and ensure no orphaned BLIP process is running.';
  dialog.showErrorBox(
    'BLIP — network error',
    [
      `Could not open networking (TCP ${tcpPort}, UDP ${udpPort}).`,
      '',
      extra,
      '',
      'Close the duplicate instance, or run one instance with BLIP_TCP_PORT and BLIP_UDP_PORT set to free ports.',
      '',
      `${err?.code ?? ''} ${err?.message ?? String(err)}`.trim(),
    ].join('\n')
  );
}

function setupMediaPermissions() {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    const allow = permission === 'media' || permission === 'display-capture';
    callback(allow);
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return permission === 'media' || permission === 'display-capture';
  });

  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const pick = await resolveDisplaySourceForCallback();
      if (!pick) {
        callback({});
        return;
      }
      callback({ video: pick, audio: false });
    } catch (err) {
      console.warn('[BLIP] display media:', err.message);
      callback({});
    }
  });
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.blip.messenger');
  }

  setupMediaPermissions();

  initConfigPath();
  config = loadConfig();
  const hadMeshKeys = !!(config.meshPrivateKey && config.meshPublicKey);
  config = ensureMeshIdentity(config);
  if (!hadMeshKeys && config.meshPrivateKey) {
    config = saveConfig({
      meshPublicKey: config.meshPublicKey,
      meshPrivateKey: config.meshPrivateKey,
    });
  }

  try {
    await bootstrapNetworking();
  } catch (err) {
    await rollbackNetworking(err);
    showFatalPortDialog(err);
    app.quit();
    return;
  }

  applyLaunchAtLogin(!!config.launchAtLogin);

  setupIpc();
  createWindow();
  installTray();
  setupAutoUpdater(() => mainWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  appIsQuitting = true;
  unregisterGlobalShortcuts();
  destroyTray();
});

app.on('window-all-closed', () => {
  void stopNetwork();
  if (process.platform !== 'darwin') app.quit();
});
