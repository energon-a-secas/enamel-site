/**
 * The preset picker as the empty state (U1).
 *
 * The studio's own path is preset, then words, then publish, but a first visit
 * used to open on the default badge with fifty controls on the right and
 * Presets one of six same-weight buttons in the stage head. A visitor who does
 * not know twenty-four finished designs exist starts editing the default. So
 * on a first visit the stage shows the twelve presets of the current kind as
 * pictures, and choosing one paints it, opens Words and puts the cursor in the
 * first words field. A returning visitor lands on their draft as before; the
 * Presets button stays for later.
 *
 * Every thumbnail is drawn by the kit with the preview provenance, so the first
 * picture a visitor sees carries the strip (C11.1). Nothing here holds design
 * state: it shows or hides what the page already has.
 */
import { presetGrid } from './render.js';
import { state } from './state.js';
import { $, param } from './utils.js';

// The key `state.js` persists the draft under, read here only to ask whether
// anything was ever saved. `state.js` does not export it; the name is also
// recorded in CLAUDE.md under Data. Change one, change both.
const DRAFT_KEY = 'enamel-studio-v1';

let active = false;

/** True when nothing was saved in this browser and the URL names no template. */
export function firstVisit() {
  if (param('t')) return false;
  try {
    return !localStorage.getItem(DRAFT_KEY);
  } catch {
    return true;
  }
}

/** Whether the stage is showing the picker rather than the preview. */
export function isEmpty() {
  return active;
}

function fillGrid() {
  const grid = $('stageGrid');
  if (grid) grid.replaceChildren(presetGrid(state.kind, null));
}

/** The parts of the stage that only mean something once a design is chosen. */
const PREVIEW_PARTS = ['preview', 'previewContext', 'warnings', 'loupeBtn'];

function toggle(showPicker) {
  const empty = $('stageEmpty');
  if (empty) empty.hidden = !showPicker;
  for (const id of PREVIEW_PARTS) {
    const el = $(id);
    if (el) el.hidden = showPicker;
  }
  $('previewStage')?.classList.toggle('is-empty', showPicker);
}

/** Show the picker for the current kind in place of the preview. */
export function showEmptyState() {
  active = true;
  fillGrid();
  toggle(true);
}

/** The kind changed while the picker was up: draw the other kind's presets. */
export function refreshEmptyState() {
  if (active) fillGrid();
}

/** Put the preview back. Safe to call when the picker was never shown. */
export function leaveEmptyState() {
  if (!active) return;
  active = false;
  toggle(false);
}

/**
 * Open the Words group and focus its first field, so the next thing the author
 * does after picking a design is the one thing a preset leaves to them.
 */
export function focusWords(editorRoot) {
  if (!editorRoot) return;
  const group = editorRoot.querySelector('details[data-group="words"]');
  if (!group) return;
  group.open = true;
  const field = group.querySelector('input[data-path], textarea[data-path]');
  if (field) {
    field.focus({ preventScroll: false });
    if (typeof field.select === 'function' && field.type === 'text') field.select();
  }
}
