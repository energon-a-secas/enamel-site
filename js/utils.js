// ── Shared utilities ─────────────────────────────────────────
// Small helper functions used across multiple modules.
//
// The generic half is not written here. C15 A53: `escHtml`, `debounce`,
// `copyText` and the toast body come from the Neorgon DOM Kit,
// `js/neorgon-dom.js`, vendored by `packages/neorgon-ui/sync-dom.sh` and never
// edited in place. This file wrote its own `escHtml` for one week and it
// escaped four characters where the kit's escapes five: no `'`, and this site
// interpolates into attributes in `editor.js`, `render.js` and `links.js`.
//
// Call sites import `escHtml` from the kit directly rather than through here,
// so there is one name for it and no chance of a second body appearing under
// the old one.

import { escHtml, showToast as neoShowToast } from './neorgon-dom.js';
import { formatDate } from './insignia/certificate.js';

export { copyText } from './neorgon-dom.js';

/**
 * Cached element lookup by ID, re-resolved when the cached node has left the
 * document.
 *
 * This is **not** Sash's `$`, which caches permanently, and the difference is
 * deliberate rather than drift (A53 flagged the pair). The editor rebuilds
 * whole panels with `innerHTML`, so a node cached before a repaint is detached
 * and writing to it paints nothing. Sash only ever fills a shell it never
 * replaces, so it has no such node and pays nothing for the check.
 */
const _els = {};
export function $(id) {
  const hit = _els[id];
  if (hit && hit.isConnected) return hit;
  const found = document.getElementById(id);
  if (found) _els[id] = found;
  return found;
}

// There is no `el` here on purpose. A53 counted seven copies of it and six were
// in Sash, which is where the shared one now lives. This site has exactly one,
// in `js/frame.js`, and that file keeps it for the reason written inside it.
// Adding a second here for symmetry would be a dead export, which is how the
// eleventh `escHtml` got written.

/**
 * A temporary toast: the kit's, with this site's dwell time.
 *
 * 2600ms rather than the kit's 2000 because several of these messages are a
 * full sentence ("A template keeps the kind it was made as, so this is a new
 * design."). The class and id names are the kit's defaults and match
 * `css/style.css`. The kit sets `aria-live` as well as `role`, which the copy
 * this replaced did not.
 */
export function showToast(msg) {
  return neoShowToast(msg, { duration: 2600 });
}

/** A structural clone that works on a plain design document. */
export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** Read a dotted path out of an object. Returns undefined for a broken path. */
export function getPath(obj, path) {
  return String(path).split('.').reduce((acc, key) => (acc === null || acc === undefined ? acc : acc[key]), obj);
}

/**
 * Write a dotted path into an object, creating plain objects on the way.
 * It refuses to walk through a null, because in a C1 design a null is a real
 * value ("this element is off") and quietly replacing it with an object would
 * turn a switched-off ribbon back on as a side effect of typing in it.
 */
export function setPath(obj, path, value) {
  const keys = String(path).split('.');
  let node = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (node[keys[i]] === null || node[keys[i]] === undefined) return false;
    node = node[keys[i]];
  }
  node[keys[keys.length - 1]] = value;
  return true;
}

/** One query parameter, trimmed, or an empty string. */
export function param(name) {
  return (new URLSearchParams(location.search).get(name) || '').trim();
}

/* ── dates and durations, one of each (C15 A54) ─────────────────────────────
   One award's dates used to render four ways across four pages of one product.
   The kit's `formatDate` is the one formatter now, and everything below is a
   thin adapter onto it. This site holds epoch ms and the kit takes an ISO
   string, which is the whole reason the adapter exists.

   `formatDate` reads the ISO string rather than converting to local time, so an
   issuer in Santiago and the badge they minted agree about the day. That is the
   trade: what a reader sees is the date drawn onto the artefact (C1.6), not the
   date in their own zone. `Sep 9, 2026` is gone; it is `9 September 2026` on
   every page of both sites. */

/** Epoch ms or an ISO string, as an ISO string. Empty for anything unusable. */
function isoOf(value) {
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : '';
}

/** A date: `9 September 2026`. Empty for absent. */
export function fmtDate(value) {
  const iso = isoOf(value);
  return iso ? formatDate(iso) : '';
}

/**
 * A date and a UTC time: `9 September 2026 at 21:06 UTC`.
 *
 * For the things that can happen later today rather than one day: when a claim
 * link stops working, and when a version or an award was made. The zone is
 * named because it is not the reader's. Byte-identical to Sash's `stamp`, which
 * is what a claimant reads at the other end of the same link.
 */
export function stamp(value) {
  const iso = isoOf(value);
  return iso ? `${formatDate(iso)} at ${iso.slice(11, 16)} UTC` : '';
}

const MINUTE = 60000, HOUR = 3600000, DAY = 86400000;

/**
 * A duration in the words a person uses for it. Never a rounded-up zero.
 *
 * A54. This replaced `describeValidity`, which agreed with Sash's `humanMs`
 * only over the four fixed values the editor offers: it rendered anything under
 * twelve hours as **"0 years"** and half a day as "1 days". The two sites are
 * the two halves of one transaction, an issuer setting a validity and a
 * claimant reading it, so the body is byte-identical to
 * `sash-site/js/utils.js`. Two copies, because the two sites share no source
 * that is ours to edit; the kit is closed and `js/insignia/` is vendored. There
 * is no `--check` on this pair, which is the same recorded drift A53 noted for
 * `js/frame.js`. Change one, change both.
 */
export function humanMs(ms) {
  if (ms < MINUTE) return 'less than a minute';
  if (ms < HOUR) { const n = Math.round(ms / MINUTE); return `${n} minute${n === 1 ? '' : 's'}`; }
  if (ms < DAY) { const n = Math.round(ms / HOUR); return `${n} hour${n === 1 ? '' : 's'}`; }
  const days = Math.round(ms / DAY);
  if (days % 365 === 0) { const y = days / 365; return `${y} year${y === 1 ? '' : 's'}`; }
  return `${days} day${days === 1 ? '' : 's'}`;
}

/** "in 6 days" / "3 hours ago", for an expiry an issuer is scanning. */
export function fmtWhen(ms, now = Date.now()) {
  if (!Number.isFinite(ms)) return '';
  const diff = ms - now;
  const abs = Math.abs(diff);
  const units = [['day', 86400000], ['hour', 3600000], ['minute', 60000]];
  for (const [unit, size] of units) {
    if (abs >= size || unit === 'minute') {
      const n = Math.round(abs / size);
      const label = `${n} ${unit}${n === 1 ? '' : 's'}`;
      return diff >= 0 ? `in ${label}` : `${label} ago`;
    }
  }
  return '';
}

/** Days from now as epoch ms, for the claim link expiry control. */
export function daysFromNow(days) {
  return Date.now() + Math.round(Number(days) * 86400000);
}

/** Split a comma or newline separated list into trimmed, non-empty parts. */
export function splitList(value) {
  return String(value || '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
}

/** An <option>, marked selected when it matches. */
export function opt(value, current, label) {
  const sel = String(value) === String(current) ? ' selected' : '';
  return `<option value="${escHtml(value)}"${sel}>${escHtml(label === undefined ? value : label)}</option>`;
}
