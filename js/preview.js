/**
 * The live preview, and the warnings measured off it.
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
import { warningsFor } from './warnings.js';
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

/** The C1.3 object the editor draws with. Never `mode: 'award'`. */
export function previewProvenance() {
  return {
    origin: 'community',
    issuerHandle: state.session.handle || PLACEHOLDER_HANDLE,
    serial: '',
    verifyUrl: PLACEHOLDER_VERIFY,
    holder: '',
    issuedAt: null,
    expiresAt: null,
    mode: 'preview',
  };
}

let fontsWatched = false;

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
    svg = renderSvg(d, previewProvenance());
  } catch (err) {
    // renderSvg throws only on a provenance that fails C1.3, which is this
    // page's own bug rather than the author's. Say so rather than showing an
    // empty frame.
    console.error('Enamel: the renderer refused this preview', err);
    host.replaceChildren();
    if (warnHost) {
      warnHost.innerHTML = warnHtml([{
        level: 'error',
        title: 'The renderer refused to draw this',
        body: String(err && err.message ? err.message : err),
      }]);
    }
    return;
  }

  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.setAttribute('class', 'preview-svg');
  host.replaceChildren(svg);

  if (warnHost) warnHost.innerHTML = warnHtml(warningsFor(d, host));

  if (!fontsWatched && document.fonts && document.fonts.ready) {
    fontsWatched = true;
    document.fonts.ready.then(() => {
      if (warnHost) warnHost.innerHTML = warnHtml(warningsFor(design(), host));
    }).catch(() => { /* a font that never resolves leaves the first pass standing */ });
  }
}

const LEVEL_LABEL = { error: 'Refused', warn: 'Warning', note: 'Worth a look' };

function warnHtml(list) {
  if (!list.length) return '';
  return list.map((w) => `<div class="warn warn--${escHtml(w.level)}">
    <span class="warn__tag">${escHtml(LEVEL_LABEL[w.level] || w.level)}</span>
    <div><strong>${escHtml(w.title)}</strong><p>${escHtml(w.body)}</p></div>
  </div>`).join('');
}

/** Link the on-screen faces once. The export inlines its own subset (C6.2). */
export function startFonts() {
  ensureFonts();
}
