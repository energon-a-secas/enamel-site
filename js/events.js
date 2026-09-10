// ── Event handlers ───────────────────────────────────────────
// Document-level wiring every page shares: the modal shell and its focus trap.
// Page-specific listeners live with the page controller that owns them.
//
// There is no inline onclick anywhere in this project and nothing here is
// exposed on window for one. Listeners are bound in JavaScript, which is the
// fleet rule and also what keeps the CSP's 'unsafe-inline' limited to the two
// head scripts C13.4 names.

/** @param {HTMLElement} root */
function getFocusable(root) {
  const sel = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');
  return Array.from(root.querySelectorAll(sel)).filter((el) => {
    if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') return false;
    return el.getClientRects().length > 0;
  });
}

let _modalLastFocus = null;

/** @param {string} id */
export function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  _modalLastFocus = /** @type {HTMLElement} */ (document.activeElement);
  modal.removeAttribute('hidden');
  document.body.classList.add('modal-open');
  const dialog = modal.querySelector('.modal__dialog');
  const list = dialog ? getFocusable(dialog) : [];
  const closeBtn = modal.querySelector('.modal__header [data-modal-close]');
  const toFocus = closeBtn && list.includes(closeBtn) ? closeBtn : list[0];
  if (toFocus) toFocus.focus();
}

/** @param {string} id */
export function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.setAttribute('hidden', '');
  document.body.classList.remove('modal-open');
  if (_modalLastFocus && typeof _modalLastFocus.focus === 'function') {
    _modalLastFocus.focus();
  }
  _modalLastFocus = null;
}

function getOpenModal() {
  return document.querySelector('.modal:not([hidden])');
}

function onDocumentKeydown(e) {
  const modal = getOpenModal();
  if (!modal || !modal.id) return;

  if (e.key === 'Escape') {
    e.preventDefault();
    closeModal(modal.id);
    return;
  }

  if (e.key !== 'Tab') return;
  const dialog = modal.querySelector('.modal__dialog');
  const list = dialog ? getFocusable(dialog) : [];
  if (list.length === 0) return;
  const first = list[0];
  const last = list[list.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

/** Clicks on backdrop / [data-modal-close] close the modal. */
function onModalClick(e) {
  const modal = /** @type {HTMLElement | null} */ (e.target.closest('.modal'));
  if (!modal || modal.hasAttribute('hidden')) return;
  const t = /** @type {HTMLElement} */ (e.target);
  if (t.closest('[data-modal-close]')) closeModal(modal.id);
}

/** Bind the listeners every page shares. Call once, from app.js. */
export function bindEvents() {
  document.addEventListener('keydown', onDocumentKeydown);
  document.addEventListener('click', onModalClick);
}
