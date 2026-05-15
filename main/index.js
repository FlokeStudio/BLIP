import { app, BrowserWindow, ipcMain, nativeImage } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { Discovery } from './discovery.js';
import { createTcpServer } from './tcp-server.js';
import { connectToPeer, sendOnSocket, pingPeer, TCP_PORT } from './tcp-client.js';
import { loadConfig, saveConfig, initConfigPath, getLocalIp } from './config.js';
import { createTray } from './tray.js';
import { resolveBuildAsset } from './paths.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const useViteDev = process.env.BLIP_VITE_DEV === '1';
const distIndex = join(rootDir, 'dist/index.html');
const preloadPath = join(rootDir, 'preload.cjs');

let mainWindow = null;
let discovery = null;
let tcpServer = null;
let config = null;
const peerSockets = new Map();

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

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function findPeerIp(blipId) {
  const peers = discovery?.getPeers() || [];
  const peer = peers.find((p) => p.blipId === blipId && p.online);
  return peer?.ip || null;
}

async function ensurePeerSocket(blipId) {
  if (peerSockets.has(blipId)) {
    const s = peerSockets.get(blipId);
    if (!s.destroyed) return s;
    peerSockets.delete(blipId);
  }

  const ip = findPeerIp(blipId);
  if (!ip) throw new Error('Peer not found');

  const socket = await connectToPeer(ip, blipId);
  peerSockets.set(blipId, socket);

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

  socket.on('close', () => peerSockets.delete(blipId));
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
      sendToRenderer('incoming-call', {
        ...msg,
        from: msg.from ?? fromBlipId,
        sdp: msg.sdp,
        video: msg.video,
      });
      break;
    case 'call-answer':
      sendToRenderer('call-answer', { ...msg, from: msg.from ?? fromBlipId });
      break;
    case 'call-candidate':
      sendToRenderer('call-candidate', { ...msg, from: msg.from ?? fromBlipId });
      break;
    case 'call-reject':
      sendToRenderer('call-rejected', { ...msg, from: msg.from ?? fromBlipId });
      break;
    case 'call-hangup':
      sendToRenderer('call-ended', { ...msg, from: msg.from ?? fromBlipId });
      break;
    default:
      break;
  }
}

function setupTcpServer() {
  tcpServer = createTcpServer({
    onMessage: (msg, socket, remoteIp) => {
      if (msg.type === 'ping') {
        socket.write(JSON.stringify({ type: 'pong' }) + '\n');
        return;
      }

      if (msg.from) {
        tcpServer.registerConnection(msg.from, socket);
        peerSockets.set(msg.from, socket);
      }

      handleTcpPayload(msg, msg.from);
    },
  });
}

function setupDiscovery() {
  discovery = new Discovery(config, (peers, occupiedIds) => {
    sendToRenderer('peers-updated', { peers, occupiedIds });
  });
  discovery.start();
}

function setupIpc() {
  ipcMain.handle('get-config', () => config);
  ipcMain.handle('save-config', (_, updates) => {
    config = saveConfig(updates);
    discovery?.updateConfig(config);
    discovery?.announce();
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
    const ip = findPeerIp(blipId);
    if (!ip) return false;
    return pingPeer(ip);
  });

  ipcMain.handle('check-id-conflict', async (_, blipId) => {
    const peers = discovery?.getPeers() || [];
    const conflict = peers.find((p) => p.blipId === blipId && p.online);
    if (!conflict) return { taken: false };
    const responds = await pingPeer(conflict.ip);
    return { taken: responds };
  });

  ipcMain.on('window-minimize', () => mainWindow?.minimize());
  ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on('window-close', () => mainWindow?.close());
}

app.whenReady().then(() => {
  initConfigPath();
  config = loadConfig();
  setupTcpServer();
  setupDiscovery();
  setupIpc();
  createWindow();
  createTray(mainWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  discovery?.stop();
  if (process.platform !== 'darwin') app.quit();
});
