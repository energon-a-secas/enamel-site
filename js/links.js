/**
 * Claim links and the issuer dashboard. `links.html?t=<templatePublicId>`.
 *
 * The URL a link points at is built by the deployment and returned by
 * `claims:create` (C3.1), so this page never assembles one. That is what stops
 * a locally-built origin ending up in something an issuer pastes into a chat.
 *
 * Revoking a link stops future claims and leaves the badges already claimed
 * from it alone (C3.5). The wording on the button says so, because "revoke"
 * reads like it takes something back.
 */
import { api, q, m, failText } from './api.js';
import { state } from './state.js';
import { emptyState, pill, KIND_LABEL } from './render.js';
import { copyText, escHtml } from './neorgon-dom.js';
import { $, daysFromNow, fmtDate, fmtWhen, humanMs, param, showToast, splitList, stamp } from './utils.js';

let template = null;
let links = [];

const STATE_TEXT = {
  ok: ['Live', 'good'],
  expired: ['Expired', 'muted'],
  exhausted: ['Every seat taken', 'muted'],
  revoked: ['Withdrawn', 'bad'],
};

/* ── the template this page is about ───────────────────────────────────────── */

function paintHead() {
  const host = $('templateHead');
  if (!host) return;
  if (!template) {
    host.innerHTML = state.session.signedIn
      ? emptyState('Pick a template', 'Open a published template from your library and its claim links are on this page.')
      : '';
    $('mintSection').hidden = true;
    $('listSection').hidden = true;
    return;
  }
  host.innerHTML = `<article class="card template">
    <div class="template__head">
      <div>
        <h3 class="template__name">${escHtml(template.name)}</h3>
        <p class="template__meta">
          ${pill(KIND_LABEL[template.kind] || template.kind)}
          ${pill(template.status)}
          ${pill(template.category)}
          <span class="template__id"><code>${escHtml(template.publicId)}</code></span>
        </p>
      </div>
      <p class="template__when">${template.versionN ? `version ${template.versionN}` : 'no version published'}</p>
    </div>
    ${template.description ? `<p class="template__desc">${escHtml(template.description)}</p>` : ''}
    <p class="fld__hint">${template.defaultValidityMs
      ? `An award claimed from this template expires ${humanMs(template.defaultValidityMs)} after it is claimed.`
      : 'An award claimed from this template does not expire.'}</p>
  </article>`;

  const publishable = template.status === 'published';
  $('mintSection').hidden = !publishable || !state.session.signedIn;
  $('listSection').hidden = !state.session.signedIn;
  if (!publishable) {
    host.insertAdjacentHTML('beforeend', emptyState('Not published yet',
      'A claim link can only be minted for a published template, because a claim pins the version it was issued from.'));
  }
}

/* ── the link list ─────────────────────────────────────────────────────────── */

function linkRow(row) {
  const [label, tone] = STATE_TEXT[row.state] || [row.state, ''];
  const seats = row.maxUses === null
    ? `${row.uses} claimed, no seat limit`
    : `${row.uses} of ${row.maxUses} seats taken`;
  return `<article class="card card--actions link" data-claim="${escHtml(row.claimId)}">
    <div class="link__head">
      <code class="link__url">${escHtml(row.url)}</code>
      ${pill(label, tone)}
    </div>
    <p class="link__meta">
      ${escHtml(seats)} · expires ${escHtml(stamp(row.expiresAt))} (${escHtml(fmtWhen(row.expiresAt))})
      · minted ${escHtml(fmtDate(row.createdAt))}
      ${row.allowList.length ? ` · only ${escHtml(row.allowList.map((h) => `@${h}`).join(', '))}` : ''}
    </p>
    <div class="toolbar">
      <button type="button" class="btn btn--secondary btn--sm" data-action="copy" data-url="${escHtml(row.url)}">Copy the link</button>
      <button type="button" class="btn btn--ghost btn--sm" data-action="claimants">Who claimed</button>
      ${row.revokedAt
        ? `<span class="fld__hint">Withdrawn ${escHtml(fmtDate(row.revokedAt))}. Badges claimed before that are still valid.</span>`
        : '<button type="button" class="btn btn--danger btn--sm" data-action="revoke">Withdraw</button>'}
    </div>
    <div class="link__claimants" hidden></div>
  </article>`;
}

function paintList() {
  const host = $('linkList');
  if (!host) return;
  if (!links.length) {
    host.innerHTML = emptyState('No links yet', 'Mint one above. It is a bearer token: anyone holding it can take a seat until it expires.');
    return;
  }
  host.innerHTML = links.map(linkRow).join('');
}

async function loadLinks() {
  if (!template || !state.session.signedIn) { links = []; paintList(); return; }
  const mine = await q(api.claims.mine, { templateId: template.templateId });
  links = Array.isArray(mine) ? mine : [];
  paintList();
}

/* ── actions ───────────────────────────────────────────────────────────────── */

async function mint() {
  const days = Number($('mintExpiry')?.value || 7);
  const seatsRaw = ($('mintSeats')?.value || '').trim();
  const allow = splitList($('mintAllow')?.value).map((h) => h.replace(/^@/, '').toLowerCase());
  const maxUses = seatsRaw === '' ? null : Math.round(Number(seatsRaw));
  if (maxUses !== null && (!Number.isFinite(maxUses) || maxUses < 1)) {
    showToast('Seats is a whole number of one or more, or empty for no limit.');
    return;
  }
  const result = await m(api.claims.create, {
    templateId: template.templateId,
    expiresAt: daysFromNow(days),
    maxUses,
    allowList: allow,
  });
  if (!result.ok) { showToast(failText(result)); return; }
  const copied = await copyText(result.url);
  showToast(copied ? 'Link minted and copied.' : 'Link minted.');
  await loadLinks();
}

async function revoke(claimId) {
  const result = await m(api.claims.revoke, { claimId });
  if (!result.ok) { showToast(failText(result)); return; }
  showToast('Withdrawn. Nobody new can claim from it.');
  await loadLinks();
}

async function showClaimants(card, claimId) {
  const host = card.querySelector('.link__claimants');
  if (!host) return;
  if (!host.hidden) { host.hidden = true; return; }
  host.hidden = false;
  host.innerHTML = '<p class="fld__hint">Reading it.</p>';
  const list = await q(api.claims.claimants, { claimId });
  const rows = Array.isArray(list) ? list : [];
  host.innerHTML = rows.length
    ? `<ul class="claimants">${rows.map((c) => `<li>
        <a href="https://sash.neorgon.com/u.html?h=${encodeURIComponent(c.handle)}" target="_blank" rel="noopener">@${escHtml(c.handle)}</a>
        <span>${escHtml(c.displayName || '')}</span>
        <code>${escHtml(c.awardPublicId)}</code>
        <span>${escHtml(stamp(c.issuedAt))}</span>
      </li>`).join('')}</ul>`
    : '<p class="fld__hint">Nobody yet.</p>';
}

/* ── the template switcher ─────────────────────────────────────────────────── */

async function paintSwitch() {
  const host = $('templateSwitch');
  if (!host || !state.session.signedIn) return;
  const mine = await q(api.templates.mine);
  const published = (Array.isArray(mine) ? mine : []).filter((r) => r.status === 'published');
  if (!published.length) {
    host.innerHTML = '<a class="btn btn--ghost btn--sm" href="templates.html">Your templates</a>';
    return;
  }
  host.innerHTML = `<label class="fld fld--inline"><span class="fld__label">Template</span>
    <select class="fld__input" id="templatePick">
      ${published.map((r) => `<option value="${escHtml(r.publicId)}"${r.publicId === template?.publicId ? ' selected' : ''}>${escHtml(r.name)}</option>`).join('')}
    </select></label>`;
  $('templatePick')?.addEventListener('change', (event) => {
    const url = new URL(location.href);
    url.searchParams.set('t', event.target.value);
    location.href = url.toString();
  });
}

/* ── entry points ──────────────────────────────────────────────────────────── */

export async function start() {
  $('mintBtn')?.addEventListener('click', mint);
  $('signInBtn')?.addEventListener('click', async () => {
    const { openSignIn } = await import('./auth.js');
    openSignIn();
  });
  const hint = $('mintHint');
  if (hint) hint.textContent = 'The link and its expiry are minted by the deployment, not by this page.';

  $('linkList')?.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const card = button.closest('[data-claim]');
    if (!card) return;
    const claimId = card.dataset.claim;
    if (button.dataset.action === 'copy') {
      const copied = await copyText(button.dataset.url);
      showToast(copied ? 'Copied.' : 'The browser would not let this page copy. Select the link instead.');
    }
    if (button.dataset.action === 'revoke') await revoke(claimId);
    if (button.dataset.action === 'claimants') await showClaimants(card, claimId);
  });
}

export async function onSession() {
  const out = $('signedOut');
  if (out) out.hidden = state.session.signedIn;

  const wanted = param('t');
  if (wanted) {
    const detail = await q(api.templates.get, { publicId: wanted });
    template = detail || null;
    if (!detail) showToast('That template is not readable from this account.');
  }
  paintHead();
  await paintSwitch();
  await loadLinks();
}
