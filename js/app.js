// ── Entry point ──────────────────────────────────────────────
// Three pages share this file. Each one names itself on <body data-page>, and
// its controller is loaded on demand so the studio's editor is not parsed by
// the two pages that do not have one.
//
// Order matters: the page renders its own state first, then Clerk loads, then
// the page is told about the session. A page that waited for Clerk before
// drawing would be blank for as long as the network took.

import { framed } from './frame.js';
import { bindEvents } from './events.js';
import { initAuth } from './auth.js';
import { showToast } from './utils.js';

const PAGES = {
  studio: () => import('./studio.js'),
  library: () => import('./library.js'),
  links: () => import('./links.js'),
};

/**
 * A read that cannot reach the deployment is a real failure and is said out
 * loud. This used to be a fire-and-forget call, which turned it into an
 * unhandled rejection: a console error nobody reads and nothing on the page.
 */
function onPageFailure(err) {
  console.error('Enamel: the Sash deployment could not be read', err);
  showToast('Could not read from Sash. Check the connection and reload.');
}

async function init() {
  // A36: framed, js/frame.js has already put a notice in place of the page.
  // Nothing below this line runs, so no sign-in mounts and no control is wired.
  if (framed) return;
  bindEvents();
  const load = PAGES[document.body.dataset.page];
  if (!load) return;
  const page = await load();
  await page.start();
  await initAuth(() => { page.onSession().catch(onPageFailure); });
}

void init();
