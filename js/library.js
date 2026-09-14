/**
 * The library: every template this account owns, its versions, and the two
 * things an owner does to one that is not editing it. `templates.html`.
 *
 * An admin also gets a way in by public id. That is not a second permission
 * model: `templates:get` already answers an admin for any row, and
 * `templates:updateMeta`, `publish` and `archive` already accept one. This page
 * only stops pretending the field is not there.
 */
import { api, q, m, failText } from './api.js';
import { state } from './state.js';
import { openModal } from './events.js';
import { emptyState, templateRow, versionList } from './render.js';
import { startCatalogue } from './catalogue.js';
import { $, showToast } from './utils.js';
import { NeoAuth } from './neorgon-auth.js';

let rows = [];

// The lede of the kit's dialog when this page asks for a sign-in. The same
// sentence is the signed-out notice in templates.html.
const SIGN_IN_REASON = 'Sign in to see the templates you have made.';

function filtered() {
  const want = $('statusFilter')?.value || 'all';
  return want === 'all' ? rows : rows.filter((r) => r.status === want);
}

function paint() {
  const host = $('libraryList');
  if (!host) return;
  if (!state.session.signedIn) {
    host.innerHTML = '';
    return;
  }
  const list = filtered();
  if (!list.length) {
    host.innerHTML = rows.length
      ? emptyState('Nothing in that state', 'Change the filter, or make something new.')
      : emptyState('No templates yet', 'Design one in the studio and save it. A draft is yours alone until you publish it.');
    return;
  }
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  host.innerHTML = list.map(templateRow).join('');
}

async function load() {
  const mine = await q(api.templates.mine);
  rows = Array.isArray(mine) ? mine : [];
  paint();
}

async function showVersions(templateId) {
  const body = $('versionsBody');
  if (!body) return;
  body.innerHTML = '<p class="fld__hint">Reading the history.</p>';
  openModal('versionsModal');
  const list = await q(api.versions.list, { templateId });
  body.innerHTML = versionList(Array.isArray(list) ? list : []);
}

async function archive(templateId) {
  if (!(await NeoAuth.requireSignIn({ reason: 'Sign in to archive a template.' }))) return;
  const result = await m(api.templates.archive, { templateId });
  if (!result.ok) { showToast(failText(result)); return; }
  showToast('Archived. It keeps its id and everything issued from it stays valid.');
  await load();
}

/* ── admin ─────────────────────────────────────────────────────────────────── */

async function adminOpen() {
  const host = $('adminResult');
  const wanted = ($('adminId')?.value || '').trim().toLowerCase();
  if (!host) return;
  if (!/^[0-9abcdefghjkmnpqrstvwxyz]{10}$/.test(wanted)) {
    host.innerHTML = emptyState('That is not a public id',
      'A public id is ten characters from the Crockford alphabet, with no i, l, o or u in it.');
    return;
  }
  host.innerHTML = '<p class="fld__hint">Reading it.</p>';
  const detail = await q(api.templates.get, { publicId: wanted });
  if (!detail) {
    host.innerHTML = emptyState('Nothing there', 'No template carries that id, or this account may not read it.');
    return;
  }
  host.innerHTML = templateRow(detail)
    + '<p class="fld__hint">Owned by another account. Editing it is recorded under your own account in the version history.</p>';
}

function paintAdmin() {
  const section = $('adminSection');
  if (section) section.hidden = !state.session.isAdmin;
}

/* ── entry points ──────────────────────────────────────────────────────────── */

export async function start() {
  // The catalogue is public, so it is read before the session is known rather
  // than after: a page that waited would be blank for as long as Clerk took.
  void startCatalogue();
  $('statusFilter')?.addEventListener('change', paint);
  $('adminOpen')?.addEventListener('click', adminOpen);
  $('signInBtn')?.addEventListener('click', (event) => {
    void NeoAuth.openSignIn({ reason: SIGN_IN_REASON, invoker: event.currentTarget });
  });

  document.addEventListener('click', (event) => {
    const el = event.target.closest('button[data-action]');
    if (!el) return;
    if (el.dataset.action === 'versions') void showVersions(el.dataset.id);
    if (el.dataset.action === 'archive') void archive(el.dataset.id);
  });
}

export async function onSession() {
  const out = $('signedOut');
  if (out) out.hidden = state.session.signedIn;
  paintAdmin();
  if (state.session.signedIn) await load();
  else { rows = []; paint(); }
}
