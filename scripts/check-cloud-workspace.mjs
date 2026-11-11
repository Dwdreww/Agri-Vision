import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { ownerResources } from './owner-resources.mjs';
import { privateDirectory, privateJson, vercelContext, vercelEnvironmentValue, reportFailure } from './cloud-admin.mjs';
import { createPhotoStore, sha256 } from '../server/photo-store.mjs';
import recommendations from '../functions/recommendations.js';

async function run(){
  const {db,auth,config}=await ownerResources();const v=await vercelContext();
  const project=await v.request(`/v9/projects/${v.project.projectId}`);
  const bypass=Object.keys(project.protectionBypass || {})[0];
  const photos=createPhotoStore({token:await vercelEnvironmentValue(v,'BLOB_READ_WRITE_TOKEN')});
  const file=path.join(privateDirectory,'qa-accounts.json');let accounts;
  try{accounts=JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  if(!accounts){
    accounts=[];
    for(let n=0;n<2;n++){
      const uid=`cloud-qa-${Date.now()}-${randomBytes(4).toString('hex')}`, email=`${uid}@example.invalid`, password=randomBytes(24).toString('base64url');
      await auth.createUser({uid,email,password,displayName:'Cloud verification'});
      accounts.push({uid,email,password});await privateJson('qa-accounts.json',accounts);
      await db.doc(`users/${uid}`).set({displayName:'Cloud verification',createdAt:new Date(),updatedAt:new Date()});
    }
  }
  if(process.argv.includes('--cleanup')){
    for(const a of accounts){if(!a.uid.startsWith('cloud-qa-'))throw Error('Invalid QA account.');await photos.removePrefix(`users/${a.uid}/scans/`);await db.recursiveDelete(db.doc(`users/${a.uid}`));await auth.deleteUser(a.uid).catch(e=>{if(e.code!=='auth/user-not-found')throw e;});}
    await fs.rename(file,path.join(privateDirectory,`qa-accounts-removed-${Date.now()}.json`));
    console.log(JSON.stringify({qaAccountsRemoved:accounts.length}));await db.terminate();return;
  }
  const url=process.argv.find(a=>a.startsWith('https://'));
  if(!url)throw Error('Pass the deployment URL.');
  const tokens=[];
  for(const a of accounts){const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${config.VITE_FIREBASE_API_KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:a.email,password:a.password,returnSecureToken:true})});const data=await r.json();if(!r.ok)throw Error('QA sign-in failed.');tokens.push(data.idToken);}
  const request=async(route,{user=0,method='GET',body}={})=>fetch(url+'/api/workspace/'+route,{method,headers:{...(bypass?{'x-vercel-protection-bypass':bypass}:{}),...(user!==null?{Authorization:'Bearer '+tokens[user]}:{}),...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});
  const checks=[];
  async function check(label,action){await action();checks.push(label);console.log(JSON.stringify({passed:label}));}
  await check('cloud API ready',async()=>{const r=await request('health',{user:null});assert.equal(r.status,200);assert.equal((await r.json()).storage,'vercel-blob');});
  await check('unauthenticated private request denied',async()=>assert.equal((await request('photos/cloud-check/prepared.jpg',{user:null})).status,401));
  const bytes=await fs.readFile(path.join(privateDirectory,'qa-photo.jpg'));
  const scanId='cloud-check';
  const scanRef=db.doc(`users/${accounts[0].uid}/scans/${scanId}`);
  if(!(await scanRef.get()).exists){
    await check('owner authenticated photo upload',async()=>{const form=new FormData();for(const key of ['prepared','annotated'])form.append(key,new Blob([bytes],{type:'image/jpeg'}),key+'.jpg');const r=await request(`scans/${scanId}/photos`,{method:'POST',body:form});if(r.status!==200)console.log(JSON.stringify({uploadStatus:r.status,body:(await r.text()).slice(0,250)}));assert.equal(r.status,200);});
    await scanRef.set({storageProvider:'vercel-blob',hasPhotos:true,preparedImagePath:`users/${accounts[0].uid}/scans/${scanId}/prepared.jpg`,annotatedImagePath:`users/${accounts[0].uid}/scans/${scanId}/annotated.jpg`,topClass:'No Disease',topConfidence:96,detectionCount:1,statusType:'healthy',statusLabel:'No Disease',modelVersion:'yolov8m-28a5c00ab63b-effnetb0-5b0e1f7211aa-roi-v2',classificationAvailable:true,inferenceMode:'region-classification',detections:[{classifier_class_index:0,classifier_class_name:'No_Disease',class_name:'No_Disease',efficientnet_confidence_percent:96,bbox:[0,0,80,60]}],createdAt:new Date()});
  }
  await check('private photo byte verification',async()=>{const r=await request(`photos/${scanId}/prepared.jpg`);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(sha256(Buffer.from(await r.arrayBuffer())),sha256(bytes));});
  await check('second account cannot read owner photo',async()=>assert.equal((await request(`photos/${scanId}/prepared.jpg?uid=${accounts[0].uid}`,{user:1})).status,404));
  await check('second account cannot read owner Firestore records',async()=>{const r=await fetch(`https://firestore.googleapis.com/v1/projects/${config.VITE_FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${accounts[0].uid}/scans/${scanId}`,{headers:{Authorization:'Bearer '+tokens[1]}});assert.equal(r.status,403);});
  await check('reading recommendations makes no provider call',async()=>{const r=await request(`scans/${scanId}/recommendations`);if(r.status!==200)console.log(JSON.stringify({recommendationStatus:r.status,body:await r.text()}));assert.equal(r.status,200);});
  if(process.argv.includes('--generate'))await check('Photo-based Gemini generation saved privately',async()=>{
    const consentVersion = recommendations.CONSENT_VERSION;
    await db.doc(`users/${accounts[0].uid}`).update({'preferences.recommendations':{version:consentVersion,enabled:true}});
    const r=await request(`scans/${scanId}/recommendations`,{method:'POST',body:{consentVersion,regenerate:false}});
    const result=await r.json();
    if(r.status!==200)console.log(JSON.stringify({generationStatus:r.status,errorCode:result.errorCode}));
    assert.equal(r.status,200);assert.equal(result.recommendation.source,'gemini');
    assert.equal(result.recommendation.sections.length,10);
    assert.equal(result.recommendation.sections[0].title,'Image Check & Diagnosis');
    assert.ok(Array.isArray(result.recommendation.photoObservations));
    assert.equal((await scanRef.collection('private').doc('recommendations').get()).exists,true);
  });
  await check('another account cannot delete owner scan',async()=>{const r=await request('actions/deleteScan',{user:1,method:'POST',body:{scanId}});assert.equal(r.status,404);assert.equal((await scanRef.get()).exists,true);});
  await privateJson('qa-result.json',{url,checks,checkedAt:new Date().toISOString()});
  console.log(JSON.stringify({complete:true,checks:checks.length}));await db.terminate();
}
run().catch(reportFailure);
