import test from 'node:test';
import assert from 'node:assert/strict';
import { planGuestImport, executeGuestImport } from '../src/guest-import.js';

const photo='data:image/jpeg;base64,'+Buffer.from([255,216,255,224,5]).toString('base64');
function backup() { return {format:'agri-vision-browser-backup',version:1,workspace:{profile:{createdAt:'2026-10-01T12:00:00Z'},farms:[{id:'farm',name:'Farm'}],plots:[{id:'plot',farmId:'farm',name:'East'}],scans:[{id:'photo',plotId:'plot',hasPhotos:true,isPhotoOnly:true,preparedImagePath:'browser/scans/photo/prepared.jpg'}],observations:[{id:'note',plotId:'plot',note:'Inspect leaves',condition:'normal'}],tasks:[{id:'task',plotId:'plot',title:'Field visit'}]},photos:[{path:'browser/scans/photo/prepared.jpg',dataUrl:photo}]}; }
test('guest import previews photos and preserves relationships without copying ownership or sharing',async()=>{
  const value=backup();value.workspace.scans[0].shareForResearch=true;value.workspace.scans[0].uid='someone-else';
  const plan=await planGuestImport(JSON.stringify(value));
  assert.equal(plan.photos,1);assert.equal(plan.records.length,5);
  const scan=plan.records.find(item=>item.collection==='scans');
  assert.equal(scan.fields.plotId,plan.records[1].id);assert.equal(scan.fields.farmId,plan.records[0].id);
  assert.equal(scan.fields.shareForResearch,false);assert.equal(scan.fields.uid,undefined);assert.equal(scan.fields.classificationAvailable,false);
  assert.deepEqual(await scan.prepared.arrayBuffer(),await scan.annotated.arrayBuffer());
  assert.equal((await planGuestImport(JSON.stringify(value))).namespace,plan.namespace);
});
test('guest import rejects corrupt identifiers, photo paths, missing growing areas, and remote photos',async()=>{
  for(const mutate of [v=>v.workspace.plots[0].farmId='missing',v=>v.workspace.tasks[0].plotId='other',v=>v.workspace.farms.push(v.workspace.farms[0]),v=>v.photos[0].path='users/other/scans/photo/prepared.jpg',v=>v.photos[0].dataUrl='https://example.com/photo.jpg']) {
    const value=backup();mutate(value);await assert.rejects(planGuestImport(JSON.stringify(value)));
  }
});
test('guest import can resume after interruption and skips already imported records',async()=>{
  const plan=await planGuestImport(JSON.stringify(backup()));const docs=new Map();let uploaded=0;
  const adapter={assertAccount(){},exists:async(c,id)=>docs.has(c+'/'+id),upload:async()=>{uploaded++;return{storageProvider:'vercel-blob'};},create:async(c,id,data)=>{docs.set(c+'/'+id,data);return true;}};
  assert.deepEqual(await executeGuestImport(plan,adapter),{imported:5,skipped:0});
  assert.deepEqual(await executeGuestImport(plan,adapter),{imported:0,skipped:5});assert.equal(uploaded,1);
  let checks=0;await assert.rejects(executeGuestImport(plan,{...adapter,assertAccount(){if(++checks>1)throw Error('account changed');}}),/account changed/);
});
