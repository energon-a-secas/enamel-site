/**
 * Badge art: pick a file, shrink it here, then the three requests of C10.5.
 *
 * The shrink is not a nicety. Convex limits are per team and this team already
 * runs about twenty projects against 1 GB of storage and 1 GB a month of egress
 * shared with backups (C10.1), and every serve is also a function call. A 512
 * square PNG keeps a badge inside that budget.
 *
 * The stored value is a storage id, never a serving URL (C10.3): a URL goes
 * stale the moment the file is deleted and would bake a deployment hostname
 * into every saved design.
 */
import { api, m, failText } from './api.js';

/** C10.1 and the server's own cap in `art.ts`. */
export const MAX_ART_BYTES = 512 * 1024;
const MAX_SIDE = 512;
const FALLBACK_SIDE = 256;

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
    input.accept = 'image/png,image/jpeg,image/webp';
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

function loadBitmap(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file did not decode as an image.')); };
    img.src = url;
  });
}

function toPng(img, side) {
  const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The browser would not encode that image.'))), 'image/png');
  });
}

/**
 * Down to 512 across, re-encoded as PNG so the declared content type is true by
 * construction (C10.2). One retry at 256 for an image that is still over the cap
 * after the first pass, then a refusal: silently sending something over the cap
 * would be refused by the deployment anyway, with a less useful message.
 */
export async function shrink(file) {
  const img = await loadBitmap(file);
  let blob = await toPng(img, MAX_SIDE);
  if (blob.size > MAX_ART_BYTES) blob = await toPng(img, FALLBACK_SIDE);
  if (blob.size > MAX_ART_BYTES) {
    throw new Error(`That image is ${Math.round(blob.size / 1024)} KB once shrunk, over the ${MAX_ART_BYTES / 1024} KB cap. Try one with fewer colours or less noise.`);
  }
  return blob;
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

/** Pick, shrink, upload and attach. Returns a failure object rather than throwing. */
export async function attachNewArt(templateId, file) {
  let blob;
  try {
    blob = await shrink(file);
  } catch (err) {
    return { ok: false, code: 'bad-image', message: err.message };
  }
  const result = await uploadArt(templateId, blob);
  if (!result.ok) return { ...result, message: failText(result) };
  return { ...result, previewUrl: URL.createObjectURL(blob) };
}
