import { useCallback, useEffect, useRef } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, workspaceMode } from './firebase.js';
import { getLanguage, setLanguage, subscribeLanguage } from './i18n.js';

export function useAccountAppearance(uid, profile, theme, setTheme, onError) {
  const syncing=useRef(false), ready=useRef(false);
  const cloud=workspaceMode==='cloud'&&Boolean(uid);
  useEffect(()=>{ready.current=false;},[uid]);
  useEffect(()=>{
    if(!cloud||!profile)return;
    syncing.current=true;
    const preferences=profile.preferences || {};
    if(['system','light','dark'].includes(preferences.theme))setTheme(preferences.theme);
    if(['en','fil'].includes(preferences.language))setLanguage(preferences.language);
    syncing.current=false;ready.current=true;
  },[cloud,uid,profile,setTheme]);
  useEffect(()=>{
    if(!cloud)return;
    return subscribeLanguage(()=>{
      if(!syncing.current&&ready.current)updateDoc(doc(db,'users',uid),{'preferences.language':getLanguage()}).catch(()=>onError('Your language choice could not be saved. Please try again.'));
    });
  },[cloud,uid,onError]);
  return useCallback(value=>{
    setTheme(value);
    if(cloud&&ready.current)updateDoc(doc(db,'users',uid),{'preferences.theme':value}).catch(()=>onError('Your appearance choice could not be saved. Please try again.'));
  },[cloud,uid,setTheme,onError]);
}
