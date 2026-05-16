import { Tray, Menu, nativeImage } from 'electron';
import { existsSync } from 'fs';
import { resolveBuildAsset } from './paths.js';

let tray = null;

function createTrayIcon() {
  const trayPath = resolveBuildAsset('tray-16.png');
  if (existsSync(trayPath)) {
    return nativeImage.createFromPath(trayPath);
  }

  const size = 16;
  const canvas = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const accent = (x + y) % 3 === 0;
      canvas[i] = accent ? 0 : 10;
      canvas[i + 1] = accent ? 255 : 10;
      canvas[i + 2] = accent ? 200 : 10;
      canvas[i + 3] = 255;
    }
  }
  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

export function destroyTray() {
  if (!tray) return;
  try {
    tray.removeAllListeners();
    tray.destroy();
  } catch {
    /* ignore */
  }
  tray = null;
}

/**
 * @param {{
 *   getMainWindow: () => import('electron').BrowserWindow | null;
 *   tooltip?: string;
 *   onQuit: () => void | Promise<void>;
 *   labels?: { show?: string; quit?: string };
 * }} opts
 */
export function createTray(opts) {
  destroyTray();
  const { getMainWindow, tooltip, onQuit, labels } = opts;
  const L = { show: labels?.show || 'Show', quit: labels?.quit || 'Quit' };
  try {
    tray = new Tray(createTrayIcon());
    tray.setToolTip(tooltip || 'BLIP');

    const showMain = () => {
      const w = getMainWindow();
      if (!w || w.isDestroyed()) return;
      if (!w.isVisible()) w.show();
      w.focus();
    };

    const menu = Menu.buildFromTemplate([
      {
        label: L.show,
        click: showMain,
      },
      { type: 'separator' },
      {
        label: L.quit,
        click: () => {
          void onQuit();
        },
      },
    ]);
    tray.setContextMenu(menu);
    tray.on('click', showMain);
    tray.on('double-click', showMain);
  } catch {
    tray = null;
  }
}
