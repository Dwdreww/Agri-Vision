import test from 'node:test';
import assert from 'node:assert/strict';
import { GUEST_SESSION_KEY, isGuestSession, enterGuestSession, leaveGuestSession } from '../src/guest-session.js';

function fixture() {
  const values = new Map([['unrelated', 'keep']]);
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
  return { values, storage };
}

const href = 'https://example.com/?view=farms#history';
const detect = (storage, href) => isGuestSession({ storage, search: new URL(href).search });

test('fresh visits require sign-in; explicit guest entry survives reloads in the same session', () => {
  const { storage, values } = fixture();
  assert.equal(detect(storage, href), false);
  const entered = enterGuestSession({ storage, href });
  assert.equal(entered, href);
  assert.equal(detect(storage, entered), true);
  assert.equal(detect(storage, href), true);
  assert.equal(values.get('unrelated'), 'keep');
  assert.equal(detect(fixture().storage, href), false);
});

test('returning to sign-in clears only the entry marker and permits reentry', () => {
  const { storage, values } = fixture();
  enterGuestSession({ storage, href });
  const returned = leaveGuestSession({ storage, href: 'https://example.com/?view=farms&guest=1#history' });
  assert.equal(returned, href);
  assert.equal(detect(storage, returned), false);
  assert.equal(values.has(GUEST_SESSION_KEY), false);
  assert.equal(values.get('unrelated'), 'keep');
  assert.equal(detect(storage, enterGuestSession({ storage, href: returned })), true);
});

test('unavailable or throwing storage uses the URL for entry and refresh detection', () => {
  const blocked = {
    getItem() { throw new Error('Blocked'); },
    setItem() { throw new Error('Blocked'); },
    removeItem() { throw new Error('Blocked'); }
  };
  for (const storage of [undefined, blocked]) {
    assert.equal(detect(storage, href), false);
    const entered = enterGuestSession({ storage, href });
    assert.equal(entered, 'https://example.com/?view=farms&guest=1#history');
    assert.equal(detect(storage, entered), true);
    const returned = leaveGuestSession({ storage, href: entered });
    assert.equal(detect(storage, returned), false);
    assert.equal(new URL(returned).searchParams.get('view'), 'farms');
    assert.equal(new URL(returned).hash, '#history');
  }
});

test('sign-in override wins when removing the marker throws or silently fails', () => {
  for (const removeItem of [() => { throw new Error('Blocked'); }, () => {}]) {
    const { storage, values } = fixture();
    values.set(GUEST_SESSION_KEY, 'true');
    storage.removeItem = removeItem;
    const returned = leaveGuestSession({ storage, href });
    assert.equal(new URL(returned).searchParams.get('guest'), '0');
    assert.equal(detect(storage, returned), false);
    assert.equal(values.get('unrelated'), 'keep');
    const reentered = enterGuestSession({ storage, href: returned });
    assert.equal(reentered, href);
    assert.equal(detect(storage, reentered), true);
  }
});

test('silent write failures use URL entry; explicit entry works after a sign-in override', () => {
  const { storage } = fixture();
  storage.setItem = () => {};
  const entered = enterGuestSession({ storage, href: 'https://example.com/?view=farms&guest=0#history' });
  assert.equal(new URL(entered).searchParams.get('guest'), '1');
  assert.equal(detect(storage, entered), true);
});

test('only exact entry flags or marker values enable guest mode', () => {
  const { storage, values } = fixture();
  values.set(GUEST_SESSION_KEY, 'false');
  assert.equal(isGuestSession({ storage, search: '?guest=true' }), false);
  values.set(GUEST_SESSION_KEY, 'true');
  assert.equal(isGuestSession({ storage, search: '?guest=0' }), false);
});
