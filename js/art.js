/**
 * Badge art: pick a file, rasterise it here, then the three requests of C10.5.
 *
 * The shrink is not a nicety. Convex limits are per team and this team already
 * runs about twenty projects against 1 GB of storage and 1 GB a month of egress
 * shared with backups (C10.1), and every serve is also a function call. A 512
 * square PNG keeps a badge inside that budget.
 *
 * Round 2 (4.2): the picker also takes an SVG or a favicon. Both are drawn to
 * a canvas in this tab and re-encoded as PNG, so the deployment's contract
 * (C10.2, png, jpeg, webp) does not move and the file never leaves the tab as
 * SVG. An `<img>` fed a `blob:` URL of a local file runs no script and cannot
 * fetch (secure static mode), which is what makes the canvas the safe
 * rasteriser. A source of 64 pixels or under is drawn at the largest integer
 * multiple that fits, with smoothing off, so a 16 pixel icon becomes crisp
 * pixel art rather than blur; that is a look, not a lossless logo, and the
 * caption under the control says so.
 *
 * The stored value is a storage id, never a serving URL (C10.3): a URL goes
 * stale the moment the file is deleted and would bake a deployment hostname
 * into every saved design.
 */
import { api, m, failText } from './api.js';
import { paletteFrom, SAMPLE_SIDE } from './palette.js';

/** C10.1 and the server's own cap in `art.ts`. */
export const MAX_ART_BYTES = 512 * 1024;
const MAX_SIDE = 512;
const FALLBACK_SIDE = 256;
/** A decoded side at or under this is scaled up as pixel art (4.2). */
export const PIXEL_ART_MAX = 64;

export const ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,.ico,.svg';

/**
 * Open the file picker once and resolve with the file, or null.
 *
 * The input is put in the document rather than left detached. A detached input
 * opens no chooser at all in some engines, and the failure is silent: the button
 * does nothing and there is nothing in the console to say why.
 */
export function pickImage() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPT;
    input.hidden = true;
    input.addEventListener('change', () => {
      const file = input.files && input.files[0] ? input.files[0] : null;
      input.remove();
      resolve(file);
    }, { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

/** An SVG is drawn at an explicit side whatever size it reports. */
export function isVector(file) {
  return file.type === 'image/svg+xml' || /\.svg$/i.test(file.name || '');
}

function loadBitmap(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    // Set before `src`: an SVG with no width or height of its own then has a
    // box to report a size for (Firefox reports 0 otherwise). The canvas pass
    // still draws a vector at its own side, because an engine may report its
    // fallback (150 or 300) rather than this box.
    img.width = MAX_SIDE;
    img.height = MAX_SIDE;
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file did not decode as an image.')); };
    img.src = url;
  });
}

/**
 * How a decoded image is drawn at `side`: a vector at the side itself, a small
 * raster at an integer multiple with smoothing off, anything else shrunk.
 */
export function drawPlan(decoded, vector, side = MAX_SIDE) {
  const w0 = Math.max(1, decoded.width || 0), h0 = Math.max(1, decoded.height || 0);
  const long = Math.max(w0, h0);
  if (vector) {
    const scale = side / long;
    return { width: Math.max(1, Math.round(w0 * scale)), height: Math.max(1, Math.round(h0 * scale)), smooth: true, mode: 'vector', factor: scale };
  }
  if (long <= PIXEL_ART_MAX) {
    const factor = Math.max(1, Math.floor(side / long));
    return { width: w0 * factor, height: h0 * factor, smooth: false, mode: 'pixel', factor };
  }
  const scale = Math.min(1, side / long);
  return { width: Math.max(1, Math.round(w0 * scale)), height: Math.max(1, Math.round(h0 * scale)), smooth: true, mode: 'raster', factor: scale };
}

function draw(img, plan) {
  const canvas = document.createElement('canvas');
  canvas.width = plan.width;
  canvas.height = plan.height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = plan.smooth;
  if (plan.smooth) ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, plan.width, plan.height);
  return canvas;
}

function toPng(img, plan) {
  const canvas = draw(img, plan);
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The browser would not encode that image.'))), 'image/png');
    } catch (err) {
      reject(new Error(`The browser would not encode that image: ${err.message}`));
    }
  });
}

/** The 48 by 48 sample the palette is read from. Null when the canvas will not give it up. */
function sampleSwatches(img, plan) {
  try {
    const canvas = draw(img, { width: SAMPLE_SIDE, height: SAMPLE_SIDE, smooth: plan.smooth });
    return paletteFrom(canvas.getContext('2d').getImageData(0, 0, SAMPLE_SIDE, SAMPLE_SIDE));
  } catch {
    return null;
  }
}

/**
 * Decode and draw to PNG at 512 across, re-encoded so the declared content type
 * is true by construction (C10.2). One retry at 256 for an image still over
 * the cap after the first pass, then a refusal: silently sending something
 * over the cap would be refused by the deployment anyway, with a less useful
 * message. Resolves `{ blob, info }`; `info` says what decoded and how it was
 * drawn, which the caption under the control reports.
 */
export async function rasterise(file) {
  const img = await loadBitmap(file);
  const vector = isVector(file);
  const decoded = { width: img.naturalWidth, height: img.naturalHeight };
  let plan = drawPlan(decoded, vector, MAX_SIDE);
  let blob = await toPng(img, plan);
  if (blob.size > MAX_ART_BYTES) {
    plan = drawPlan(decoded, vector, FALLBACK_SIDE);
    blob = await toPng(img, plan);
  }
  if (blob.size > MAX_ART_BYTES) {
    throw new Error(`That image is ${Math.round(blob.size / 1024)} KB once shrunk, over the ${MAX_ART_BYTES / 1024} KB cap. Try one with fewer colours or less noise.`);
  }
  const info = {
    decoded,
    drawn: { width: plan.width, height: plan.height },
    mode: plan.mode,
    factor: plan.factor,
    swatches: sampleSwatches(img, plan),
  };
  return { blob, info };
}

/** The PNG alone, for a caller that wants nothing else. */
export async function shrink(file) {
  return (await rasterise(file)).blob;
}

/**
 * What the last attach decoded, keyed by the preview URL it produced, so the
 * form can caption the thumbnail it shows and offer the palette read from it.
 * Session-only: after a reload the art is a remote URL again, the canvas would
 * be tainted by it, and there is nothing to report or offer.
 */
let lastArt = null;

export function artInfo(url) {
  return lastArt && url && lastArt.url === url ? lastArt.info : null;
}

/** One sentence on what decoded and how it was drawn. */
export function artCaption(info) {
  if (!info) return '';
  const { decoded, drawn, mode, factor } = info;
  if (mode === 'vector') return `A vector image, drawn at ${drawn.width} by ${drawn.height}.`;
  if (mode === 'pixel') return `Decoded at ${decoded.width} by ${decoded.height} pixels and scaled up ${factor} times as pixel art.`;
  if (decoded.width === drawn.width && decoded.height === drawn.height) return `Decoded at ${decoded.width} by ${decoded.height} pixels.`;
  return `Decoded at ${decoded.width} by ${decoded.height} pixels, drawn at ${drawn.width} by ${drawn.height}.`;
}

/**
 * The three requests, in order, with the reply of each one checked.
 * `art:getUploadUrl` is the authorisation point and the only one, because the
 * URL it returns is a bearer credential good for an hour.
 */
export async function uploadArt(templateId, blob) {
  const granted = await m(api.art.getUploadUrl);
  if (!granted.ok) return granted;

  let posted;
  try {
    posted = await fetch(granted.url, {
      method: 'POST',
      headers: { 'Content-Type': blob.type },
      body: blob,
    });
  } catch (err) {
    return { ok: false, code: 'upload-failed', message: `The upload did not reach storage: ${err.message}` };
  }
  // memes-site does not check this and turns a refused upload into a JSON parse
  // error with nothing on screen. C10.5 names it.
  if (!posted.ok) {
    return { ok: false, code: 'upload-failed', message: `Storage refused the upload with status ${posted.status}.` };
  }
  const body = await posted.json().catch(() => ({}));
  if (!body.storageId) {
    return { ok: false, code: 'upload-failed', message: 'Storage accepted the file but named no id for it.' };
  }
  return await m(api.art.attach, { templateId, storageId: body.storageId });
}

/**
 * Pick, rasterise, upload and attach. Returns a failure object rather than
 * throwing. On success the result carries `previewUrl` (a `blob:` URL of the
 * PNG that was sent) and `info`, and `artInfo(previewUrl)` answers for it.
 */
export async function attachNewArt(templateId, file) {
  let pass;
  try {
    pass = await rasterise(file);
  } catch (err) {
    return { ok: false, code: 'bad-image', message: err.message };
  }
  const result = await uploadArt(templateId, pass.blob);
  if (!result.ok) return { ...result, message: failText(result) };
  const previewUrl = URL.createObjectURL(pass.blob);
  lastArt = { url: previewUrl, info: pass.info };
  return { ...result, previewUrl, info: pass.info };
}

/** Record a rasterised result under a preview URL without uploading (the proof harness and tests). */
export function rememberArt(previewUrl, info) {
  lastArt = { url: previewUrl, info };
}
