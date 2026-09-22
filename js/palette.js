/**
 * A palette from an image: three swatches offered, never applied on their own.
 *
 * After an upload the Centre group shows the accent, base and ink this module
 * reads off the mark, and one "Use these" button writes them. Nothing new is
 * stored, since a design's palette is already three hex fields, and nothing
 * happens without the click: a bad guess costs one click, an automatic one
 * would cost the author's own colours.
 *
 * Pure. The quantiser takes an ImageData-shaped object (`data`, `width`,
 * `height`) and returns hex strings, so it runs in Node for its test and in
 * the browser for the studio. `art.js` draws the 48 by 48 sample and calls it.
 */

/** Pixels more transparent than this are edge and shadow, not the mark. */
const MIN_ALPHA = 128;
/** Chroma at or under this is grey, near-white or near-black, and skipped. */
const GREY_TOLERANCE = 12;
/** The ink when no bin is dark enough to print the strip on. */
export const FALLBACK_INK = '#0b1020';
/** A bin lighter than this (relative luminance) is not an ink. */
const INK_MAX_LUMINANCE = 0.25;
const SAMPLE_SIDE = 48;

export { SAMPLE_SIDE };

const hex2 = (n) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');

/** Three channels 0 to 255 as lowercase six-digit hex. */
export function toHex(r, g, b) {
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

function channel(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of an sRGB triple. */
export function luminance(r, g, b) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** sRGB 0 to 255 to HSL: hue in degrees, saturation and lightness 0 to 1. */
export function rgbToHsl(r, g, b) {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rr) h = ((gg - bb) / d) % 6;
  else if (max === gg) h = (bb - rr) / d + 2;
  else h = (rr - gg) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, l];
}

/** HSL back to sRGB 0 to 255. */
export function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/**
 * The three swatches, or null when the image holds no colour to read.
 *
 * Pixels with alpha under 128 and pixels within 12 of grey (which takes white
 * and black with it) are dropped; the rest are binned in a 4-bit-per-channel
 * cube and each bin is weighted by its count times its mean saturation. The
 * winner is the accent. The base is the accent's hue rotated 180 degrees at 25
 * percent lightness. The ink is the darkest bin present, unless even that is
 * too light to print the strip on, in which case it is `FALLBACK_INK`; the
 * strip contrast warning still runs after "Use these" so a pale ink is caught.
 */
export function paletteFrom(image) {
  const { data, width, height } = image;
  const bins = new Map();
  const end = Math.min(data.length, width * height * 4);
  for (let i = 0; i + 3 < end; i += 4) {
    if (data[i + 3] < MIN_ALPHA) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max - min <= GREY_TOLERANCE) continue;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    let bin = bins.get(key);
    if (!bin) { bin = { n: 0, r: 0, g: 0, b: 0, sat: 0 }; bins.set(key, bin); }
    bin.n += 1; bin.r += r; bin.g += g; bin.b += b; bin.sat += (max - min) / max;
  }
  if (!bins.size) return null;

  let winner = null, best = -1, darkest = null, darkL = Infinity;
  for (const bin of bins.values()) {
    const mean = [bin.r / bin.n, bin.g / bin.n, bin.b / bin.n];
    const weight = bin.sat; // count times mean saturation is the summed saturation
    if (weight > best) { best = weight; winner = mean; }
    const l = luminance(...mean);
    if (l < darkL) { darkL = l; darkest = mean; }
  }
  const [h, s] = rgbToHsl(...winner);
  return {
    accent: toHex(...winner),
    base: toHex(...hslToRgb(h + 180, s, 0.25)),
    ink: darkL <= INK_MAX_LUMINANCE ? toHex(...darkest) : FALLBACK_INK,
  };
}

/**
 * Write the three swatches into a badge design: `palette.base`, `.accent`,
 * `.ink`, and every ring whose colour still equals the old accent, so a ring
 * that was following the accent keeps following it. A ring recoloured by hand
 * is left alone. Returns the design. Marking dirty and repainting is the
 * caller's, so this stays a pure write.
 */
export function applyPalette(d, swatches) {
  if (!d || !d.palette || !swatches) return d;
  const oldAccent = d.palette.accent;
  d.palette.base = swatches.base;
  d.palette.accent = swatches.accent;
  d.palette.ink = swatches.ink;
  for (const ring of Array.isArray(d.rings) ? d.rings : []) {
    if (ring.color === oldAccent) ring.color = swatches.accent;
  }
  return d;
}
