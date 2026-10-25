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
    const titles=row.attributes.title||{},title=titles.en||titles['ja-ro']||titles.ja||Object.values(titles)[0]||'Untitled manga',base='https://uploads.mangadex.org/covers/'+row.id+'/'+encodeURIComponent(cover);
    return [{id:category+':mangadex:'+row.id,category,title:string(title),subtitle:(category==='webtoons'?'MangaDex · web comic':'MangaDex · cover art'),year:firstYear(row.attributes.year),previewUrl:base+'.256.jpg',imageUrl:base+'.512.jpg',
      sourceUrl:'https://mangadex.org/title/'+row.id,provider:'MangaDex',source:'MangaDex',kind:'cover',rights:'source-only'}];
  });
}

const MANGA_DETAIL_CACHE=new Map();
const MANGA_GALLERY_CACHE=new Map();
const OPEN_LIBRARY_MANGA_CACHE=new Map();
const normalizeMangaTitle=value=>string(value,180).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function mangaTitleVariants(attributes){
  const titles=[...Object.values(attributes?.title||{}),...(attributes?.altTitles||[]).flatMap(row=>Object.values(row||{}))];
  return [...new Set(titles.map(normalizeMangaTitle).filter(Boolean))];
}
export function mangaTitleMatchScore(attributes,query){
  const target=normalizeMangaTitle(query);if(!target)return 0;
  const variants=mangaTitleVariants(attributes);if(variants.includes(target))return 1;
  const tokens=new Set(target.split(' '));
  return Math.max(0,...variants.map(value=>{
    if(target.startsWith(value+' '))return .88;
    const other=new Set(value.split(' '));
    return [...tokens].filter(token=>other.has(token)).length/Math.max(tokens.size,other.size);
  }));
}
function mangaCoverImage(mangaId,fileName,size){
  return `https://uploads.mangadex.org/covers/${encodeURIComponent(mangaId)}/${encodeURIComponent(fileName)}.${size}.jpg`;
}
function mangaPictureTitleScore(row,query){
  const target=normalizeMangaTitle(query);if(!target)return 0;
  const values=[row?.title,row?.title_english,row?.title_japanese,...(Array.isArray(row?.title_synonyms)?row.title_synonyms:[])].map(normalizeMangaTitle).filter(Boolean);
  if(values.includes(target))return 1;
  const queryTokens=new Set(target.split(' '));
  return Math.max(0,...values.map(value=>{
    if(target.startsWith(value+' '))return .88;
    if(value.startsWith(target+' '))return .78;
    const titleTokens=new Set(value.split(' '));
    return [...queryTokens].filter(token=>titleTokens.has(token)).length/Math.max(queryTokens.size,titleTokens.size);
  }));
}
function validMalImage(value){
  try{const image=new URL(value);return image.protocol==='https:'&&(image.hostname==='cdn.myanimelist.net'||image.hostname.endsWith('.cdn.myanimelist.net'))?image.toString():'';}catch{return '';}
}
/** Jikan's picture list is a fallback gallery only; it does not identify print volume numbers. */
export async function jikanMangaSeriesGallery({title='',malId='',signal}={}){
  const safeTitle=string(title,180),safeMalId=string(malId,12),numericId=/^\d{1,10}$/.test(safeMalId)?safeMalId:'';
  if(!numericId&&normalizeMangaTitle(safeTitle).length<2)return null;
  const cacheKey=numericId?'mal:'+numericId:'title:'+normalizeMangaTitle(safeTitle),cached=MANGA_GALLERY_CACHE.get(cacheKey);
  if(cached&&cached.expiresAt>Date.now())return cached.value;
  let row;
  if(numericId){
    const response=await api(`https://api.jikan.moe/v4/manga/${numericId}`,{},signal,3500);
    row=response?.data;
  }else{
    const params=new URLSearchParams({q:safeTitle,limit:'8',sfw:'true'});
    const response=await api('https://api.jikan.moe/v4/manga?'+params,{},signal,3500);
    const candidates=Array.isArray(response?.data)?response.data:[];
    const best=candidates.map(candidate=>({candidate,score:mangaPictureTitleScore(candidate,safeTitle)})).sort((a,b)=>b.score-a.score)[0];
    if(!best||best.score<.72)throw new Error('Jikan could not find a matching manga record.');
    row=best.candidate;
  }
  const id=String(row?.mal_id??'').slice(0,12);
  if(!/^\d{1,10}$/.test(id))throw new Error('Jikan returned an incomplete manga record.');
  const pictures=await api(`https://api.jikan.moe/v4/manga/${id}/pictures`,{},signal,3500);
  const seen=new Set(),volumes=(Array.isArray(pictures?.data)?pictures.data:[]).flatMap((picture,index)=>{
    const image=validMalImage(picture?.webp?.large_image_url||picture?.jpg?.large_image_url||picture?.webp?.image_url||picture?.jpg?.image_url);
    if(!image||seen.has(image))return [];
    seen.add(image);const preview=validMalImage(picture?.webp?.image_url||picture?.jpg?.image_url)||image;
    return [{id:`manga:jikan:${id}:picture:${index+1}`,category:'manga',title:`${string(row?.title_english||row?.title,180)||safeTitle} · Image ${index+1}`,subtitle:`Image ${index+1} · Jikan / MyAnimeList`,source:'Jikan / MyAnimeList',provider:'Jikan / MyAnimeList',sourceUrl:`https://myanimelist.net/manga/${id}`,previewUrl:preview,imageUrl:image,downloadUrl:image,kind:'cover',rights:'source-only',availability:'link-only'}];
  }).slice(0,120);
  if(!volumes.length)return null;
  const released=string(row?.published?.from,32).match(/\b(?:18|19|20)\d{2}\b/)?.[0];
  const authors=(Array.isArray(row?.authors)?row.authors:[]).map(author=>string(author?.name,120)).filter(Boolean);
  const result={id:`jikan:${id}`,title:string(row?.title_english||row?.title||safeTitle,180),description:string(row?.synopsis,1800),year:released,status:string(row?.status,32),lastVolume:'',authors:[...new Set(authors)],source:'Jikan / MyAnimeList',sourceUrl:`https://myanimelist.net/manga/${id}`,volumes,galleryLabel:'Related cover artwork',detailNote:'Fallback gallery from Jikan / MyAnimeList. These images are not numbered and are not verified as separate print volumes.'};
  if(MANGA_GALLERY_CACHE.size>80)for(const [key,value] of MANGA_GALLERY_CACHE)if(value.expiresAt<=Date.now())MANGA_GALLERY_CACHE.delete(key);
  MANGA_GALLERY_CACHE.set(cacheKey,{expiresAt:Date.now()+10*60*1000,value:result});
  return result;
}
/** Uses Open Library's search records to find explicitly numbered manga cover works.
 * Cover images are referenced from covers.openlibrary.org; the cover endpoint is never crawled.
 */
export async function openLibraryMangaSeriesGallery({title='',signal}={}){
  const safeTitle=string(title,180),normalizedTitle=normalizeMangaTitle(safeTitle);
  if(normalizedTitle.length<2)return null;
  const cached=OPEN_LIBRARY_MANGA_CACHE.get(normalizedTitle);
  if(cached&&cached.expiresAt>Date.now())return cached.value;
  const params=new URLSearchParams({q:safeTitle,limit:'100',fields:'title,cover_i,key,first_publish_year'});
  const data=await api('https://openlibrary.org/search.json?'+params,{headers:{'User-Agent':'RUPAArtworkArchive/1.0 (https://bobbyfch.github.io/rupa/)'}},signal,5000);
  const volumesByNumber=new Map();
  for(const row of Array.isArray(data?.docs)?data.docs:[]){
    const candidateTitle=string(row?.title,220),normalizedCandidate=normalizeMangaTitle(candidateTitle);
    if(!normalizedCandidate.startsWith(normalizedTitle+' '))continue;
    const suffix=normalizedCandidate.slice(normalizedTitle.length).trim();
    const match=suffix.match(/^(?:(?:volume|vol|book)\s*)?(\d{1,4})$/);
    const coverId=Number(row?.cover_i),workKey=string(row?.key,100);
    if(!match||!Number.isSafeInteger(coverId)||coverId<1||!/^\/works\/OL\d+W$/.test(workKey))continue;
    const number=Number(match[1]);
    if(number<1||volumesByNumber.has(number))continue;
    const coverBase=`https://covers.openlibrary.org/b/id/${coverId}`;
    const year=Number(row?.first_publish_year),volumeLabel=`Volume ${number}`;
    volumesByNumber.set(number,{id:`manga:openlibrary:${workKey.slice('/works/'.length)}`,category:'manga',title:`${safeTitle} · ${volumeLabel}`,subtitle:`${volumeLabel} · Open Library`,year:Number.isInteger(year)&&year>=1800&&year<=2200?String(year):undefined,source:'Open Library',provider:'Open Library',sourceUrl:`https://openlibrary.org${workKey}`,previewUrl:`${coverBase}-M.jpg`,imageUrl:`${coverBase}-L.jpg`,downloadUrl:`${coverBase}-L.jpg`,kind:'cover',rights:'source-only',availability:'link-only'});
  }
  const volumes=[...volumesByNumber.entries()].sort(([a],[b])=>a-b).map(([,item])=>item);
  if(!volumes.length)return null;
  const result={id:`openlibrary:${normalizedTitle.replaceAll(' ','-')}`,title:safeTitle,description:'',status:'',lastVolume:'',authors:[],source:'Open Library',sourceUrl:`https://openlibrary.org/search?q=${encodeURIComponent(safeTitle)}`,volumes,galleryLabel:'Volume covers',volumesNumbered:true,detailNote:'Open Library records include these numbered cover works. Volume coverage and edition numbering can vary by language and edition.'};
  if(OPEN_LIBRARY_MANGA_CACHE.size>80)for(const [key,value] of OPEN_LIBRARY_MANGA_CACHE)if(value.expiresAt<=Date.now())OPEN_LIBRARY_MANGA_CACHE.delete(key);
  OPEN_LIBRARY_MANGA_CACHE.set(normalizedTitle,{expiresAt:Date.now()+10*60*1000,value:result});
  return result;
}
/** Fetches only series metadata and cover-art records. It never requests chapters or page images. */
export async function mangaDexSeriesDetail({id='',title='',signal}={}){
  const safeId=string(id,80),safeTitle=string(title,180);
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if(safeId&&!uuid.test(safeId))throw new Error('Invalid MangaDex series ID.');
  if(!safeId&&normalizeMangaTitle(safeTitle).length<2)throw new Error('Enter a manga title to load its volumes.');
  const cacheKey=safeId||normalizeMangaTitle(safeTitle),cached=MANGA_DETAIL_CACHE.get(cacheKey);
  if(cached&&cached.expiresAt>Date.now())return cached.value;
  let row;
  if(safeId){
    const params=new URLSearchParams({});params.append('includes[]','author');params.append('includes[]','artist');
    const response=await api(`https://api.mangadex.org/manga/${encodeURIComponent(safeId)}?${params}`,{headers:{'User-Agent':'RUPA Artwork Index/0.4'}},signal,4000);
    row=response?.data;
  }else{
    const params=new URLSearchParams({title:safeTitle,limit:'20','order[relevance]':'desc'});
    params.append('includes[]','author');params.append('includes[]','artist');params.append('contentRating[]','safe');
    const response=await api(`https://api.mangadex.org/manga?${params}`,{headers:{'User-Agent':'RUPA Artwork Index/0.4'}},signal,4000);
    const candidates=Array.isArray(response?.data)?response.data:[];
    const best=candidates.map(candidate=>({candidate,score:mangaTitleMatchScore(candidate?.attributes,safeTitle)})).sort((a,b)=>b.score-a.score)[0];
    if(!best||best.score<.75)throw new Error('Matching series was not found on MangaDex.');
    row=best.candidate;
  }
  const mangaId=string(row?.id,80),attributes=row?.attributes||{};
  if(!uuid.test(mangaId)||!Object.keys(attributes.title||{}).length)throw new Error('MangaDex returned an incomplete series record.');
  const titles=attributes.title||{},seriesTitle=string(titles.en||titles['ja-ro']||titles.ja||Object.values(titles)[0],180);
  const coverRows=[];
  for(let offset=0;offset<300;offset+=100){
    const params=new URLSearchParams({limit:'100',offset:String(offset),'order[volume]':'asc'});params.append('manga[]',mangaId);
    const page=await api(`https://api.mangadex.org/cover?${params}`,{headers:{'User-Agent':'RUPA Artwork Index/0.4'}},signal,4000);
    const rows=Array.isArray(page?.data)?page.data:[];coverRows.push(...rows);
    if(rows.length<100||coverRows.length>=Number(page?.total||0))break;
  }
  const byVolume=new Map();
  for(const cover of coverRows){
    const fileName=string(cover?.attributes?.fileName,220),volume=string(cover?.attributes?.volume,40);
    if(!fileName||!volume)continue;
    const current=byVolume.get(volume),locale=string(cover?.attributes?.locale,12).toLowerCase();
    if(!current||locale==='en'||(!current.locale&&locale))byVolume.set(volume,{cover,locale});
  }
  const volumeNumber=value=>{const match=value.match(/\d+(?:\.\d+)?/);return match?Number(match[0]):Number.POSITIVE_INFINITY;};
  const volumes=[...byVolume.entries()].sort(([a],[b])=>volumeNumber(a)-volumeNumber(b)||a.localeCompare(b,undefined,{numeric:true})).map(([volume,{cover,locale}],index)=>{
    const fileName=string(cover.attributes.fileName,220),id=string(cover.id,80),label=`Volume ${volume}`;
    return {id:`manga:mangadex:${mangaId}:cover:${id||index}`,category:'manga',title:`${seriesTitle} · ${label}`,subtitle:`${label}${locale?` · ${locale.toUpperCase()}`:''}`,source:'MangaDex',provider:'MangaDex',sourceUrl:`https://mangadex.org/title/${mangaId}`,previewUrl:mangaCoverImage(mangaId,fileName,256),imageUrl:mangaCoverImage(mangaId,fileName,512),downloadUrl:`https://uploads.mangadex.org/covers/${mangaId}/${encodeURIComponent(fileName)}`,mediaId:id||undefined,kind:'cover',rights:'source-only',availability:'link-only'};
  });
  const authors=(row.relationships||[]).filter(rel=>rel.type==='author'||rel.type==='artist').map(rel=>string(rel?.attributes?.name,120)).filter(Boolean);
  const description=attributes.description?.en||attributes.description?.['ja-ro']||Object.values(attributes.description||{}).find(value=>typeof value==='string')||'';
  const year=Number(attributes.year);
  const result={id:mangaId,title:seriesTitle,description:string(description,1800),year:Number.isInteger(year)&&year>0?String(year):undefined,status:string(attributes.status,32),lastVolume:string(attributes.lastVolume,32),authors:[...new Set(authors)],source:'MangaDex',sourceUrl:`https://mangadex.org/title/${mangaId}`,volumes};
  if(MANGA_DETAIL_CACHE.size>80)for(const [key,value] of MANGA_DETAIL_CACHE)if(value.expiresAt<=Date.now())MANGA_DETAIL_CACHE.delete(key);
  MANGA_DETAIL_CACHE.set(cacheKey,{expiresAt:Date.now()+6*60*1000,value:result});
  return result;
}

const STEAMGRIDDB_API='https://www.steamgriddb.com/api/v2';
const STEAMGRIDDB_ASSETS={
  grids:{kind:'cover',label:'Grid',route:'grid'},
  heroes:{kind:'wallpaper',label:'Hero',route:'hero'},
  logos:{kind:'logo',label:'Logo',route:'logo'},
  icons:{kind:'icon',label:'Icon',route:'icon'},
};
const steamGridDbFilterTypes={
  covers:['grids'],screenshots:[],wallpapers:['heroes'],artworks:['heroes'],
  logos:['logos'],icons:['icons'],'title-screens':[],all:Object.keys(STEAMGRIDDB_ASSETS),
};
const normalizeGameName=value=>string(value,180).toLocaleLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function steamGridDbImage(value){
  const url=https(value);if(!url)return '';
  try{
    const parsed=new URL(url),host=parsed.hostname.toLocaleLowerCase();
    return host==='steamgriddb.com'||host.endsWith('.steamgriddb.com')
      ||(host==='s3.amazonaws.com'&&parsed.pathname.startsWith('/steamgriddb/'))?url:'';
  }catch{return '';}
}
export async function steamGridDbArtworks(query,limit,apiKey,signal,assetFilter='covers') {
  const term=string(query,90),key=string(apiKey,300);
  if(term.length<2)return [];
  if(!key)throw new Error('SteamGridDB requires a configured Worker secret: STEAMGRIDDB_API_KEY.');
  const types=steamGridDbFilterTypes[assetFilter]||steamGridDbFilterTypes.covers;
  if(!types.length)return [];
  const search=await api(`${STEAMGRIDDB_API}/search/autocomplete/${encodeURIComponent(term)}`,{
    headers:{Authorization:`Bearer ${key}`},
  },signal);
  if(search?.success!==true||!Array.isArray(search.data))throw new Error('SteamGridDB returned an invalid title search response.');
  const normalizedQuery=normalizeGameName(term);
  const games=search.data.map((game,index)=>{
    const name=string(game?.name,180),normalizedName=normalizeGameName(name);
    const rank=normalizedName===normalizedQuery?0:normalizedName.startsWith(normalizedQuery)?1:normalizedName.includes(normalizedQuery)?2:normalizedQuery.includes(normalizedName)?3:99;
    return {id:Number(game?.id),name,index,rank};
  }).filter(game=>Number.isSafeInteger(game.id)&&game.id>0&&game.name&&game.rank<99)
    .sort((a,b)=>a.rank-b.rank||a.index-b.index).slice(0,3);
  if(!games.length)return [];
  const settled=await Promise.allSettled(games.flatMap(game=>types.map(async type=>{
    const endpoint=STEAMGRIDDB_ASSETS[type];
    const payload=await api(`${STEAMGRIDDB_API}/${type}/game/${game.id}`,{
      headers:{Authorization:`Bearer ${key}`},
    },signal);
    if(payload?.success!==true||!Array.isArray(payload.data))throw new Error('SteamGridDB returned an invalid artwork response.');
    return payload.data.map(asset=>{
      const imageUrl=steamGridDbImage(asset?.url),previewUrl=steamGridDbImage(asset?.thumb)||imageUrl;
      if(!imageUrl)return null;
      const assetId=Number(asset?.id);if(!Number.isSafeInteger(assetId)||assetId<1)return null;
      const author=string(asset?.author?.name,120);
      const sourceUrl=`https://www.steamgriddb.com/${endpoint.route}/${assetId}`;
      return {
        id:`games:steamgriddb:${game.id}:${type}:${assetId}`,category:'games',title:game.name,
        subtitle:`PC · ${endpoint.label} · SteamGridDB`,source:'SteamGridDB',provider:'SteamGridDB API',
        sourceId:'steamgriddb',sourceUrl,imageUrl,previewUrl,
        mediaId:String(game.id),externalId:String(assetId),editionId:`steamgriddb:${game.id}`,
        kind:endpoint.kind,rights:'source-only',availability:'link-only',
        artist:author||undefined,attribution:author?`Uploaded by ${author} on SteamGridDB`:'SteamGridDB community artwork',
        tags:Array.isArray(asset?.tags)?asset.tags.map(tag=>string(tag,80)).filter(Boolean).slice(0,8):[],
      };
    }).filter(Boolean);
  })));
  const results=settled.flatMap(entry=>entry.status==='fulfilled'?entry.value:[]);
  const failures=settled.filter(entry=>entry.status==='rejected');
  if(signal?.aborted)throw signal.reason||new DOMException('Request cancelled.','AbortError');
  if(failures.length===settled.length)throw failures[0].reason;
  if(failures.length){
    const error=new Error('Some SteamGridDB artwork types were unavailable.');
    error.partialResults=results;
    throw error;
  }
  return results.slice(0,Math.max(0,limit));
}

export async function additionalGames(query,signal) {
  return combined([{name:'xlenore PS1/PS2',search:()=>sonySerialCovers(query,signal)},
    {name:'Libretro Thumbnails',search:()=>libretroExactCover(query,signal)}]);
}
