import Dexie, { type Table } from 'dexie';
import { DEFAULT_PREFERENCES, type Artwork, type Favorite, type FavoriteFolder, type Hunt, type LocalProfile, type Preferences, type UserArtwork } from './types';

class ArchiveDB extends Dexie {
  profiles!: Table<LocalProfile, string>;
  favorites!: Table<Favorite, string>;
  favoriteFolders!: Table<FavoriteFolder, string>;
  userArtworks!: Table<UserArtwork, string>;
  hunts!: Table<Hunt, string>;
  // Keep the historical IndexedDB name so existing profiles and favorites survive the rebrand.
  constructor(){
    super('coveratlas-v2');
    this.version(1).stores({ profiles: 'id, name, createdAt', favorites: 'id, profileId, updatedAt', hunts: 'id, profileId, updatedAt' });
    this.version(2).stores({ profiles: 'id, name, createdAt', favorites: 'id, profileId, updatedAt', hunts: 'id, profileId, updatedAt', userArtworks: 'id, profileId, createdAt' });
    this.version(3).stores({ profiles: 'id, name, createdAt', favorites: 'id, profileId, updatedAt, [profileId+folderId]', favoriteFolders: 'id, profileId, updatedAt, [profileId+name]', hunts: 'id, profileId, updatedAt', userArtworks: 'id, profileId, createdAt' });
  }
}
export const db = new ArchiveDB();
export const activeIdKey = 'rupa:active-profile';
const legacyNunkiActiveIdKey='nunki:active-profile';
const legacyActiveIdKey = 'coveratlas:active-profile';
export function getActiveId() { try { return localStorage.getItem(activeIdKey) || localStorage.getItem(legacyNunkiActiveIdKey) || localStorage.getItem(legacyActiveIdKey) || 'guest'; } catch { return 'guest'; } }
export function setActiveId(id: string) { localStorage.setItem(activeIdKey,id); window.dispatchEvent(new Event('ca-profile-change')); }
export async function createProfile(name: string) {
  const clean = name.trim().slice(0,50);
  if (!clean) throw new Error('Profile name required');
  const now = Date.now();
  const profile: LocalProfile = { id: crypto.randomUUID(), name: clean, createdAt: now, updatedAt: now, preferences: {...DEFAULT_PREFERENCES} };
  await db.profiles.add(profile); setActiveId(profile.id); return profile;
}
export async function updatePreferences(profile: LocalProfile, prefs: Partial<Preferences>) {
  await db.profiles.update(profile.id, { preferences: {...profile.preferences,...prefs}, updatedAt: Date.now() });
}
export async function toggleFavorite(profileId: string, artwork: Artwork) {
  const id = `${profileId}:${artwork.id}`; const old = await db.favorites.get(id);
  await db.favorites.put({ id, profileId, artwork, updatedAt: Date.now(), deleted: Boolean(old && !old.deleted) });
}
export async function createFavoriteFolder(profileId:string,name:string):Promise<FavoriteFolder> {
  const clean=name.trim().replace(/\s+/g,' ').slice(0,40);
  if(!clean)throw new Error('Folder name required');
  const existing=await db.favoriteFolders.where('profileId').equals(profileId).toArray();
  const match=existing.find(folder=>!folder.deleted&&folder.name.toLocaleLowerCase()===clean.toLocaleLowerCase());
  if(match)return match;
  const now=Date.now(),folder:FavoriteFolder={id:`${profileId}:${crypto.randomUUID()}`,profileId,name:clean,createdAt:now,updatedAt:now};
  await db.favoriteFolders.put(folder);return folder;
}
export async function renameFavoriteFolder(id:string,name:string):Promise<void> {
  const clean=name.trim().replace(/\s+/g,' ').slice(0,40);
  if(!clean)throw new Error('Folder name required');
  const folder=await db.favoriteFolders.get(id);if(!folder||folder.deleted)throw new Error('Favorite folder not found');
  const folders=await db.favoriteFolders.where('profileId').equals(folder.profileId).toArray();
  if(folders.some(other=>other.id!==id&&!other.deleted&&other.name.toLocaleLowerCase()===clean.toLocaleLowerCase()))throw new Error('A folder with this name already exists');
  await db.favoriteFolders.update(id,{name:clean,updatedAt:Date.now()});
}
export async function moveFavoriteToFolder(favoriteId:string,folderId?:string):Promise<void> {
  const favorite=await db.favorites.get(favoriteId);if(!favorite||favorite.deleted)throw new Error('Favorite not found');
  if(folderId){const folder=await db.favoriteFolders.get(folderId);if(!folder||folder.deleted||folder.profileId!==favorite.profileId)throw new Error('Favorite folder not found');}
  const updated={...favorite,updatedAt:Date.now()};
  if(folderId)updated.folderId=folderId;else delete updated.folderId;
  await db.favorites.put(updated);
}
export async function deleteFavoriteFolder(id:string):Promise<void> {
  const folder=await db.favoriteFolders.get(id);if(!folder||folder.deleted)return;
  const now=Date.now();
  await db.transaction('rw',db.favorites,db.favoriteFolders,async()=>{
    await db.favorites.where('profileId').equals(folder.profileId).filter(favorite=>favorite.folderId===id&&!favorite.deleted).modify(favorite=>{delete favorite.folderId;favorite.updatedAt=now;});
    await db.favoriteFolders.update(id,{deleted:true,updatedAt:now});
  });
}
export async function addHunt(profileId:string, title:string, note:string) {
  const time=Date.now(); const id=`${profileId}:${crypto.randomUUID()}`;
  await db.hunts.add({id,profileId,title:title.trim().slice(0,180),note:note.trim().slice(0,700),createdAt:time,updatedAt:time});
}
export async function deleteHunt(id:string) {await db.hunts.update(id,{deleted:true,updatedAt:Date.now()});}
export interface ArchiveSnapshot { schema:1|2; profile:LocalProfile; favorites:Favorite[]; favoriteFolders?:FavoriteFolder[]; hunts:Hunt[] }
export async function getSnapshot(profile:LocalProfile):Promise<ArchiveSnapshot> {
  const [favorites,favoriteFolders,hunts]=await Promise.all([
    db.favorites.where('profileId').equals(profile.id).toArray(),
    db.favoriteFolders.where('profileId').equals(profile.id).toArray(),
    db.hunts.where('profileId').equals(profile.id).toArray()
  ]);
  return { schema:2, profile, favorites, favoriteFolders, hunts };
}
function newest<T extends {id:string;updatedAt:number}>(a:T[],b:T[]):T[] {
  const m=new Map<string,T>(); for(const row of [...a,...b]) if (!m.has(row.id) || (m.get(row.id)?.updatedAt || 0)<=row.updatedAt) m.set(row.id,row);
  return [...m.values()];
}
export async function applySnapshot(local:ArchiveSnapshot,remote:ArchiveSnapshot):Promise<ArchiveSnapshot> {
  if(![1,2].includes(remote.schema)||![1,2].includes(local.schema)||local.profile.id!==remote.profile.id) throw new Error('Invalid sync profile');
  const newer = local.profile.updatedAt >= remote.profile.updatedAt ? local.profile : remote.profile;
  const profile = {...newer,syncCode:local.profile.syncCode||remote.profile.syncCode};
  const favorites=newest(local.favorites,remote.favorites);
  const favoriteFolders=newest(local.favoriteFolders||[],remote.favoriteFolders||[]);
  const hunts=newest(local.hunts,remote.hunts);
  await db.transaction('rw',db.profiles,db.favorites,db.favoriteFolders,db.hunts,async()=>{
    await db.profiles.put(profile);
    await db.favorites.bulkPut(favorites);
    await db.favoriteFolders.bulkPut(favoriteFolders);
    await db.hunts.bulkPut(hunts);
  });
  return {schema:2,profile,favorites,favoriteFolders,hunts};
}
export async function importSnapshot(data:unknown, nameOverride?:string) {
  if(!data||typeof data!=='object')throw new Error('Invalid backup');
  const parsed=data as Partial<ArchiveSnapshot>;
  if(![1,2].includes(parsed.schema||0)||!parsed.profile?.id||!Array.isArray(parsed.favorites)||!Array.isArray(parsed.hunts)|| (parsed.favoriteFolders!==undefined&&!Array.isArray(parsed.favoriteFolders))) throw new Error('Unsupported backup version');
  const profileId=crypto.randomUUID(), now=Date.now();
  const profile:LocalProfile={id:profileId,name:(nameOverride||parsed.profile.name||'Imported Archive').slice(0,50),createdAt:now,updatedAt:now,preferences:{...DEFAULT_PREFERENCES,...parsed.profile.preferences}};
  const folderIds=new Map<string,string>();
  const folders=(parsed.favoriteFolders||[]).flatMap(folder=>{
    if(!folder?.id||!folder.name)return [];
    const imported={...folder,id:`${profileId}:${crypto.randomUUID()}`,profileId,createdAt:now,updatedAt:now};
    folderIds.set(folder.id,imported.id);return [imported];
  });
  await db.transaction('rw',db.profiles,db.favorites,db.favoriteFolders,db.hunts,async()=>{
    await db.profiles.add(profile);
    await db.favoriteFolders.bulkPut(folders);
    await db.favorites.bulkPut(parsed.favorites!.filter(x=>x?.artwork?.id).map(x=>{
      const favorite={...x,id:`${profileId}:${x.artwork.id}`,profileId,updatedAt:now};
      const remapped=x.folderId?folderIds.get(x.folderId):undefined;
      if(remapped)favorite.folderId=remapped;else delete favorite.folderId;
      return favorite;
    }));
    await db.hunts.bulkPut(parsed.hunts!.filter(x=>x?.title).map(x=>({...x,id:`${profileId}:${crypto.randomUUID()}`,profileId,updatedAt:now})));
  });
  setActiveId(profileId);return profile;
}

// ---- User-owned artwork (USER_LOCAL_ONLY): stays in this browser. Not part of snapshots, backups or device sync. ----
export const USER_ART_MIME = ['image/jpeg','image/png','image/webp'];
export const USER_ART_MAX_BYTES = 25_000_000;
async function measure(blob:Blob):Promise<{width:number;height:number}> {
  const bitmap=await createImageBitmap(blob);
  try{return {width:bitmap.width,height:bitmap.height};}finally{bitmap.close();}
}
export async function addUserArtwork(profileId:string, file:Blob, meta:{title:string;region?:string;edition?:string;notes?:string}):Promise<UserArtwork> {
  if(!USER_ART_MIME.includes(file.type))throw new Error('Use a JPEG, PNG or WebP image.');
  if(file.size>USER_ART_MAX_BYTES)throw new Error('Image is larger than 25 MB.');
  const title=meta.title.trim().slice(0,160);
  if(!title)throw new Error('Give the artwork a title.');
  const {width,height}=await measure(file).catch(()=>{throw new Error('This file could not be decoded as an image.');});
  const item:UserArtwork={id:`${profileId}:${crypto.randomUUID()}`,profileId,title,region:meta.region?.slice(0,12)||undefined,edition:meta.edition?.trim().slice(0,160)||undefined,notes:meta.notes?.trim().slice(0,500)||undefined,blob:file,mime:file.type,width,height,bytes:file.size,createdAt:Date.now()};
  await db.userArtworks.add(item);return item;
}
export const removeUserArtwork=(id:string)=>db.userArtworks.delete(id);
const toDataUrl=(blob:Blob)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
export async function exportUserCollection(profileId:string):Promise<string> {
  const rows=await db.userArtworks.where('profileId').equals(profileId).toArray();
  const items=await Promise.all(rows.map(async({blob,id:_id,profileId:_p,...rest})=>({...rest,dataUrl:await toDataUrl(blob)})));
  return JSON.stringify({format:'RUPA Local Artwork',version:1,items});
}
export async function importUserCollection(profileId:string, text:string):Promise<number> {
  const data=JSON.parse(text) as {format?:string;version?:number;items?:Partial<UserArtwork&{dataUrl:string}>[]};
  if(data.format!=='RUPA Local Artwork'||data.version!==1||!Array.isArray(data.items))throw new Error('Not a RUPA local artwork file.');
  let added=0;
  for(const row of data.items){
    const match=typeof row.dataUrl==='string'?row.dataUrl.match(/^data:(image[/](?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/):null;
    if(!match||!row.title)continue;
    const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));
    await addUserArtwork(profileId,new Blob([bytes],{type:match[1]}),{title:row.title,region:row.region,edition:row.edition,notes:row.notes}).then(()=>{added++;}).catch(()=>undefined);
  }
  return added;
}
