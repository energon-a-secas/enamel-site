/**
 * Clerk session, and the two facts about the caller this site needs.
 *
 * The client is vendored at `js/vendor/neorgon-auth.js` and refreshed only by
 * `packages/neorgon-ui/sync-auth.sh`. Sessions are shared across
 * `*.neorgon.com`, so somebody signed in on Sash arrives here already signed in.
 *
 * Nothing here is an authorisation decision. The server keys every row by
 * `identity.subject` and refuses what it should refuse; `handle` and `isAdmin`
 * are read so the page can say what will happen before the call is made, never
 * to decide whether to make it.
 */
import { convex, api, q } from './api.js';
import { state } from './state.js';
import { $ } from './utils.js';

let clerk = null;
let onChange = () => {};

function publishableKey() {
  const meta = document.querySelector('meta[name="clerk-publishable-key"]');
  return (meta && meta.content) || '';
}

function showAuthError(message) {
  const el = $('authError');
  if (!el) return;
  el.textContent = message;
  el.hidden = !message;
}

/** Open the account panel under the header, or Clerk's own dialog. */
export function openSignIn() {
  const panel = $('authPanel');
  const toggle = $('authToggle');
  if (panel && !panel.classList.contains('open')) {
    panel.classList.add('open');
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
  }
  if (clerk && typeof clerk.neorgonOpenSignIn === 'function' && !clerk.session) {
    clerk.neorgonOpenSignIn();
  }
}

function togglePanel() {
  const panel = $('authPanel');
  const toggle = $('authToggle');
  if (!panel) return;
  const open = panel.classList.toggle('open');
  if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
}

/**
 * The caller's handle and admin flag, read once per session change.
 * A signed-in caller with no profile row has no handle, which is a real state:
 * a handle is claimed on Sash and publishing needs one.
 */
async function readCaller() {
  const profile = await q(api.profiles.me);
  if (profile) {
    state.session.handle = profile.handle || null;
    state.session.isAdmin = !!profile.isAdmin;
    return;
  }
  state.session.handle = null;
  state.session.isAdmin = !!(await q(api.auth.isAdmin));
}

function paintSession() {
  const gate = $('authGate');
  const user = $('authUser');
  const name = $('authUsername');
  const toggle = $('authToggle');
  const signedIn = state.session.signedIn;
  if (gate) gate.hidden = signedIn;
  if (user) user.hidden = !signedIn;
  if (toggle) toggle.classList.toggle('logged-in', signedIn);
  if (name) {
    name.textContent = state.session.handle
      ? `@${state.session.handle}`
      : (state.session.label || '');
  }
}

/**
 * Wire the account control and load Clerk. `handler` is called after every
 * session change, once the handle and the admin flag have been read, so a page
 * never renders a half-known caller.
 */
export async function initAuth(handler) {
  onChange = typeof handler === 'function' ? handler : () => {};
  $('authToggle')?.addEventListener('click', togglePanel);

  const key = publishableKey();
  if (!key) {
    showAuthError('This page is missing its Clerk key, so signing in is not possible here.');
    state.session.checked = true;
    onChange(state.session);
    return;
  }

  try {
    const { initNeorgonClerkConvex, neorgonDisplayLabel } = await import('./vendor/neorgon-auth.js');
    clerk = await initNeorgonClerkConvex({
      convex,
      publishableKey: key,
      signInHost: '#neorgon-signin-mount',
      userButtonHost: '#neorgon-user-mount',
      signInProps: { appearance: { layout: { unsafe_disableDevelopmentModeWarnings: true } } },
      onSession: ({ clerk: instance, hasSession }) => {
        void (async () => {
          state.session.signedIn = hasSession;
          state.session.label = hasSession ? neorgonDisplayLabel(instance) : '';
          if (hasSession) {
            // A read that cannot reach the deployment must not become an
            // unhandled rejection inside a callback nobody is awaiting. The
            // caller is then known to be signed in with no handle, which is a
            // state the pages already render.
            try {
              await readCaller();
            } catch (err) {
              console.error('Enamel: could not read the caller profile', err);
              state.session.handle = null;
              state.session.isAdmin = false;
            }
          } else {
            state.session.handle = null;
            state.session.isAdmin = false;
          }
          state.session.checked = true;
          paintSession();
          onChange(state.session);
        })();
      },
    });
  } catch (err) {
    // Loud, and on the page rather than only in the console: a sign-in control
    // that does nothing is the failure this message exists to name.
    console.error('Enamel: Clerk did not load', err);
    showAuthError('Sign in did not load. Reload the page, or check the browser console.');
    state.session.checked = true;
    onChange(state.session);
  }
}
