/**
 * Shared mutable state. Every module imports the same object.
 *
 * Two designs are held at once, one per kind, so switching between Badge and
 * Certificate does not throw away the other one. The stored draft is a
 * convenience for a browser refresh: the template on Sash is the record, and
 * `templateId` is what ties the two together.
 */
import { normalizeDesign } from './insignia/schema.js';
import { presetDesign, DEFAULT_PRESET } from './insignia/data/presets.js';
import { clone } from './utils.js';

const STORAGE_KEY = 'enamel-studio-v1';

/** Template metadata, the half of a template that is not the design. */
export function blankMeta() {
  return {
    name: '',
    description: '',
    criteria: '',
    skills: [],
    category: 'fun',
    sphere: null,
    access: 'open',
    seats: null,
    allowList: [],
    stackable: false,
    defaultValidityMs: null,
  };
}

export const state = {
  kind: 'badge',
  designs: {
    badge: normalizeDesign(presetDesign(DEFAULT_PRESET.badge)),
    certificate: normalizeDesign(presetDesign(DEFAULT_PRESET.certificate)),
  },
  meta: blankMeta(),
  presetId: DEFAULT_PRESET.badge,
  pairingId: 'classic',
  // Set once the design has been saved to Sash at least once.
  templateId: null,
  publicId: null,
  // The kind the open template was created as. A template's kind is fixed on
  // the server (publish refuses a badge row holding a certificate design), so
  // switching kinds here detaches from it rather than saving a mismatch.
  templateKind: null,
  status: 'draft',
  versionN: 0,
  // Badge art: the storage reference goes in the design, the serving URL never
  // does (C10.3). The URL is resolved per session and handed to setArtUrls.
  artRef: null,
  artUrl: null,
  // Painted from the Auth Kit's onChange (js/auth.js). `checked` turns true once
  // the kit has settled, so a page can tell "not yet known" from "signed out".
  session: { signedIn: false, label: '', userId: null, handle: null, isAdmin: false, checked: false },
  dirty: false,
};

/** The design currently being edited. */
export function design() {
  return state.designs[state.kind];
}

/** Replace the design of the current kind, normalised. */
export function setDesign(next) {
  state.designs[state.kind] = normalizeDesign(next);
  state.dirty = true;
  return state.designs[state.kind];
}

// `dirty` is persisted with the rest. Without it a refresh reports "Saved" while
// holding local edits the deployment has never seen, which is the one thing the
// save bar exists to be honest about.
const PERSISTED = ['kind', 'designs', 'meta', 'presetId', 'pairingId', 'templateId', 'publicId',
  'templateKind', 'status', 'versionN', 'artRef', 'dirty'];

/** Load the saved draft. A corrupt or stale payload is discarded, not repaired. */
export function loadSaved(s = state) {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    for (const key of PERSISTED) {
      if (saved[key] === undefined) continue;
      s[key] = saved[key];
    }
    s.designs.badge = normalizeDesign(s.designs.badge);
    s.designs.certificate = normalizeDesign(s.designs.certificate);
    if (s.kind !== 'badge' && s.kind !== 'certificate') s.kind = 'badge';
    s.meta = { ...blankMeta(), ...(s.meta || {}) };
  } catch {
    /* a draft that will not parse is not worth repairing */
  }
}

/** Persist the current draft. */
export function save(s = state) {
  try {
    const out = {};
    for (const key of PERSISTED) out[key] = s[key];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
  } catch {
    /* quota exceeded or private browsing */
  }
}

/** Forget the local draft and start again from the default preset. */
export function resetDraft(s = state) {
  s.designs = {
    badge: normalizeDesign(presetDesign(DEFAULT_PRESET.badge)),
    certificate: normalizeDesign(presetDesign(DEFAULT_PRESET.certificate)),
  };
  s.meta = blankMeta();
  s.presetId = DEFAULT_PRESET[s.kind];
  s.templateId = null;
  s.publicId = null;
  s.templateKind = null;
  s.status = 'draft';
  s.versionN = 0;
  s.artRef = null;
  s.artUrl = null;
  s.dirty = false;
  save(s);
}

/**
 * Adopt a template read back from Sash. The design comes from the row rather
 * than from anything held locally, so what is on screen is what the deployment
 * will publish.
 */
export function adoptTemplate(detail, s = state) {
  s.templateId = detail.templateId;
  s.publicId = detail.publicId;
  s.templateKind = detail.kind;
  s.status = detail.status;
  s.versionN = detail.versionN || 0;
  s.kind = detail.kind === 'certificate' ? 'certificate' : 'badge';
  if (detail.design) s.designs[s.kind] = normalizeDesign(clone(detail.design));
  s.meta = {
    ...blankMeta(),
    name: detail.name || '',
    description: detail.description || '',
    criteria: detail.criteria || '',
    skills: Array.isArray(detail.skills) ? detail.skills.slice() : [],
    category: detail.category || 'fun',
    sphere: detail.sphere ?? null,
    access: detail.access || 'open',
    seats: detail.seats ?? null,
    allowList: Array.isArray(detail.allowList) ? detail.allowList.slice() : [],
    stackable: !!detail.stackable,
    defaultValidityMs: detail.defaultValidityMs ?? null,
  };
  s.artUrl = detail.artUrl || null;
  s.artRef = s.designs[s.kind]?.centre?.imageRef || null;
  // The row's design is not a preset, so the picker outlines nothing. The
  // last preset applied stayed lit through a load and a Randomize until the
  // 2026-09-10 verification measured it.
  s.presetId = null;
  s.dirty = false;
  save(s);
}
