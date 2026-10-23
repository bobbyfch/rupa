import { db, applySnapshot, getSnapshot, type ArchiveSnapshot } from './db';
import { credentials, decryptJson, encryptJson, parseChain, newChain, encodeChain } from './crypto';
import type { LocalProfile } from './types';
import { apiUrl, hasBackend } from './providers';
interface RemoteRecord {version:number;payload:{iv:string;ciphertext:string}|null}
async function call(url:string,opts:RequestInit){
  const res=await fetch(apiUrl(url),opts);
  if(!res.ok){const error=await res.json().catch(()=>({error:`HTTP ${res.status}`}));throw new Error(error.error||`HTTP ${res.status}`);}
  return res.json();
}
export async function createSync(profile:LocalProfile){
  if(!hasBackend)throw new Error('Deploy a Cloudflare Worker and set VITE_API_URL first');
  const chain=newChain(),code=encodeChain(chain),creds=await credentials(chain);
  const snapshot=await getSnapshot(profile),payload=await encryptJson(chain.master,snapshot);
  await call('/sync/chains',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${creds.token}`},body:JSON.stringify({id:chain.id,payload})});
  await db.profiles.update(profile.id,{syncCode:code});return code;
}
export async function syncProfile(profile:LocalProfile,code=profile.syncCode){
  if(!hasBackend)throw new Error('Cloudflare Worker not configured');
  if(!code)throw new Error('No sync chain');
  const chain=parseChain(code),creds=await credentials(chain);
  const headers={'Content-Type':'application/json','Authorization':`Bearer ${creds.token}`};
  for(let attempt=0;attempt<4;attempt++){
    const remote=await call(`/sync/chains/${chain.id}`,{headers}) as RemoteRecord;
    const latestProfile=(await db.profiles.get(profile.id))||profile;
    const current=await getSnapshot(latestProfile);let merged=current;
    if(remote.payload){const r=await decryptJson<ArchiveSnapshot>(chain.master,remote.payload);merged=await applySnapshot(current,r);}
    const payload=await encryptJson(chain.master,merged);
    try{
      await call(`/sync/chains/${chain.id}`,{method:'PUT',headers,body:JSON.stringify({expectedVersion:remote.version,payload})});
      return merged;
    }catch(e){if(!(e instanceof Error) || !e.message.includes('version'))throw e;}
  }
  throw new Error('Sync collision. Try again.');
}
export async function joinSync(code:string,name:string){
  const chain=parseChain(code),creds=await credentials(chain),headers={Authorization:`Bearer ${creds.token}`};
  const remote=await call(`/sync/chains/${chain.id}`,{headers}) as RemoteRecord;
  if(!remote.payload)throw new Error('Empty archive');
  const original=await decryptJson<ArchiveSnapshot>(chain.master,remote.payload);
  if(original.schema!==1&&original.schema!==2)throw new Error('Unsupported archive');
  // Keep original profile identity for CRDT-style record IDs shared across devices.
  const profile={...original.profile,name:name.trim()||original.profile.name,syncCode:code};
  const current=await db.profiles.get(profile.id);
  if(current)throw new Error('This archive is already on this device');
  await db.transaction('rw',db.profiles,db.favorites,db.favoriteFolders,db.hunts,async()=>{
    await db.profiles.put(profile);
    await db.favorites.bulkPut(original.favorites);
    await db.favoriteFolders.bulkPut(original.favoriteFolders||[]);
    await db.hunts.bulkPut(original.hunts);
  });
  return profile;
}
