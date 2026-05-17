/** WebRTC capture constraints and sender tuning for BLIP calls. */

export const STREAM_QUALITY_IDS = ['low', 'hd', 'fhd', 'max'];

const PRESETS = {
  low: {
    camera: { width: { ideal: 640, min: 480 }, height: { ideal: 480, min: 360 }, frameRate: { ideal: 24, max: 24 } },
    screen: { width: { ideal: 1280, min: 720 }, height: { ideal: 720, min: 480 }, frameRate: { ideal: 24, max: 24 } },
    camBitrate: 800_000,
    screenBitrate: 2_000_000,
    screenMax: { w: 1280, h: 720 },
  },
  hd: {
    camera: { width: { ideal: 1280, min: 640 }, height: { ideal: 720, min: 480 }, frameRate: { ideal: 24, max: 30 } },
    screen: { width: { ideal: 1280, min: 1280 }, height: { ideal: 720, min: 720 }, frameRate: { ideal: 30, max: 30 } },
    camBitrate: 1_500_000,
    screenBitrate: 4_000_000,
    screenMax: { w: 1280, h: 720 },
  },
  fhd: {
    camera: { width: { ideal: 1920, min: 1280 }, height: { ideal: 1080, min: 720 }, frameRate: { ideal: 30, max: 30 } },
    screen: { width: { ideal: 1920, min: 1280 }, height: { ideal: 1080, min: 720 }, frameRate: { ideal: 30, max: 30 } },
    camBitrate: 2_500_000,
    screenBitrate: 6_000_000,
    screenMax: { w: 1920, h: 1080 },
  },
  max: {
    camera: { width: { ideal: 1920, min: 1280 }, height: { ideal: 1080, min: 720 }, frameRate: { ideal: 30, max: 60 } },
    screen: { width: { ideal: 1920, min: 1920 }, height: { ideal: 1080, min: 1080 }, frameRate: { ideal: 30, max: 30 } },
    camBitrate: 4_000_000,
    screenBitrate: 8_000_000,
    screenMax: { w: 1920, h: 1080 },
  },
};

export function normalizeStreamQuality(id) {
  return STREAM_QUALITY_IDS.includes(id) ? id : 'fhd';
}

export function normalizeFullscreenQuality(config) {
  const q = config?.fullscreenQuality || config?.streamQuality;
  return STREAM_QUALITY_IDS.includes(q) ? q : 'fhd';
}

export function getStreamPreset(config) {
  return PRESETS[normalizeStreamQuality(config?.streamQuality)];
}

export function getFullscreenPreset(config) {
  return PRESETS[normalizeFullscreenQuality(config)];
}

/** Target pixel frame for fullscreen theater (from settings). */
export function getFullscreenDimensions(config) {
  const { screenMax } = getFullscreenPreset(config);
  return { width: screenMax.w, height: screenMax.h };
}

/**
 * Size the stage video to the configured fullscreen resolution (letterboxed on display).
 * @param {HTMLElement} wrap
 * @param {HTMLVideoElement | null} video
 * @param {object} config
 * @param {boolean} on
 */
export function applyCallFullscreenLayout(wrap, video, config, on) {
  if (!wrap) return;
  if (!on) {
    wrap.classList.remove('call-video-wrap--fs-sized');
    wrap.style.removeProperty('--call-fs-w');
    wrap.style.removeProperty('--call-fs-h');
    if (video) {
      video.style.removeProperty('width');
      video.style.removeProperty('height');
    }
    return;
  }
  const { width, height } = getFullscreenDimensions(config);
  wrap.classList.add('call-video-wrap--fs-sized');
  wrap.style.setProperty('--call-fs-w', `${width}px`);
  wrap.style.setProperty('--call-fs-h', `${height}px`);
  if (video) {
    video.style.width = `${width}px`;
    video.style.height = `${height}px`;
    video.style.maxWidth = '100vw';
    video.style.maxHeight = '100vh';
    video.style.objectFit = 'contain';
  }
}

export function getCameraVideoConstraints(config) {
  return { ...getStreamPreset(config).camera };
}

export function getScreenCaptureConstraints(config) {
  const p = getStreamPreset(config);
  return { video: { ...p.screen }, audio: false };
}

export function getScreenCaptureMandatory(config) {
  const { screenMax } = getStreamPreset(config);
  return {
    minWidth: screenMax.w,
    maxWidth: screenMax.w,
    minHeight: screenMax.h,
    maxHeight: screenMax.h,
    maxFrameRate: 30,
  };
}

/** @deprecated use getCameraVideoConstraints(config) */
export const CAMERA_VIDEO_CONSTRAINTS = PRESETS.fhd.camera;

/** @deprecated use getScreenCaptureConstraints(config) */
export const SCREEN_CAPTURE_CONSTRAINTS = { video: PRESETS.fhd.screen, audio: false };

export async function applyScreenTrackConstraints(track, config) {
  if (!track?.applyConstraints) return;
  const p = getStreamPreset(config);
  try {
    await track.applyConstraints({
      width: { ideal: p.screenMax.w, min: Math.floor(p.screenMax.w * 0.75) },
      height: { ideal: p.screenMax.h, min: Math.floor(p.screenMax.h * 0.75) },
      frameRate: { ideal: 30, max: 30 },
    });
  } catch (err) {
    console.warn('[call] screen track constraints:', err.message);
  }
}

export async function tuneVideoSender(sender, { screenShare = false, config } = {}) {
  if (!sender?.getParameters || !sender.setParameters) return;
  const p = getStreamPreset(config);
  try {
    const params = sender.getParameters();
    if (!params.encodings?.length) params.encodings = [{}];
    const enc = params.encodings[0];
    enc.maxBitrate = screenShare ? p.screenBitrate : p.camBitrate;
    enc.maxFramerate = screenShare ? 30 : p.camera.frameRate?.max || 30;
    if (screenShare) enc.scaleResolutionDownBy = 1;
    await sender.setParameters(params);
  } catch (err) {
    console.warn('[call] RTP encoding:', err.message);
  }
}

/** Heuristic: screen shares are usually HD landscape. */
export function trackLooksLikeScreen(track) {
  const s = track?.getSettings?.();
  if (!s?.width || !s?.height) return false;
  return s.width >= 960 && s.height >= 540 && s.width >= s.height * 1.2;
}
