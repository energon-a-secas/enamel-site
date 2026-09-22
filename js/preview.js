/**
 * The live preview, the warnings measured off it, and the row under it that
 * shows the draft at the sizes it is actually seen.
 *
 * The kit is the only drawing path on this site (C1). Nothing here builds an
 * SVG: it hands a design and a provenance object to `renderSvg` and appends what
 * comes back, which is why the editor cannot show an author something the export
 * will not produce.
 *
 * The provenance is `mode: 'preview'`, and the strip is still drawn. That is
 * deliberate and it is C11.1: an author who has never seen the strip would
 * design around a space that is not free.
 */
import { renderSvg, ensureFonts, setArtUrls } from './insignia/render.js';
import { renderAwardCard } from './insignia/wallet.js';
import { preset } from './insignia/data/presets.js';
import { warningsFor } from './warnings.js';
import { withFixes } from './fixes.js';
import { state, design } from './state.js';
import { escHtml } from './neorgon-dom.js';

const PLACEHOLDER_HANDLE = 'yourhandle';
// A certificate draws its QR only when the provenance carries a verify URL, so a
// preview with an empty one hides a square up to 400 units across and the author
// designs around space that is not free. That is the same reasoning C11.2 gives
// for drawing the strip in preview mode. The value is visibly a placeholder and
// the strip's own text still reads "preview, not yet issued": the kit builds that
// line from the mode, never from this string.
const PLACEHOLDER_VERIFY = 'https://sash.neorgon.com/badge.html?id=preview';
// The same reasoning again, for the two things a certificate draws from the
// provenance and nowhere else: the serial and the date line. With an empty
// serial and a null `issuedAt` the serial face, size and colour controls and the
// four date label controls changed nothing on screen, so an author could not
// judge what they had picked. The serial is the shape of a real one (C4.1) and
// is the placeholder the admin field on templates.html already shows; the date
// is today, so "issued 14 September 2026" reads as what an award made now would
// carry. In preview mode the strip still says "preview, not yet issued": the kit
// builds that line from the mode, never from these values.
const PLACEHOLDER_SERIAL = 'ab12cd34ef';

/** Today, as the ISO UTC instant C1.3 wants, at the start of the day. */
function todayIso() {
  return `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
}

/** The C1.3 object the editor draws with. Never `mode: 'award'`. */
export function previewProvenance() {
  return {
    origin: 'community',
    issuerHandle: state.session.handle || PLACEHOLDER_HANDLE,
    serial: PLACEHOLDER_SERIAL,
    verifyUrl: PLACEHOLDER_VERIFY,
    holder: '',
    issuedAt: todayIso(),
    expiresAt: null,
    mode: 'preview',
  };
}

/**
 * The provenance for the draft on screen: the preview object plus the expiry
 * the template's own validity would give an award made today, so a certificate
 * whose awards expire shows its "valid until" line. The download controls use
 * this same object, which is what keeps the file and the preview one drawing.
 */
export function draftProvenance() {
  const prov = previewProvenance();
  const validity = Number(state.meta.defaultValidityMs);
  if (Number.isFinite(validity) && validity > 0) {
    prov.expiresAt = `${new Date(Date.now() + validity).toISOString().slice(0, 10)}T00:00:00Z`;
  }
  return prov;
}

let fontsWatched = false;
// The list the warning buttons index into. Rebuilt on every paint, so a button
// from a stale paint is never resolved against a fresher list.
let lastWarnings = [];

/**
 * Draw the design into `host` and list its warnings in `warnHost`.
 *
 * The warnings are computed after the node is in the document, because the arc
 * measurement reads the advance the browser actually drew rather than modelling
 * it. The first pass runs before the web fonts have loaded, so it repeats once
 * `document.fonts.ready` settles.
 */
export function paintPreview(host, warnHost) {
  if (!host) return;
  const d = design();
  if (state.artRef && state.artUrl) setArtUrls({ [state.artRef]: state.artUrl });

  let svg;
  try {
    svg = renderSvg(d, draftProvenance());
  } catch (err) {
    // renderSvg throws only on a provenance that fails C1.3, which is this
    // page's own bug rather than the author's. Say so rather than showing an
    // empty frame.
    console.error('Enamel: the renderer refused this preview', err);
    host.replaceChildren();
    paintWarnings(warnHost, [{
      kind: 'refused', level: 'error',
      title: 'The renderer refused to draw this',
      body: String(err && err.message ? err.message : err),
    }]);
    return;
  }

  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.setAttribute('class', 'preview-svg');
  host.replaceChildren(svg);

  paintWarnings(warnHost, warningsFor(d, host));

  if (!fontsWatched && document.fonts && document.fonts.ready) {
    fontsWatched = true;
    document.fonts.ready.then(() => {
      paintWarnings(warnHost, warningsFor(design(), host));
    }).catch(() => { /* a font that never resolves leaves the first pass standing */ });
  }
}

/* ── warnings, each with the button that repairs it (U3) ───────────────────── */

const LEVEL_LABEL = { error: 'Refused', warn: 'Warning', note: 'Worth a look' };

function paintWarnings(warnHost, list) {
  if (!warnHost) return;
  lastWarnings = withFixes(list);
  warnHost.innerHTML = warnHtml(lastWarnings);
}

function warnHtml(list) {
  if (!list.length) return '';
  return list.map((w, i) => `<div class="warn warn--${escHtml(w.level)}">
    <span class="warn__tag">${escHtml(LEVEL_LABEL[w.level] || w.level)}</span>
    <div class="warn__body"><strong>${escHtml(w.title)}</strong><p>${escHtml(w.body)}</p>
      ${w.fixes && w.fixes.length ? `<div class="warn__fixes">${w.fixes.map((f, j) => `<button type="button" class="btn btn--secondary btn--sm warn__fix" data-fix="${i}:${j}">${escHtml(f.label)}</button>`).join('')}</div>` : ''}
    </div>
  </div>`).join('');
}

/** The fix a warning button names, from its `data-fix="i:j"`, or null. */
export function fixAt(key) {
  const [i, j] = String(key || '').split(':').map(Number);
  return lastWarnings[i]?.fixes?.[j] || null;
}

/* ── where it will live (U6) ───────────────────────────────────────────────── */

/**
 * The draft as the C2 PublicAward shape a wall renders, so the card under the
 * preview is drawn by the same `renderAwardCard` the wallet uses. The name and
 * the handle beside the badge are the first time an author sees them together,
 * which is the picture that says "done".
 */
function previewAward(d, prov) {
  const from = state.presetId ? preset(state.presetId) : null;
  const name = state.meta.name.trim()
    || (from && from.kind === d.kind ? from.name : '')
    || (d.kind === 'badge' ? 'Untitled badge' : 'Untitled certificate');
  return {
    origin: prov.origin, issuerHandle: prov.issuerHandle, publicId: prov.serial, verifyUrl: prov.verifyUrl,
    holderHandle: '', issuedAt: prov.issuedAt, expiresAt: prov.expiresAt, status: 'valid', source: 'claim',
    kind: d.kind, name, design: d, artUrl: state.artUrl, count: 1,
  };
}

function contextItem(label, node, modifier = '', size = 0) {
  const item = document.createElement('figure');
  item.className = `context-item${modifier ? ` context-item--${modifier}` : ''}`;
  // The kit sets the size on the card's art; the figure repeats it so the CSS
  // can make the figure as wide as the card and line the label up under it.
  if (size) item.style.setProperty('--ins-card-size', `${size}px`);
  item.appendChild(node);
  const caption = document.createElement('figcaption');
  caption.className = 'context-item__label';
  caption.textContent = label;
  item.appendChild(caption);
  return item;
}

/** The whole SVG at `px`, never a crop (4.4): a 48 is the badge, band and all. */
function bare(d, prov, px) {
  const svg = renderSvg(d, prov);
  svg.setAttribute('width', String(px));
  svg.setAttribute('height', String(px));
  svg.setAttribute('class', 'context-bare');
  return svg;
}

function badgeContext(d, prov) {
  const award = previewAward(d, prov);
  return [
    contextItem('Wallet card, 180', renderAwardCard(award, { size: 180, linkToVerify: false }), 'card', 180),
    contextItem('Embed tile, 140', renderAwardCard(award, { size: 140, linkToVerify: false }), 'card', 140),
    contextItem('48, a tab or an avatar', bare(d, prov, 48), 'bare'),
  ];
}

/**
 * A certificate lives on a wall as a card, and on paper. The sheet is drawn at
 * the millimetre size the printer gets (C6.4, A4 in the page's orientation),
 * inside its own scroll box, opened at the corner that carries the band, so
 * the QR and the serial show at the size a hand-held reader will meet them.
 */
function certificateContext(d, prov) {
  const award = previewAward(d, prov);
  const box = document.createElement('div');
  box.className = 'context-sheet';
  const svg = renderSvg(d, prov);
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.setAttribute('class', 'context-sheet__svg');
  svg.style.width = d.orientation === 'portrait' ? '210mm' : '297mm';
  box.appendChild(svg);
  const sheet = contextItem(`A4 ${d.orientation} at print size, scroll for the rest`, box, 'sheet');
  return [
    contextItem('Wall card, 180', renderAwardCard(award, { size: 180, linkToVerify: false }), 'card', 180),
    sheet,
  ];
}

/**
 * Fill `host` with the draft at the sizes it is seen: the wallet card at 180,
 * the embed tile at 140 and a bare 48 for a badge; the wall card and the A4
 * sheet for a certificate. Runs on the same debounce as the preview.
 */
export function paintContext(host) {
  if (!host) return;
  const d = design();
  const prov = draftProvenance();
  if (state.artRef && state.artUrl) setArtUrls({ [state.artRef]: state.artUrl });
  let items;
  try {
    items = d.kind === 'badge' ? badgeContext(d, prov) : certificateContext(d, prov);
  } catch (err) {
    console.error('Enamel: the context row could not be drawn', err);
    host.replaceChildren();
    return;
  }
  host.replaceChildren(...items);
  const box = host.querySelector('.context-sheet');
  if (box) {
    box.scrollLeft = box.scrollWidth;
    box.scrollTop = box.scrollHeight;
  }
}

/* ── the loupe ─────────────────────────────────────────────────────────────── */

/**
 * The preview at twice its size inside a scroll box, because microtext at 520
 * px is a dashed hairline. Presentation only: nothing in the design changes,
 * and the width is read from the drawing on screen so 2x means twice what the
 * author was looking at, on a phone as on a desk.
 */
export function setLoupe(stage, on) {
  if (!stage) return;
  if (on) {
    const svg = stage.querySelector('.preview-svg');
    const width = svg ? svg.getBoundingClientRect().width : 520;
    stage.style.setProperty('--loupe-width', `${Math.round(Math.max(width, 160) * 2)}px`);
  }
  stage.classList.toggle('is-loupe', on);
}

/** Link the on-screen faces once. The export inlines its own subset (C6.2). */
export function startFonts() {
  ensureFonts();
}
