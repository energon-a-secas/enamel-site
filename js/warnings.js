/**
 * Authoring-time warnings for the ways a design looks right here and then
 * loses something on export. Each was found by measuring rather than by
 * looking, and each warns rather than blocks: an author may want any of them.
 *
 *   A27  arc text can leave the silhouette. A badge exports on a transparent
 *        ground, so text outside the shape does not look wrong in the editor and
 *        then disappears on a light page. The arc radius does not know what
 *        shape it is drawn on. D1 measured its own presets with isPointInFill
 *        over 42 sample points per arc and found one at 42 of 42 outside.
 *   A34.1 the provenance strip's text is a fixed light colour and its plate
 *        takes the author's `palette.ink`, so a light ink is a pale line on a
 *        pale plate. The strip is the control C11.1 requires to be legible.
 *   U3   an arc longer than its path is cut. The 48 in C1.1 is a string cap and
 *        `arcOutside` only samples the path that exists, so a 48-character top
 *        arc at size 40 drew as a fragment with nothing said. Every engine drops
 *        the glyphs that fall off both ends of the path, so what survives is the
 *        middle of the line, and the warning quotes it. D2: measured on the path,
 *        Firefox and WebKit report the run that fits, so it is measured off it.
 *   V10  arc and ribbon words can sit on a ground they do not read against.
 *        Meme palettes put pale words on pale bases and nothing measured it.
 *
 * Nothing here draws and nothing here repairs. Each warning carries a `kind`
 * and the numbers it was measured from; `fixes.js` turns those into the button
 * a warning offers. The measurements read the preview the renderer already
 * produced, so what is measured is what is drawn.
 */
import { validateDesign, SHAPE_IDS } from './insignia/schema.js';
import { SHAPES } from './insignia/shapes.js';
import { materialStops } from './insignia/finish.js';
import { isLightBase, stampCentre, stampGeometry } from './insignia/security.js';

const NS = 'http://www.w3.org/2000/svg';
const FIELD = 512;
const CX = FIELD / 2;
const CY = FIELD / 2;
const R = 236;
const ARC_MARGIN = 24;
const BOTTOM_ARC_R = 174;
/** D1's sample count, kept the same so a measurement here means what its did. */
export const ARC_SAMPLES = 42;
/**
 * Two thresholds rather than one, because a single one is either noise or
 * silence. WCAG AA for normal text is 4.5:1 and for large text 3:1, and these
 * lines sit between the two definitions: 20 units on a 512 badge is large,
 * 26 units on a 1684 certificate is not. So under 3:1 is a warning, and between
 * 3:1 and 4.5:1 is worth a look. The first twelve badge presets run 13.8:1 to
 * 16.8:1 and the four added in round 2 clear 4.5:1 (judged 2026-09-22);
 * the one certificate in the middle band is the light-ground one, 4.4:1, by design.
 */
export const MIN_STRIP_CONTRAST = 4.5;
export const BAD_STRIP_CONTRAST = 3;
const gradeFor = (ratio) => (ratio < BAD_STRIP_CONTRAST ? 'warn' : 'note');

/* ── colour ────────────────────────────────────────────────────────────────── */

function rgb(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return [0, 0, 0];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/** Channels back to `#rrggbb`. */
export function hexOf(channels) {
  return `#${channels.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('')}`;
}

/** `over` laid on `under` at `alpha`, as an opaque colour. */
function composite(over, under, alpha) {
  const a = rgb(over);
  const b = rgb(under);
  return a.map((channel, i) => channel * alpha + b[i] * (1 - alpha));
}

function luminance(channels) {
  const lin = channels.map((c) => c / 255).map((s) => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** WCAG contrast ratio between two already-composited colours. */
export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The same ratio, for two hex colours. */
export function hexContrast(a, b) {
  return contrast(rgb(a), rgb(b));
}

/**
 * Which way a colour has to move to read against `ground`: `darker` on a light
 * ground, `lighter` on a dark one. Black and white are the two ends of the
 * lightness axis, so whichever reads better is the direction with headroom.
 */
export function towardsContrast(ground) {
  return hexContrast(ground, '#000000') >= hexContrast(ground, '#ffffff') ? 'darker' : 'lighter';
}

// The body a metal badge draws its arcs on is the material paint, not
// `palette.base`: six stops from finish.js, the body colour at the half. Read
// from the kit rather than mirrored, so a repainted metal cannot leave this
// check measuring a colour nothing draws.
/** The colour a badge's arcs sit on: the material's body stop, else the base. */
export function groundHex(badge) {
  const stops = materialStops(badge.palette.metal);
  return stops ? stops.find(([offset]) => offset === 0.5)[1] : badge.palette.base;
}

/* ── the shape probe ───────────────────────────────────────────────────────── */

let probe = null;

/** The hidden 0 by 0 `<svg>` every measurement runs in: a path for the silhouette, a text for the advance. */
function ensureProbe() {
  if (probe) return probe;
  const svg = document.createElementNS(NS, 'svg');
  for (const [name, value] of [['width', '0'], ['height', '0'], ['aria-hidden', 'true']]) svg.setAttribute(name, value);
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  const path = document.createElementNS(NS, 'path');
  const text = document.createElementNS(NS, 'text');
  svg.append(path, text);
  document.body.appendChild(svg);
  probe = { svg, path, text };
  return probe;
}

function probeFor(shapeId) {
  const shape = SHAPES[shapeId];
  if (!shape) return null;
  ensureProbe().path.setAttribute('d', shape.d);
  return probe;
}

function inFill(target, x, y) {
  try {
    return target.path.isPointInFill(new DOMPoint(x, y));
  } catch {
    try { // Older engines want an SVGPoint from the owning document.
      const p = target.svg.createSVGPoint();
      p.x = x;
      p.y = y;
      return target.path.isPointInFill(p);
    } catch { return true; } // Cannot measure: say nothing rather than cry wolf.
  }
}

/* ── the arc geometry the renderer uses ────────────────────────────────────── */

/** The radius `drawArc` gives an arc of this size on this side. */
export function arcRadius(side, fontSize) {
  return side === 'top' ? R - ARC_MARGIN - fontSize * 0.72 : BOTTOM_ARC_R;
}

/** The length of the semicircle an arc of this size runs along. */
export function arcPathLength(side, fontSize) {
  return Math.PI * Math.max(0, arcRadius(side, fontSize));
}

/* ── A27: does the arc stay on the silhouette ──────────────────────────────── */

/**
 * How many of the sample points along one arc's baseline fall outside the
 * shape. `length` is the drawn advance in the 512 field, measured off the
 * rendered text rather than modelled, because letter-spacing and the loaded
 * face both change it.
 */
export function arcOutside(shapeId, side, fontSize, length) {
  const target = probeFor(shapeId);
  if (!target || !(length > 0)) return 0;
  const r = arcRadius(side, fontSize);
  if (!(r > 0)) return ARC_SAMPLES;
  const half = Math.min(0.5, length / (2 * Math.PI * r));
  let outside = 0;
  for (let i = 0; i < ARC_SAMPLES; i++) {
    const t = 0.5 - half + (2 * half * i) / (ARC_SAMPLES - 1);
    const x = CX - r * Math.cos(Math.PI * t);
    const y = side === 'top' ? CY - r * Math.sin(Math.PI * t) : CY + r * Math.sin(Math.PI * t);
    if (!inFill(target, x, y)) outside++;
  }
  return outside;
}

/** The preview's `<text>` for one arc, or null when that arc is not drawn. */
function arcText(root, side) {
  if (!root) return null;
  const tp = Array.from(root.querySelectorAll('textPath')).find((t) => (t.getAttribute('href') || '').includes(side === 'top' ? 'arctop' : 'arcbot'));
  return tp ? tp.parentNode : null;
}

/**
 * The natural advance of an arc's line: the preview's `<text>` copied onto the
 * probe, where it sits on no path. On a `<textPath>` Chromium reports the whole
 * line but Firefox and WebKit report only the run that fits, never more than the
 * path, so a cut line measured there never looked cut (D2). The four attributes
 * are the ones `drawArc` sets, so the copy resolves the face the preview did.
 */
function naturalAdvance(text) {
  const copy = ensureProbe().text;
  for (const name of ['font-family', 'font-size', 'font-weight', 'letter-spacing']) {
    const value = text.getAttribute(name);
    if (value === null) copy.removeAttribute(name); else copy.setAttribute(name, value);
  }
  copy.textContent = text.textContent;
  let length = 0;
  try { length = copy.getComputedTextLength(); } catch { length = 0; }
  copy.textContent = '';
  return length;
}

/**
 * The advance of each arc's line, `{ top, bottom }` in 512-field units, with 0
 * for an arc that has no text. Measured off the preview the renderer produced,
 * modelled when the engine will not measure.
 */
export function measureArcs(root, badge) {
  const out = { top: 0, bottom: 0 };
  for (const side of ['top', 'bottom']) {
    const arc = badge?.arcs?.[side];
    if (!arc || !arc.text) continue;
    const text = arcText(root, side);
    const length = text ? naturalAdvance(text) : 0;
    // 0.62 em: the middle of the six roles' average advance. Only when nothing measures, only to warn.
    out[side] = length > 0 ? length : arc.text.length * arc.size * 0.62 + arc.tracking * Math.max(0, arc.text.length - 1);
  }
  return out;
}

/* ── U3: is the arc longer than its path ───────────────────────────────────── */

/**
 * The part of an arc's words the engine draws when the line overruns its path,
 * or null when the whole line fits. `length` is the line's natural advance; the
 * path is the renderer's own semicircle, read off the preview where the engine
 * reports it and modelled from the same formula where it does not. The survivor
 * is read per glyph where that is a read: Chromium gives a glyph off the path
 * no extent, but Firefox gives every glyph one and WebKit counts fewer glyphs
 * than the line has, so those keep the middle of the line in proportion, which
 * is what all three engines draw.
 */
export function arcCut(root, arc, side, length) {
  if (!arc || !arc.text || !(length > 0)) return null;
  const text = arcText(root, side);
  let pathLength = arcPathLength(side, arc.size);
  try {
    const href = text?.firstElementChild?.getAttribute('href');
    const pathEl = href && root.querySelector(href);
    if (pathEl && typeof pathEl.getTotalLength === 'function') pathLength = pathEl.getTotalLength();
  } catch { /* the model stands */ }
  if (!(length > pathLength + 0.5)) return null;

  // The line as the engine addresses it: runs of spaces collapse and the ends are trimmed.
  const words = String(arc.text).replace(/\s+/g, ' ').trim();
  let survivor = '';
  try {
    if (text.getNumberOfChars() === words.length) {
      for (let i = 0; i < words.length; i++) if (text.getExtentOfChar(i).width > 0) survivor += words[i];
    }
  } catch { survivor = ''; }
  if (!survivor.trim() || survivor.length === words.length) {
    const keep = Math.max(1, Math.floor(words.length * (pathLength / length)));
    const from = Math.floor((words.length - keep) / 2);
    survivor = words.slice(from, from + keep);
  }
  return { length, pathLength, survivor: survivor.trim() };
}

/* ── the warning list ──────────────────────────────────────────────────────── */

const SHAPE_NAME = (id) => (SHAPE_IDS.includes(id) ? id.replace(/-/g, ' ') : 'shape');

/** What every arc warning carries for its fix: the size to shrink from and the measured advance. */
function arcFacts(badge, side, target, length) {
  const arc = badge.arcs[side];
  return { target, side, size: arc.size, tracking: arc.tracking, chars: String(arc.text).length, length, shape: badge.shape };
}

function cutWarnings(badge, lengths, root, target, where) {
  const out = [];
  for (const side of ['top', 'bottom']) {
    const arc = badge.arcs[side];
    const cut = arcCut(root, arc, side, lengths[side]);
    if (!cut) continue;
    out.push({
      kind: 'arc-cut', level: 'warn', ...arcFacts(badge, side, target, lengths[side]),
      title: `The ${side} line is cut to "${cut.survivor}"${where}`,
      body: `Those words run ${cut.length.toFixed(0)} units along an arc ${cut.pathLength.toFixed(0)} units long, `
        + 'so the glyphs that fall off either end of the path are not drawn at all, here or in the export. '
        + 'Nobody reads the rest. Drop the size, or put the words on the ribbon, which takes up to 24 characters.',
    });
  }
  return out;
}

function arcWarnings(badge, lengths, target, where) {
  const out = [];
  for (const side of ['top', 'bottom']) {
    const arc = badge.arcs[side];
    if (!arc || !arc.text) continue;
    const outside = arcOutside(badge.shape, side, arc.size, lengths[side]);
    if (!outside) continue;
    const all = outside === ARC_SAMPLES;
    out.push({
      kind: 'arc-off', level: all ? 'warn' : 'note', ...arcFacts(badge, side, target, lengths[side]),
      title: all
        ? `The ${side} arc sits off the ${SHAPE_NAME(badge.shape)}${where}`
        : `The ${side} arc runs past the ${SHAPE_NAME(badge.shape)}${where}`,
      body: `${outside} of ${ARC_SAMPLES} sample points along that line fall outside the silhouette. `
        + 'A badge exports on a transparent ground, so whatever is outside the shape disappears on a light page. '
        + 'Shorten it, drop the size, or put the words on a ribbon, which draws its own plate.',
    });
  }
  return out;
}

/* ── the ribbon and the bottom arc share the foot ──────────────────────────── */

// The renderer's bands in the 512 field: the ribbon plate runs 336 to 394 and
// the bottom arc's baseline sits at 430 on radius 174, so the arc's ends climb
// to 369 and a line long enough puts its glyphs under the plate. C15 A26 found
// the contract's own example doing it and took the ribbon out of the example;
// the 2026-09-10 verification found the editor letting an author do the same
// with nothing said. The plate is drawn after the arc, so the plate wins.
const RIBBON_TOP = 336;
const RIBBON_BOTTOM = 394;

/** The modelled reach of a bottom arc of `size` and drawn `length` into the ribbon band. */
export function modelOverlap(size, length) {
  const half = Math.min(0.5, (length || 0) / (2 * Math.PI * BOTTOM_ARC_R));
  const endY = CY + BOTTOM_ARC_R * Math.cos(Math.PI * half);
  const top = endY - size * 0.75;
  return Math.max(0, Math.min(endY, RIBBON_BOTTOM) - Math.max(top, RIBBON_TOP));
}

/**
 * How far, in field units, the drawn bottom arc reaches into the ribbon band.
 * Read off the preview's own text node where the engine will measure, so the
 * loaded face and the tracking are what is measured; modelled from the arc
 * geometry when it will not.
 */
export function arcUnderRibbon(root, arc, length) {
  const text = arcText(root, 'bottom');
  if (text) {
    try {
      const box = text.getBBox();
      if (box && box.height > 0) {
        return Math.max(0, Math.min(box.y + box.height, RIBBON_BOTTOM) - Math.max(box.y, RIBBON_TOP));
      }
    } catch { /* fall through to the model */ }
  }
  return modelOverlap(arc.size, length);
}

function ribbonWarning(badge, lengths, root, target, where) {
  const arc = badge.arcs.bottom;
  if (!badge.ribbon || !arc || !arc.text) return null;
  const overlap = arcUnderRibbon(root, arc, lengths.bottom);
  if (!(overlap > 0)) return null;
  return {
    kind: 'ribbon-overlap', level: 'warn', ...arcFacts(badge, 'bottom', target, lengths.bottom),
    title: `The ribbon covers the bottom arc${where}`,
    body: `The ribbon draws its plate from ${RIBBON_TOP} to ${RIBBON_BOTTOM} on the 512 field and the bottom arc `
      + `reaches ${overlap.toFixed(0)} units up into it, so the plate hides the top of those words. `
      + 'Shorten the arc, drop its size, or put the words on the ribbon and switch the arc off.',
  };
}

/* ── V10: do the words read against what they sit on ──────────────────────── */

function textContrastWarnings(badge, target, where) {
  const out = [];
  const ground = groundHex(badge);
  for (const side of ['top', 'bottom']) {
    const arc = badge.arcs[side];
    if (!arc || !arc.text) continue;
    const ratio = hexContrast(arc.color, ground);
    if (ratio >= MIN_STRIP_CONTRAST) continue;
    out.push({
      kind: 'arc-contrast', level: gradeFor(ratio), target, side, colorPath: `arcs.${side}.color`, ground, ratio,
      title: `The ${side} arc is hard to read on the ${badge.palette.metal === 'none' ? 'base' : badge.palette.metal}${where}`,
      body: `Its words and the ground under them sit at ${ratio.toFixed(1)} to 1. `
        + 'Below 4.5 to 1 a small line goes soft on a phone and on a projector; below 3 to 1 it goes missing.',
    });
  }
  if (badge.ribbon && badge.ribbon.text) {
    const ratio = hexContrast(badge.ribbon.textColor, badge.ribbon.color);
    if (ratio < MIN_STRIP_CONTRAST) {
      out.push({
        kind: 'ribbon-contrast', level: gradeFor(ratio), target, colorPath: 'ribbon.textColor', ground: badge.ribbon.color, ratio,
        title: `The ribbon's words are hard to read on its band${where}`,
        body: `The words and the band sit at ${ratio.toFixed(1)} to 1. The ribbon draws its own plate, `
          + 'so this is the one line on the badge whose ground you chose outright.',
      });
    }
  }
  return out;
}

/* ── A34.1: the strip and the band ─────────────────────────────────────────── */

/** The strip's contrast for a badge, as the renderer composites it today. */
export function stripRatio(badge) {
  const plate = composite(badge.palette.ink, badge.palette.base, 0.92);
  const line = composite('#e7e9ff', hexOf(plate), 0.92);
  return contrast(line, plate);
}

function stripWarning(badge) {
  const ratio = stripRatio(badge);
  if (ratio >= MIN_STRIP_CONTRAST) return null;
  return {
    kind: 'strip-contrast', level: gradeFor(ratio), target: 'badge', ratio,
    title: 'The provenance strip is hard to read',
    body: `Its text is a fixed light colour and its plate takes your ink, which puts them at `
      + `${ratio.toFixed(1)} to 1. That strip carries the origin, your handle and the address a reader `
      + 'types back in, so it is the one part of the badge that has to stay legible. A darker ink fixes it.',
  };
}

/** The certificate band's worst slot: `{ slot, ratio, plate }`, the plate as hex. */
export function bandWorst(cert) {
  // The paper grain (security.js) lies under the band's plate: at `strength` it
  // moves the ground about strength times 128 levels, toward white on a dark
  // base and toward the ink on a light one, before the plate's ten percent ink.
  const grain = cert.background.grain || 0;
  const ground = grain
    ? hexOf(composite(isLightBase(cert.palette.base) ? cert.palette.ink : '#ffffff', cert.palette.base, grain * 0.5))
    : cert.palette.base;
  const plate = hexOf(composite(cert.palette.ink, ground, 0.1));
  return [['eyebrow', cert.text.eyebrow.color], ['body', cert.text.body.color]]
    .map(([slot, colour]) => ({ slot, ratio: hexContrast(colour, plate), plate }))
    .sort((a, b) => a.ratio - b.ratio)[0];
}

function bandWarning(cert) {
  const worst = bandWorst(cert);
  if (!worst || worst.ratio >= MIN_STRIP_CONTRAST) return null;
  return {
    kind: 'band-contrast', level: gradeFor(worst.ratio), target: 'badge', slot: worst.slot, ground: worst.plate, ratio: worst.ratio,
    title: 'The provenance band is hard to read',
    body: `The band draws in the ${worst.slot} colour on a plate mixed from your base and your ink, `
      + `which puts them at ${worst.ratio.toFixed(1)} to 1. That band carries the origin, your handle `
      + 'and the verify address into the print, so it has to stay legible.',
  };
}

/** The stamp and the seal on one spot. Both are round, so it is a distance test on the kit's own placement. */
function stampWarning(cert) {
  if (!cert.stamp.show || !cert.seal.design) return null;
  const { cx, cy } = stampCentre(cert);
  const sx = cert.seal.x * cert.size.w;
  const sy = cert.seal.y * cert.size.h;
  const gap = Math.hypot(cx - sx, cy - sy) - stampGeometry(cert.stamp.size).outer - cert.seal.size / 2;
  if (gap >= 0) return null;
  return {
    kind: 'stamp-seal', level: 'warn', target: 'badge', overlap: Math.round(-gap),
    title: 'The stamp sits on the seal',
    body: `The two overlap by ${Math.round(-gap)} units, so one covers part of the other. `
      + 'Move the stamp across or down, or the seal, until they clear. The band holds the stamp above itself, so a stamp pushed low stops there.',
  };
}

/* ── the list ──────────────────────────────────────────────────────────────── */

/** Every warning one badge document raises, `target` naming which document it is. */
function badgeWarnings(badge, root, target, where) {
  const lengths = measureArcs(root, badge);
  const out = [];
  out.push(...cutWarnings(badge, lengths, root, target, where));
  out.push(...arcWarnings(badge, lengths, target, where));
  const ribbon = ribbonWarning(badge, lengths, root, target, where);
  if (ribbon) out.push(ribbon);
  out.push(...textContrastWarnings(badge, target, where));
  return out;
}

/**
 * Every warning for a design, in the order they should be shown.
 * `root` is the element the preview was rendered into.
 */
export function warningsFor(design, root) {
  const out = [];
  for (const problem of validateDesign(design)) {
    out.push({ kind: 'refused', level: 'error', target: 'badge', title: 'Sash will refuse this design', body: problem });
  }

  if (design.kind === 'badge') {
    out.push(...badgeWarnings(design, root, 'badge', ''));
    const strip = stripWarning(design);
    if (strip) out.push(strip);
  } else {
    if (design.seal.design) out.push(...badgeWarnings(design.seal.design, root, 'seal', ' on the seal'));
    const band = bandWarning(design);
    if (band) out.push(band);
    const stamp = stampWarning(design);
    if (stamp) out.push(stamp);
  }
  return out;
}
