import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';
import { Discovery } from './discovery.js';
import { createTcpServer } from './tcp-server.js';
import { connectToPeer, sendOnSocket, pingPeer } from './tcp-client.js';
import { loadConfig, saveConfig, initConfigPath } from './config.js';
import { createTray, destroyTray } from './tray.js';
import { setupAutoUpdater, checkForUpdatesNow, quitAndInstallUpdater } from './updater.js';
import { resolveBuildAsset } from './paths.js';
import { resolvePorts } from './ports.js';

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
  peerSockets.set(socketKey, socket);

  let buffer = '';
  socket.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        handleTcpPayload(msg, blipId);
      } catch {
        /* ignore */
      }
    }
  });

  socket.on('close', () => peerSockets.delete(socketKey));
  tcpServer.registerConnection(blipId, socket);
  return socket;
}

function handleTcpPayload(msg, fromBlipId) {
  switch (msg.type) {
    case 'ping':
      return;
    case 'message':
      sendToRenderer('tcp-message', msg);
      break;
    case 'call-offer':
      void sendToCallWindow(
        'incoming-call',
        {
          ...msg,
          from: msg.from ?? fromBlipId,
          sdp: msg.sdp,
          video: msg.video,
        },
        { focus: true }
      );
      break;
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

      if (msg.from) {
        tcpServer.registerConnection(msg.from, socket);
      }

      handleTcpPayload(msg, msg.from);
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
    return config;
  });
  ipcMain.handle('get-peers', () => ({
    peers: discovery?.getPeers() || [],
    occupiedIds: discovery?.getOccupiedIds() || [],
  }));

  ipcMain.handle('send-tcp-message', async (_, payload) => {
    try {
      const socket = await ensurePeerSocket(payload.to);
      await sendOnSocket(socket, {
        type: 'message',
        from: config.blipId,
        to: payload.to,
        text: payload.text,
        timestamp: Date.now(),
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('initiate-call', async (_, payload) => {
    try {
      const socket = await ensurePeerSocket(payload.to);
      await sendOnSocket(socket, {
        type: 'call-offer',
        from: config.blipId,
        to: payload.to,
        sdp: payload.sdp,
        video: payload.video ?? false,
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('call-accept', async (_, payload) => {
    try {
      const socket = await ensurePeerSocket(payload.to);
      await sendOnSocket(socket, {
        type: 'call-answer',
        from: config.blipId,
        to: payload.to,
        sdp: payload.sdp,
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('call-reject', async (_, payload) => {
    try {
      const socket = await ensurePeerSocket(payload.to);
      await sendOnSocket(socket, {
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
      const socket = await ensurePeerSocket(payload.to);
      await sendOnSocket(socket, {
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
      const socket = await ensurePeerSocket(payload.to);
      await sendOnSocket(socket, {
        type: 'call-hangup',
        from: config.blipId,
        to: payload.to,
      });
      return { ok: true };
    } catch {
      return { ok: true };
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
    return { taken: responds };
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

  ipcMain.on('window-minimize', () => mainWindow?.minimize());
  ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on('window-close', () => mainWindow?.close());
  ipcMain.on('call-window-minimize', () => callWindow?.minimize());
  ipcMain.on('call-window-close', () => {
    if (callWindow && !callWindow.isDestroyed()) callWindow.hide();
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

app.whenReady().then(async () => {
  initConfigPath();
  config = loadConfig();

  try {
    await bootstrapNetworking();
  } catch (err) {
    await rollbackNetworking(err);
    showFatalPortDialog(err);
    app.quit();
    return;
  }

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
  destroyTray();
});

app.on('window-all-closed', () => {
  void stopNetwork();
  if (process.platform !== 'darwin') app.quit();
});
