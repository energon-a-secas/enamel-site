/**
 * The session, through the Neorgon Auth Kit, and the two facts about the
 * caller this site needs.
 *
 * The kit is vendored at `js/neorgon-auth.js` and refreshed only by
 * `packages/neorgon-ui/sync-auth.sh`. It owns the header slot, the sign-in
 * dialog and the Convex token; this module only listens. Sessions are shared
 * across `*.neorgon.com`, so somebody signed in on Sash arrives here already
 * signed in. Pages that gate an action import `NeoAuth` themselves and call
 * `requireSignIn` in front of it.
 *
 * Nothing here is an authorisation decision. The server keys every row by
 * `identity.subject` and refuses what it should refuse; `handle` and `isAdmin`
 * are read so the page can say what will happen before the call is made, never
 * to decide whether to make it.
 */
import { NeoAuth } from './neorgon-auth.js';
import { convex, api, q } from './api.js';
import { state } from './state.js';

let onChange = () => {};
let changeSeq = 0;

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

/**
 * The kit reports a real change only (signed in, signed out, another user, a
 * new label), never a token refresh tick, so the two reads above run once per
 * change rather than once a minute.
 */
async function onSessionChange({ signedIn, label, userId }) {
  const seq = ++changeSeq;
  state.session.signedIn = signedIn;
  state.session.label = signedIn ? label : '';
  state.session.userId = signedIn ? userId : null;
  if (signedIn) {
    // A read that cannot reach the deployment must not become an unhandled
    // rejection inside a listener nobody is awaiting. The caller is then known
    // to be signed in with no handle, which is a state the pages already render.
    try {
      await readCaller();
    } catch (err) {
      console.error('Enamel: could not read the caller profile', err);
      state.session.handle = null;
      state.session.isAdmin = false;
    }
    // A change that landed while the profile was being read has already won.
    if (seq !== changeSeq) return;
  } else {
    state.session.handle = null;
    state.session.isAdmin = false;
  }
  state.session.checked = true;
  onChange(state.session);
}

/**
 * Start the kit and subscribe. `handler` is called after every real session
 * change, once the handle and the admin flag have been read, so a page never
 * renders a half-known caller. On a page with no key the kit settles as
 * unavailable and the handler still runs, signed out.
 */
export async function initAuth(handler) {
  onChange = typeof handler === 'function' ? handler : () => {};
  NeoAuth.onChange((detail) => { void onSessionChange(detail); });
  await NeoAuth.start({ convex });
}
