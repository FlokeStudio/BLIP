import { t } from './i18n.js';

export function buildThemedSelect(className = 'blip-select settings-dropdown') {
  const sel = document.createElement('select');
  sel.className = className;
  return sel;
}

/**
 * @param {{ value: string, label: string }[]} options
 * @param {string} current
 * @param {(value: string) => void} onChange
 */
export function fillSettingsDropdown(select, options, current, onChange) {
  select.innerHTML = '';
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    select.appendChild(o);
  }
  const ok = options.some((o) => o.value === current);
  select.value = ok ? current : options[0]?.value || '';
  select.addEventListener('change', () => onChange(select.value));
}

export function buildSettingsField(labelKey, controlEl) {
  const wrap = document.createElement('div');
  wrap.className = 'settings-field';
  const label = document.createElement('label');
  label.className = 'settings-field-label';
  label.dataset.i18n = labelKey;
  label.textContent = t(labelKey);
  wrap.appendChild(label);
  wrap.appendChild(controlEl);
  return wrap;
}
