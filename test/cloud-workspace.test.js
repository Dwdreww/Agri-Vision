import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudWorkspace } from '../server/workspace.mjs';
import { createAccountLock } from '../server/account-lock.mjs';
import { createPhotoStore, photoPath, sha256 } from '../server/photo-store.mjs';
import { createRecommendationStore, recommendationPath } from '../server/recommendation-store.mjs';
import { MemoryFirestore } from './helpers/memory-firestore.js';
import recommendations from '../functions/recommendations.js';

const jpeg = Buffer.from([255,216,255,224,1,2,3]);
const consent = { regenerate: false, consentVersion: recommendations.CONSENT_VERSION };
const scan = { topClass:'Fruit Rot Disease',topConfidence:80,detectionCount:1,statusType:'risk',modelVersion:'yolov8m-28a5c00ab63b-effnetb0-43adddf64b22-roi-v2',inferenceMode:'region-classification',classificationAvailable:true,
  detections:[{classifier_class_index:2,classifier_class_name:'fruit_rot',class_name:'Fruit_Rot_Disease',efficientnet_confidence_percent:80}],storageProvider:'vercel-blob',hasPhotos:true };
function fixture(fetchImpl) {
  const db = new MemoryFirestore([['users/alice',{}],['users/bob',{}],['users/alice/scans/private',scan],['users/bob/scans/theirs',scan],['users/locked',{deletionInProgress:true}]]);
  const files = new Map([[photoPath('alice','private','prepared.jpg'),jpeg],[photoPath('bob','theirs','prepared.jpg'),jpeg]]);
  const removed = [];
  const photoReads = [];
  const photos = { supports: value => value==='vercel-blob',
    read: async (uid,id,name) => {
      const key = photoPath(uid,id,name);
      photoReads.push(key);
      return files.has(key) ? {statusCode:200,stream:new Blob([files.get(key)]).stream()} : null;
    },
    save: async (uid,id,images) => { for(const name of ['prepared','annotated'])files.set(photoPath(uid,id,name+'.jpg'),images[name]);return {}; },
    removePrefix: async prefix => { removed.push(prefix);for(const key of files.keys())if(key.startsWith(prefix))files.delete(key); }
  };
  const deletedUsers = [];
  const auth = { verifyIdToken: async (token,revoked) => { assert.equal(revoked,true);if(!['alice','bob','locked'].includes(token))throw Object.assign(new Error('bad'),{code:'auth/invalid-id-token'});return {uid:token,auth_time:Math.floor(Date.now()/1000)}; },deleteUser: async uid=>deletedUsers.push(uid) };
  let generations = 0;
  const recommendationProvider = async (prepared,{photo})=>{
    assert.equal(prepared.input.condition,'Fruit Rot Disease');
    assert.deepEqual(photo,jpeg);
    generations++;
    return {source:'gemini',analysis:'Inspect the model-reported fruit rot.',concerns:[],actions:[{text:'Inspect the fruit.',reason:'Compare the model result in person.'}],tips:[],provider:'Google Gemini',model:'gemini-3.5-flash-lite',generatedAt:new Date().toISOString()};
  };
  const handle = createCloudWorkspace({ db,auth,photos,apiKey:'test-only',fetchImpl,
    recommendationProvider: fetchImpl ? undefined : recommendationProvider });
  const request = (path,{uid='alice',method='GET',body}={}) => handle(new Request('https://example.com/api/workspace/'+path,{method,headers:{...(uid?{Authorization:'Bearer '+uid}:{}),...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})}));
  return { db,files,removed,request,deletedUsers,photoReads,generations:()=>generations };
}

test('cloud photos authenticate every read and cannot cross account boundaries',async()=>{
  const f=fixture();
  assert.equal((await f.request('health',{uid:null})).status,200);
  assert.equal((await f.request('photos/private/prepared.jpg',{uid:null})).status,401);
  assert.equal((await f.request('photos/private/prepared.jpg',{uid:'expired'})).status,401);
  assert.equal((await f.request('photos/private/prepared.jpg?uid=alice',{uid:'bob'})).status,404);
  assert.equal((await f.request('photos/private/prepared.jpg',{uid:'locked'})).status,409);
  const response=await f.request('photos/private/prepared.jpg');
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),jpeg);
  assert.equal((await f.request('photos/private/../../secrets')).status,404);
});

test('cloud upload and cleanup only act on the verified owner and protect saved photos',async()=>{
  const f=fixture();const form=()=>{const data=new FormData();for(const key of ['prepared','annotated'])data.append(key,new Blob([jpeg],{type:'image/jpeg'}),key+'.jpg');return data;};
  assert.equal((await f.request('scans/new/photos',{method:'POST',body:form()})).status,200);
  assert.ok(f.files.has(photoPath('alice','new','prepared.jpg')));
  assert.equal((await f.request('scans/private/photos',{method:'DELETE'})).status,409);
  assert.equal((await f.request('scans/private/photos',{method:'POST',body:form()})).status,409);
  assert.equal((await f.request('scans/new/photos',{method:'DELETE'})).status,200);
  assert.ok(f.files.has(photoPath('bob','theirs','prepared.jpg')));
});

test('cloud recommendations read saved data, require consent, and persist privately in Firestore',async()=>{
  const f=fixture();
  assert.equal((await f.request('scans/private/recommendations',{uid:'bob'})).status,404);
  assert.equal((await f.request('scans/private/recommendations')).status,200);assert.equal(f.generations(),0);
  assert.equal((await f.request('scans/private/recommendations',{method:'POST',body:{regenerate:false}})).status,400);
  const generate = (body=consent) => f.request('scans/private/recommendations',{method:'POST',body});
  for (const preference of [{version:'2026-10-08',enabled:true},{version:consent.consentVersion,enabled:false}]) {
    f.db.records.set('users/alice',{preferences:{recommendations:preference}});
    const denied = await generate();
    assert.equal(denied.status,403);
    assert.equal((await denied.json()).errorCode,'AI_PHOTO_CONSENT_REQUIRED');
  }
  assert.deepEqual(f.photoReads,[]);
  assert.equal(f.generations(),0);
  f.db.records.set('users/alice',{preferences:{recommendations:{version:consent.consentVersion,enabled:true}}});
  assert.equal((await generate({...consent,photo:jpeg.toString('base64')})).status,400);
  const response=await generate();
  assert.equal(response.status,200);assert.equal(f.generations(),1);
  assert.deepEqual(f.photoReads,[photoPath('alice','private','prepared.jpg')]);
  assert.equal((await response.json()).recommendation.source,'gemini');
  assert.equal(f.db.records.get(recommendationPath('alice','private')).recommendation.source,'gemini');
  assert.equal((await generate()).status,200);
  f.db.records.set('users/alice',{preferences:{recommendations:{version:consent.consentVersion,enabled:false}}});
  assert.equal((await (await f.request('scans/private/recommendations')).json()).recommendation.source,'gemini');
  assert.equal((await generate({...consent,regenerate:true})).status,403);
  assert.equal(f.generations(),1);
});

test('a missing original uses standard guidance without a provider call or quota charge',async()=>{
  const f=fixture();
  f.db.records.set('users/alice',{preferences:{recommendations:{version:consent.consentVersion,enabled:true}}});
  f.files.delete(photoPath('alice','private','prepared.jpg'));
  f.files.set(photoPath('alice','private','annotated.jpg'),jpeg);
  const response=await f.request('scans/private/recommendations',{method:'POST',body:consent});
  assert.equal(response.status,503);
  const result=await response.json();
  assert.equal(result.errorCode,'AI_PHOTO_UNAVAILABLE');
  assert.equal(result.recommendation.source,'standard');
  assert.deepEqual(f.photoReads,[photoPath('alice','private','prepared.jpg')]);
  assert.equal(f.generations(),0);
  assert.equal(f.db.records.has('users/alice/private/recommendation-usage'),false);
});

test('a completed inconclusive scan can receive a photo report after opt-in',async()=>{
  let calls = 0;
  const observations = ['The top has a dense cluster of leaves.'];
  const f = fixture(async (_url, options) => {
    calls++;
    const body = JSON.parse(options.body);
    const [image, text] = body.contents[0].parts;
    assert.deepEqual(Buffer.from(image.inlineData.data, 'base64'), jpeg);
    const input = JSON.parse(text.text);
    assert.deepEqual(input.result, {condition:'Unclassified',confidence:null,regions:[]});
    const result = {actions: input.immediateActions, sections: Array(10).fill('a'), photoObservations:observations};
    return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(result)}]}}]});
  });
  const inconclusive = {...scan,topClass:'No Detection',topConfidence:null,statusType:'monitor',detectionCount:0,detections:[]};
  f.db.records.set('users/alice/scans/private',inconclusive);
  const prepared = recommendations.prepareScan(inconclusive);
  f.db.records.set(recommendationPath('alice','private'),{
    version:recommendations.SCHEMA_VERSION,
    fingerprint:prepared.previousFingerprints[0],
    recommendation:recommendations.standardRecommendation(prepared)
  });
  const route = 'scans/private/recommendations';
  assert.equal((await f.request(route,{method:'POST',body:consent})).status,403);
  assert.equal(calls,0);
  assert.deepEqual(f.photoReads,[]);
  f.db.records.set('users/alice',{preferences:{recommendations:{version:consent.consentVersion,enabled:true}}});
  const response = await f.request(route,{method:'POST',body:consent});
  assert.equal(response.status,200);
  const {recommendation} = await response.json();
  assert.equal(recommendation.source,'gemini');
  assert.match(recommendation.analysis,/could not classify/);
  assert.deepEqual(recommendation.photoObservations,observations);
  assert.equal(recommendation.sections.length,10);
  assert.deepEqual((await (await f.request(route)).json()).recommendation,recommendation);
  const previousReport = {
    ...recommendation,
    sections: Array.from({length:15}, (_, index) => ({title:`Topic ${index + 1}`,text:'Inspect the fruit in person.'}))
  };
  f.db.records.set(recommendationPath('alice','private'),{
    version:recommendations.SCHEMA_VERSION,
    fingerprint:prepared.previousFingerprints[0],
    recommendation:previousReport
  });
  assert.deepEqual((await (await f.request(route)).json()).recommendation,previousReport);
  assert.equal(calls,1);
});

test('cloud scan deletion removes private subdocuments and photos without touching another user',async()=>{
  const f=fixture();f.db.records.set(recommendationPath('alice','private'),{recommendation:{}});
  assert.equal((await f.request('actions/deleteScan',{method:'POST',body:{scanId:'private'}})).status,200);
  assert.equal(f.db.records.has('users/alice/scans/private'),false);assert.equal(f.db.records.has(recommendationPath('alice','private')),false);
  assert.equal(f.files.has(photoPath('alice','private','prepared.jpg')),false);assert.equal(f.db.records.has('users/bob/scans/theirs'),true);
});

test('cloud account deletion requires confirmation and removes only that account',async()=>{
  const f=fixture();
  assert.equal((await f.request('actions/deleteAccount',{method:'POST',body:{confirm:false}})).status,400);
  assert.equal((await f.request('actions/deleteAccount',{method:'POST',body:{confirm:true}})).status,200);
  assert.deepEqual(f.deletedUsers,['alice']);assert.equal(f.db.records.has('users/bob'),true);
  assert.equal([...f.db.records.keys()].some(key=>key.startsWith('users/alice')),false);
});

test('serverless instances share an account lease and independent accounts can proceed',async()=>{
  const db=new MemoryFirestore();const one=createAccountLock(db),two=createAccountLock(db);let finish;
  const operation=one('alice',()=>new Promise(resolve=>{finish=resolve;}));
  await new Promise(resolve=>setImmediate(resolve));
  await assert.rejects(two('alice',async()=>{}),error=>error.status===409);
  assert.equal(await two('bob',async()=>42),42);finish('done');assert.equal(await operation,'done');
  assert.equal(await two('alice',async()=>7),7);
});

test('cloud recommendation reservations are atomic across accounts and preserve daily limits',async()=>{
  const db=new MemoryFirestore();const store=createRecommendationStore(db,{globalLimit:1});const date=new Date('2026-11-04T12:00:00Z');
  const result=await Promise.allSettled([store.reserve('alice',date),store.reserve('bob',date)]);
  assert.equal(result.filter(item=>item.status==='fulfilled').length,1);assert.equal(db.records.get('serverState/recommendation-usage').count,1);
});

test('private blob uploads are immutable, retry safely, and validate bytes before writing',async()=>{
  const files=new Map();let writes=0;
  const store=createPhotoStore({token:'test-only',sdk:{
    get:async path=>files.has(path)?{statusCode:200,stream:new Blob([files.get(path)]).stream()}:null,
    put:async(path,bytes,options)=>{assert.equal(options.access,'private');assert.equal(options.allowOverwrite,false);files.set(path,bytes);writes++;},
    del:async paths=>{for(const path of paths)files.delete(path);}
  }});
  const checksum=await store.save('alice','one',{prepared:jpeg,annotated:jpeg});assert.equal(checksum.prepared,sha256(jpeg));assert.equal(writes,2);
  await store.save('alice','one',{prepared:jpeg,annotated:jpeg});assert.equal(writes,2);
  await store.verify('alice','one','prepared.jpg',sha256(jpeg));
  await assert.rejects(store.save('alice','one',{prepared:Buffer.concat([jpeg,Buffer.from([1])]),annotated:jpeg}),error=>error.status===409);
  await assert.rejects(store.save('alice','bad',{prepared:Buffer.from('not jpeg'),annotated:jpeg}),error=>error.status===400);
  assert.equal(writes,2);assert.throws(()=>photoPath('../alice','one','prepared.jpg'));
});
