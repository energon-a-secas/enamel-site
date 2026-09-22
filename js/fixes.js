/**
 * The repair a warning carries (U3): one button that does what the warning's
 * prose used to ask the author to do by hand.
 *
 *   Shrink to fit        drops the arc's size until the measurement that raised
 *                        the warning clears: the whole line on its path, no
 *                        sample point off the silhouette, or nothing under the
 *                        ribbon's plate.
 *   Move to the ribbon   copies the words to `ribbon.text` and switches the arc
 *                        off. The ribbon draws its own plate, so the words stay
 *                        readable on any silhouette, and it takes 24 characters
 *                        (C1.1), so a longer line is cut at a word.
 *   Darken the ink       steps `palette.ink` down in OKLCH lightness until the
 *                        provenance strip clears 4.5:1 (A34.1).
 *   Darken or lighten    the same stepper, on the one colour a contrast warning
 *                        named, in whichever direction has headroom.
 *
 * `warnings.js` measures and describes; this file only writes fields that
 * already exist, inside their C1 ranges. A fix is applied to the design on the
 * bench and the design is then normalised and repainted like any other write,
 * so the warnings re-measure and a repair that did not clear the warning is
 * still visible.
 */
import { state, design, setDesign } from './state.js';
import { groupsFor } from './fields.js';
import {
  arcOutside, arcPathLength, modelOverlap, stripRatio, hexContrast, towardsContrast, MIN_STRIP_CONTRAST,
} from './warnings.js';

const ARC_MIN_SIZE = 8;     // C1.1's floor on arcs.*.size
const RIBBON_MAX_CHARS = 24; // C1.1's cap on ribbon.text
const L_STEP = 0.02;        // one step of OKLCH lightness; 50 of them span the axis

/* ── OKLab, for a lightness step that keeps the hue ────────────────────────── */

// Björn Ottosson's OKLab, 2020. Stepping L with a and b fixed is stepping OKLCH
// lightness with chroma and hue fixed, which is what "darker" means to an eye:
// a naive RGB scale drifts the hue of anything saturated.

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function hexToOklab(hex) {
  const h = String(hex || '').replace('#', '');
  const [r, g, b] = h.length === 6
    ? [0, 2, 4].map((i) => toLinear(parseInt(h.slice(i, i + 2), 16) / 255))
    : [0, 0, 0];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

function oklabToHex([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
  // Out of gamut is clipped per channel. A step that lands outside sRGB loses a
  // little chroma and keeps its lightness, which is the right way to be wrong.
  return `#${lin.map((c) => Math.round(Math.max(0, Math.min(1, toGamma(Math.max(0, Math.min(1, c))))) * 255)
    .toString(16).padStart(2, '0')).join('')}`;
}

/** `hex` moved one step darker or lighter in OKLCH, the hue kept. */
export function stepLightness(hex, direction) {
  const [L, a, b] = hexToOklab(hex);
  const next = direction === 'lighter' ? Math.min(1, L + L_STEP) : Math.max(0, L - L_STEP);
  return oklabToHex([next, a, b]);
}

/**
 * `hex` stepped in `direction` until it reads at `target` against `ground`,
 * or until the axis runs out. Returns the colour it stopped at either way.
 */
export function stepToContrast(hex, ground, target = MIN_STRIP_CONTRAST, direction = towardsContrast(ground)) {
  let out = hex;
  for (let i = 0; i < 60; i++) {
    if (hexContrast(out, ground) >= target) return out;
    const next = stepLightness(out, direction);
    if (next === out) return out;
    out = next;
  }
  return out;
}

/** A34.1's repair: the ink stepped darker until the strip clears 4.5:1. */
export function darkenInk(d) {
  for (let i = 0; i < 60 && stripRatio(d) < MIN_STRIP_CONTRAST; i++) {
    const next = stepLightness(d.palette.ink, 'darker');
    if (next === d.palette.ink) break;
    d.palette.ink = next;
  }
}

/* ── the arc repairs ───────────────────────────────────────────────────────── */

/** The badge document a warning is about: the design, or the seal inside a certificate. */
const badgeOf = (d, target) => (target === 'seal' ? d.seal.design : d);

/**
 * The drawn advance an arc would have at another size. Glyphs scale with the
 * size; letter-spacing does not, so the tracking is taken out, scaled back in.
 */
function lengthAt(w, size) {
  const track = w.tracking * Math.max(0, w.chars - 1);
  return (w.length - track) * (size / w.size) + track;
}

/** Drop the arc's size one unit at a time until `fits(size, length)` holds. */
function shrinkToFit(w, fits) {
  return (d) => {
    const arc = badgeOf(d, w.target)?.arcs?.[w.side];
    if (!arc) return;
    for (let size = Math.floor(arc.size); size >= ARC_MIN_SIZE; size--) {
      if (fits(size, lengthAt(w, size))) { arc.size = size; return; }
    }
    arc.size = ARC_MIN_SIZE;
  };
}

/** At most 24 characters, cut at the last space that keeps a whole word. */
export function ribbonWords(text) {
  const words = String(text || '').replace(/\s+/g, ' ').trim();
  if (words.length <= RIBBON_MAX_CHARS) return words;
  const cut = words.lastIndexOf(' ', RIBBON_MAX_CHARS);
  return (cut > 0 ? words.slice(0, cut) : words.slice(0, RIBBON_MAX_CHARS)).trim();
}

/**
 * A fresh ribbon in this badge's colours: the same object the Words group's
 * Ribbon toggle makes (`fields.js` owns it), so a ribbon made here and a ribbon
 * switched on by hand are one shape. The literal is the fallback for a form
 * that no longer declares the toggle.
 */
function newRibbon(b) {
  const toggle = groupsFor(b, state.meta).flatMap((g) => g.fields)
    .find((f) => f.type === 'toggle' && f.path === 'ribbon' && typeof f.make === 'function');
  return toggle ? toggle.make() : { text: '', color: b.palette.accent, textColor: b.palette.ink, font: 'sans', size: 24 };
}

function moveToRibbon(w) {
  return (d) => {
    const b = badgeOf(d, w.target);
    const arc = b?.arcs?.[w.side];
    if (!arc) return;
    const ribbon = b.ribbon || newRibbon(b);
    ribbon.text = ribbonWords(arc.text);
    b.ribbon = ribbon;
    b.arcs[w.side] = null;
  };
}

/** One colour on the document, stepped towards contrast against the warning's ground. */
function recolour(w, path) {
  return (d) => {
    const b = badgeOf(d, w.target);
    const keys = path.split('.');
    let node = b;
    for (let i = 0; i < keys.length - 1; i++) node = node?.[keys[i]];
    if (!node) return;
    const key = keys[keys.length - 1];
    node[key] = stepToContrast(node[key], w.ground, MIN_STRIP_CONTRAST, towardsContrast(w.ground));
  };
}

const verb = (ground) => (towardsContrast(ground) === 'darker' ? 'Darken' : 'Lighten');

/* ── the list ──────────────────────────────────────────────────────────────── */

/** The fixes one warning offers, in the order they are shown. Empty for a warning nothing can repair in one click. */
export function fixesFor(w) {
  switch (w.kind) {
    case 'arc-cut':
      return [
        { label: 'Shrink to fit', apply: shrinkToFit(w, (size, length) => length <= arcPathLength(w.side, size)) },
        { label: 'Move to the ribbon', apply: moveToRibbon(w) },
      ];
    case 'arc-off':
      return [
        { label: 'Shrink to fit', apply: shrinkToFit(w, (size, length) => arcOutside(w.shape, w.side, size, length) === 0) },
        { label: 'Move to the ribbon', apply: moveToRibbon(w) },
      ];
    case 'ribbon-overlap':
      return [{ label: 'Shrink to fit', apply: shrinkToFit(w, (size, length) => modelOverlap(size, length) === 0) }];
    case 'strip-contrast':
      return [{ label: 'Darken the ink', apply: darkenInk }];
    case 'band-contrast':
      return [{ label: `${verb(w.ground)} the ${w.slot}`, apply: recolour(w, `text.${w.slot}.color`) }];
    case 'arc-contrast':
      return [{ label: `${verb(w.ground)} the ${w.side} arc`, apply: recolour(w, w.colorPath) }];
    case 'ribbon-contrast':
      return [{ label: `${verb(w.ground)} the ribbon words`, apply: recolour(w, w.colorPath) }];
    default:
      return [];
  }
}

/** Attach `fixes` (and `fix`, the first of them) to every warning in a list. */
export function withFixes(list) {
  for (const w of list) {
    w.fixes = fixesFor(w);
    w.fix = w.fixes[0] || null;
  }
  return list;
}

/**
 * Apply one fix to the design on the bench. The result goes through
 * `setDesign`, the same normalise path every control's write ends in, so a fix
 * can never leave the document in a shape a slider could not.
 */
export function applyFix(fix) {
  if (!fix || typeof fix.apply !== 'function') return false;
  const d = design();
  fix.apply(d);
  setDesign(d);
  return true;
}
