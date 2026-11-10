import { randomUUID } from 'node:crypto';
const lifetimeMs = 180000;

// Firestore leases serialize mutations across separate serverless instances,
// including generation, photo upload, and account/scan deletion.
export function createAccountLock(db, { now = () => Date.now() } = {}) {
  return async function withAccountLock(uid, operation) {
    const ref = db.doc(`serverLocks/account-${uid}`);
    const owner = randomUUID();
    await db.runTransaction(async tx => {
      const current = await tx.get(ref);
      if (current.exists && current.get('expiresAt') > now()) throw Object.assign(new Error('Another account operation is finishing. Please try again shortly.'), { status: 409, retryAfter: 2 });
      tx.set(ref, { owner, expiresAt: now() + lifetimeMs });
    });
    const renew = setInterval(() => {
      db.runTransaction(async tx => {
        const current = await tx.get(ref);
        if (current.get('owner') !== owner) throw new Error('Account operation lease was lost.');
        tx.update(ref, { expiresAt: now() + lifetimeMs });
      }).catch(error => console.error('Account lease renewal failed:', error.code || error.name));
    }, lifetimeMs / 3);
    renew.unref?.();
    try { return await operation(); }
    finally {
      clearInterval(renew);
      await db.runTransaction(async tx => {
        const current = await tx.get(ref);
        if (current.get('owner') === owner) tx.delete(ref);
      }).catch(error => console.error('Account lease cleanup failed:', error.code || error.name));
    }
  };
}
