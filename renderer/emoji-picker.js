import { t } from './i18n.js';
import { EMOJI_CATEGORIES } from './emoji-data.js';

/**
 * @param {HTMLElement} anchorBtn
 * @param {HTMLInputElement} input
 */
export function attachEmojiPicker(anchorBtn, input) {
  let panel = null;

  function close() {
    panel?.remove();
    panel = null;
  }

  anchorBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (panel) {
      close();
      return;
    }

    panel = document.createElement('div');
    panel.className = 'emoji-picker glass';

    const tabs = document.createElement('div');
    tabs.className = 'emoji-picker-tabs';
    const body = document.createElement('div');
    body.className = 'emoji-picker-body';

    let activeCat = EMOJI_CATEGORIES[0]?.id;

    function renderBody() {
      body.innerHTML = '';
      const cat = EMOJI_CATEGORIES.find((c) => c.id === activeCat) || EMOJI_CATEGORIES[0];
      if (!cat) return;
      const grid = document.createElement('div');
      grid.className = 'emoji-picker-grid';
      for (const ch of cat.emojis) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'emoji-picker-btn';
        btn.textContent = ch;
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          insertEmoji(ch);
        });
        grid.appendChild(btn);
      }
      body.appendChild(grid);
    }

    function insertEmoji(ch) {
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? start;
      const v = input.value;
      input.value = v.slice(0, start) + ch + v.slice(end);
      const pos = start + ch.length;
      input.setSelectionRange(pos, pos);
      input.focus();
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    for (const cat of EMOJI_CATEGORIES) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'emoji-picker-tab';
      tab.dataset.cat = cat.id;
      tab.title = t(cat.labelKey);
      tab.textContent = [...cat.emojis].slice(0, 1);
      tab.addEventListener('click', (ev) => {
        ev.stopPropagation();
        activeCat = cat.id;
        tabs.querySelectorAll('.emoji-picker-tab').forEach((el) => {
          el.classList.toggle('selected', el.dataset.cat === activeCat);
        });
        renderBody();
      });
      if (cat.id === activeCat) tab.classList.add('selected');
      tabs.appendChild(tab);
    }

    renderBody();
    panel.appendChild(tabs);
    panel.appendChild(body);

    const rect = anchorBtn.getBoundingClientRect();
    panel.style.position = 'fixed';
    panel.style.left = `${Math.max(8, Math.min(rect.left - 220, window.innerWidth - 340))}px`;
    panel.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    panel.style.zIndex = '600';
    document.body.appendChild(panel);

    setTimeout(() => {
      document.addEventListener('click', close, { once: true });
    }, 0);
  });
}
