import { app } from 'electron';
import electronUpdater from 'electron-updater';

const updaterModule = electronUpdater.default ?? electronUpdater;
const { autoUpdater } = updaterModule;

let getMainWindow = () => null;
let listenersAttached = false;

function notify(payload) {
  const w = getMainWindow();
  if (w && !w.isDestroyed()) {
    w.webContents.send('update-status', payload);
  }
}

function attachListeners() {
  if (listenersAttached) return;
  listenersAttached = true;
  autoUpdater.on('checking-for-update', () => notify({ state: 'checking' }));
  autoUpdater.on('update-available', (info) =>
    notify({ state: 'available', version: info?.version })
  );
  autoUpdater.on('update-not-available', () => notify({ state: 'none' }));
  autoUpdater.on('error', (err) =>
    notify({ state: 'error', message: err?.message || String(err) })
  );
  autoUpdater.on('download-progress', (p) =>
    notify({ state: 'progress', percent: Math.floor(p.percent) })
  );
  autoUpdater.on('update-downloaded', (info) =>
    notify({ state: 'downloaded', version: info?.version })
  );
}

/**
 * @param {() => import('electron').BrowserWindow | null} getWindow
 */
export function setupAutoUpdater(getWindow) {
  getMainWindow = getWindow;
  if (!app.isPackaged) return;

  attachListeners();
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch((err) => {
      console.warn('[BLIP] checkForUpdates', err);
      notify({ state: 'error', message: err?.message || String(err) });
    });
  }, 6000);
}

export async function checkForUpdatesNow() {
  if (!app.isPackaged) return { ok: false, skipped: true };
  attachListeners();
  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export function quitAndInstallUpdater() {
  if (!app.isPackaged) return;
  autoUpdater.quitAndInstall(false, true);
}
