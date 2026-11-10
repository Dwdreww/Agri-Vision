import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ownerResources } from './owner-resources.mjs';
import { privateDirectory, privateJson, vercelContext, vercelEnvironmentValue, reportFailure } from './cloud-admin.mjs';
import { createPhotoStore, sha256 } from '../server/photo-store.mjs';
import { recommendationPath } from '../server/recommendation-store.mjs';
import { migrateLedger } from '../server/migration-ledger.mjs';
const require=createRequire(import.meta.url);
const {validCachedRecommendation}=require('../functions/local-recommendations.js');
const {SCHEMA_VERSION}=require('../functions/recommendations.js');
const optional=async file=>{try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}};

async function migrate(){
  const {db,projectId,photoRoot}=await ownerResources();
  const apply=process.argv.includes('--apply');
  const allUsers=await db.collection('users').get();
  const qa=new Set((await optional(path.join(privateDirectory,'qa-accounts.json')) || []).map(a=>a.uid));
  const users={docs:allUsers.docs.filter(owner=>!qa.has(owner.id))};
  const inventory=[],records=[],ledgers=[];const counts={users:users.docs.length,farms:0,plots:0,scans:0,observations:0,tasks:0,photos:0,photoBytes:0,recommendationCaches:0,cloudScans:0};
  for(const owner of users.docs){
    records.push({path:owner.ref.path,data:owner.data()});
    for(const collection of ['farms','plots','scans','observations','tasks']){
      const documents=await owner.ref.collection(collection).get();counts[collection]+=documents.size;
      for(const record of documents.docs){
        const data=record.data();records.push({path:record.ref.path,data});
        if(collection!=='scans')continue;
        if(data.storageProvider==='vercel-blob'){counts.cloudScans++;continue;}
        if(data.storageProvider!=='local')continue;
        const item={uid:owner.id,id:record.id,record,images:{},cache:null,provider:data.storageProvider};
        if(data.hasPhotos){
          for(const name of ['prepared','annotated']){
            if(data[`${name}ImagePath`]!==`users/${owner.id}/scans/${record.id}/${name}.jpg`)throw new Error('A photo path does not match its owner.');
            const bytes=await fs.readFile(path.join(photoRoot,owner.id,'scans',record.id,`${name}.jpg`));
            item.images[name]=bytes;counts.photos++;counts.photoBytes+=bytes.length;
          }
        }
        item.cache=await optional(path.join(photoRoot,owner.id,'scans',record.id,'recommendations.json'));
        if(item.cache){
          if(item.cache.version!==SCHEMA_VERSION||!validCachedRecommendation(item.cache.recommendation)||!/^[a-f0-9]{64}$/.test(item.cache.fingerprint))throw new Error('A local recommendation cache needs review before migration.');
          counts.recommendationCaches++;
        }
        inventory.push(item);
      }
    }
    const ledger=await optional(path.join(photoRoot,owner.id,'scans','.ai-usage.json'));
    if(ledger)ledgers.push({source:ledger,target:`users/${owner.id}/private/recommendation-usage`,marker:`users/${owner.id}/private/local-usage-migration`});
  }
  const global=await optional(path.join(photoRoot,'.ai-usage-global.json'));
  if(global)ledgers.push({source:global,target:'serverState/recommendation-usage',marker:'serverMigrations/local-photo-v1/ledgers/global'});
  const summary={projectId,counts,localRecords:inventory.length,cloudRecords:counts.cloudScans,sourceRetained:true,billingEnabled:false};
  console.log(JSON.stringify({...summary,apply}));
  if(!apply){await db.terminate();return;}
  // Never replace the initial snapshot during a resumed run.
  try{await fs.access(path.join(privateDirectory,'records-before.json'));}catch{await privateJson('records-before.json',records);}
  try{await fs.access(path.join(privateDirectory,'local-caches-before.json'));}catch{await privateJson('local-caches-before.json',inventory.filter(i=>i.cache).map(i=>({uid:i.uid,id:i.id,cache:i.cache})));}
  const v=await vercelContext();
  const token=await vercelEnvironmentValue(v,'BLOB_READ_WRITE_TOKEN');
  if(!token)throw new Error('Private photo storage authorization is missing.');
  const photos=createPhotoStore({token});
  const journal=[];
  for(const item of inventory){
    if(item.images.prepared){
      await photos.save(item.uid,item.id,item.images);
      for(const name of ['prepared','annotated'])await photos.verify(item.uid,item.id,`${name}.jpg`,sha256(item.images[name]));
    }
    if(item.cache){
      const ref=db.doc(recommendationPath(item.uid,item.id));
      await db.runTransaction(async tx=>{const existing=await tx.get(ref);if(!existing.exists||Date.parse(existing.get('recommendation.generatedAt'))<Date.parse(item.cache.recommendation.generatedAt))tx.set(ref,item.cache);});
    }
    journal.push({uid:item.uid,id:item.id,verified:true,checksums:Object.fromEntries(Object.entries(item.images).map(([name,bytes])=>[name,sha256(bytes)]))});
    await privateJson('photo-copy-journal.json',journal);
  }
  for(const ledger of ledgers)await migrateLedger(db,ledger.source,ledger.target,ledger.marker);
  if(!inventory.length){console.log(JSON.stringify({complete:true,alreadyMigrated:true,cloudScans:counts.cloudScans}));await db.terminate();return;}
  // Every source photo has now been copied and independently read back. Switch
  // the pointer only if the scan has not changed since inventory collection.
  for(const item of inventory){
    if(item.provider==='vercel-blob')continue;
    await db.runTransaction(async tx=>{
      const current=await tx.get(item.record.ref);
      if(!current.exists||!current.updateTime.isEqual(item.record.updateTime))throw new Error('A record changed during migration. Rerun to review and resume.');
      tx.update(item.record.ref,{storageProvider:'vercel-blob',photoChecksums:Object.fromEntries(Object.entries(item.images).map(([name,bytes])=>[name,sha256(bytes)])),cloudMigratedAt:new Date().toISOString()});
    });
  }
  await privateJson('migration-complete.json',{...summary,finishedAt:new Date().toISOString(),verifiedPhotos:counts.photos,quotaLedgers:ledgers.length});
  console.log(JSON.stringify({complete:true,verifiedPhotos:counts.photos,migratedScans:inventory.length,recommendationCaches:counts.recommendationCaches,sourceRetained:true}));
  await db.terminate();
}
migrate().catch(reportFailure);
