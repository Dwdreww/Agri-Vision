import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLedger} from '../server/migration-ledger.mjs';
import {MemoryFirestore} from './helpers/memory-firestore.js';
test('quota migration adds the local contribution once and preserves live cloud attempts on retries',async()=>{
 const db=new MemoryFirestore([['usage/global',{day:'2026-11-04',count:2,lastAttemptAt:100}]]);
 const source={day:'2026-11-04',count:3,lastAttemptAt:200};
 await migrateLedger(db,source,'usage/global','markers/local');assert.equal(db.records.get('usage/global').count,5);
 db.records.set('usage/global',{day:'2026-11-04',count:6,lastAttemptAt:300});
 await migrateLedger(db,source,'usage/global','markers/local');assert.equal(db.records.get('usage/global').count,6);
 await migrateLedger(db,{...source,count:4},'usage/global','markers/local');assert.equal(db.records.get('usage/global').count,7);
 await migrateLedger(db,{day:'2026-11-03',count:50,lastAttemptAt:50},'usage/global','markers/older');assert.equal(db.records.get('usage/global').count,7);
 await assert.rejects(migrateLedger(db,{...source,count:2},'usage/global','markers/local'));
});
