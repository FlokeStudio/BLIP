const STORAGE_KEY = 'blip_avatar_custom_v1';
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_DATA_URL_CHARS = 100000;
const OUTPUT_PX = 64;

const ACCENT = '#00ffc8';
const SHADES = ['#004d3d', '#008f72', '#00ffc8'];

function hashBlipId(blipId) {
  let h = blipId * 2654435761;
  return ((h >>> 0) % 65536) / 65536;
}

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function generateAvatarData(blipId) {
  const rand = seededRandom(Math.floor(hashBlipId(blipId) * 1e9) + blipId);
  const pixels = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 4; x++) {
      const filled = rand() > 0.35;
      const shade = SHADES[Math.floor(rand() * SHADES.length)];
      pixels[y * 8 + x] = filled ? shade : 'transparent';
      pixels[y * 8 + (7 - x)] = filled ? shade : 'transparent';
    }
  }
  return pixels;
}

export function drawAvatar(canvas, blipId, scale = 4) {
  const pixels = generateAvatarData(blipId);
  const size = 8 * scale;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < 64; i++) {
    const color = pixels[i];
    if (color === 'transparent') continue;
    const x = (i % 8) * scale;
    const y = Math.floor(i / 8) * scale;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, scale, scale);
  }
}

export function getCustomAvatarDataUrl() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (typeof o?.dataUrl === 'string' && o.dataUrl.startsWith('data:image/')) return o.dataUrl;
  } catch {
    /* ignore */
  }
  return null;
}

export function setCustomAvatarDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return;
  if (dataUrl.length > MAX_DATA_URL_CHARS) throw new Error('too_large');
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ dataUrl, updated: Date.now() }));
}

export function clearCustomAvatar() {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasCustomAvatar() {
  return !!getCustomAvatarDataUrl();
}

/**
 * Resize image file to OUTPUT_Px square JPEG, cap encoded size.
 * @param {File} file
 * @returns {Promise<string>} data URL
 */
export async function encodeAvatarFileToDataUrl(file) {
  if (!file || !file.size) throw new Error('empty');
  if (file.size > MAX_FILE_BYTES) throw new Error('file_too_big');
  const mime = (file.type || '').toLowerCase();
  if (!['image/png', 'image/webp', 'image/jpeg'].includes(mime)) throw new Error('bad_mime');

  const blobUrl = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('decode'));
      img.src = blobUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_PX;
    canvas.height = OUTPUT_PX;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, OUTPUT_PX, OUTPUT_PX);

    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) throw new Error('decode');
    const side = Math.min(iw, ih);
    const sx = (iw - side) / 2;
    const sy = (ih - side) / 2;
    ctx.drawImage(img, sx, sy, side, side, 0, 0, OUTPUT_PX, OUTPUT_PX);

    let q = 0.88;
    let out = canvas.toDataURL('image/jpeg', q);
    while (out.length > MAX_DATA_URL_CHARS && q > 0.45) {
      q -= 0.07;
      out = canvas.toDataURL('image/jpeg', q);
    }
    if (out.length > MAX_DATA_URL_CHARS) throw new Error('too_large');
    return out;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

function appendCustomImg(wrap, dataUrl, scale) {
  const px = 8 * scale;
  const img = document.createElement('img');
  img.className = 'avatar-img';
  img.src = dataUrl;
  img.alt = '';
  img.width = px;
  img.height = px;
  img.decoding = 'async';
  wrap.appendChild(img);
}

/**
 * @param {number} blipId
 * @param {number} [scale]
 * @param {{ selfBlipId?: number | null }} [opts] — when blipId === selfBlipId, show uploaded avatar if set
 */
export function createAvatarElement(blipId, scale = 4, opts = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'avatar-wrap';
  const selfId = opts.selfBlipId != null ? Number(opts.selfBlipId) : null;
  const useCustom =
    selfId != null && Number(blipId) === selfId && Number.isFinite(selfId) && hasCustomAvatar();

  if (useCustom) {
    appendCustomImg(wrap, getCustomAvatarDataUrl(), scale);
    return wrap;
  }

  const canvas = document.createElement('canvas');
  canvas.className = 'avatar-canvas';
  drawAvatar(canvas, blipId, scale);
  wrap.appendChild(canvas);
  return wrap;
}
