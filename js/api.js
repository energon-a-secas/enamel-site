/**
 * The one place this site talks to Convex.
 *
 * `js/convex.js` is owned by the backend workstream and is the complete list of
 * function names this site may call (C8.4). Nothing here adds a name to it: this
 * module wraps the client so every page handles the two failure shapes the same
 * way, because C2 gives them different meanings.
 *
 *   an authentication failure THROWS ("Not authenticated"), because the only
 *   thing a client can do about it is offer sign in
 *   every other failure RETURNS { ok:false, code, message }, because the client
 *   renders a message per code
 *
 * A query returns its value or null and never carries the `ok` envelope.
 */
import { convex, api } from './convex.js';

export { api, convex };

/** True when the deployment refused us for want of an identity. */
export function isAuthError(err) {
  return /not authenticated/i.test(String((err && err.message) || err || ''));
}

/**
 * A query. An authentication failure is answered with `null` rather than an
 * exception, because every caller of a query on this site wants "nothing to
 * show" in that case and the sign-in control is already on the page.
 */
export async function q(name, args = {}) {
  try {
    return await convex.query(name, args);
  } catch (err) {
    if (isAuthError(err)) return null;
    throw err;
  }
}

/**
 * A mutation. An authentication failure comes back as a normal failure object
 * with the code `signed-out`, so a caller has one shape to render and the page
 * decides whether to open the sign-in panel.
 */
export async function m(name, args = {}) {
  try {
    return await convex.mutation(name, args);
  } catch (err) {
    if (isAuthError(err)) {
      return { ok: false, code: 'signed-out', message: 'Sign in to do that.' };
    }
    return { ok: false, code: 'unreachable', message: describeTransport(err) };
  }
}

/**
 * A transport failure is not a contract failure and must not be dressed as one.
 * The deployment being unreachable, a CSP refusal and a malformed argument all
 * land here, and each of them is a different thing to go and look at.
 */
function describeTransport(err) {
  const text = String((err && err.message) || err || 'unknown error');
  return `The Sash deployment did not answer: ${text}`;
}

/**
 * The extra sentence a code deserves, on top of the server's own message.
 *
 * The server writes for humans already, so most codes get nothing added here,
 * and a code whose message already says the next move gets nothing: the
 * blocked-issuer message names the term and says what to do about it, and an
 * added line only repeats it.
 */
const ADVICE = {
  'no-handle': 'A handle is claimed once, on sash.neorgon.com, and it is the issuing handle printed on every badge you make.',
  'rate-limited': 'The limit is per account and it is there so a loop cannot probe the edges of the checks.',
};

/** One line of copy for a failure object, ready to show. */
export function failText(res) {
  if (!res || res.ok) return '';
  const advice = ADVICE[res.code];
  return advice ? `${res.message} ${advice}` : res.message;
}
