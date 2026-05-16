import { t } from './i18n.js';

export function createIdGrid({ occupiedIds = [], selectedId = null, onSelect }) {
  const container = document.createElement('div');
  container.className = 'id-grid-wrap';

  const title = document.createElement('h2');
  title.className = 'section-title';
  title.dataset.i18n = 'grid.title';
  title.textContent = t('grid.title');

  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.dataset.i18n = 'grid.hint';
  hint.textContent = t('grid.hint');

  const grid = document.createElement('div');
  grid.className = 'id-grid';
  grid.setAttribute('role', 'grid');

  const occupied = new Set(occupiedIds);
  let pending = selectedId;

  for (let n = 1; n <= 64; n++) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'id-cell';
    if (n >= 10) cell.classList.add('id-cell--2digit');
    cell.dataset.id = String(n);
    cell.setAttribute('aria-label', String(n));

    const num = document.createElement('span');
    num.className = 'id-cell-num';
    num.textContent = String(n);
    cell.appendChild(num);

    if (occupied.has(n) && n !== selectedId) {
      cell.classList.add('occupied');
      cell.disabled = true;
      const cross = document.createElement('span');
      cross.className = 'id-cell-cross';
      cross.setAttribute('aria-hidden', 'true');
      cell.appendChild(cross);
    } else if (n === selectedId) {
      cell.classList.add('selected');
    }

    cell.addEventListener('click', () => {
      if (cell.disabled) return;
      grid.querySelectorAll('.id-cell').forEach((c) => {
        c.classList.remove('selected', 'pending');
      });
      cell.classList.add('pending');
      pending = n;
      onSelect?.(n);
    });

    grid.appendChild(cell);
  }

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'btn btn-accent';
  confirmBtn.dataset.i18n = 'grid.confirm';
  confirmBtn.textContent = t('grid.confirm');
  confirmBtn.disabled = !pending;
  confirmBtn.addEventListener('click', () => {
    if (pending) onSelect?.(pending, true);
  });

  container.appendChild(title);
  container.appendChild(hint);
  container.appendChild(grid);
  container.appendChild(confirmBtn);

  return {
    el: container,
    updateOccupied(ids) {
      occupied.clear();
      ids.forEach((id) => occupied.add(id));
      grid.querySelectorAll('.id-cell').forEach((cell) => {
        const n = Number(cell.dataset.id);
        const cross = cell.querySelector('.id-cell-cross');
        if (occupied.has(n) && n !== selectedId) {
          cell.classList.add('occupied');
          cell.disabled = true;
          if (!cross) {
            const c = document.createElement('span');
            c.className = 'id-cell-cross';
            cell.appendChild(c);
          }
        } else if (n !== selectedId) {
          cell.classList.remove('occupied');
          cell.disabled = false;
          cross?.remove();
        }
      });
    },
    setSelected(id) {
      pending = id;
      confirmBtn.disabled = !id;
      grid.querySelectorAll('.id-cell').forEach((c) => {
        c.classList.toggle('selected', Number(c.dataset.id) === id);
      });
    },
  };
}
