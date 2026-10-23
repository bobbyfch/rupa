// Additional RUPA discovery adapters. Each result is a source reference, not a reuse/download license.
// These modules are intentionally dependency-free for Cloudflare Workers and Node's test runner.
const string = (value, max=180) => typeof value === 'string' ? value.trim().slice(0,max) : '';
const firstYear = value => (string(value).match(/\b(?:18|19|20)\d{2}\b/) || [])[0];
const https = value => { try { const u=new URL(value); if(u.protocol==='http:'&&['coverartarchive.org','archive.org'].includes(u.hostname.toLowerCase()))u.protocol='https:'; return u.protocol==='https:' ? u.href : ''; } catch {return '';} };
const combinedSignal = (parent,timeoutMs) => {
  const timeout=AbortSignal.timeout(timeoutMs);
  return parent ? AbortSignal.any([parent,timeout]) : timeout;
};
const api = async (url,init={},parentSignal,timeoutMs=9000) => {
  const response=await fetch(url,{...init,signal:combinedSignal(parentSignal,timeoutMs),headers:{Accept:'application/json',...(init.headers||{})}});
  if(!response.ok)throw new Error('HTTP '+response.status);
  return response.json();
};
const combined = async providers => {
  const settled=await Promise.allSettled(providers.map(p=>p.search()));
  const results=[],warnings=[];
  settled.forEach((r,i)=>{ if(r.status==='fulfilled')results.push(...r.value); else warnings.push(providers[i].name+': '+(r.reason?.message||'unavailable')); });
  return {results,warnings};
};

export const parseSonySerial=query => {
  const match=string(query,90).toUpperCase().match(/(?:^|[^A-Z\d])([A-Z]{4})[-_ ]?(\d{3})[. ]?(\d{2})(?=$|[^A-Z\d])/);
  return match ? match[1]+'-'+match[2]+match[3] : null;
};
const sonyRepos=[
  ['PS1','psx-covers'],
  ['PS2','ps2-covers']
];
const sonyHosts='https://raw.githubusercontent.com/xlenore/';
const VITAHEX_ROOT='https://raw.githubusercontent.com/VitaHEX-Games/hexflow-covers/main';
let vitaIndexCache={expiresAt:0,rows:[]};
async function exists(url,parentSignal) {
  try {
    const r=await fetch(url,{method:'HEAD',signal:combinedSignal(parentSignal,7000),redirect:'follow'});
    if(r.status===404)return false;
    if(!r.ok)throw new Error('Static artwork source HTTP '+r.status);
    return (r.headers.get('content-type')||'image/jpeg').startsWith('image/');
  }catch(error){if(parentSignal?.aborted)return false;throw error;}
}
export async function sonySerialCovers(query,signal) {
  const serial=parseSonySerial(query);
  if(!serial)return [];
  const checks=sonyRepos.flatMap(([system,repo])=>[
    {system,repo,variant:'default',ext:'jpg',kind:'cover'},
    {system,repo,variant:'3d',ext:'png',kind:'alternate'}
  ]);
  const available=await Promise.all(checks.map(async entry=>{
    const url=sonyHosts+entry.repo+'/main/covers/'+entry.variant+'/'+serial+'.'+entry.ext;
    if(!await exists(url,signal))return null;
    return {id:'games:xlenore:'+entry.repo+':'+entry.variant+':'+serial,category:'games',
      title:serial,subtitle:entry.system+' '+(entry.variant==='3d'?'3D box art':'box cover')+' · serial match',
      sourceUrl:'https://github.com/xlenore/'+entry.repo+'/blob/main/covers/'+entry.variant+'/'+serial+'.'+entry.ext,
      source:'xlenore/'+entry.repo,provider:'xlenore/'+entry.repo,previewUrl:url,imageUrl:url,
      kind:entry.kind,rights:'source-only'};
  }));
  return available.filter(Boolean);
}
function normalizeGameTitle(value) {
  return string(value,180).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}
async function vitaCoverIndex(signal) {
  if(vitaIndexCache.expiresAt>Date.now()&&vitaIndexCache.rows.length)return vitaIndexCache.rows;
  const response=await fetch(VITAHEX_ROOT+'/HEXFlow-Coverlisting.txt',{signal:combinedSignal(signal,9000),headers:{Accept:'text/plain'}});
  if(!response.ok)throw new Error('HexFlow cover index HTTP '+response.status);
  const body=await response.text();
  const rows=body.split(/\r?\n/).flatMap(line=>{
    const match=line.trim().match(/^([A-Z]{4}\d{5})\s+(.{2,140})$/i);
    return match?[{appId:match[1].toUpperCase(),title:match[2].trim()}]:[];
  });
  if(!rows.length)throw new Error('HexFlow returned an empty PS Vita title index');
  vitaIndexCache={expiresAt:Date.now()+6*60*60*1000,rows};
  return rows;
}
function vitaAppIdFromQuery(value) {
  const fromUrl=value.match(/(?:^|\/)([A-Z]{4}\d{5})(?:\.png)?(?:$|[?#/])/i)?.[1];
  const direct=value.trim().match(/^(?:ps\s*vita\s*[|:]\s*)?([A-Z]{4}\d{5})$/i)?.[1];
  return (fromUrl||direct||'').toUpperCase()||null;
}
export async function vitaHexCovers(query,limit=12,signal) {
  const value=string(query,180),appId=vitaAppIdFromQuery(value);
  const index=await vitaCoverIndex(signal).catch(error=>{
    if(signal?.aborted)throw error;
    if(appId)return [];
    throw error;
  });
  const normalized=normalizeGameTitle(value);
  const matched=appId?(index.filter(row=>row.appId===appId).length?index.filter(row=>row.appId===appId):[{appId,title:appId}]):index.filter(row=>{
    const title=normalizeGameTitle(row.title);
    return title.includes(normalized)||normalized.split(' ').every(token=>title.split(' ').includes(token));
  });
  const selected=matched.slice(0,Math.max(1,Math.min(12,limit)));
  const results=await Promise.all(selected.map(async row=>{
    const url=VITAHEX_ROOT+'/Covers/PSVita/'+row.appId+'.png';
    if(!await exists(url,signal))return null;
    return {id:'games:vitahex:'+row.appId,category:'games',title:row.title,subtitle:'PS Vita · App ID '+row.appId+' · 250 × 320 px',year:undefined,
      sourceUrl:'https://github.com/VitaHEX-Games/hexflow-covers/blob/main/Covers/PSVita/'+row.appId+'.png',source:'HexFlow Covers',provider:'HexFlow Covers',previewUrl:url,imageUrl:url,
      sdDownloadUrl:url,downloadUrl:url,hdDownloadUrls:[url],kind:'cover',rights:'source-only'};
  }));
  return results.filter(Boolean);
}
// Query syntax: NES | Super Mario Bros. (USA), SNES | Chrono Trigger (USA), etc.
// Libretro's monorepo is a submodule index. Actual images live in one repo per platform.
export const RETRO_SYSTEMS=Object.freeze({
  NES:'Nintendo_-_Nintendo_Entertainment_System',
  SNES:'Nintendo_-_Super_Nintendo_Entertainment_System',
  GBA:'Nintendo_-_Game_Boy_Advance',
  GB:'Nintendo_-_Game_Boy',
  GBC:'Nintendo_-_Game_Boy_Color',
  N64:'Nintendo_-_Nintendo_64',
  NDS:'Nintendo_-_Nintendo_DS',
  WII:'Nintendo_-_Wii',
  DREAMCAST:'Sega_-_Dreamcast',
  GENESIS:'Sega_-_Mega_Drive_-_Genesis',
  PSP:'Sony_-_PlayStation_Portable',
  PS1:'Sony_-_PlayStation',
  PS2:'Sony_-_PlayStation_2',
  SATURN:'Sega_-_Saturn',
  'ATARI2600':'Atari_-_2600'
});
export async function libretroExactCover(query,signal) {
  const match=string(query,180).match(/^([A-Z0-9]+)\s*\|\s*(.{2,150})$/i);
  if(!match)return [];
  const system=match[1].toUpperCase(),repo=RETRO_SYSTEMS[system];
  if(!repo)return [];
  const title=match[2].replace(/[&*\/:\`<>?\\|"]/g,'_').trim();
  if(!title||title.includes('..'))return [];
  const url='https://raw.githubusercontent.com/libretro-thumbnails/'+repo+'/master/Named_Boxarts/'+encodeURIComponent(title)+'.png';
  if(!await exists(url,signal))return [];
  return [{id:'games:libretro:'+system+':'+title,category:'games',title:match[2].trim(),
    subtitle:'RetroArch '+system+' · exact box-art filename',sourceUrl:'https://github.com/libretro-thumbnails/'+repo+'/tree/master/Named_Boxarts',
    source:'Libretro Thumbnails',provider:'Libretro Thumbnails',previewUrl:url,imageUrl:url,kind:'cover',rights:'source-only'}];
}

export async function deezerAlbums(query,limit=12,signal) {
  const value=string(query,180);
  const urlMatch=value.match(/deezer\.com\/(?:[a-z]{2}\/)?album\/(\d+)/i);
  const endpoint=urlMatch
    ?'https://api.deezer.com/album/'+urlMatch[1]
    :'https://api.deezer.com/search/album?q='+encodeURIComponent(value)+'&limit='+Math.min(24,limit);
  const data=await api(endpoint,{},signal),rows=Array.isArray(data.data)?data.data:(data.id?[data]:[]);
  return rows.flatMap(x=>{
    const cover=https(x.cover_xl||x.cover_big||x.cover_medium||x.cover),preview=https(x.cover_big||x.cover_xl||x.cover_medium||x.cover),small=https(x.cover_medium||x.cover_small||preview),artist=string(x.artist?.name);
    if(!x.id||!cover)return [];
    return [{id:'music:deezer:'+x.id,category:'music',title:string(x.title)||'Untitled album',subtitle:artist||'Deezer',artist:artist||undefined,
      year:firstYear(x.release_date),previewUrl:preview||cover,imageUrl:cover,sdDownloadUrl:small||preview||cover,downloadUrl:cover,hdDownloadUrls:[cover,preview,small].filter((url,index,all)=>url&&all.indexOf(url)===index),sourceUrl:'https://www.deezer.com/album/'+x.id,
      provider:'Deezer',source:'Deezer',kind:'cover',rights:'source-only'}];
  });
}

export async function musicBrainzCaa(query,limit=8,signal) {
  const value=string(query,180),mbid=(value.match(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/i)||[])[0]||null;
  const rows=mbid?[{id:mbid,title:value,'artist-credit':[]}]:await api('https://musicbrainz.org/ws/2/release-group/?query='+encodeURIComponent(value)+'&fmt=json&limit='+Math.min(12,limit),
    {headers:{'User-Agent':'RUPAArtworkArchive/1.0 (https://bobbyfch.github.io/rupa/)'}},signal,6000).then(x=>x['release-groups']||[]);
  const candidates=rows.slice(0,Math.min(6,limit)).filter(group=>group.id);
  const settled=await Promise.allSettled(candidates.map(async group=>{
    let covers;
    try{covers=await api('https://coverartarchive.org/release-group/'+encodeURIComponent(group.id),{},signal,4500);}
    catch(error){if(error?.name==='AbortError'||!/^HTTP 404$/.test(error?.message||''))throw error;return null;}
    const front=(covers.images||[]).find(image=>image.front)||covers.images?.[0];
    const sourceImage=front?.thumbnails||{},image=https(sourceImage['1200']||sourceImage.large||front?.image),preview=https(sourceImage['500']||sourceImage['250']||image),small=https(sourceImage['250']||preview);
    if(!image)return null;
    const credit=(group['artist-credit']||[]).map(item=>string(item.name||item.artist?.name)+string(item.joinphrase)).filter(Boolean).join('').trim();
    return {id:'music:musicbrainz:'+group.id,category:'music',title:string(group.title)||'Untitled release',subtitle:credit||'MusicBrainz release group',artist:credit||undefined,
      year:firstYear(group['first-release-date']),previewUrl:preview,imageUrl:image,sdDownloadUrl:small,downloadUrl:image,hdDownloadUrls:[image,preview,small].filter((url,index,all)=>url&&all.indexOf(url)===index),sourceUrl:'https://musicbrainz.org/release-group/'+group.id,
      provider:'MusicBrainz + Cover Art Archive',source:'Cover Art Archive',kind:'cover',rights:'source-only'};
  }));
  const out=settled.flatMap(entry=>entry.status==='fulfilled'&&entry.value?[entry.value]:[]);
  const failures=settled.filter(entry=>entry.status==='rejected');
  if(failures.length){const error=new Error(failures[0].reason?.message||'Cover Art Archive request failed');error.partialResults=out;throw error;}
  return out;
}

let mangaDexTagCache={expiresAt:0,rows:[]};
async function mangaDexWebComicTag(signal){
  if(mangaDexTagCache.expiresAt>Date.now())return mangaDexTagCache.rows;
  const data=await api('https://api.mangadex.org/manga/tag',{},signal);
  const rows=(data.data||[]).filter(row=>/^(?:web comic|webtoon)$/i.test(string(row.attributes?.name?.en,80))).map(row=>row.id).filter(Boolean);
  if(!rows.length)throw new Error('MangaDex did not return a web comic category tag.');
  mangaDexTagCache={expiresAt:Date.now()+6*60*60*1000,rows};
  return rows;
}
export async function mangaDexCovers(query,limit=12,signal,category='manga') {
  const value=string(query,150);
  const params=new URLSearchParams({title:value,limit:String(Math.min(12,limit))});
  params.append('includes[]','cover_art');params.append('contentRating[]','safe');
  if(category==='webtoons')for(const tag of await mangaDexWebComicTag(signal))params.append('includedTags[]',tag);
  const found=await api('https://api.mangadex.org/manga?'+params.toString(),{},signal);
  const manga=(found.data||[]).filter(row=>row.id&&row.attributes?.title);
  const coverRows=await Promise.all(manga.map(async row=>{
    const relation=(row.relationships||[]).find(rel=>rel.type==='cover_art'),inlineName=relation?.attributes?.fileName;
    if(inlineName)return {row,cover:{data:{attributes:{fileName:inlineName}}}};
    const coverId=relation?.id;
    if(!coverId)return null;
    try{return {row,cover:await api('https://api.mangadex.org/cover/'+coverId,{},signal)};}catch(error){if(error?.name==='AbortError')throw error;return null;}
  }));
  return coverRows.flatMap(entry=>{
    if(!entry)return [];
    const row=entry.row,cover=entry.cover.data?.attributes?.fileName;
    if(!cover)return [];
    const title=Object.values(row.attributes.title||{})[0]||'Untitled manga',base='https://uploads.mangadex.org/covers/'+row.id+'/'+encodeURIComponent(cover);
    return [{id:category+':mangadex:'+row.id,category,title:string(title),subtitle:(category==='webtoons'?'MangaDex · web comic':'MangaDex · cover art'),year:firstYear(row.attributes.year),previewUrl:base+'.256.jpg',imageUrl:base+'.512.jpg',
      sourceUrl:'https://mangadex.org/title/'+row.id,provider:'MangaDex',source:'MangaDex',kind:'cover',rights:'source-only'}];
  });
}

export async function additionalGames(query,signal) {
  return combined([{name:'xlenore PS1/PS2',search:()=>sonySerialCovers(query,signal)},
    {name:'Libretro Thumbnails',search:()=>libretroExactCover(query,signal)}]);
}
