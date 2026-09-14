/**
 * The public catalogue on templates.html: every published template anyone can
 * claim from, the Neorgon set and what the community has published, each with
 * a thumbnail drawn by the kit. Readable signed out, because `templates:listPublic`
 * and `templates:get` answer a stranger for a published, non-private row (C2).
 *
 * The list does not carry designs, so each thumbnail is one `templates:get`.
 * They are fetched a few at a time and drawn as they land, so the names and
 * the "Open in the studio" links are on the page before the first drawing is.
 */
import { api, q } from './api.js';
import { thumb, catalogueCard, emptyState } from './render.js';
import { previewProvenance } from './preview.js';
import { ensureFonts } from './insignia/render.js';
import { $ } from './utils.js';

let rows = [];
const designs = new Map();
const CONCURRENCY = 4;

/**
 * The strip on a thumbnail names the row's origin and issuer, as the badge it
 * would mint does: NEORGON BADGE @neorgon for the seeded set, COMMUNITY BADGE
 * @handle for the rest. The preview provenance carries the visitor's own handle,
 * which is right for the draft on the studio and wrong for somebody else's row.
 */
function provenanceFor(row) {
  const prov = previewProvenance();
  if (row.origin === 'neorgon') {
    prov.origin = 'neorgon';
    prov.issuerHandle = 'neorgon';
  } else if (row.issuerHandle) {
    prov.issuerHandle = row.issuerHandle;
  }
  return prov;
}

function filtered() {
  const want = $('publicKind')?.value || 'all';
  return want === 'all' ? rows : rows.filter((r) => r.kind === want);
}

function drawThumb(row) {
  const slot = document.querySelector(`#publicGrid [data-public-id="${row.publicId}"] [data-thumb]`);
  if (!slot || !designs.has(row.publicId)) return;
  const design = designs.get(row.publicId);
  if (!design) {
    slot.innerHTML = '<span class="fld__hint">No drawing for this one.</span>';
    return;
  }
  slot.replaceChildren(thumb(design, row.kind === 'badge' ? 140 : 200, provenanceFor(row)));
}

function paint() {
  const host = $('publicGrid');
  if (!host) return;
  const list = filtered();
  if (!list.length) {
    host.innerHTML = emptyState(rows.length ? 'Nothing of that kind' : 'Nothing published yet',
      rows.length ? 'Change the filter.' : 'The first published template will appear here.');
    return;
  }
  host.innerHTML = list.map(catalogueCard).join('');
  for (const row of list) drawThumb(row);
}

async function fetchDesigns(list) {
  const queue = list.filter((r) => !designs.has(r.publicId));
  const worker = async () => {
    while (queue.length) {
      const row = queue.shift();
      let detail = null;
      try {
        detail = await q(api.templates.get, { publicId: row.publicId });
      } catch (err) {
        console.error('Enamel: could not read a catalogue template', err);
      }
      designs.set(row.publicId, detail && detail.design ? detail.design : null);
      drawThumb(row);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
}

/** Read the catalogue and draw it. Does not wait for the session: it is public. */
export async function startCatalogue() {
  const host = $('publicGrid');
  if (!host) return;
  ensureFonts();
  $('publicKind')?.addEventListener('change', paint);
  host.innerHTML = '<p class="fld__hint">Reading the catalogue.</p>';
  try {
    const list = await q(api.templates.listPublic, { limit: 100 });
    rows = Array.isArray(list) ? list : [];
  } catch (err) {
    console.error('Enamel: the catalogue could not be read', err);
    host.innerHTML = emptyState('Could not read the catalogue', 'Check the connection and reload.');
    return;
  }
  paint();
  await fetchDesigns(rows);
}
