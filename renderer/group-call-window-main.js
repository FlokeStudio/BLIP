import { setLang, applyI18n, onLangChange } from './i18n.js';
import {
  initGroupCallWindow,
  joinGroupCall,
  leaveGroupCall,
  handleGroupCallSignal,
  handleGroupCallStart,
  handleGroupCallEnd,
  handleGroupCallState,
} from './group-call.js';
import { applyCallWindowAppearance, listenReducedMotion } from './appearance.js';
import { setSoundPrefs } from './audio.js';

let appearanceRm = null;

const api = {
  getConfig: () => window.blip.getConfig(),
  saveConfig: (data) => window.blip.saveConfig(data),
  sendTcpMessage: (payload) => window.blip.sendTcpMessage(payload),
};

function applyChrome(cfg) {
  setLang(cfg.language || localStorage.getItem('blip_lang') || 'en');
  setSoundPrefs({
    enabled: cfg.uiSoundsEnabled !== false && cfg.doNotDisturb !== true,
    volume: typeof cfg.uiSoundsVolume === 'number' ? cfg.uiSoundsVolume : 1,
    soundPack: cfg.uiSoundPack,
    melodyPack: cfg.uiMelodyPack,
  });
  applyCallWindowAppearance(cfg);
  applyI18n(document);
}

async function routeGroupTcp(msg) {
  const cfg = await api.getConfig();
  const callApi = { ...api, config: cfg };
  switch (msg.type) {
    case 'group-call-signal':
      await handleGroupCallSignal(msg, callApi);
      break;
    case 'group-call-state':
      await handleGroupCallState(msg, callApi);
      break;
    case 'group-call-start':
      await handleGroupCallStart(msg, callApi);
      break;
    case 'group-call-end':
      await handleGroupCallEnd(msg);
      break;
    default:
      break;
  }
}

async function boot() {
  if (!window.blip) {
    document.getElementById('group-call-root').innerHTML =
      '<p style="color:#ff3366;padding:24px;">No preload bridge</p>';
    return;
  }

  const config = await api.getConfig();
  applyChrome(config);
  appearanceRm?.();
  appearanceRm = listenReducedMotion(() => {});
  initGroupCallWindow(api);

  document.getElementById('group-call-win-min')?.addEventListener('click', () => {
    window.blip.groupCallWindowMinimize?.();
  });
  document.getElementById('group-call-win-max')?.addEventListener('click', () => {
    window.blip.groupCallWindowMaximize?.();
  });
  document.getElementById('group-call-win-close')?.addEventListener('click', () => {
    void leaveGroupCall();
  });

  onLangChange(() => applyI18n(document));
  window.blip.onConfigUpdated?.((cfg) => applyChrome(cfg));

  window.blip.onGroupCallJoin?.((payload) => {
    if (payload?.groupId) {
      void joinGroupCall(payload.groupId, api, { skipInvite: !!payload.skipInvite });
    }
  });

  window.blip.onGroupCallIncoming?.((payload) => {
    if (!payload?.groupId) return;
    void handleGroupCallStart(
      {
        type: 'group-call-start',
        groupId: payload.groupId,
        from: payload.from,
        members: payload.members,
        host: payload.host,
      },
      api
    );
  });

  window.blip.onGroupCallTcp?.((msg) => {
    void routeGroupTcp(msg);
  });

  window.blip.onGroupCallLeave?.(() => {
    void leaveGroupCall();
  });

  window.blip.onGlobalHangup?.(() => {
    void leaveGroupCall();
  });
}

boot().catch((e) => console.error(e));
