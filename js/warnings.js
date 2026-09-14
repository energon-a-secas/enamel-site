/**
 * Authoring-time warnings for the two ways a design looks right here and then
 * loses something on export. Both are amendments in CONTRACTS.md C15, both were
 * found by measuring rather than by looking, and both warn rather than block:
 * an author may want either of them on a dark ground.
 *
 *   A27  arc text can leave the silhouette. A badge exports on a transparent
 *        ground, so text outside the shape does not look wrong in the editor and
 *        then disappears on a light page. The arc radius does not know what
 *        shape it is drawn on. D1 measured its own presets with isPointInFill
 *        over 42 sample points per arc and found one at 42 of 42 outside.
 *   A34.1 the provenance strip's text is a fixed light colour and its plate
 *        takes the author's `palette.ink`, so a light ink is a pale line on a
 *        pale plate. The strip is the control C11.1 requires to be legible.
 *
 * Nothing here draws. It reads the design, and it measures the arcs off the
 * preview the renderer already produced, so what is measured is what is drawn.
 */
import { validateDesign, SHAPE_IDS } from './insignia/schema.js';
import { SHAPES } from './insignia/shapes.js';

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
 * 3:1 and 4.5:1 is worth a look. The twelve badge presets run 13.8:1 to 16.8:1
 * and the one certificate that lands in the middle band is the light-ground one,
 * at 4.4:1, which is a deliberate design rather than a mistake.
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

/** `over` laid on `under` at `alpha`, as an opaque colour. */
function composite(over, under, alpha) {
  const a = rgb(over);
  const b = rgb(under);
  return a.map((channel, i) => channel * alpha + b[i] * (1 - alpha));
}

function luminance(channels) {
  const lin = channels.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** WCAG contrast ratio between two already-composited colours. */
export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/* ── the shape probe ───────────────────────────────────────────────────────── */

let probe = null;

function probeFor(shapeId) {
  const shape = SHAPES[shapeId];
  if (!shape) return null;
  if (!probe) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    const path = document.createElementNS(NS, 'path');
    svg.appendChild(path);
    document.body.appendChild(svg);
    probe = { svg, path };
  }
  probe.path.setAttribute('d', shape.d);
  return probe;
}

function inFill(target, x, y) {
  try {
    return target.path.isPointInFill(new DOMPoint(x, y));
  } catch {
    // Older engines want an SVGPoint from the owning document.
    try {
      const p = target.svg.createSVGPoint();
      p.x = x;
      p.y = y;
      return target.path.isPointInFill(p);
    } catch {
      return true; // Cannot measure: say nothing rather than cry wolf.
    }
  }
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
  const r = side === 'top' ? R - ARC_MARGIN - fontSize * 0.72 : BOTTOM_ARC_R;
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

/**
 * The drawn advance of each arc, read off the preview the renderer produced.
 * Returns `{ top, bottom }` in 512-field units, with 0 for an arc that is not
 * drawn. Falls back to an estimate when the engine will not measure.
 */
export function measureArcs(root, badge) {
  const out = { top: 0, bottom: 0 };
  if (!root) return out;
  for (const tp of root.querySelectorAll('textPath')) {
    const href = tp.getAttribute('href') || '';
    const side = href.includes('arctop') ? 'top' : href.includes('arcbot') ? 'bottom' : null;
    if (!side || out[side]) continue;
    const text = tp.parentNode;
    let length = 0;
    try {
      length = text.getComputedTextLength();
    } catch {
      length = 0;
    }
    out[side] = length;
  }
  for (const side of ['top', 'bottom']) {
    const arc = side === 'top' ? badge?.arcs?.top : badge?.arcs?.bottom;
    if (out[side] || !arc || !arc.text) continue;
    // 0.62 em is the middle of the six roles' average advance. Only reached
    // when the engine refuses to measure, and only ever used to warn.
    out[side] = arc.text.length * arc.size * 0.62 + arc.tracking * Math.max(0, arc.text.length - 1);
  }
  return out;
}

/* ── the warning list ──────────────────────────────────────────────────────── */

const SHAPE_NAME = (id) => (SHAPE_IDS.includes(id) ? id.replace(/-/g, ' ') : 'shape');

function arcWarnings(badge, lengths, where) {
  const out = [];
  for (const side of ['top', 'bottom']) {
    const arc = side === 'top' ? badge.arcs.top : badge.arcs.bottom;
    if (!arc || !arc.text) continue;
    const outside = arcOutside(badge.shape, side, arc.size, lengths[side]);
    if (!outside) continue;
    const all = outside === ARC_SAMPLES;
    out.push({
      level: all ? 'warn' : 'note',
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

/**
 * How far, in field units, the drawn bottom arc reaches into the ribbon band.
 * Read off the preview's own text node where the engine will measure, so the
 * loaded face and the tracking are what is measured; modelled from the arc
 * geometry when it will not.
 */
export function arcUnderRibbon(root, arc, length) {
  let top = null;
  let bottom = null;
  const text = root && Array.from(root.querySelectorAll('textPath'))
    .find((tp) => (tp.getAttribute('href') || '').includes('arcbot'))?.parentNode;
  if (text) {
    try {
      const box = text.getBBox();
      if (box && box.height > 0) { top = box.y; bottom = box.y + box.height; }
    } catch { /* fall through to the model */ }
  }
  if (top === null) {
    const half = Math.min(0.5, (length || 0) / (2 * Math.PI * BOTTOM_ARC_R));
    const endY = CY + BOTTOM_ARC_R * Math.cos(Math.PI * half);
    top = endY - arc.size * 0.75;
    bottom = endY;
  }
  return Math.max(0, Math.min(bottom, RIBBON_BOTTOM) - Math.max(top, RIBBON_TOP));
}

function ribbonWarning(badge, lengths, root, where) {
  const arc = badge.arcs.bottom;
  if (!badge.ribbon || !arc || !arc.text) return null;
  const overlap = arcUnderRibbon(root, arc, lengths.bottom);
  if (!(overlap > 0)) return null;
  return {
    level: 'warn',
    title: `The ribbon covers the bottom arc${where}`,
    body: `The ribbon draws its plate from ${RIBBON_TOP} to ${RIBBON_BOTTOM} on the 512 field and the bottom arc `
      + `reaches ${overlap.toFixed(0)} units up into it, so the plate hides the top of those words. `
      + 'Shorten the arc, drop its size, or put the words on the ribbon and switch the arc off.',
  };
}

function stripWarning(badge) {
  const plate = composite(badge.palette.ink, badge.palette.base, 0.86);
  const line = composite('#e7e9ff', `#${plate.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`, 0.92);
  const ratio = contrast(line, plate);
  if (ratio >= MIN_STRIP_CONTRAST) return null;
  return {
    level: gradeFor(ratio),
    title: 'The provenance strip is hard to read',
    body: `Its text is a fixed light colour and its plate takes your ink, which puts them at `
      + `${ratio.toFixed(1)} to 1. That strip carries the origin, your handle and the address a reader `
      + 'types back in, so it is the one part of the badge that has to stay legible. A darker ink fixes it.',
  };
}

function bandWarning(cert) {
  const plate = composite(cert.palette.ink, cert.palette.base, 0.1);
  const plateHex = `#${plate.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
  const worst = [['eyebrow', cert.text.eyebrow.color], ['body', cert.text.body.color]]
    .map(([slot, colour]) => ({ slot, ratio: contrast(rgb(colour), rgb(plateHex)) }))
    .sort((a, b) => a.ratio - b.ratio)[0];
  if (!worst || worst.ratio >= MIN_STRIP_CONTRAST) return null;
  return {
    level: gradeFor(worst.ratio),
    title: 'The provenance band is hard to read',
    body: `The band draws in the ${worst.slot} colour on a plate mixed from your base and your ink, `
      + `which puts them at ${worst.ratio.toFixed(1)} to 1. That band carries the origin, your handle `
      + 'and the verify address into the print, so it has to stay legible.',
  };
}

/**
 * Every warning for a design, in the order they should be shown.
 * `root` is the element the preview was rendered into.
 */
export function warningsFor(design, root) {
  const out = [];
  for (const problem of validateDesign(design)) {
    out.push({ level: 'error', title: 'Sash will refuse this design', body: problem });
  }

  if (design.kind === 'badge') {
    const lengths = measureArcs(root, design);
    out.push(...arcWarnings(design, lengths, ''));
    const ribbon = ribbonWarning(design, lengths, root, '');
    if (ribbon) out.push(ribbon);
    const strip = stripWarning(design);
    if (strip) out.push(strip);
  } else {
    if (design.seal.design) {
      const lengths = measureArcs(root, design.seal.design);
      out.push(...arcWarnings(design.seal.design, lengths, ' on the seal'));
      const ribbon = ribbonWarning(design.seal.design, lengths, root, ' on the seal');
      if (ribbon) out.push(ribbon);
    }
    const band = bandWarning(design);
    if (band) out.push(band);
  }
  return out;
}
