/**
 * The two download controls on the studio: a PNG and an SVG of the draft.
 *
 * They call the vendored exporter Sash uses (`js/insignia/export.js`), so what
 * an author downloads here went through the pipeline C6.2 freezes: real text,
 * the fonts inlined, every image inlined, the provenance strip drawn (C11.1).
 * The one difference from a wallet export is the provenance, which is the
 * preview's, so the strip reads "preview, not yet issued" and the file name
 * says preview. Nothing here draws, and nothing here names a font.
 */
import { exportPng, exportSvgFile, triggerDownload, slugify } from './insignia/export.js';
import { preset } from './insignia/data/presets.js';
import { state, design } from './state.js';
import { draftProvenance } from './preview.js';
import { $, showToast } from './utils.js';

/**
 * `<name>-preview`: the template's name, else the preset's, else the kind.
 * `presetId` is one value for both kinds, so a badge preset does not name a
 * certificate download: the preset counts only when it is of the kind on screen.
 */
export function previewStem() {
  const from = state.presetId ? preset(state.presetId) : null;
  const name = state.meta.name.trim() || (from && from.kind === state.kind ? from.name : '') || state.kind;
  return `${slugify(name)}-preview`;
}

async function guarded(button, label, work) {
  if (button.disabled) return;
  button.disabled = true;
  try {
    await work();
    showToast(`The ${label} is in your downloads. It is a preview, and its strip says so.`);
  } catch (err) {
    // Loud on purpose, as on Sash: the exporter throws when it cannot inline a
    // font or an image, and a download that quietly carried the wrong face is
    // the failure the pipeline exists to prevent.
    console.error('Enamel: the export failed', err);
    showToast(`The ${label} could not be built: ${err && err.message ? err.message : err}`);
  } finally {
    button.disabled = false;
  }
}

/** Wire `#exportPngBtn` and `#exportSvgBtn`. Safe on a page that has neither. */
export function bindExport() {
  const png = $('exportPngBtn');
  const svg = $('exportSvgBtn');
  png?.addEventListener('click', () => guarded(png, 'PNG', async () => {
    triggerDownload(await exportPng(design(), draftProvenance(), { scale: 2 }), `${previewStem()}.png`);
  }));
  svg?.addEventListener('click', () => guarded(svg, 'SVG', async () => {
    triggerDownload(await exportSvgFile(design(), draftProvenance()), `${previewStem()}.svg`);
  }));
}
