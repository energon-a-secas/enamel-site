/**
 * The editor, declared rather than written.
 *
 * Every control is one entry naming a dotted path into the design document, so
 * the form and the C1 schema cannot drift: a field that names a path the schema
 * does not have is visibly dead, and a schema field with no entry here is
 * visibly missing. The shape of this file follows
 * `projects/cardforge-site/js/template-editor.js`, which drives a form from a
 * schema in the same way. Its renderer is not reusable here and is not reused.
 *
 * `path` beginning `meta.` addresses the template metadata rather than the
 * design. `editor.js` routes on that prefix and nothing else knows.
 */
import {
  SHAPE_IDS, METALS, PATTERN_KINDS, PIP_STYLES, FONT_ROLES,
  CERT_BACKGROUNDS, CERT_FRAMES, CATEGORIES, SPHERES, ACCESS_LEVELS, ORIENTATIONS,
} from './insignia/schema.js';
import { GLYPH_LIST } from './insignia/glyphs.js';
import { PAIRINGS } from './insignia/data/fonts.js';

export const ROLE_LABELS = {
  display: 'Display serif', slab: 'Slab', sans: 'Sans',
  mono: 'Mono', script: 'Script', rounded: 'Rounded',
};

export const CATEGORY_LABELS = {
  kt: 'Knowledge transfer', course: 'Course', challenge: 'Challenge',
  fun: 'Fun', meme: 'Meme', recognition: 'Recognition',
};

export const ACCESS_LABELS = {
  open: 'Open, anyone with a link',
  limited: 'Limited, a fixed number of seats',
  private: 'Private, not listed',
};

export const VALIDITY_CHOICES = [
  ['', 'Does not expire'],
  ['2592000000', '30 days'],
  ['7776000000', '90 days'],
  ['31536000000', 'A year'],
  ['63072000000', 'Two years'],
];

const roles = () => FONT_ROLES.map((r) => [r, ROLE_LABELS[r]]);

// The deployment's caps on the two list fields (convex/templates.ts checkMeta:
// 20 skills of 40 characters, 200 handles; convex/lib/handles.ts HANDLE_RE:
// 30 characters). A list is typed as one comma-separated line, so its
// `maxlength` is the items plus the ", " between them. The server still
// refuses what gets past this, and its message names the cap; this only stops
// the form accepting ten thousand characters it already knows will be refused.
const SKILLS_MAX = 20;
const SKILL_CHARS = 40;
const ALLOW_MAX = 200;
const HANDLE_CHARS = 30;
const listCap = (items, chars) => items * chars + (items - 1) * 2;

const f = (path, label, type, extra = {}) => ({ path, label, type, ...extra });

/** A nullable sub-object: the checkbox writes the whole thing or a null. */
const toggle = (path, label, make, hint) => ({ path, label, type: 'toggle', make, hint, rerender: true });

const ARC = (side) => [
  f(`arcs.${side}.text`, 'Words', 'text', { maxlength: 48 }),
  f(`arcs.${side}.font`, 'Face', 'select', { options: roles() }),
  f(`arcs.${side}.size`, 'Size', 'range', { min: 8, max: 120, step: 1 }),
  f(`arcs.${side}.tracking`, 'Tracking', 'range', { min: -8, max: 24, step: 0.5 }),
  f(`arcs.${side}.color`, 'Colour', 'color'),
];

function badgeGroups(d) {
  return [
    {
      id: 'words', title: 'Words', open: true, fields: [
        toggle('arcs.top', 'Top arc', () => ({ text: 'FIRST LIGHT', font: 'display', size: 40, tracking: 4, color: '#ffffff' })),
        ...(d.arcs.top ? ARC('top') : []),
        toggle('arcs.bottom', 'Bottom arc', () => ({ text: 'AT LAST', font: 'display', size: 30, tracking: 6, color: '#ffffff' })),
        ...(d.arcs.bottom ? ARC('bottom') : []),
        toggle('ribbon', 'Ribbon', () => ({ text: '2026', color: d.palette.accent, textColor: d.palette.ink, font: 'sans', size: 24 }),
          'A ribbon draws its own plate, so words on it stay readable on any silhouette.'),
        ...(d.ribbon ? [
          f('ribbon.text', 'Ribbon words', 'text', { maxlength: 24 }),
          f('ribbon.font', 'Face', 'select', { options: roles() }),
          f('ribbon.size', 'Size', 'range', { min: 8, max: 64, step: 1 }),
          f('ribbon.color', 'Band', 'color'),
          f('ribbon.textColor', 'Words', 'color'),
        ] : []),
        f('mark.edition', 'Edition mark', 'text', { maxlength: 16, hint: 'Sits under the top arc. Leave it empty to draw nothing.' }),
        f('mark.year', 'Year', 'year', { min: 1900, max: 2999 }),
      ],
    },
    {
      id: 'shape', title: 'Shape and colour', open: true, fields: [
        f('shape', 'Silhouette', 'select', { options: SHAPE_IDS.map((s) => [s, s.replace(/-/g, ' ')]) }),
        f('palette.base', 'Base', 'color'),
        f('palette.accent', 'Accent', 'color'),
        f('palette.ink', 'Ink', 'color', { hint: 'The provenance strip is drawn on this, with light text. A light ink makes it hard to read.' }),
        f('palette.metal', 'Metal', 'select', { options: METALS, hint: 'A metal replaces the base with a three-stop gradient.' }),
        f('pattern.kind', 'Pattern', 'select', { options: PATTERN_KINDS }),
        ...(d.pattern.kind === 'none' ? [] : [
          f('pattern.color', 'Pattern colour', 'color'),
          f('pattern.opacity', 'Pattern strength', 'range', { min: 0, max: 1, step: 0.01 }),
          f('pattern.scale', 'Pattern scale', 'range', { min: 0.25, max: 4, step: 0.05 }),
        ]),
        f('rings', 'Rings', 'rings'),
        f('pips.count', 'Pips lit', 'range', { min: 0, max: 10, step: 1 }),
        ...(d.pips.count ? [
          f('pips.max', 'Pips in the row', 'range', { min: 1, max: 10, step: 1 }),
          f('pips.style', 'Pip shape', 'select', { options: PIP_STYLES }),
          f('pips.color', 'Pip colour', 'color'),
        ] : []),
      ],
    },
    {
      id: 'centre', title: 'Centre', open: false, fields: [
        f('centre.kind', 'What sits in the middle', 'select', { options: [['glyph', 'A glyph'], ['image', 'An image'], ['none', 'Nothing']], rerender: true }),
        ...(d.centre.kind === 'glyph' ? [
          f('centre.glyph', 'Glyph', 'select', { options: GLYPH_LIST }),
          f('centre.color', 'Glyph colour', 'color'),
        ] : []),
        ...(d.centre.kind === 'image' ? [f('centre.imageRef', 'Image', 'art')] : []),
        ...(d.centre.kind === 'none' ? [] : [
          f('centre.scale', 'Size', 'range', { min: 0.2, max: 2, step: 0.05 }),
          f('centre.dy', 'Nudge up or down', 'range', { min: -128, max: 128, step: 1 }),
        ]),
      ],
    },
  ];
}

const CERT_SLOTS = [
  ['eyebrow', 'Eyebrow'], ['title', 'Title'], ['holderLabel', 'Holder label'],
  ['holder', 'Holder'], ['issuerLine', 'Issuer line'], ['body', 'Body'], ['dateLabel', 'Date label'],
];

function certificateGroups(d) {
  return [
    {
      id: 'words', title: 'Words', open: true, fields: [
        ...CERT_SLOTS.map(([slot, label]) => f(`text.${slot}`, label, 'certtext', { slot })),
        {
          path: 'text.holder', label: '', type: 'note',
          body: 'The holder, the issuer line and the date are filled from the award when a certificate is issued. What you type in them is a preview.',
        },
      ],
    },
    {
      id: 'surface', title: 'Page and surface', open: true, fields: [
        f('orientation', 'Orientation', 'select', { options: ORIENTATIONS, rerender: true }),
        f('palette.base', 'Ground', 'color'),
        f('palette.accent', 'Accent', 'color'),
        f('palette.ink', 'Ink', 'color'),
        f('background.kind', 'Background', 'select', { options: CERT_BACKGROUNDS }),
        ...(d.background.kind === 'plain' ? [] : [
          f('background.color', 'Background colour', 'color'),
          f('background.opacity', 'Background strength', 'range', { min: 0, max: 1, step: 0.01 }),
          f('background.scale', 'Background scale', 'range', { min: 0.25, max: 4, step: 0.05 }),
        ]),
        f('frame.style', 'Frame', 'select', { options: CERT_FRAMES }),
        ...(d.frame.style === 'none' ? [] : [
          f('frame.width', 'Frame weight', 'range', { min: 1, max: 64, step: 1 }),
          f('frame.color', 'Frame colour', 'color'),
          f('frame.inset', 'Frame inset', 'range', { min: 0, max: 200, step: 1 }),
        ]),
      ],
    },
    {
      id: 'seal', title: 'Seal', open: false, fields: [
        f('seal.design', 'Seal', 'seal'),
        ...(d.seal.design ? [
          f('seal.size', 'Seal size', 'range', { min: 60, max: 600, step: 5 }),
          f('seal.x', 'Across', 'range', { min: 0, max: 1, step: 0.01 }),
          f('seal.y', 'Down', 'range', { min: 0, max: 1, step: 0.01 }),
        ] : []),
      ],
    },
    {
      id: 'foot', title: 'Signatures and the foot', open: false, fields: [
        f('signatures', 'Signatures', 'signatures'),
        f('serial.font', 'Serial face', 'select', { options: roles() }),
        f('serial.size', 'Serial size', 'range', { min: 8, max: 64, step: 1 }),
        f('serial.color', 'Serial colour', 'color'),
        f('verify.qr', 'Draw the QR', 'check'),
        f('verify.size', 'QR size', 'range', { min: 60, max: 400, step: 5,
          hint: 'The square in the preview is drawn at the size it will take. It encodes a placeholder here and the real verify address once the award exists.' }),
        {
          path: 'serial.show', label: '', type: 'note',
          body: 'The serial and the verify line can be hidden in this preview. They are drawn anyway on anything issued.',
        },
      ],
    },
  ];
}

/** The template metadata group, the half of a template that is not the design. */
export function metaGroup(meta) {
  return {
    id: 'details', title: 'Template details', open: true, fields: [
      f('meta.name', 'Name', 'text', { maxlength: 80, hint: 'Screened against a list of real issuers when you publish.' }),
      f('meta.description', 'Description', 'textarea', { maxlength: 600 }),
      f('meta.criteria', 'How it is earned', 'textarea', { maxlength: 1200 }),
      f('meta.skills', 'Skills', 'list', {
        maxlength: listCap(SKILLS_MAX, SKILL_CHARS),
        hint: `Comma separated, up to ${SKILLS_MAX}, each ${SKILL_CHARS} characters or fewer.`,
      }),
      f('meta.category', 'Category', 'select', { options: CATEGORIES.map((c) => [c, CATEGORY_LABELS[c]]), rerender: true }),
      ...(meta.category === 'recognition' ? [f('meta.sphere', 'Sphere', 'select', { options: SPHERES })] : []),
      f('meta.access', 'Access', 'select', { options: ACCESS_LEVELS.map((a) => [a, ACCESS_LABELS[a]]), rerender: true }),
      ...(meta.access === 'limited' ? [f('meta.seats', 'Seats', 'number', { min: 1, step: 1 })] : []),
      ...(meta.access === 'private' ? [{
        path: 'meta.access', label: '', type: 'note',
        body: 'An uploaded image is not private, even on a private template: anyone with its address can open it. Removing the image is the only way to withdraw it.',
      }] : []),
      ...(meta.category === 'recognition' || meta.category === 'meme'
        ? [f('meta.stackable', 'Can be earned more than once', 'check')] : []),
      f('meta.defaultValidityMs', 'Awards expire', 'select', { options: VALIDITY_CHOICES, cast: 'msOrNull' }),
      f('meta.allowList', 'Only these handles', 'list', {
        maxlength: listCap(ALLOW_MAX, HANDLE_CHARS),
        hint: `Comma separated, up to ${ALLOW_MAX} handles. Leave empty to let anyone claim.`,
      }),
    ],
  };
}

/** The font pairing control. A pairing names roles, never a family (C7.13). */
export function pairingOptions() {
  return PAIRINGS.map((p) => [p.id, p.name]);
}

export function pairingNote(id) {
  return (PAIRINGS.find((p) => p.id === id) || PAIRINGS[0]).note;
}

/** Every group for a design, metadata last. */
export function groupsFor(design, meta) {
  const base = design.kind === 'certificate' ? certificateGroups(design) : badgeGroups(design);
  return [...base, metaGroup(meta)];
}
