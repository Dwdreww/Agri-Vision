export const GUEST_SESSION_KEY = 'agriVisionGuestEntry';

export function isGuestSession({ storage, search = '' }) {
  const entry = new URLSearchParams(search).get('guest');
  if (entry === '0') return false;
  if (entry === '1') return true;
  try { return storage?.getItem(GUEST_SESSION_KEY) === 'true'; }
  catch { return false; }
}

export function enterGuestSession({ storage, href }) {
  const url = new URL(href);
  url.searchParams.delete('guest');
  try {
    if (!storage) throw new Error('Session storage unavailable');
    storage.setItem(GUEST_SESSION_KEY, 'true');
    if (storage.getItem(GUEST_SESSION_KEY) !== 'true') throw new Error('Session storage write failed');
  } catch {
    // Guest entry still works if session storage is blocked. Records require
    // IndexedDB; its existing error screen explains unavailable persistence.
    url.searchParams.set('guest', '1');
  }
  return url.href;
}

export function leaveGuestSession({ storage, href }) {
  const url = new URL(href);
  url.searchParams.delete('guest');
  try {
    storage?.removeItem(GUEST_SESSION_KEY);
    if (storage?.getItem(GUEST_SESSION_KEY) === 'true') url.searchParams.set('guest', '0');
  } catch {
    // Explicit sign-in wins over a stale marker when storage cannot be cleared.
    url.searchParams.set('guest', '0');
  }
  return url.href;
}
