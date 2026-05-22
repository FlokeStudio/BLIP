import { t } from './i18n.js';
import { premiumTierEnabled } from './mesh-plus.js';
import { getLocalTrustState, resolvePeerMeshPlusTrust } from './trust-ui.js';
import { BUILD_TRUST, MESH_TRUST, OFFICIAL_BUILD_ISSUER } from '../shared/trust-levels.js';
import { showAppToast } from './toasts.js';
import { buildPanelTitleRow, buildSectionSubtitleRow } from './settings-ui.js';
import { createMeshPlusPixelHero, createMeshPlusPixelStrip } from './mesh-plus-pixel-bg.js';

const CAROUSEL_SLIDES = [
  { icon: '◈', titleKey: 'mesh_plus.slide_premium_bg', descKey: 'mesh_plus.slide_premium_bg_desc' },
  { icon: '♪', titleKey: 'mesh_plus.slide_sound', descKey: 'mesh_plus.slide_sound_desc' },
  { icon: '◇', titleKey: 'mesh_plus.slide_theme', descKey: 'mesh_plus.slide_theme_desc' },
  { icon: '⬡', titleKey: 'mesh_plus.slide_icons', descKey: 'mesh_plus.slide_icons_desc' },
  { icon: '▦', titleKey: 'mesh_plus.slide_projects', descKey: 'mesh_plus.slide_projects_desc' },
  { icon: '⧉', titleKey: 'mesh_plus.slide_clipboard', descKey: 'mesh_plus.slide_clipboard_desc' },
  { icon: '▶', titleKey: 'mesh_plus.slide_gif', descKey: 'mesh_plus.slide_gif_desc' },
  { icon: '⎙', titleKey: 'mesh_plus.slide_export', descKey: 'mesh_plus.slide_export_desc' },
  { icon: '◎', titleKey: 'mesh_plus.slide_relay', descKey: 'mesh_plus.slide_relay_desc' },
];

/**
 * @param {object} state
 * @param {() => void} onConfigChange
 */
export function buildSettingsMeshPlusPanel(state, onConfigChange) {
  const frag = document.createElement('div');
  frag.className = 'settings-panel settings-panel--mesh-plus';

  frag.appendChild(buildPanelTitleRow('settings.section_mesh_plus', 'mesh_plus.intro_hint'));

  const pixelHero = createMeshPlusPixelHero();
  const statusCard = document.createElement('div');
  statusCard.className = 'mesh-plus-status-card settings-list-panel';
  const statusRow = document.createElement('div');
  statusRow.className = 'mesh-plus-status-row';
  const statusLabel = document.createElement('span');
  statusLabel.className = 'settings-field-label';
  statusLabel.dataset.i18n = 'mesh_plus.status_label';
  statusLabel.textContent = t('mesh_plus.status_label');
  const statusPill = document.createElement('span');
  statusPill.className = 'mesh-plus-tier-pill';
  statusRow.appendChild(statusLabel);
  statusRow.appendChild(statusPill);
  statusCard.appendChild(statusRow);
  pixelHero.inner.appendChild(statusCard);
  frag.appendChild(pixelHero.hero);

  const carouselPixelStrip = createMeshPlusPixelStrip(false);
  frag.appendChild(carouselPixelStrip.strip);

  const carouselTitle = document.createElement('h3');
  carouselTitle.className = 'section-subtitle';
  carouselTitle.dataset.i18n = 'mesh_plus.carousel_title';
  carouselTitle.textContent = t('mesh_plus.carousel_title');
  frag.appendChild(carouselTitle);

  const carousel = document.createElement('div');
  carousel.className = 'mesh-plus-carousel settings-list-panel';
  const carouselTop = document.createElement('div');
  carouselTop.className = 'mesh-plus-carousel__top';
  const slideCounter = document.createElement('span');
  slideCounter.className = 'mesh-plus-carousel__counter';
  carouselTop.appendChild(slideCounter);
  carousel.appendChild(carouselTop);

  const carouselStage = document.createElement('div');
  carouselStage.className = 'mesh-plus-carousel__stage';

  const carouselMedia = document.createElement('div');
  carouselMedia.className = 'mesh-plus-carousel__media';
  carouselMedia.setAttribute('aria-hidden', 'true');
  carouselStage.appendChild(carouselMedia);

  const carouselBody = document.createElement('div');
  carouselBody.className = 'mesh-plus-carousel__body';
  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'btn btn-lang mesh-plus-carousel__nav';
  prevBtn.dataset.i18n = 'mesh_plus.carousel_prev';
  prevBtn.textContent = t('mesh_plus.carousel_prev');
  prevBtn.setAttribute('aria-label', t('mesh_plus.carousel_prev'));
  const carouselInner = document.createElement('div');
  carouselInner.className = 'mesh-plus-carousel__track';
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'btn btn-lang mesh-plus-carousel__nav';
  nextBtn.dataset.i18n = 'mesh_plus.carousel_next';
  nextBtn.textContent = t('mesh_plus.carousel_next');
  nextBtn.setAttribute('aria-label', t('mesh_plus.carousel_next'));
  carouselBody.appendChild(prevBtn);
  carouselBody.appendChild(carouselInner);
  carouselBody.appendChild(nextBtn);
  carouselStage.appendChild(carouselBody);

  const dots = document.createElement('div');
  dots.className = 'mesh-plus-carousel__dots';
  carouselStage.appendChild(dots);
  carousel.appendChild(carouselStage);
  frag.appendChild(carousel);

  let slideIndex = 0;
  let carouselTimer = null;

  function renderSlide(i) {
    slideIndex = ((i % CAROUSEL_SLIDES.length) + CAROUSEL_SLIDES.length) % CAROUSEL_SLIDES.length;
    const slide = CAROUSEL_SLIDES[slideIndex];
    carouselInner.innerHTML = '';
    const icon = document.createElement('div');
    icon.className = 'mesh-plus-carousel__icon';
    icon.textContent = slide.icon;
    const title = document.createElement('div');
    title.className = 'mesh-plus-carousel__title';
    title.dataset.i18n = slide.titleKey;
    title.textContent = t(slide.titleKey);
    const desc = document.createElement('p');
    desc.className = 'mesh-plus-carousel__desc';
    desc.dataset.i18n = slide.descKey;
    desc.textContent = t(slide.descKey);
    carouselInner.appendChild(icon);
    carouselInner.appendChild(title);
    carouselInner.appendChild(desc);
    slideCounter.textContent = t('mesh_plus.carousel_counter')
      .replace('{n}', String(slideIndex + 1))
      .replace('{total}', String(CAROUSEL_SLIDES.length));
    dots.querySelectorAll('button').forEach((btn, idx) => {
      btn.classList.toggle('selected', idx === slideIndex);
      btn.setAttribute('aria-label', t('mesh_plus.carousel_dot').replace('{n}', String(idx + 1)));
    });
  }

  CAROUSEL_SLIDES.forEach((_, idx) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'mesh-plus-carousel__dot';
    dot.addEventListener('click', () => {
      renderSlide(idx);
      resetCarouselTimer();
    });
    dots.appendChild(dot);
  });

  prevBtn.addEventListener('click', () => {
    renderSlide(slideIndex - 1);
    resetCarouselTimer();
  });
  nextBtn.addEventListener('click', () => {
    renderSlide(slideIndex + 1);
    resetCarouselTimer();
  });

  function resetCarouselTimer() {
    if (carouselTimer) clearInterval(carouselTimer);
    carouselTimer = setInterval(() => renderSlide(slideIndex + 1), 7000);
  }

  const activationCard = document.createElement('div');
  activationCard.className = 'mesh-plus-activation settings-list-panel';

  activationCard.appendChild(
    buildSectionSubtitleRow('mesh_plus.activation_title', 'mesh_plus.activation_hint')
  );

  const keyLabel = document.createElement('label');
  keyLabel.className = 'settings-field-label';
  keyLabel.dataset.i18n = 'mesh_plus.key_label';
  keyLabel.textContent = t('mesh_plus.key_label');
  keyLabel.htmlFor = 'mesh-plus-key-input';

  const keyInput = document.createElement('input');
  keyInput.type = 'text';
  keyInput.id = 'mesh-plus-key-input';
  keyInput.className = 'input mesh-plus-key-input';
  keyInput.autocomplete = 'off';
  keyInput.spellcheck = false;
  keyInput.placeholder = t('mesh_plus.key_placeholder');

  const btnRow = document.createElement('div');
  btnRow.className = 'mesh-plus-activation__actions';

  const activateBtn = document.createElement('button');
  activateBtn.type = 'button';
  activateBtn.className = 'btn btn-accent';
  activateBtn.dataset.i18n = 'mesh_plus.activate';
  activateBtn.textContent = t('mesh_plus.activate');

  const revokeBtn = document.createElement('button');
  revokeBtn.type = 'button';
  revokeBtn.className = 'btn btn-danger hidden';
  revokeBtn.dataset.i18n = 'mesh_plus.revoke_key';
  revokeBtn.textContent = t('mesh_plus.revoke_key');

  btnRow.appendChild(activateBtn);
  btnRow.appendChild(revokeBtn);

  const feedback = document.createElement('p');
  feedback.className = 'mesh-plus-feedback hint';

  activationCard.appendChild(keyLabel);
  activationCard.appendChild(keyInput);
  activationCard.appendChild(btnRow);
  activationCard.appendChild(feedback);
  frag.appendChild(activationCard);

  function syncActivationUi() {
    const active = premiumTierEnabled(state.config);
    const trust = getLocalTrustState();
    const selfPeer = {
      meshPlus: active,
      meshPlusTrust: trust?.meshPlusTrust,
      buildTrust: trust?.buildTrust,
      buildVerified: trust?.buildTrust === BUILD_TRUST.VERIFIED_OFFICIAL,
      buildIssuer: trust?.buildTrust === BUILD_TRUST.VERIFIED_OFFICIAL ? OFFICIAL_BUILD_ISSUER : '',
    };
    const meshTrust = active
      ? resolvePeerMeshPlusTrust(selfPeer)
      : MESH_TRUST.UNVERIFIED_MESH_PLUS;
    statusPill.textContent = active ? t('mesh_plus.status_mesh_plus') : t('mesh_plus.status_free');
    statusPill.classList.toggle('mesh-plus-tier-pill--active', active);
    statusCard.classList.toggle('mesh-plus-status-card--active', active);
    pixelHero.setSubscriptionActive(active);
    carouselPixelStrip.setSubscriptionActive(active);
    if (meshTrust === MESH_TRUST.UNVERIFIED_MESH_PLUS && active) {
      statusCard.classList.add('mesh-plus-status-card--trust-unverified');
    } else {
      statusCard.classList.remove('mesh-plus-status-card--trust-unverified');
    }
    if (
      active &&
      meshTrust === MESH_TRUST.UNVERIFIED_MESH_PLUS &&
      trust?.buildTrust === BUILD_TRUST.UNVERIFIED_BUILD
    ) {
      statusCard.dataset.i18nTitle = 'mesh_plus.trust_needs_official_build';
      statusCard.title = t('mesh_plus.trust_needs_official_build');
    }
    keyInput.classList.toggle('hidden', active);
    keyLabel.classList.toggle('hidden', active);
    activateBtn.classList.toggle('hidden', active);
    revokeBtn.classList.toggle('hidden', !active);
    if (active) {
      feedback.textContent = state.config.meshPlusLicenseMasked
        ? `${t('mesh_plus.active_ok')} · ${state.config.meshPlusLicenseMasked}`
        : t('mesh_plus.active_ok');
      feedback.classList.remove('mesh-plus-feedback--error');
    } else {
      feedback.textContent = t('mesh_plus.inactive_hint');
      feedback.classList.remove('mesh-plus-feedback--error');
    }
  }

  async function revokeLicense() {
    revokeBtn.disabled = true;
    try {
      await window.blip.deactivateMeshPlus();
      state.config = await window.blip.getConfig();
      keyInput.value = '';
      syncActivationUi();
      showAppToast({ title: t('mesh_plus.revoke_ok'), durationMs: 4000 });
      onConfigChange?.();
    } catch (e) {
      showAppToast({
        title: e?.message || t('mesh_plus.error_invalid'),
        durationMs: 4500,
        variant: 'danger',
      });
    } finally {
      revokeBtn.disabled = false;
    }
  }

  activateBtn.addEventListener('click', async () => {
    const raw = keyInput.value.trim();
    if (!raw) {
      feedback.textContent = t('mesh_plus.error_empty');
      feedback.classList.add('mesh-plus-feedback--error');
      return;
    }
    activateBtn.disabled = true;
    try {
      const res = await window.blip.activateMeshPlus(raw);
      if (!res?.ok) {
        const errKey = `mesh_plus.error_${res?.error || 'invalid'}`;
        feedback.textContent = t(errKey) !== errKey ? t(errKey) : t('mesh_plus.error_invalid');
        feedback.classList.add('mesh-plus-feedback--error');
        return;
      }
      state.config = await window.blip.getConfig();
      keyInput.value = '';
      syncActivationUi();
      showAppToast({ title: t('mesh_plus.activate_ok'), durationMs: 4000 });
      onConfigChange?.();
    } catch (e) {
      feedback.textContent = e?.message || t('mesh_plus.error_invalid');
      feedback.classList.add('mesh-plus-feedback--error');
    } finally {
      activateBtn.disabled = false;
    }
  });

  revokeBtn.addEventListener('click', () => void revokeLicense());

  renderSlide(0);
  resetCarouselTimer();
  syncActivationUi();

  frag._meshPlusCleanup = () => {
    if (carouselTimer) clearInterval(carouselTimer);
  };

  return frag;
}
