// ── DOM rendering ────────────────────────────────────────────
// The pieces more than one page draws. Nothing here talks to Convex and
// nothing here holds state: a caller passes a row in and gets a node or a
// string of markup back.

import { renderSvg } from './insignia/render.js';
import { presetsFor } from './insignia/data/presets.js';
import { escHtml } from './neorgon-dom.js';
import { fmtDate, stamp } from './utils.js';
import { previewProvenance } from './preview.js';

export const STATUS_LABEL = { draft: 'Draft', published: 'Published', archived: 'Archived' };
export const KIND_LABEL = { badge: 'Badge', certificate: 'Certificate' };

/**
 * A small drawing of a design, for a picker or a list row. The provenance
 * defaults to the preview's; a catalogue row passes its own so the strip names
 * that row's origin and issuer rather than the visitor's.
 */
export function thumb(design, size = 132, provenance = previewProvenance()) {
  const wrap = document.createElement('div');
  wrap.className = 'thumb';
  wrap.style.setProperty('--thumb-size', `${size}px`);
  try {
    const svg = renderSvg(design, provenance);
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    wrap.appendChild(svg);
  } catch (err) {
    console.error('Enamel: could not draw a thumbnail', err);
    wrap.textContent = 'This design will not draw.';
    wrap.classList.add('thumb--broken');
  }
  return wrap;
}

/** The preset picker's grid, for one kind. */
export function presetGrid(kind, currentId) {
  const frag = document.createDocumentFragment();
  for (const preset of presetsFor(kind)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'preset';
    if (preset.id === currentId) button.classList.add('is-on');
    button.dataset.preset = preset.id;
    button.appendChild(thumb(preset.design, kind === 'badge' ? 132 : 168));
    const label = document.createElement('span');
    label.className = 'preset__name';
    label.textContent = preset.name;
    button.appendChild(label);
    if (preset.note) {
      const note = document.createElement('span');
      note.className = 'preset__note';
      note.textContent = preset.note;
      button.appendChild(note);
    }
    frag.appendChild(button);
  }
  return frag;
}

/** An empty list, said in words rather than left blank. */
export function emptyState(title, body) {
  return `<div class="empty"><strong>${escHtml(title)}</strong><p>${escHtml(body)}</p></div>`;
}

/** A status pill. */
export function pill(text, tone = '') {
  return `<span class="pill${tone ? ` pill--${escHtml(tone)}` : ''}">${escHtml(text)}</span>`;
}

const TONE = { draft: 'muted', published: 'good', archived: 'muted' };

/** One template in the library list. */
export function templateRow(row) {
  const versions = row.versionN
    ? `version ${row.versionN}`
    : 'no version published yet';
  return `<article class="card card--actions template" data-public-id="${escHtml(row.publicId)}">
    <div class="template__head">
      <div>
        <h3 class="template__name">${escHtml(row.name || 'Untitled')}</h3>
        <p class="template__meta">
          ${pill(KIND_LABEL[row.kind] || row.kind)}
          ${pill(STATUS_LABEL[row.status] || row.status, TONE[row.status] || '')}
          ${pill(row.category)}
          ${row.sphere ? pill(row.sphere) : ''}
          <span class="template__id"><code>${escHtml(row.publicId)}</code></span>
        </p>
      </div>
      <p class="template__when">${escHtml(versions)}, changed ${escHtml(fmtDate(row.updatedAt))}</p>
    </div>
    ${row.description ? `<p class="template__desc">${escHtml(row.description)}</p>` : ''}
    <div class="toolbar">
      <a class="btn btn--secondary btn--sm" href="./?t=${encodeURIComponent(row.publicId)}">Open in the studio</a>
      <button type="button" class="btn btn--ghost btn--sm" data-action="versions" data-id="${escHtml(row.templateId)}">Versions</button>
      ${row.status === 'published'
        ? `<a class="btn btn--ghost btn--sm" href="links.html?t=${encodeURIComponent(row.publicId)}">Claim links</a>`
        : '<span class="fld__hint">Publish it before it can be claimed.</span>'}
      ${row.status === 'archived'
        ? ''
        : `<button type="button" class="btn btn--ghost btn--sm" data-action="archive" data-id="${escHtml(row.templateId)}">Archive</button>`}
    </div>
  </article>`;
}

/** One template in the public catalogue. `js/catalogue.js` fills the thumbnail slot. */
export function catalogueCard(row) {
  const issuer = row.origin === 'neorgon' ? 'Neorgon' : (row.issuerHandle ? `@${row.issuerHandle}` : 'community');
  return `<article class="card catalogue__card" data-public-id="${escHtml(row.publicId)}">
    <div class="catalogue__thumb" data-thumb><span class="fld__hint">Drawing it.</span></div>
    <div class="catalogue__body">
      <h3 class="template__name">${escHtml(row.name || 'Untitled')}</h3>
      <p class="template__meta">
        ${pill(KIND_LABEL[row.kind] || row.kind)}
        ${pill(issuer, row.origin === 'neorgon' ? 'good' : '')}
        ${pill(row.category)}
      </p>
      ${row.description ? `<p class="template__desc">${escHtml(row.description)}</p>` : ''}
      <div class="toolbar">
        <a class="btn btn--secondary btn--sm" href="./?t=${encodeURIComponent(row.publicId)}">Open in the studio</a>
      </div>
    </div>
  </article>`;
}

/** The version history of one template. */
export function versionList(rows) {
  if (!rows.length) {
    return emptyState('No versions yet', 'A version is written when you publish. Until then the draft lives on the template row and can change freely.');
  }
  return `<ol class="versions">${rows.map((v) => `<li class="versions__row">
    <span class="versions__n">v${escHtml(v.n)}</span>
    <span class="versions__log">${escHtml(v.changelog || 'No note')}</span>
    <span class="versions__when">${escHtml(stamp(v.createdAt))}</span>
  </li>`).join('')}</ol>
  <p class="fld__hint">A version is frozen once written. Every award pins the version it was issued from, so
  publishing again never changes a badge somebody already holds.</p>`;
}
