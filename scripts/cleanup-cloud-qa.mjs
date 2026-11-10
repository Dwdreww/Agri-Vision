import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { ownerResources } from './owner-resources.mjs';
import { privateDirectory, privateJson, reportFailure } from './cloud-admin.mjs';

// Operates only on the disposable accounts recorded by the cloud QA script.
async function cleanup(){
  const {db,auth,config}=await ownerResources();
  const file=path.join(privateDirectory,'qa-accounts.json');
  const accounts=JSON.parse(await fs.readFile(file,'utf8'));
  let remaining=[...accounts];const checks=[];
  for(const account of accounts){
    if(!/^cloud-qa-\d+-[a-f0-9]{8}$/.test(account.uid)||!account.email.endsWith('@example.invalid'))throw Error('The QA account guard rejected this entry.');
    const signIn=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${config.VITE_FIREBASE_API_KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:account.email,password:account.password,returnSecureToken:true})});
    const credentials=await signIn.json();assert.ok(credentials.idToken);
    const request=(action,data)=>fetch('https://agri-vision-eosin.vercel.app/api/workspace/actions/'+action,{method:'POST',headers:{Authorization:'Bearer '+credentials.idToken,'Content-Type':'application/json'},body:JSON.stringify(data)});
    const scan=db.doc(`users/${account.uid}/scans/cloud-check`);
    if((await scan.get()).exists){
      const response=await request('deleteScan',{scanId:'cloud-check'});assert.equal(response.status,200);
      assert.equal((await scan.get()).exists,false);assert.equal((await scan.collection('private').doc('recommendations').get()).exists,false);
      checks.push('Owner scan deletion removed private cache and scan');
    }
    const response=await request('deleteAccount',{confirm:true});
    if(response.status!==200)console.log(JSON.stringify({deletionStatus:response.status,body:await response.text()}));
    assert.equal(response.status,200);assert.equal((await db.doc(`users/${account.uid}`).get()).exists,false);
    await assert.rejects(auth.getUser(account.uid),error=>error.code==='auth/user-not-found');
    remaining=remaining.filter(item=>item.uid!==account.uid);await privateJson('qa-accounts.json',remaining);
    checks.push('Owner account deletion removed Auth user and private records');
  }
  await fs.rename(file,path.join(privateDirectory,`qa-accounts-removed-${Date.now()}.json`));
  await privateJson('qa-cleanup-result.json',{checks,removedAccounts:accounts.length,finishedAt:new Date().toISOString()});
  console.log(JSON.stringify({complete:true,removedAccounts:accounts.length,checks}));await db.terminate();
}
cleanup().catch(reportFailure);
