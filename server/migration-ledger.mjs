export function validLedger(value) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value.day || '') && Number.isInteger(value.count) && value.count >= 0 && Number.isFinite(value.lastAttemptAt);
}
// Track the local contribution separately: live reservations replace the usage
// document, so embedding migration markers there would make retries double count.
export async function migrateLedger(db, source, targetPath, markerPath) {
  if (!validLedger(source)) throw new Error('Invalid local recommendation allowance.');
  return db.runTransaction(async transaction => {
    const targetRef=db.doc(targetPath), markerRef=db.doc(markerPath);
    const [targetSnapshot,markerSnapshot]=await Promise.all([transaction.get(targetRef),transaction.get(markerRef)]);
    const target=targetSnapshot.data(), marker=markerSnapshot.data();
    if(target&&!validLedger(target))throw new Error('Invalid cloud recommendation allowance.');
    const prior=marker?.day===source.day?marker.count:0;
    if(source.count<prior)throw new Error('Local usage decreased since the previous migration.');
    const delta=source.count-prior;
    if(!target||target.day<source.day)transaction.set(targetRef,{...source});
    else if(target.day===source.day)transaction.set(targetRef,{day:target.day,count:target.count+delta,lastAttemptAt:Math.max(target.lastAttemptAt,source.lastAttemptAt)});
    transaction.set(markerRef,{...source});
    return delta;
  });
}
