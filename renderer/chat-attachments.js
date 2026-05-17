import { getMaxFileBytes } from './file-transfer-limits.js';

/** Legacy default; use getMaxFileBytes(config) in app code. */
export const MAX_CHAT_FILE_BYTES = 100 * 1024 * 1024 * 1024;
export const INLINE_FILE_BYTES = 768 * 1024;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_EDGE = 960;
const MAX_DATA_URL_CHARS = 520_000;
const MAX_INLINE_DATA_URL_CHARS = 1_100_000;

function inferImageMime(file) {
  if (file.type && file.type.startsWith('image/')) return file.type;
  const n = (file.name || '').toLowerCase();
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.webp')) return 'image/webp';
  if (n.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

export function isImageFile(file) {
  if (!file) return false;
  if (file.type?.startsWith('image/')) return true;
  const n = (file.name || '').toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(n);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('read'));
    reader.readAsDataURL(file);
  });
}

/**
 * Resize image for LAN send (JPEG, capped size).
 * @param {File} file
 * @returns {Promise<{ kind: 'image', name: string, mime: string, size: number, dataUrl: string }>}
 */
export async function encodeChatImageAttachment(file) {
  if (!file || !file.size) throw new Error('empty');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('file_too_big');
  const mime = inferImageMime(file);
  if (!mime.startsWith('image/')) throw new Error('bad_mime');

  const blobUrl = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('decode'));
      img.src = blobUrl;
    });

    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) throw new Error('decode');

    const scale = Math.min(1, MAX_EDGE / Math.max(iw, ih));
    const w = Math.max(1, Math.round(iw * scale));
    const h = Math.max(1, Math.round(ih * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';
    ctx.drawImage(img, 0, 0, w, h);

    let q = 0.86;
    let dataUrl = canvas.toDataURL('image/jpeg', q);
    while (dataUrl.length > MAX_DATA_URL_CHARS && q > 0.45) {
      q -= 0.06;
      dataUrl = canvas.toDataURL('image/jpeg', q);
    }
    if (dataUrl.length > MAX_DATA_URL_CHARS) throw new Error('too_large');

    return {
      kind: 'image',
      name: file.name || 'image.jpg',
      mime: 'image/jpeg',
      size: file.size,
      dataUrl,
    };
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

/**
 * Small generic file inline in a chat message (data URL).
 * @param {File} file
 */
export async function encodeInlineFileAttachment(file, config) {
  if (!file || !file.size) throw new Error('empty');
  if (file.size > INLINE_FILE_BYTES) throw new Error('use_chunked');
  const maxBytes = getMaxFileBytes(config);
  if (file.size > maxBytes) throw new Error('file_too_big');

  const dataUrl = await readFileAsDataUrl(file);
  if (typeof dataUrl !== 'string' || dataUrl.length > MAX_INLINE_DATA_URL_CHARS) {
    throw new Error('too_large');
  }

  const mime = file.type || 'application/octet-stream';
  return {
    kind: 'file',
    name: file.name || 'file',
    mime,
    size: file.size,
    dataUrl,
  };
}

export function validateChatFile(file, config) {
  if (!file || !file.size) throw new Error('empty');
  if (file.size > getMaxFileBytes(config)) throw new Error('file_too_big');
}
