/**
 * In-app media lightbox — images, video, YouTube. Pixel controls + share/download.
 */
import { t } from './i18n.js';
import { youtubeThumb } from './link-embed.js';

let root = null;
let videoEl = null;
let ytFrame = null;
let closeFn = null;

function ensureRoot() {
  if (root) return root;
  root = document.createElement('div');
  root.className = 'media-viewer hidden';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');

  const toolbar = document.createElement('div');
  toolbar.className = 'media-viewer-toolbar';

  const mkBtn = (label, i18n) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-lang media-viewer-btn';
    b.textContent = label;
    if (i18n) b.dataset.i18n = i18n;
    return b;
  };

  const shareBtn = mkBtn(t('media.share'), 'media.share');
  const dlBtn = mkBtn(t('media.download'), 'media.download');
  const closeBtn = mkBtn('×', 'media.close');
  closeBtn.classList.add('media-viewer-close');

  toolbar.appendChild(shareBtn);
  toolbar.appendChild(dlBtn);
  toolbar.appendChild(closeBtn);

  const stage = document.createElement('div');
  stage.className = 'media-viewer-stage';

  const img = document.createElement('img');
  img.className = 'media-viewer-img hidden';

  videoEl = document.createElement('video');
  videoEl.className = 'media-viewer-video hidden';
  videoEl.controls = false;
  videoEl.playsInline = true;

  ytFrame = document.createElement('iframe');
  ytFrame.className = 'media-viewer-yt hidden';
  ytFrame.allow =
    'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
  ytFrame.allowFullscreen = true;
  ytFrame.referrerPolicy = 'no-referrer';

  stage.appendChild(img);
  stage.appendChild(videoEl);
  stage.appendChild(ytFrame);

  const controls = document.createElement('div');
  controls.className = 'media-viewer-controls';

  const rewindBtn = document.createElement('button');
  rewindBtn.type = 'button';
  rewindBtn.className = 'btn btn-accent media-viewer-ctrl media-viewer-ctrl--pixel';
  rewindBtn.title = t('media.rewind');
  rewindBtn.innerHTML =
    '<span class="pixel-tri pixel-tri--left"></span><span class="pixel-tri pixel-tri--left"></span>';

  const playBtn = document.createElement('button');
  playBtn.type = 'button';
  playBtn.className = 'btn btn-accent media-viewer-ctrl media-viewer-ctrl--main media-viewer-ctrl--pixel';
  playBtn.title = t('media.play');
  playBtn.innerHTML = '<span class="pixel-tri pixel-tri--right"></span>';

  const forwardBtn = document.createElement('button');
  forwardBtn.type = 'button';
  forwardBtn.className = 'btn btn-accent media-viewer-ctrl media-viewer-ctrl--pixel';
  forwardBtn.title = t('media.forward');
  forwardBtn.innerHTML =
    '<span class="pixel-tri pixel-tri--right"></span><span class="pixel-tri pixel-tri--right"></span>';

  const seekBar = document.createElement('div');
  seekBar.className = 'media-viewer-seek';
  const seekFill = document.createElement('div');
  seekFill.className = 'media-viewer-seek-fill';
  seekBar.appendChild(seekFill);

  controls.appendChild(rewindBtn);
  controls.appendChild(playBtn);
  controls.appendChild(forwardBtn);

  root.appendChild(toolbar);
  root.appendChild(stage);
  root.appendChild(controls);
  root.appendChild(seekBar);

  let state = { src: null, name: '', type: 'image', ytId: null };

  function hideAllMedia() {
    img.classList.add('hidden');
    videoEl.classList.add('hidden');
    ytFrame.classList.add('hidden');
    controls.classList.add('hidden');
    seekBar.classList.add('hidden');
  }

  function syncPlayBtn() {
    playBtn.innerHTML = '';
    if (state.type === 'youtube') {
      playBtn.innerHTML = '<span class="pixel-glyph pixel-glyph--play"></span>';
      return;
    }
    if (state.type === 'video') {
      playBtn.innerHTML = videoEl.paused
        ? '<span class="pixel-glyph pixel-glyph--play"></span>'
        : '<span class="pixel-glyph pixel-glyph--pause"></span>';
    }
  }

  function updateSeek() {
    if (state.type !== 'video' || !Number.isFinite(videoEl.duration)) {
      seekFill.style.width = '0%';
      return;
    }
    const pct = videoEl.duration ? (videoEl.currentTime / videoEl.duration) * 100 : 0;
    seekFill.style.width = `${pct}%`;
  }

  rewindBtn.addEventListener('click', () => {
    if (state.type === 'video') videoEl.currentTime = Math.max(0, videoEl.currentTime - 10);
  });
  forwardBtn.addEventListener('click', () => {
    if (state.type === 'video' && Number.isFinite(videoEl.duration)) {
      videoEl.currentTime = Math.min(videoEl.duration, videoEl.currentTime + 10);
    }
  });
  playBtn.addEventListener('click', () => {
    if (state.type === 'youtube') return;
    if (state.type !== 'video') return;
    if (videoEl.paused) void videoEl.play();
    else videoEl.pause();
    syncPlayBtn();
  });
  videoEl.addEventListener('play', syncPlayBtn);
  videoEl.addEventListener('pause', syncPlayBtn);
  videoEl.addEventListener('timeupdate', updateSeek);

  async function downloadCurrent() {
    if (state.type === 'youtube') {
      if (window.blip?.openExternal) void window.blip.openExternal(`https://www.youtube.com/watch?v=${state.ytId}`);
      return;
    }
    if (!state.src) return;
    const a = document.createElement('a');
    a.href = state.src;
    a.download = state.name || 'download';
    a.click();
  }

  async function shareCurrent() {
    const title = state.name || 'BLIP';
    if (state.type === 'youtube' && state.ytId) {
      const url = `https://www.youtube.com/watch?v=${state.ytId}`;
      if (navigator.share) {
        try {
          await navigator.share({ title, url });
          return;
        } catch {
          /* fall through */
        }
      }
      if (window.blip?.openExternal) void window.blip.openExternal(url);
      return;
    }
    if (navigator.share && state.src?.startsWith('blob:') === false) {
      try {
        await navigator.share({ title, text: title, url: state.src });
        return;
      } catch {
        /* ignore */
      }
    }
    await downloadCurrent();
  }

  closeFn = () => {
    root.classList.add('hidden');
    videoEl.pause();
    videoEl.removeAttribute('src');
    videoEl.load();
    ytFrame.src = '';
    img.removeAttribute('src');
    document.body.classList.remove('media-viewer-open');
  };

  closeBtn.addEventListener('click', closeFn);
  shareBtn.addEventListener('click', () => void shareCurrent());
  dlBtn.addEventListener('click', () => void downloadCurrent());
  root.addEventListener('click', (e) => {
    if (e.target === root) closeFn();
  });
  document.addEventListener('keydown', (e) => {
    if (root.classList.contains('hidden')) return;
    if (e.key === 'Escape') closeFn();
  });

  root._open = (payload) => {
    state = { ...payload };
    hideAllMedia();
    if (payload.type === 'image') {
      img.src = payload.src;
      img.classList.remove('hidden');
      controls.classList.add('hidden');
      seekBar.classList.add('hidden');
    } else if (payload.type === 'youtube') {
      state.ytId = payload.ytId;
      ytFrame.src = `https://www.youtube.com/embed/${payload.ytId}?autoplay=1&rel=0`;
      ytFrame.classList.remove('hidden');
      controls.classList.remove('hidden');
      playBtn.disabled = true;
      rewindBtn.disabled = true;
      forwardBtn.disabled = true;
      seekBar.classList.add('hidden');
    } else if (payload.type === 'video') {
      videoEl.src = payload.src;
      videoEl.classList.remove('hidden');
      controls.classList.remove('hidden');
      seekBar.classList.remove('hidden');
      playBtn.disabled = false;
      rewindBtn.disabled = false;
      forwardBtn.disabled = false;
      void videoEl.play().catch(() => {});
      syncPlayBtn();
    }
    root.classList.remove('hidden');
    document.body.classList.add('media-viewer-open');
  };

  document.body.appendChild(root);
  return root;
}

/** Mount viewer DOM once at boot so first play/open is instant. */
export function initMediaViewer() {
  ensureRoot();
}

export function openMediaViewer(payload) {
  const el = ensureRoot();
  el._open(payload);
}

export function closeMediaViewer() {
  closeFn?.();
}

export function openImageAttachment(attachment) {
  if (!attachment?.dataUrl) return;
  openMediaViewer({
    type: 'image',
    src: attachment.dataUrl,
    name: attachment.name || 'image.jpg',
  });
}

export function openVideoAttachment(attachment) {
  if (!attachment?.dataUrl) return;
  openMediaViewer({
    type: 'video',
    src: attachment.dataUrl,
    name: attachment.name || 'video.mp4',
  });
}

export function openYoutubeViewer(ytId) {
  openMediaViewer({
    type: 'youtube',
    ytId,
    name: 'YouTube',
    src: youtubeThumb(ytId),
  });
}
