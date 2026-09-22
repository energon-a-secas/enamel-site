/**
 * The studio: the editor, the preview, and the two calls that put a design on
 * Sash. `index.html`.
 *
 * Saving is two mutations rather than one because the deployment holds a
 * template in two halves: `templates:updateMeta` for the words about the badge
 * and `versions:saveDraft` for the design itself, which writes to the template
 * row and never to `templateVersions`. Only `templates:publish` writes a
 * version, and a version is frozen the moment it exists (C2.4).
 */
import { api, m, q, failText } from './api.js';
import { state, design, setDesign, loadSaved, save, adoptTemplate, resetDraft } from './state.js';
import { initEditor, renderEditor, applyPairing } from './editor.js';
import { paintPreview, paintContext, fixAt, setLoupe, startFonts } from './preview.js';
import { applyFix } from './fixes.js';
import { firstVisit, isEmpty, showEmptyState, refreshEmptyState, leaveEmptyState, focusWords } from './empty-state.js';
import { bindExport } from './exporting.js';
import { presetGrid } from './render.js';
import { openModal, closeModal } from './events.js';
import { attachNewArt, artCaption, pickImage } from './art.js';
import { presetDesign, randomDesign } from './insignia/data/presets.js';
import { PUBLIC_ID_RE } from './insignia/schema.js';
import { debounce } from './neorgon-dom.js';
import { NeoAuth } from './neorgon-auth.js';
import { $, param, showToast } from './utils.js';

let editorRoot = null;
let previewHost = null;
let warnHost = null;
let contextHost = null;
let stageEl = null;

// The lede of the kit's dialog when this page asks for a sign-in, and the one
// sentence next to the disabled controls that says the same thing.
const SIGN_IN_REASON = 'Sign in to save this design to Sash and publish it.';
const ART_REASON = 'Sign in to upload an image.';

/** The preview, its warnings, and the row under it, in one pass. */
function paintAll() {
  paintPreview(previewHost, warnHost);
  paintContext(contextHost);
}

// Any write while the picker is up means the author has started on the design
// under it, so the picker gives way to the preview. A kind switch is the one
// change that is not a write, and `setKind` never reaches this.
const repaint = debounce(() => {
  leaveEmptyState();
  paintAll();
  save();
  paintSaveState();
}, 90);

/* ── the save bar ──────────────────────────────────────────────────────────── */

function paintSaveState() {
  const el = $('saveState');
  if (!el) return;
  const bits = [];
  if (!state.templateId) bits.push('Not saved to Sash yet');
  else if (state.dirty) bits.push('Unsaved changes');
  else bits.push('Saved');
  if (state.publicId) bits.push(`id ${state.publicId}`);
  if (state.versionN) bits.push(`version ${state.versionN} published`);
  else if (state.templateId) bits.push('no version published');
  el.textContent = bits.join(' · ');

  const canWrite = state.session.signedIn;
  // Before the kit has settled nothing is said: on a host with a session the
  // controls would otherwise flash "sign in" at somebody already signed in.
  const askSignIn = state.session.checked && !canWrite;
  for (const id of ['saveDraftBtn', 'publishBtn']) {
    const button = $(id);
    if (!button) continue;
    button.toggleAttribute('disabled', !canWrite);
    // A disabled control is skipped by Tab, so the reason is attached to it
    // for a reader that lands on it another way, and detached once signed in
    // so nobody is told to sign in twice.
    if (askSignIn) button.setAttribute('aria-describedby', 'signInNotice');
    else button.removeAttribute('aria-describedby');
  }
  const ask = $('signInNotice');
  if (ask) ask.hidden = !askSignIn;
  const notice = $('handleNotice');
  if (notice) notice.hidden = !(canWrite && !state.session.handle);
}

/**
 * Keep the address bar honest: `?t=` names the template on screen, or nothing.
 * A URL that named a template the page was not showing is how a link followed
 * with unsaved work on the bench came to look as if it had opened (ENAMEL-02).
 */
function pointUrlAt(publicId) {
  const url = new URL(location.href);
  if (publicId) url.searchParams.set('t', publicId);
  else url.searchParams.delete('t');
  history.replaceState(null, '', url);
}

function showBlocked(res) {
  const box = $('blockNotice');
  if (!box) return;
  if (!res) { box.hidden = true; return; }
  $('blockMessage').textContent = failText(res);
  box.hidden = false;
  box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/* ── saving ────────────────────────────────────────────────────────────────── */

function metaArgs() {
  const meta = state.meta;
  return {
    name: meta.name,
    description: meta.description,
    criteria: meta.criteria,
    skills: meta.skills,
    category: meta.category,
    sphere: meta.sphere,
    access: meta.access,
    seats: meta.seats,
    allowList: meta.allowList,
    stackable: meta.stackable,
    defaultValidityMs: meta.defaultValidityMs,
  };
}

/**
 * Save the design and its metadata, creating the template on the first call.
 * Returns a failure object, or `{ ok: true }`.
 */
async function saveToSash() {
  if (!state.meta.name.trim()) {
    return { ok: false, code: 'invalid', message: 'Give the template a name first. It is the line a claimer reads.' };
  }
  if (!state.templateId) {
    const created = await m(api.templates.create, { kind: state.kind, design: design(), ...metaArgs() });
    if (!created.ok) return created;
    state.templateId = created.templateId;
    state.publicId = created.publicId;
    state.templateKind = state.kind;
    state.status = 'draft';
    state.dirty = false;
    save();
    pointUrlAt(created.publicId);
    return { ok: true };
  }

  const updated = await m(api.templates.updateMeta, { templateId: state.templateId, ...metaArgs() });
  if (!updated.ok) return updated;
  const saved = await m(api.versions.saveDraft, { templateId: state.templateId, design: design() });
  if (!saved.ok) return saved;
  state.dirty = false;
  save();
  return { ok: true };
}

async function onSaveDraft(event) {
  if (!(await NeoAuth.requireSignIn({ reason: SIGN_IN_REASON, invoker: event?.currentTarget }))) return;
  showBlocked(null);
  const result = await saveToSash();
  if (!result.ok) {
    showToast(failText(result));
    if (result.code === 'no-handle') $('handleNotice').hidden = false;
    return;
  }
  showToast('Draft saved.');
  paintSaveState();
}

async function onPublish() {
  // The session can lapse while the modal is open. The kit's dialog then sits
  // over it, and a dismissed dialog leaves the modal where it was.
  if (!(await NeoAuth.requireSignIn({ reason: SIGN_IN_REASON }))) return;
  showBlocked(null);
  const changelog = ($('changelogInput')?.value || '').trim();
  const saved = await saveToSash();
  if (!saved.ok) {
    closeModal('publishModal');
    showToast(failText(saved));
    if (saved.code === 'no-handle') $('handleNotice').hidden = false;
    return;
  }
  const published = await m(api.templates.publish, { templateId: state.templateId, changelog });
  closeModal('publishModal');
  if (!published.ok) {
    if (published.code === 'blocked-issuer') showBlocked(published);
    else showToast(failText(published));
    if (published.code === 'no-handle') $('handleNotice').hidden = false;
    return;
  }
  state.status = 'published';
  state.versionN = published.n;
  save();
  paintSaveState();
  showToast(`Published as version ${published.n}.`);
}

async function openPublish(event) {
  if (!(await NeoAuth.requireSignIn({ reason: SIGN_IN_REASON, invoker: event?.currentTarget }))) return;
  const hint = $('publishHint');
  if (hint) {
    hint.textContent = state.versionN
      ? `This template is at version ${state.versionN}. Publishing writes version ${state.versionN + 1}.`
      : 'This writes version 1 and makes the template claimable.';
  }
  const box = $('changelogInput');
  if (box) box.value = state.versionN ? '' : 'First cut';
  openModal('publishModal');
}

/* ── art ───────────────────────────────────────────────────────────────────── */

/**
 * A centre of kind `image` with no `imageRef` is an invalid document (C1.1), so
 * an author who asks for an image and then does not supply one is put back on a
 * glyph rather than left holding something the deployment will refuse.
 */
function abandonImage() {
  const d = design();
  if (d.centre.kind === 'image' && !d.centre.imageRef) {
    d.centre.kind = 'glyph';
    renderEditor(editorRoot);
    repaint();
  }
}

async function onArt(what) {
  const d = design();
  if (what === 'clear') {
    d.centre.imageRef = null;
    d.centre.kind = 'glyph';
    state.artRef = null;
    state.artUrl = null;
    state.dirty = true;
    renderEditor(editorRoot);
    repaint();
    return;
  }
  // Signed out, the kit's dialog asks instead of a toast; a dismissed dialog
  // puts the centre back on a glyph, as a cancelled file picker does.
  if (!(await NeoAuth.requireSignIn({ reason: ART_REASON }))) { abandonImage(); return; }

  const file = await pickImage();
  if (!file) { abandonImage(); return; }
  // Art is attached to a template row, so a design with nowhere to live has to
  // land first. Saying so beats a refusal the author cannot act on.
  if (!state.templateId) {
    showToast('Saving this design first, so the image has somewhere to attach.');
    // The design on screen still has no imageRef, so it would be refused. Save
    // it as it was before the author asked for an image.
    const restore = d.centre.kind;
    d.centre.kind = 'glyph';
    const saved = await saveToSash();
    d.centre.kind = restore;
    if (!saved.ok) { showToast(failText(saved)); abandonImage(); return; }
  }
  showToast('Shrinking and uploading.');
  const result = await attachNewArt(state.templateId, file);
  if (!result.ok) { showToast(result.message); abandonImage(); return; }

  d.centre.kind = 'image';
  d.centre.imageRef = result.artRef;
  state.artRef = result.artRef;
  state.artUrl = result.previewUrl;
  state.dirty = true;
  renderEditor(editorRoot);
  repaint();
  // The caption the form shows under the thumbnail, said at the moment it
  // happens, so a favicon author hears "scaled up 32 times as pixel art".
  showToast(`Image attached. ${artCaption(result.info)} Save the draft to keep it in the design.`);
}

/* ── presets, randomize, kind ──────────────────────────────────────────────── */

function openPresets() {
  const grid = $('presetGrid');
  if (grid) grid.replaceChildren(presetGrid(state.kind, state.presetId));
  openModal('presetModal');
}

/**
 * Paint a preset. From the stage's picker (U1) the preview replaces the picker
 * at once and the cursor lands in the first words field, because the words are
 * the one thing a preset leaves to the author; from the modal it closes as before.
 */
function applyPreset(id, fromStage = false) {
  setDesign(presetDesign(id));
  state.presetId = id;
  applyPairing(design(), state.pairingId);
  renderEditor(editorRoot);
  if (fromStage) {
    leaveEmptyState();
    paintAll();
    focusWords(editorRoot);
  } else {
    closeModal('presetModal');
  }
  repaint();
  showToast('Preset applied. The words are yours to change.');
}

function onRandomize() {
  setDesign(randomDesign(state.kind));
  // A random design is nobody's preset, so the picker outlines nothing.
  state.presetId = null;
  applyPairing(design(), state.pairingId);
  renderEditor(editorRoot);
  repaint();
}

/**
 * Forget the local draft and put the picker back on the stage, over the default
 * preset. Behind a confirm, because it is the one control on the page that
 * throws work away; what it throws away is only what this browser holds. A
 * template saved to Sash keeps its rows, and the studio simply stops pointing
 * at it.
 */
function onStartOver() {
  const sure = window.confirm('Start over? This forgets the design and the template details held in this browser. Anything already saved to Sash stays there.');
  if (!sure) return;
  resetDraft();
  pointUrlAt(null);
  paintKind();
  renderEditor(editorRoot);
  paintAll();
  paintSaveState();
  showEmptyState();
  showToast('Started over. Pick a preset to begin again; anything saved to Sash is still there.');
}

/** The one toggle on the stage that draws the preview at 2x. Presentation only. */
function onLoupe(event) {
  const button = event.currentTarget;
  const on = button.getAttribute('aria-pressed') !== 'true';
  setLoupe(stageEl, on);
  button.setAttribute('aria-pressed', on ? 'true' : 'false');
}

/**
 * A warning's own button (U3). The fix is applied through `fixes.js`, then the
 * form and the preview are rebuilt the way any control's write rebuilds them,
 * so the warnings re-measure and a fix that did not clear one stays visible.
 * Focus moves to the next fix, or to the list, because the button that was
 * clicked has just been redrawn out from under the pointer.
 */
function onFix(event) {
  const button = event.target.closest('[data-fix]');
  if (!button || !warnHost.contains(button)) return;
  const fix = fixAt(button.dataset.fix);
  if (!fix || !applyFix(fix)) return;
  renderEditor(editorRoot);
  paintAll();
  save();
  paintSaveState();
  const next = warnHost.querySelector('.warn__fix') || warnHost;
  next.focus({ preventScroll: true });
}

function setKind(kind) {
  if (kind === state.kind) return;
  if (state.templateId && state.templateKind && state.templateKind !== kind) {
    // A template's kind is fixed on the server: publish refuses a badge row
    // holding a certificate design. Detaching is honest about what happens next.
    state.templateId = null;
    state.publicId = null;
    state.templateKind = null;
    state.status = 'draft';
    state.versionN = 0;
    pointUrlAt(null);
    showToast('A template keeps the kind it was made as, so this is a new design. The other one is untouched.');
  }
  state.kind = kind;
  paintKind();
  renderEditor(editorRoot);
  // While the picker is up, a kind switch shows the other kind's presets and
  // saves nothing: a visitor who has chosen nothing yet still has a first visit.
  if (isEmpty()) { refreshEmptyState(); return; }
  repaint();
}

/** The segmented control, in the class and in the accessibility tree. */
function paintKind() {
  for (const button of document.querySelectorAll('[data-kind]')) {
    const on = button.dataset.kind === state.kind;
    button.classList.toggle('is-on', on);
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
}

/* ── loading a template ────────────────────────────────────────────────────── */

async function loadTemplate(publicId) {
  // Opening a template replaces the design on screen, so a `?t=` link must not
  // quietly take an author's unsaved work with it. The URL keeps the id, so
  // saving and reloading opens it.
  if (state.dirty && state.publicId !== publicId) {
    showToast('There are unsaved changes here, so that link was not opened. Save this design first, or use Start over to drop the changes, then open the link again.');
    // The page is still showing what it was showing. Say so in the URL too,
    // rather than leaving it naming the template that was refused.
    pointUrlAt(state.publicId);
    return;
  }
  const detail = await q(api.templates.get, { publicId });
  if (!detail) {
    // Signed out there is no account to blame: only a published template is
    // readable without one, and a draft of yours wants a sign-in first.
    showToast(state.session.signedIn
      ? 'That template is not readable from this account.'
      : 'No published template has that id. If it is a draft of yours, sign in.');
    return;
  }
  adoptTemplate(detail);
  if (state.artRef && detail.artUrl) state.artUrl = detail.artUrl;
  paintKind();
  renderEditor(editorRoot);
  leaveEmptyState();
  paintAll();
  paintSaveState();
}

/* ── entry points ──────────────────────────────────────────────────────────── */

export async function start() {
  editorRoot = $('editorRoot');
  previewHost = $('preview');
  warnHost = $('warnings');
  contextHost = $('previewContext');
  stageEl = $('previewStage');
  // Asked before the draft is read, since reading it is how a visit stops
  // being a first one.
  const fresh = firstVisit();
  loadSaved();
  startFonts();

  initEditor(editorRoot, repaint, onArt);
  renderEditor(editorRoot);
  paintAll();
  paintSaveState();
  // U1. Nothing chosen yet: the stage is the picker, and the default design
  // under it is painted so that any write shows it at once.
  if (fresh) showEmptyState();

  paintKind();
  for (const button of document.querySelectorAll('[data-kind]')) {
    button.addEventListener('click', () => setKind(button.dataset.kind));
  }
  $('presetBtn')?.addEventListener('click', openPresets);
  $('randomBtn')?.addEventListener('click', onRandomize);
  $('resetBtn')?.addEventListener('click', onStartOver);
  $('loupeBtn')?.addEventListener('click', onLoupe);
  warnHost?.addEventListener('click', onFix);
  $('stageGrid')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-preset]');
    if (button) applyPreset(button.dataset.preset, true);
  });
  bindExport();
  $('saveDraftBtn')?.addEventListener('click', onSaveDraft);
  $('publishBtn')?.addEventListener('click', openPublish);
  $('publishConfirm')?.addEventListener('click', onPublish);
  $('signInBtn')?.addEventListener('click', (event) => {
    void NeoAuth.openSignIn({ reason: SIGN_IN_REASON, invoker: event.currentTarget });
  });
  $('presetGrid')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-preset]');
    if (button) applyPreset(button.dataset.preset);
  });
}

/** Called after every session change, once the handle is known. */
export async function onSession() {
  paintSaveState();
  const wanted = param('t').toLowerCase();
  if (!wanted) return;
  // The same gate every other lookup applies (C4.1): a value that is not the
  // shape of a public id never reaches the deployment. A 10,000-character
  // parameter used to go out as a 10 KB query and come back as a toast that
  // blamed the account.
  if (!PUBLIC_ID_RE.test(wanted)) {
    showToast('That link does not name a template. A public id is ten characters from the Crockford alphabet.');
    return;
  }
  // A published template is readable by anyone, so a visitor arriving on a
  // link gets to see it signed in or not. Only the template already on screen
  // is left alone: the session can change more than once on one page.
  if (wanted !== state.publicId) await loadTemplate(wanted);
}
