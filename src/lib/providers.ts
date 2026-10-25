import type { AppleCategory, AppleStorefront, Artwork, Category, MangaSeriesDetail, MotionArtwork, ProviderResult } from './types';
import { APPLE_STOREFRONTS } from './appleStorefronts.ts';
import appleChartFeeds from './appleChartFeeds.json' with { type: 'json' };
import { artworkMatches, hasTitleIndex, searchAnimeIndex, searchGameIndex, searchTitleArtworks } from './catalog.ts';
import { fetchOpenLibraryMangaSeries, mergeMangaSeriesDetails } from './mangaCatalog.ts';
const backend = (import.meta.env?.VITE_API_URL || '').replace(/\/$/, '');
const configuredSearchBackend = (import.meta.env?.VITE_SEARCH_API_URL || '').replace(/\/$/, '');
const isGitHubPages = typeof window !== 'undefined' && window.location.hostname.endsWith('.github.io');
const searchBackend = configuredSearchBackend || (typeof window !== 'undefined' && !isGitHubPages ? window.location.origin : '');
const API_REQUEST_TIMEOUT_MS=15_000;
const MANGA_DETAIL_REQUEST_TIMEOUT_MS=28_000;
const APPLE_SEARCH_TIMEOUT_MS=10_000;
export const hasBackend = Boolean(backend);
export const hasSearchBackend = Boolean(searchBackend);
export const apiUrl = (path:string) => `${backend}${path}`;
async function aniListMangaAliases(mediaId:string,signal:AbortSignal):Promise<string[]>{
 if(!/^\d+$/.test(mediaId))return [];
 const query='query ($id:Int){Media(id:$id,type:MANGA){title{userPreferred english romaji native} synonyms}}';
 const requestSignal=AbortSignal.any([signal,AbortSignal.timeout(5_000)]);
 const response=await fetch('https://graphql.anilist.co',{method:'POST',signal:requestSignal,headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({query,variables:{id:Number(mediaId)}})});
 if(!response.ok)throw new Error(`AniList returned HTTP ${response.status}.`);
 const payload=await response.json() as {data?:{Media?:{title?:Record<string,unknown>;synonyms?:unknown[]}}};
 const media=payload.data?.Media;
 return [...new Set([...Object.values(media?.title||{}),...(Array.isArray(media?.synonyms)?media.synonyms:[])].filter((value):value is string=>typeof value==='string').map(value=>value.trim()).filter(Boolean))].slice(0,8);
}
async function openLibraryMangaTitles(title:string,alternateTitles:string[],signal:AbortSignal):Promise<MangaSeriesDetail>{
 const titles=[...new Set([title,...alternateTitles].map(value=>value.trim()).filter(Boolean))].slice(0,5);
 const attempts=await Promise.allSettled(titles.map(value=>fetchOpenLibraryMangaSeries(value,signal)));
 if(signal.aborted)throw signal.reason||new DOMException('Request cancelled.','AbortError');
 const successful=attempts.flatMap(attempt=>attempt.status==='fulfilled'?[attempt.value]:[]);
 const withVolumes=successful.filter(detail=>detail.volumes.length);
 if(!withVolumes.length){if(successful.length)return successful[0];const failed=attempts.find(attempt=>attempt.status==='rejected');throw failed?.status==='rejected'?failed.reason:new Error('Open Library returned no manga records.');}
 return withVolumes.slice(1).reduce((combined,detail)=>mergeMangaSeriesDetails(combined,detail),withVolumes[0]);
}
export async function getMangaSeriesDetail(title:string,id:string|undefined,signal:AbortSignal,provider?:string,mediaId?:string,alternateTitles:string[]=[]):Promise<MangaSeriesDetail>{
 const params=new URLSearchParams();
 const mangaDexId=id?.startsWith('manga:mangadex:')?id.slice('manga:mangadex:'.length):'';
 if(mangaDexId)params.set('id',mangaDexId);
 params.set('title',title.slice(0,180));
 if(provider==='Jikan / MyAnimeList'&&/^\d+$/.test(mediaId||''))params.set('malId',mediaId!);
 const timeout=AbortSignal.timeout(MANGA_DETAIL_REQUEST_TIMEOUT_MS),requestSignal=AbortSignal.any([signal,timeout]);
 let workerDetail:MangaSeriesDetail|undefined,workerError:unknown;
 const aliases=new Set(alternateTitles.filter(value=>typeof value==='string').map(value=>value.trim()).filter(value=>value&&value.toLocaleLowerCase()!==title.trim().toLocaleLowerCase()));
 if(provider==='AniList'&&mediaId){try{for(const value of await aniListMangaAliases(mediaId,signal))if(value.toLocaleLowerCase()!==title.trim().toLocaleLowerCase())aliases.add(value);}catch(error){if(signal.aborted)throw error;}}
 try{
  const response=await fetch(apiUrl('/api/manga-detail')+'?'+params.toString(),{signal:requestSignal,headers:{Accept:'application/json'}});
  const payload=await response.json().catch(()=>null) as unknown;
  if(!response.ok){const message=payload&&typeof payload==='object'&&'error'in payload?String((payload as {error?:unknown}).error||''):'';throw new Error(message||`Manga artwork sources returned HTTP ${response.status}.`);}
  if(!payload||typeof payload!=='object'||!Array.isArray((payload as MangaSeriesDetail).volumes)||typeof (payload as MangaSeriesDetail).title!=='string')throw new Error('Manga sources returned an incomplete series record.');
  workerDetail=payload as MangaSeriesDetail;
  if(workerDetail.volumes.length){
   try{return mergeMangaSeriesDetails(workerDetail,await openLibraryMangaTitles(title,[...aliases],signal));}
   catch(error){if(signal.aborted)throw error;return workerDetail;}
  }
 }catch(error){
  if(signal.aborted)throw error;
  workerError=error;
 }

 // GitHub Pages has no server-side runtime. Keep manga volume lookup usable there
 // by querying Open Library directly when the optional search route is missing, unavailable,
 // or has no numbered cover records for this series.
 try{
  const fallback=await openLibraryMangaTitles(title,[...aliases],signal);
  if(workerDetail)return fallback.volumes.length?mergeMangaSeriesDetails(workerDetail,fallback):workerDetail;
  return fallback;
 }catch(error){
  if(signal.aborted)throw error;
  if(workerDetail)return workerDetail;
  if(timeout.aborted)throw new Error('Loading manga artwork took too long. Try again.');
  if(workerError instanceof Error)throw new Error(`${workerError.message} Open Library fallback: ${error instanceof Error?error.message:'unavailable'}`);
  throw error;
 }
}
function isAppleImageUrl(url:URL) {
  const host=url.hostname.toLowerCase();
  return url.protocol==='https:'&&(host==='mzstatic.com'||host.endsWith('.mzstatic.com'))&&(!url.port||url.port==='443');
}
export function appleArtworkSizedUrl(value:string,size:number):string|undefined {
  let url:URL;
  try{url=new URL(value);}catch{return undefined;}
  if(!isAppleImageUrl(url)||!Number.isInteger(size)||size<32||size>10000)return undefined;
  // Apple Books RSS charts can return the unusual 0x170bb image variant.
  // Treat zero as an unspecified dimension and replace it with the requested size.
  const suffix=/\/\d{1,6}x\d{1,6}(?:bb(?:-\d{1,3})?|-\d{1,3})?\.(jpe?g|png|webp|avif)$/i;
  if(!suffix.test(url.pathname))return undefined;
  url.pathname=url.pathname.replace(suffix,`/${size}x${size}bb.$1`);
  return url.toString();
}
export function appleOriginalArtworkUrl(value:string):string|undefined {
  let url:URL;
  try{url=new URL(value);}catch{return undefined;}
  if(!isAppleImageUrl(url))return undefined;
  const prefix='/image/thumb/';
  if(!url.pathname.startsWith(prefix))return undefined;
  const parts=url.pathname.slice(prefix.length).split('/').filter(Boolean);
  if(!parts.length)return undefined;
  const separated=/^\d{1,5}x\d{1,5}(?:bb)?(?:-\d{1,3})?\.(?:jpe?g|png|webp|avif)$/i;
  const inline=/^(.+)\.\d{1,5}x\d{1,5}(?:bb)?(?:-\d{1,3})?\.(jpe?g|png|webp|avif)$/i;
  if(separated.test(parts[parts.length-1]))parts.pop();
  else {
    const match=parts[parts.length-1].match(inline);
    if(match)parts[parts.length-1]=match[1]+'.'+match[2];
  }
  if(!parts.length||! /\.(?:jpe?g|png|webp|avif)$/i.test(parts[parts.length-1]))return undefined;
  url.hostname='a5.mzstatic.com';
  url.pathname='/us/r1000/0/'+parts.join('/');
  url.search='';url.hash='';
  return url.toString();
}
async function json(url:string,signal?:AbortSignal,init:RequestInit={}) {
  const controller=new AbortController(),abortFromCaller=()=>controller.abort(signal?.reason);
  if(signal?.aborted)abortFromCaller();else signal?.addEventListener('abort',abortFromCaller,{once:true});
  const timer=setTimeout(()=>controller.abort(new DOMException('Catalog request timed out.','TimeoutError')),API_REQUEST_TIMEOUT_MS);
  try {
    const res=await fetch(url,{...init,signal:controller.signal,headers:{Accept:'application/json',...(init.headers||{})}});
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch(error) {
    if(controller.signal.reason?.name==='TimeoutError')throw new Error(`Catalog request timed out after ${API_REQUEST_TIMEOUT_MS/1000}s`);
    throw error;
  } finally {
    clearTimeout(timer);signal?.removeEventListener('abort',abortFromCaller);
  }
}
async function appleSearchData(url:string,signal?:AbortSignal):Promise<any> {
  if(typeof document==='undefined')return json(url,signal);
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(new DOMException('The request was aborted.','AbortError'));return;}
    const callback='__rupaApple'+Math.random().toString(36).slice(2);
    const host=window as unknown as Record<string,(value:any)=>void>;
    const script=document.createElement('script');
    let timer=0,retireTimer=0,settled=false;
    const cleanup=()=>{window.clearTimeout(timer);window.clearTimeout(retireTimer);signal?.removeEventListener('abort',onAbort);delete host[callback];script.remove();};
    const fail=(error:Error,keepLateCallback=false)=>{
      if(settled)return;
      settled=true;
      if(keepLateCallback){
        window.clearTimeout(timer);
        signal?.removeEventListener('abort',onAbort);
        host[callback]=()=>undefined;
        retireTimer=window.setTimeout(()=>{delete host[callback];script.remove();},30_000);
      }else cleanup();
      reject(error);
    };
    const onAbort=()=>fail(new DOMException('The request was aborted.','AbortError'),true);
    host[callback]=(value:any)=>{
      if(settled)return;
      settled=true;
      cleanup();
      resolve(value);
    };
    script.onerror=()=>{if(settled)cleanup();else fail(new Error('Apple Search API could not be reached'));};
    script.onload=()=>{if(settled)cleanup();else fail(new Error('Apple Search API returned no catalog data'));};
    timer=window.setTimeout(()=>fail(new Error('Apple Search API timed out'),true),APPLE_SEARCH_TIMEOUT_MS);
    signal?.addEventListener('abort',onAbort,{once:true});
    if(signal?.aborted){onAbort();return;}
    const requestUrl=new URL(url);requestUrl.searchParams.set('callback',callback);
    script.src=requestUrl.toString();
    document.head.appendChild(script);
  });
}
async function appleSearch(q:string,media:string,entity:string,category:Exclude<Category,'all'>,country:AppleStorefront,signal?:AbortSignal):Promise<Artwork[]> {
  const params=new URLSearchParams({term:q,media,entity,limit:'18',country});
  const data=await appleSearchData(`https://itunes.apple.com/search?${params}`,signal);
  if(category==='podcastepisodes')return applePodcastEpisodeResults(data.results||[]);
  if(category==='appscreenshots')return appleAppScreenshotResults(data.results||[]);
  return appleArtworkResults(data.results||[],category,entity);
}
function appleArtworkResults(rows:any[],category:Exclude<Category,'all'>,entity:string):Artwork[] {
 const seen=new Set<string>();
  const screenshotsById=new Map<string,{url:string;device:string}[]>();
  if(category==='apps')for(const app of rows){
    const appId=String(app.trackId||'');if(!appId)continue;
    const fields:[string,string][] = String(app.kind||'').toLowerCase().includes('mac')||entity.toLowerCase().includes('desktop')
      ? [['Mac','screenshotUrls']]
      : [['iPhone','screenshotUrls'],['iPad','ipadScreenshotUrls'],['Apple TV','appletvScreenshotUrls']];
    const assets=screenshotsById.get(appId)||[];
    for(const [device,key] of fields)for(const url of Array.isArray(app[key])?app[key]:[]){
      if(typeof url==='string'&&/^https:\/\//i.test(url)&&!assets.some(asset=>asset.device===device&&asset.url===url))assets.push({url,device});
    }
    screenshotsById.set(appId,assets);
  }
  return rows.flatMap((x:any)=>{
    const raw=String(x.artworkUrl100||x.artworkUrl600||x.artworkUrl512||'');
    const preview=appleArtworkSizedUrl(raw,600)||String(x.artworkUrl600||x.artworkUrl512||raw);
    const image=appleArtworkSizedUrl(raw,1200)||String(x.artworkUrl600||x.artworkUrl512||preview);
    const hdDownloadUrls=[appleOriginalArtworkUrl(raw),appleArtworkSizedUrl(raw,10000),appleArtworkSizedUrl(raw,1200),image,preview].filter((url,index,all):url is string=>Boolean(url)&&all.indexOf(url)===index);
    const isMovie=category==='movies';
    const id=String(isMovie?x.trackId||x.collectionId||'':x.collectionId||x.trackId||x.artistId||'');
    if(!preview||!id||seen.has(id))return [];
    seen.add(id);
    const title=String(x.collectionName||x.trackName||x.artistName||'Untitled');
    const subtitle=String(x.artistName||x.primaryGenreName||entity);
    const source=({music:'Apple Music',musicvideos:'Apple Music',books:'Apple Books',audiobooks:'Apple Books',podcasts:'Apple Podcasts',podcastepisodes:'Apple Podcasts',apps:'App Store',appscreenshots:'App Store',movies:'Apple TV',tv:'Apple TV'} as Partial<Record<Category,string>>)[category]||'Apple';
    const sourceUrl=String(x.collectionViewUrl||x.trackViewUrl||x.artistViewUrl||'');
    const kind=category==='movies'||category==='tv'?'poster':category==='musicvideos'?'thumbnail':'cover';
    const screenshots=category==='apps'?screenshotsById.get(id)?.slice(0,4):undefined;
    const mediaPreviewUrl=category==='musicvideos'&&/^https:\/\//i.test(String(x.previewUrl||''))?String(x.previewUrl):undefined;
    return [{id:`${category}:apple:${id}`,category,title:isMovie?String(x.trackName||x.collectionName||'Untitled film'):title,subtitle,artist:category==='music'?subtitle:undefined,artistUrl:String(x.artistViewUrl||''),year:String(x.releaseDate||'').slice(0,4),source,sourceUrl,mediaId:category==='apps'?id:undefined,screenshots,mediaPreviewUrl,previewUrl:preview,imageUrl:image||preview,sdDownloadUrl:preview,downloadUrl:hdDownloadUrls[0],hdDownloadUrls,kind,rights:'source-only'} as Artwork];
  });
}
function applePodcastEpisodeResults(rows:any[]):Artwork[] {
  const seen=new Set<string>();
  return rows.flatMap((x:any)=>{
    if(x.kind!=='podcast-episode'&&x.wrapperType!=='podcastEpisode')return [];
    const id=String(x.trackId||'');
    const raw=String(x.artworkUrl600||x.artworkUrl100||x.artworkUrl160||'');
    const preview=appleArtworkSizedUrl(raw,600)||raw,image=appleArtworkSizedUrl(raw,1200)||preview;
    if(!id||!preview||seen.has(id))return [];
    seen.add(id);
    const show=String(x.collectionName||'Apple Podcasts');
    return [{id:`podcastepisodes:apple:${id}`,category:'podcastepisodes',title:String(x.trackName||'Untitled episode'),subtitle:show,year:String(x.releaseDate||'').slice(0,4),source:'Apple Podcasts',sourceUrl:String(x.trackViewUrl||x.collectionViewUrl||''),mediaId:id,previewUrl:preview,imageUrl:image,sdDownloadUrl:preview,downloadUrl:appleOriginalArtworkUrl(raw)||appleArtworkSizedUrl(raw,10000)||image,hdDownloadUrls:[appleOriginalArtworkUrl(raw),appleArtworkSizedUrl(raw,10000),image,preview].filter((url,index,all):url is string=>Boolean(url)&&all.indexOf(url)===index),kind:'cover',rights:'source-only'} as Artwork];
  });
}
function normalizeAppleTerm(value:string):string{return value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
function normalizeAppleIsbn(value:string):string|undefined {
  const isbn=value.replace(/[\s-]/g,'').toUpperCase();
  if(/^\d{13}$/.test(isbn)){
    const sum=[...isbn.slice(0,12)].reduce((total,digit,index)=>total+Number(digit)*(index%2?3:1),0);
    return (10-sum%10)%10===Number(isbn[12])?isbn:undefined;
  }
  if(!/^\d{9}[\dX]$/.test(isbn))return undefined;
  const valid=[...isbn].reduce((total,digit,index)=>total+(digit==='X'?10:Number(digit))*(10-index),0)%11===0;
  if(!valid)return undefined;
  const prefix='978'+isbn.slice(0,9),sum=[...prefix].reduce((total,digit,index)=>total+Number(digit)*(index%2?3:1),0);
  return prefix+String((10-sum%10)%10);
}
function appleAppScreenshotResults(rows:any[],limit=24,query='',deviceFilter?:string):Artwork[] {
  const seen=new Set<string>();
  const candidates:{item:Artwork;exact:number;index:number;device:number;order:number}[]=[];
  const devices:[string,string,number][]=[['iPhone','screenshotUrls',0],['iPad','ipadScreenshotUrls',1],['Apple TV','appletvScreenshotUrls',3]];
  const normalizedQuery=normalizeAppleTerm(query);
  for(const [order,app] of rows.entries()){
    const appId=String(app.trackId||'');
    const appName=String(app.trackName||app.trackCensoredName||'App Store app');
    const developer=String(app.artistName||'App Store');
    const sourceUrl=String(app.trackViewUrl||'');
    if(!appId||!sourceUrl)continue;
    const appDevices:[string,string,number][] = String(app.kind||'').toLowerCase().includes('mac')?[['Mac','screenshotUrls',2]]:devices;
    for(const [device,key,deviceRank] of appDevices.filter(([device])=>!deviceFilter||device===deviceFilter)){
      const screenshots=Array.isArray(app[key])?app[key]:[];
      for(const [index,rawValue] of screenshots.entries()){
        const raw=String(rawValue||''),preview=appleArtworkSizedUrl(raw,600),image=appleArtworkSizedUrl(raw,1200);
        if(!preview||!image)continue;
        const hdDownloadUrls=[appleOriginalArtworkUrl(raw),appleArtworkSizedUrl(raw,10000),image,preview].filter((url,index,all):url is string=>Boolean(url)&&all.indexOf(url)===index);
        const item:Artwork={id:`appscreenshots:apple:${appId}:${device.toLowerCase().replace(/\s+/g,'-')}:${index+1}`,category:'appscreenshots',title:`${appName} · ${device} ${index+1}`,subtitle:developer,source:'App Store',sourceUrl,mediaId:appId,previewUrl:preview,imageUrl:image,sdDownloadUrl:preview,downloadUrl:hdDownloadUrls[0],hdDownloadUrls,kind:'thumbnail',rights:'source-only'};
        if(seen.has(item.id))continue;
        seen.add(item.id);
        candidates.push({item,exact:Number(normalizeAppleTerm(appName)!==normalizedQuery),index,device:deviceRank,order});
      }
    }
  }
  return candidates.sort((a,b)=>a.exact-b.exact||a.index-b.index||a.device-b.device||a.order-b.order).slice(0,limit).map(candidate=>candidate.item);
}
function parseAppleMusicUrl(value:string):{id:string;isArtist:boolean}|undefined {
  let url:URL;
  try{url=new URL(value);}catch{return undefined;}
  if(url.protocol!=='https:'||url.hostname.toLowerCase()!=='music.apple.com')return undefined;
  const isArtist=/\/artist\//i.test(url.pathname),isAlbum=/\/album\//i.test(url.pathname);
  if(!isArtist&&!isAlbum)return undefined;
  const id=url.pathname.match(/\/(\d{4,})(?:\/)?$/)?.[1];
  return id?{id,isArtist}:undefined;
}
async function appleMusicArtistAlbums(id:string,country:AppleStorefront,signal?:AbortSignal):Promise<Artwork[]> {
  const params=new URLSearchParams({id,country,entity:'album',limit:'200'});
  const data=await appleSearchData(`https://itunes.apple.com/lookup?${params}`,signal);
  const rows=(data.results||[]).filter((x:any)=>Boolean(x.collectionId&&x.collectionName));
  const releaseTime=(value:unknown)=>{const time=Date.parse(String(value||''));return Number.isFinite(time)?time:0;};
  rows.sort((a:any,b:any)=>releaseTime(b.releaseDate)-releaseTime(a.releaseDate));
  return appleArtworkResults(rows,'music','album');
}
function normalizeMusicSearch(value:string):string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}
async function appleMusicUrlSearch(value:string,country:AppleStorefront,signal?:AbortSignal):Promise<Artwork[]> {
  const parsed=parseAppleMusicUrl(value);
  if(!parsed)throw new Error('Paste an Apple Music album or artist URL.');
  if(parsed.isArtist)return appleMusicArtistAlbums(parsed.id,country,signal);
  const params=new URLSearchParams({id:parsed.id,country});
  const data=await appleSearchData(`https://itunes.apple.com/lookup?${params}`,signal);
  return appleArtworkResults((data.results||[]).filter((x:any)=>Boolean(x.collectionId&&x.collectionName)), 'music','album');
}
const APPLE_CATALOG_SEARCH:Partial<Record<AppleCategory,{media:string;entity:string;hosts:string[];path:RegExp}>>={
  movies:{media:'movie',entity:'movie',hosts:['itunes.apple.com'],path:/\/movie\//i},
  tv:{media:'tvShow',entity:'tvSeason',hosts:['itunes.apple.com'],path:/\/tv-season\//i},
  musicvideos:{media:'musicVideo',entity:'musicVideo',hosts:['music.apple.com','itunes.apple.com'],path:/\/music-video\//i},
  books:{media:'ebook',entity:'ebook',hosts:['books.apple.com','itunes.apple.com'],path:/\/book\//i},
  audiobooks:{media:'audiobook',entity:'audiobook',hosts:['books.apple.com','itunes.apple.com'],path:/\/audiobook\//i},
  podcasts:{media:'podcast',entity:'podcast',hosts:['podcasts.apple.com','itunes.apple.com'],path:/\/podcast\//i},
  podcastepisodes:{media:'podcast',entity:'podcastEpisode',hosts:['podcasts.apple.com','itunes.apple.com'],path:/\/podcast\//i},
  apps:{media:'software',entity:'software',hosts:['apps.apple.com','itunes.apple.com'],path:/\/app\//i},
  appscreenshots:{media:'software',entity:'software',hosts:['apps.apple.com','itunes.apple.com'],path:/\/app\//i}
};
function appleCatalogId(value:string,category:AppleCategory):string|undefined{
  try{const url=new URL(value),config=APPLE_CATALOG_SEARCH[category];if(!config||url.protocol!=='https:'||!config.hosts.includes(url.hostname.toLowerCase())||!config.path.test(url.pathname))return undefined;return url.pathname.match(/\/(?:id)?(\d+)\/?$/i)?.[1];}catch{return undefined;}
}
async function appleCatalogLookup(value:string,category:AppleCategory,country:AppleStorefront,signal?:AbortSignal):Promise<Artwork[]>{
  const id=(category==='movies'||category==='tv')&&/^\d{4,}$/.test(value.trim())?value.trim():appleCatalogId(value,category),config=APPLE_CATALOG_SEARCH[category];
  if(!id||!config)throw new Error(`Paste a valid Apple ${category} URL or search by name.`);
  const params=new URLSearchParams({id,country,entity:config.entity,limit:category==='podcastepisodes'?'200':'18'});
  const data=await appleSearchData(`https://itunes.apple.com/lookup?${params}`,signal);
  let rows=data.results||[];
  if(category==='podcastepisodes'){
    const episodeId=/^https:\/\//i.test(value.trim())?new URL(value.trim()).searchParams.get('i'):null;
    const episodes=applePodcastEpisodeResults(rows);
    return episodeId?episodes.filter(item=>item.mediaId===episodeId):episodes.slice(0,24);
  }
  if(category==='appscreenshots')return appleAppScreenshotResults(rows);
  return appleArtworkResults(rows.filter((item:any)=>Boolean(item.artworkUrl100||item.artworkUrl600||item.artworkUrl512)),category,config.entity);
}
async function appleCatalogSearch(q:string,category:AppleCategory,country:AppleStorefront,signal?:AbortSignal):Promise<Artwork[]>{
  const value=q.trim();
  if(/^https?:\/\//i.test(value))return appleCatalogLookup(value,category,country,signal);
  if((category==='movies'||category==='tv')&&/^\d{4,}$/.test(value))return appleCatalogLookup(value,category,country,signal);
  if(category==='books'){
    const isbn=normalizeAppleIsbn(value);
    if(isbn){
      const params=new URLSearchParams({isbn,country});
      const data=await appleSearchData(`https://itunes.apple.com/lookup?${params}`,signal);
      return appleArtworkResults(data.results||[],'books','ebook');
    }
  }
  if(category==='apps'||category==='appscreenshots')return appleSoftwareSearch(value,category,country,signal);
  const config=APPLE_CATALOG_SEARCH[category];if(!config)throw new Error('This Apple catalog category is not available yet.');
  return appleSearch(value,config.media,config.entity,category,country,signal);
}
async function appleSoftwareSearch(query:string,category:'apps'|'appscreenshots',country:AppleStorefront,signal?:AbortSignal):Promise<Artwork[]> {
  const entities=['software','iPadSoftware','desktopSoftware'];
  const settled=await Promise.allSettled(entities.map(async entity=>{
    const params=new URLSearchParams({term:query,media:'software',entity,limit:'18',country});
    return appleSearchData(`https://itunes.apple.com/search?${params}`,signal);
  }));
  const fulfilled=settled.filter((entry):entry is PromiseFulfilledResult<any>=>entry.status==='fulfilled');
  if(!fulfilled.length)throw (settled.find((entry):entry is PromiseRejectedResult=>entry.status==='rejected')?.reason||new Error('Apple App Store search failed'));
  const rows=fulfilled.flatMap(entry=>entry.value.results||[]);
  if(category==='appscreenshots')return appleAppScreenshotResults(rows,24,query);
  const byId=new Map(appleArtworkResults(rows,'apps','software').map(item=>[item.id,item]));
  return [...byId.values()].sort((a,b)=>Number(normalizeAppleTerm(a.title)!==normalizeAppleTerm(query))-Number(normalizeAppleTerm(b.title)!==normalizeAppleTerm(query))).slice(0,24);
}
async function music(q:string,country:AppleStorefront,signal?:AbortSignal):Promise<Artwork[]> {
  if(/^https?:\/\//i.test(q.trim()))return appleMusicUrlSearch(q.trim(),country,signal);
  const results=await appleSearch(q,'music','album','music',country,signal);
  if(!results.length)return appleSearch(q,'music','song','music',country,signal).then(rows=>[...new Map(rows.map(item=>[item.id,item])).values()]);
  const term=normalizeMusicSearch(q);
  if(results.some(item=>normalizeMusicSearch(item.title)===term))return results;
  const artist=results.find(item=>normalizeMusicSearch(item.artist||item.subtitle)===term);
  const artistUrl=artist&&parseAppleMusicUrl(artist.artistUrl||'');
  if(!artistUrl?.isArtist)return results;
  const discography=await appleMusicArtistAlbums(artistUrl.id,country,signal);
  return discography.length?discography:results;
}
export async function searchMusicArtists(q:string,signal?:AbortSignal,country:AppleStorefront='id'):Promise<Artwork[]> {
  if(!backend)throw new Error('Artist image search needs a RUPA API backend configured in VITE_API_URL.');
  const value=q.trim();
  let artists:any[]=[];
  if(/^https?:\/\//i.test(value)){
    const parsed=parseAppleMusicUrl(value);
    if(!parsed?.isArtist)throw new Error('Paste an Apple Music artist URL for this search.');
    const params=new URLSearchParams({id:parsed.id,country});
    const data=await appleSearchData(`https://itunes.apple.com/lookup?${params}`,signal);
    artists=(data.results||[]).filter((row:any)=>row.artistId||row.wrapperType==='artist');
    if(!artists.length)artists=[{artistId:parsed.id,artistName:value.split('/').filter(Boolean).at(-2)||'Artist',artistViewUrl:value}];
  }else{
    const params=new URLSearchParams({term:value,media:'music',entity:'musicArtist',limit:'8',country});
    const data=await appleSearchData(`https://itunes.apple.com/search?${params}`,signal);
    artists=data.results||[];
  }
  const seen=new Set<string>();
  const candidates=artists.flatMap((row:any)=>{
    const id=String(row.artistId||'');
    const slug=String(row.artistName||'artist').trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,'');
    const url=String(row.artistViewUrl||`https://music.apple.com/${country}/artist/${encodeURIComponent(slug)}/${id}`);
    if(!id||!validAppleArtistUrl(url)||seen.has(id))return [];
    seen.add(id);
    return [{id,name:String(row.artistName||'Artist'),url}];
  }).slice(0,6);
  if(!candidates.length)return [];
  const settled=await Promise.allSettled(candidates.map(async artist=>{
    const imageUrl=await getAppleArtistImage(artist.url,signal);
    if(!imageUrl)return null;
    return {id:`music:apple-artist:${artist.id}`,category:'music',title:artist.name,subtitle:'Artist image',artist:artist.name,artistUrl:artist.url,source:'Apple Music',sourceUrl:artist.url,previewUrl:imageUrl,imageUrl,kind:'artist-image',rights:'source-only'} as Artwork;
  }));
  const results=settled.flatMap(entry=>entry.status==='fulfilled'&&entry.value?[entry.value]:[]);
  if(!results.length)throw new Error('Apple Music did not expose artist images for these results.');
  return results;
}
export type AppleChartKind='albums'|'songs'|'music-videos'|'movies'|'tv-seasons'|'tv-episodes'|'top-free'|'top-paid'|'top';
const APPLE_CHART_FEEDS=appleChartFeeds as Partial<Record<AppleCategory,Partial<Record<AppleChartKind,string>>>>;
const APPLE_CHART_TIMEOUT_MS=3_500;
const APPLE_CHART_CACHE_TTL_MS=4*60_000;
const APPLE_CHART_CACHE=new Map<string,{expiresAt:number;items:Artwork[]}>();
type LegacyAppleChartEntry={
  'im:name'?:{label?:string};'im:artist'?:{label?:string};'im:image'?:Array<{label?:string;attributes?:{height?:string}}>;
  'im:releaseDate'?:{label?:string;attributes?:{label?:string}};title?:{label?:string};link?:{attributes?:{href?:string;rel?:string}}|Array<{attributes?:{href?:string;rel?:string}}>;
  id?:{label?:string;attributes?:{'im:id'?:string}};category?:{attributes?:{term?:string}};
};
type AppleTrendSnapshot={schemaVersion:1;generatedAt:string|null;feeds:Record<string,{entries:LegacyAppleChartEntry[];updatedAt?:string}>};
let appleTrendSnapshotPromise:Promise<AppleTrendSnapshot|null>|undefined;
function appleChartSource(category:AppleCategory):string {
  if(category==='apps')return 'App Store';
  if(category==='books'||category==='audiobooks')return 'Apple Books';
  if(category==='podcasts')return 'Apple Podcasts';
  if(category==='movies'||category==='tv')return 'Apple TV';
  return 'Apple Music';
}
function appleChartLink(entry:LegacyAppleChartEntry):string {
  const links=Array.isArray(entry.link)?entry.link:[entry.link];
  const href=links.find(link=>link?.attributes?.rel==='alternate')?.attributes?.href||links.find(link=>link?.attributes?.href)?.attributes?.href||entry.id?.label||'';
  try{const url=new URL(href);return url.protocol==='https:'&&(url.hostname==='apple.com'||url.hostname.endsWith('.apple.com'))?url.toString():'';}catch{return '';}
}
function appleChartArtwork(entry:LegacyAppleChartEntry):string {
  const images=Array.isArray(entry['im:image'])?entry['im:image']:[];
  return images.slice().sort((a,b)=>Number(b.attributes?.height||0)-Number(a.attributes?.height||0)).find(image=>typeof image.label==='string'&&image.label.startsWith('https://'))?.label||'';
}
async function fetchAppleChartJson(url:string,signal?:AbortSignal):Promise<{feed?:{entry?:LegacyAppleChartEntry[]}}> {
  const controller=new AbortController(),abort=()=>controller.abort(signal?.reason||new DOMException('Chart request cancelled.','AbortError'));
  if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>controller.abort(new DOMException('Apple chart request timed out.','TimeoutError')),APPLE_CHART_TIMEOUT_MS);
  try{
    const response=await fetch(url,{signal:controller.signal,headers:{Accept:'application/json'}});
    if(response.status===429)throw new Error('Apple is rate-limiting chart requests. Try again later.');
    if(!response.ok)throw new Error(`Apple charts are unavailable right now (HTTP ${response.status}).`);
    return await response.json() as {feed?:{entry?:LegacyAppleChartEntry[]}};
  }catch(error){
    if(signal?.aborted)throw signal.reason||new DOMException('Chart request cancelled.','AbortError');
    if(controller.signal.reason?.name==='TimeoutError')throw new Error('Apple’s chart feed took too long. Try again or use catalog search.');
    if(error instanceof TypeError)throw new Error('Apple charts could not be reached from this browser. Try again or use catalog search.');
    throw error;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
function appleChartArtworkItems(category:AppleCategory,country:AppleStorefront,entries:LegacyAppleChartEntry[]):Artwork[] {
  const source=appleChartSource(category);
  return entries.flatMap(raw=>{
    if(!raw||typeof raw!=='object')return [];
    const artwork=appleChartArtwork(raw),preview=appleArtworkSizedUrl(artwork,600)||artwork;
    const image=appleArtworkSizedUrl(artwork,1200)||preview;
    const id=String(raw.id?.attributes?.['im:id']||raw.id?.label||raw['im:name']?.label||'').trim();
    const sourceUrl=appleChartLink(raw);
    if(!id||!preview||!sourceUrl)return [];
    const title=String(raw['im:name']?.label||raw.title?.label||'Untitled');
    const subtitle=String(raw['im:artist']?.label||raw.category?.attributes?.term||source);
    const releaseDate=String(raw['im:releaseDate']?.label||'');
    const hdDownloadUrls=[appleOriginalArtworkUrl(artwork),appleArtworkSizedUrl(artwork,10000),image,preview].filter((candidate,position,all):candidate is string=>Boolean(candidate)&&all.indexOf(candidate)===position);
    const sourceKind=category==='musicvideos'?'thumbnail':category==='movies'||category==='tv'?'poster':'cover';
    return [{id:`${category}:apple-chart:${country}:${id}`,category,title,subtitle,year:releaseDate.slice(0,4)||undefined,releaseDate,source,provider:source,sourceUrl,mediaId:category==='apps'?id:undefined,previewUrl:preview,imageUrl:image,sdDownloadUrl:preview,downloadUrl:hdDownloadUrls[0],hdDownloadUrls,kind:sourceKind,rights:'source-only'} as Artwork];
  });
}
function appleChartSnapshotKey(country:AppleStorefront,category:AppleCategory,kind:AppleChartKind){return `${country}/${category}/${kind}`;}
function loadAppleTrendSnapshot():Promise<AppleTrendSnapshot|null>{
  if(typeof document==='undefined')return Promise.resolve(null);
  if(!appleTrendSnapshotPromise){
    const base=import.meta.env?.BASE_URL||'/';
    appleTrendSnapshotPromise=fetch(`${base}data/apple-trends.json`,{headers:{Accept:'application/json'},cache:'no-cache',signal:AbortSignal.timeout(5000)})
      .then(async response=>{
        if(!response.ok)return null;
        const snapshot=await response.json() as AppleTrendSnapshot;
        return snapshot?.schemaVersion===1&&Boolean(snapshot.generatedAt)&&snapshot.feeds&&typeof snapshot.feeds==='object'?snapshot:null;
      }).catch(()=>null);
  }
  return appleTrendSnapshotPromise;
}
export async function fetchAppleTrendArtwork(category:AppleCategory,kind:AppleChartKind,country:AppleStorefront,signal?:AbortSignal):Promise<Artwork[]> {
  const feed=APPLE_CHART_FEEDS[category]?.[kind];
  if(!feed)return [];
  if(signal?.aborted)throw signal.reason||new DOMException('Chart request cancelled.','AbortError');
  const url=`https://itunes.apple.com/${country}/rss/${feed}/limit=10/json`,cached=APPLE_CHART_CACHE.get(url);
  if(cached&&cached.expiresAt>Date.now())return cached.items;
  const data=await fetchAppleChartJson(url,signal),entries=Array.isArray(data.feed?.entry)?data.feed.entry:[];
  const items=appleChartArtworkItems(category,country,entries);
  APPLE_CHART_CACHE.set(url,{expiresAt:Date.now()+APPLE_CHART_CACHE_TTL_MS,items});
  return items;
}

export interface AppleTrendAvailability {
  items: Artwork[];
  storefront: AppleStorefront;
  availableStorefronts: AppleStorefront[];
}

/**
 * Prefer the daily, same-origin snapshot. If no snapshot has been published yet,
 * check the chosen storefront first and try only two common fallback markets.
 */
export async function fetchAppleTrendArtworkWithAvailability(
  category: AppleCategory,
  kind: AppleChartKind,
  preferredStorefront: AppleStorefront,
  signal?: AbortSignal,
): Promise<AppleTrendAvailability> {
  const snapshot=await loadAppleTrendSnapshot();
  if(signal?.aborted)throw signal.reason||new DOMException('Chart request cancelled.','AbortError');
  if(snapshot){
    const availableStorefronts=APPLE_STOREFRONTS.map(option=>option.id).filter(country=>{
      const entries=snapshot.feeds[appleChartSnapshotKey(country,category,kind)]?.entries;
      return Array.isArray(entries)&&appleChartArtworkItems(category,country,entries).length>0;
    });
    const storefront=availableStorefronts.includes(preferredStorefront)?preferredStorefront:availableStorefronts[0]||preferredStorefront;
    const entries=snapshot.feeds[appleChartSnapshotKey(storefront,category,kind)]?.entries||[];
    return {items:appleChartArtworkItems(category,storefront,entries),storefront,availableStorefronts};
  }
  try{
    const items=await fetchAppleTrendArtwork(category,kind,preferredStorefront,signal);
    if(items.length)return {items,storefront:preferredStorefront,availableStorefronts:[]};
  }catch(error){
    if(signal?.aborted)throw signal.reason||new DOMException('Chart request cancelled.','AbortError');
  }
  const fallbacks=['us','gb','au'].filter((id):id is AppleStorefront=>id!==preferredStorefront).slice(0,2);
  const settled=await Promise.allSettled(fallbacks.map(country=>fetchAppleTrendArtwork(category,kind,country,signal)));
  if(signal?.aborted)throw signal.reason||new DOMException('Chart request cancelled.','AbortError');
  const available=settled.flatMap((entry,index)=>entry.status==='fulfilled'&&entry.value.length?[{country:fallbacks[index],items:entry.value}]:[]);
  if(available.length){
    const selected=available[0];
    return {items:selected.items,storefront:selected.country,availableStorefronts:[]};
  }
  const failure=settled.find((entry):entry is PromiseRejectedResult=>entry.status==='rejected');
  if(failure)throw failure.reason;
  return {items:[],storefront:preferredStorefront,availableStorefronts:[]};
}

async function podcasts(q:string,signal?:AbortSignal,country:AppleStorefront='id'):Promise<Artwork[]> {
  if(/^https?:\/\//i.test(q.trim()))return appleCatalogLookup(q.trim(),'podcasts',country,signal);
  return appleSearch(q,'podcast','podcast','podcasts',country,signal);
}
function uniqueStrings(items:string[]):string[]{return [...new Set(items)];}
function normalizeProviderResult(data:any):ProviderResult{return {results:(data.results||[]).map((item:Artwork&{provider?:string})=>({...item,source:item.source||item.provider||'Source'})),warnings:data.warnings||[],unavailable:data.unavailable||[]};}
let offlineArtPromise:Promise<Artwork[]>|null=null;
function appAssetUrl(value:string):string{
 if(/^(?:https?:|data:|blob:)/i.test(value))return value;
 const base=new URL(import.meta.env.BASE_URL||'/',window.location.origin);
 return new URL(value.replace(/^\/+/,''),base).toString();
}
async function offlineArtworks():Promise<Artwork[]>{
 if(!offlineArtPromise){
  offlineArtPromise=(async()=>{
   const url=new URL('offline/artworks.json',new URL(import.meta.env.BASE_URL||'/',window.location.origin));
   const response=await fetch(url,{headers:{Accept:'application/json'},cache:'force-cache',signal:AbortSignal.timeout(7000)});
   if(!response.ok)throw new Error(`Offline artwork index HTTP ${response.status}`);
   const data=await response.json() as {assets?:Artwork[]};
   return (data.assets||[]).map(item=>({...item,availability:'mirrored' as const,imageUrl:appAssetUrl(item.imageUrl),previewUrl:appAssetUrl(item.previewUrl),sdDownloadUrl:item.sdDownloadUrl?appAssetUrl(item.sdDownloadUrl):undefined,downloadUrl:item.downloadUrl?appAssetUrl(item.downloadUrl):undefined,hdDownloadUrls:item.hdDownloadUrls?.map(appAssetUrl)}));
  })().catch(error=>{offlineArtPromise=null;throw error;});
 }
 return offlineArtPromise;
}
export async function searchOfflineArt(query:string,signal?:AbortSignal,category?:Artwork['category']):Promise<Artwork[]>{
 if(signal?.aborted)throw signal.reason||new DOMException('Search cancelled.','AbortError');
 const items=(await offlineArtworks()).filter(item=>!category||item.category===category);
 if(signal?.aborted)throw signal.reason||new DOMException('Search cancelled.','AbortError');
 if(!query.trim())return items;
 return items.filter(item=>artworkMatches(item,query));
}
function dedupeArtwork(items:Artwork[]):Artwork[]{
 const seen=new Set<string>();
 return items.filter(item=>{
  const externalId=item.externalId?.replace(/^wikidata:/i,'').trim();
  const entityId=item.mediaId?.trim()||externalId;
  const edition=item.editionId||item.region||'';
  const key=entityId
   ?`${item.category}:entity:${entityId}:${item.kind||''}:${edition}`.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim()
   :`${item.category}:${item.title}|${item.artist||item.subtitle}|${item.year||''}|${edition}|${item.kind||''}`.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  if(seen.has(key))return false;seen.add(key);return true;
 });
}
/** Offline title index for games and anime: needs no search backend, only the static JSON shards shipped with the site. */
async function searchLocalIndex(q:string,category:string,signal?:AbortSignal,onPartial?:(result:ProviderResult)=>void):Promise<ProviderResult>{
 try{
  if(category!=='games'&&category!=='anime'){
   // Every other collection: mirrored open-licensed files first, then Wikidata rows that carry a Commons image.
   const [mirrored,indexed]=await Promise.all([searchOfflineArt(q,signal,category as Artwork['category']).catch(()=>[] as Artwork[]),searchTitleArtworks(category,q,signal,24)]);
   const note=indexed.withoutImage?[indexed.withoutImage+' additional title record'+(indexed.withoutImage===1?'':'s')+' match the query, but no image preview is available in this category yet.']:[];
   return {results:dedupeArtwork([...mirrored,...indexed.items]),warnings:note,unavailable:[]};
  }
  const results=category==='games'
   ?await searchGameIndex(q,{signal,onPartial:items=>onPartial?.({results:dedupeArtwork(items),warnings:[],unavailable:[]})})
   :await searchAnimeIndex(q,signal);
  return {results:dedupeArtwork(results),warnings:[],unavailable:[]};
 }catch(error){
  if(signal?.aborted)throw error;
  return {results:[],warnings:['Offline index: '+(error instanceof Error?error.message:'unavailable')],unavailable:[]};
 }
}
/** YouTube thumbnails need no key or search backend: the image host is public and the id is in the link. */
export function youtubeVideoId(value:string):string|null{
 const text=value.trim();
 if(/^[A-Za-z0-9_-]{11}$/.test(text))return text;
 try{
  const url=new URL(text),host=url.hostname.toLowerCase();
  if(!['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be','www.youtu.be','youtube-nocookie.com','www.youtube-nocookie.com'].includes(host))return null;
  const id=host.endsWith('youtu.be')?url.pathname.split('/').filter(Boolean)[0]:url.searchParams.get('v')||url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/i)?.[1];
  return id&&/^[A-Za-z0-9_-]{11}$/.test(id)?id:null;
 }catch{return null;}
}
async function youtubeThumbnails(q:string,signal?:AbortSignal):Promise<ProviderResult>{
 const id=youtubeVideoId(q);
 if(!id)return {results:[],warnings:['Paste a YouTube video URL or 11-character video ID to load its thumbnail.'],unavailable:[]};
 const host='https://i.ytimg.com/vi/'+id+'/',maxres=host+'maxresdefault.jpg',sd=host+'sddefault.jpg',hq=host+'hqdefault.jpg';
 let title='YouTube video '+id,author='YouTube video';
 try{const meta=await json('https://www.youtube.com/oembed?format=json&url='+encodeURIComponent('https://www.youtube.com/watch?v='+id),signal);title=String(meta.title||title);author=String(meta.author_name||author);}catch{if(signal?.aborted)throw signal.reason;}
 return {results:[{id:'videos:youtube:'+id,category:'videos',title,subtitle:author,previewUrl:hq,imageUrl:maxres,sdDownloadUrl:hq,downloadUrl:maxres,hdDownloadUrls:[maxres,sd,hq],sourceUrl:'https://www.youtube.com/watch?v='+id,source:'YouTube thumbnails',provider:'YouTube thumbnails',kind:'thumbnail',rights:'source-only'}],warnings:[],unavailable:[]};
}
const LOCAL_ONLY_CATEGORIES=new Set<string>(['comics','boardgames','magazines','physicalmedia']);
const SEARCH_BACKED_CATEGORIES=new Set<string>(['games','webtoons']);
function publicAnimeMangaItems(data:any,category:'anime'|'manga',provider:'AniList'|'Jikan / MyAnimeList'|'MangaDex'):Artwork[]{
 const rows=provider==='AniList'?data?.data?.Page?.media:provider==='MangaDex'?data?.data:data?.data;
 if(!Array.isArray(rows))return [];
 return rows.flatMap((entry:any)=>{
  if(provider==='AniList'){
   const title=String(entry?.title?.userPreferred||entry?.title?.english||entry?.title?.romaji||entry?.title?.native||'').trim();
   const image=String(entry?.coverImage?.extraLarge||entry?.coverImage?.large||'').trim();
   const id=String(entry?.id||'');
   if(!title||!image||!id)return [];
    const year=Number(entry?.startDate?.year||entry?.seasonYear);
    const alternateTitles=category==='manga'?[entry?.title?.english,entry?.title?.romaji,entry?.title?.native,...(Array.isArray(entry?.synonyms)?entry.synonyms:[])].filter((value:any):value is string=>typeof value==='string'&&Boolean(value.trim())&&value.trim()!==title).map((value:string)=>value.trim()).filter((value:string,index:number,all:string[])=>all.indexOf(value)===index):undefined;
    return [{id:`${category}:anilist:${id}`,category,title,subtitle:`AniList ${category} catalogue`,year:Number.isInteger(year)&&year>0?String(year):undefined,previewUrl:String(entry?.coverImage?.large||image),imageUrl:image,downloadUrl:image,sourceUrl:String(entry?.siteUrl||`https://anilist.co/${category}/${id}`),source:'AniList',provider:'AniList',mediaId:id,alternateTitles,kind:category==='anime'?'poster':'cover',rights:'source-only'} as Artwork];
  }
  if(provider==='Jikan / MyAnimeList'){
   const id=String(entry?.mal_id||''),title=String(entry?.title_english||entry?.title||entry?.title_japanese||'').trim();
   const preview=String(entry?.images?.jpg?.image_url||entry?.images?.webp?.image_url||'').trim();
   const image=String(entry?.images?.jpg?.large_image_url||entry?.images?.webp?.large_image_url||preview).trim();
   if(!id||!title||!preview||!image)return [];
   const date=String(category==='anime'?entry?.aired?.from:entry?.published?.from||'');
   const year=date.match(/\b(19|20)\d{2}\b/)?.[0];
   const type=category==='anime'?'anime':'manga';
    const alternateTitles=category==='manga'?[entry?.title_english,entry?.title,entry?.title_japanese,...(Array.isArray(entry?.title_synonyms)?entry.title_synonyms:[])].filter((value:any):value is string=>typeof value==='string'&&Boolean(value.trim())&&value.trim()!==title).map((value:string)=>value.trim()).filter((value:string,index:number,all:string[])=>all.indexOf(value)===index):undefined;
    return [{id:`${category}:jikan:${id}`,category,title,subtitle:String(entry?.type||`${category} artwork`),year,previewUrl:preview,imageUrl:image,downloadUrl:image,sourceUrl:`https://myanimelist.net/${type}/${id}`,source:'Jikan / MyAnimeList',provider:'Jikan / MyAnimeList',mediaId:id,alternateTitles,kind:category==='anime'?'poster':'cover',rights:'source-only'} as Artwork];
  }
  const id=String(entry?.id||''),attributes=entry?.attributes||{};
   const title=String(attributes?.title?.en||attributes?.title?.['ja-ro']||attributes?.title?.ja||Object.values(attributes?.title||{})[0]||'').trim();
   const alternateTitles=[...Object.values(attributes?.title||{}),...(Array.isArray(attributes?.altTitles)?attributes.altTitles.flatMap((row:any)=>Object.values(row||{})):[])].filter((value:any):value is string=>typeof value==='string'&&Boolean(value.trim())&&value.trim()!==title).map((value:string)=>value.trim()).filter((value:string,index:number,all:string[])=>all.indexOf(value)===index);
  const cover=Array.isArray(entry?.relationships)?entry.relationships.find((item:any)=>item?.type==='cover_art'):undefined;
  const fileName=String(cover?.attributes?.fileName||'').trim();
  if(!id||!title||!fileName)return [];
  const image=`https://uploads.mangadex.org/covers/${encodeURIComponent(id)}/${encodeURIComponent(fileName)}`;
  const year=Number(attributes?.year);
   return [{id:`manga:mangadex:${id}`,category:'manga',title,subtitle:'MangaDex · cover art',year:Number.isInteger(year)&&year>0?String(year):undefined,previewUrl:`${image}.256.jpg`,imageUrl:`${image}.512.jpg`,downloadUrl:`${image}.512.jpg`,sourceUrl:`https://mangadex.org/title/${encodeURIComponent(id)}`,source:'MangaDex',provider:'MangaDex',mediaId:id,alternateTitles,kind:'cover',rights:'source-only'} as Artwork];
 });
}
async function searchPublicAnimeMangaSource(query:string,category:'anime'|'manga',source:'anilist'|'jikan'|'mangadex',signal?:AbortSignal):Promise<Artwork[]>{
 if(source==='anilist'){
  const gql='query ($search:String,$type:MediaType){Page(page:1,perPage:20){media(search:$search,type:$type,isAdult:false){id title{userPreferred english romaji native} synonyms coverImage{large extraLarge} format seasonYear startDate{year} siteUrl}}}';
  const data=await json('https://graphql.anilist.co',signal,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:gql,variables:{search:query,type:category==='anime'?'ANIME':'MANGA'}})});
  return publicAnimeMangaItems(data,category,'AniList');
 }
 if(source==='jikan'){
  const type=category==='anime'?'anime':'manga',url=new URL(`https://api.jikan.moe/v4/${type}`);
  url.searchParams.set('q',query);url.searchParams.set('limit','16');url.searchParams.set('sfw','true');
  return publicAnimeMangaItems(await json(url.toString(),signal),category,'Jikan / MyAnimeList');
 }
 if(category!=='manga')return [];
 const url=new URL('https://api.mangadex.org/manga');
 url.searchParams.set('title',query);url.searchParams.set('limit','20');url.searchParams.set('includes[]','cover_art');
 url.searchParams.set('contentRating[]','safe');url.searchParams.set('order[relevance]','desc');
 return publicAnimeMangaItems(await json(url.toString(),signal),category,'MangaDex');
}
async function searchPublicAnimeManga(query:string,category:'anime'|'manga',source:string,signal?:AbortSignal,onPartial?:(result:ProviderResult)=>void):Promise<ProviderResult>{
 const sources=source==='all'?(category==='anime'?['anilist','jikan']:['mangadex','jikan','anilist']):[source];
 const partialResults:Artwork[]=[];
 const attempts=await Promise.allSettled(sources.map(item=>searchPublicAnimeMangaSource(query,category,item as 'anilist'|'jikan'|'mangadex',signal).then(items=>{
  partialResults.push(...items);onPartial?.({results:dedupeArtwork(partialResults),warnings:[],unavailable:[]});return items;
 })));
 if(signal?.aborted)throw signal.reason||new DOMException('Search cancelled.','AbortError');
 const results=dedupeArtwork(attempts.flatMap(item=>item.status==='fulfilled'?item.value:[]));
 const warnings=attempts.flatMap((item,index)=>item.status==='rejected'?[`${sources[index]}: ${item.reason instanceof Error?item.reason.message:'source unavailable'}`]:[]);
 const result={results,warnings,unavailable:results.length?[]:[category]};onPartial?.(result);return result;
}
/** Appends offline matches (mirrored files and Commons-image rows) after live results so every collection shows something even when a live source is thin. */
async function withOfflineMatches(result:ProviderResult,q:string,category:Category,source:string,signal?:AbortSignal):Promise<ProviderResult>{
 if(source!=='all'||!hasTitleIndex(category))return result;
 try{const local=await searchLocalIndex(q,category,signal);return local.results.length||local.warnings.length?{...result,results:dedupeArtwork([...result.results,...local.results.slice(0,12)]),warnings:uniqueStrings([...result.warnings,...local.warnings])}:result;}
 catch(error){if(signal?.aborted)throw error;return result;}
}
const SEARCH_CACHE=new Map<string,{at:number;value:ProviderResult}>();
const SEARCH_CACHE_TTL=60_000;
const APPLE_SEARCH_CATEGORIES=new Set<AppleCategory>(['music','musicvideos','books','audiobooks','podcasts','podcastepisodes','apps','appscreenshots','movies','tv']);
async function searchLocalVita(query:string,signal?:AbortSignal):Promise<ProviderResult>{
 const params=new URLSearchParams({q:query}),data=normalizeProviderResult(await json('/__rupa-local/hexflow/search?'+params.toString(),signal));
 return {...data,results:dedupeArtwork(data.results)};
}
function localizeVitaImages(results:Artwork[]):Artwork[]{
 if(!import.meta.env?.DEV)return results;
 return results.map(item=>{
  if((item.provider||item.source)!=='HexFlow Covers')return item;
  const appId=item.id.match(/:([A-Z]{4}\d{5})$/i)?.[1];if(!appId)return item;
  const url=`/__rupa-local/hexflow/Covers/PSVita/${appId.toUpperCase()}.png`;
  return {...item,previewUrl:url,imageUrl:url,sdDownloadUrl:url,downloadUrl:url,hdDownloadUrls:[url]};
 });
}
async function searchArtworkUncached(q:string,category:Category,country:AppleStorefront,source:string,signal?:AbortSignal,onPartial?:(result:ProviderResult)=>void,gameAssetFilter?:string):Promise<ProviderResult> {
 if(category==='books'&&source==='local'){
  try{return {results:await searchOfflineArt(q,signal,'books'),warnings:[],unavailable:[]};}
  catch(error){if(signal?.aborted)throw error;return {results:[],warnings:['Offline collection: '+(error instanceof Error?error.message:'unavailable')],unavailable:[]};}
 }
 // Collections with no live provider at all are served from the offline indexes alone; those with a live search backend fall back to them when it is absent.
 if(hasTitleIndex(category)||category==='games'||category==='anime'){
  const localOnly=LOCAL_ONLY_CATEGORIES.has(category),searchBacked=SEARCH_BACKED_CATEGORIES.has(category);
  if(source==='local-index'||(source==='all'&&(localOnly||(searchBacked&&!searchBackend)))){
   const local=await searchLocalIndex(q,category,signal,onPartial);
   const note=!local.results.length&&!local.warnings.length?[category==='games'?'No offline title matched. Try a platform name (PS2, SNES), a serial, or an exact title.':'No image-backed offline match. Try the original or English title, or search all connected sources.']:[];
   return {...local,warnings:[...local.warnings,...note]};
  }
 }
 if(category==='art'){
  let local:Artwork[]=[];const warnings:string[]=[];
  if(source==='all'||source==='local')try{local=await searchOfflineArt(q,signal,'art');}catch(error){warnings.push(error instanceof Error?error.message:'Offline art index unavailable');}
  if(source==='local'||!searchBackend){const result={results:local,warnings:searchBackend?warnings:[...warnings,...(local.length?[]:['Art search needs the live search backend; the local CC0 collection remains available.'])],unavailable:searchBackend?[]:['art']};onPartial?.(result);return result;}
  try{const params=new URLSearchParams({q,category,country,source});const data=normalizeProviderResult(await json(searchBackend+'/api/search?'+params.toString(),signal));const result={...data,results:dedupeArtwork([...local,...data.results]),warnings:[...warnings,...data.warnings]};onPartial?.(result);return result;}
  catch(error){if(signal?.aborted)throw error;const result={results:local,warnings:[...warnings,error instanceof Error?error.message:'Art sources unavailable'],unavailable:['art']};onPartial?.(result);return result;}
 }
 if(category==='videos'&&!searchBackend)return youtubeThumbnails(q,signal);
 if(!APPLE_SEARCH_CATEGORIES.has(category as AppleCategory)){
  if(category==='anime'||category==='manga'){
   const runPublicFallback=async()=>{
    const live=await searchPublicAnimeManga(q,category,source,signal,onPartial);
    const merged=source==='all'?await withOfflineMatches(live,q,category,source,signal):live;
    onPartial?.(merged);
    return merged;
   };
   if(!searchBackend)return runPublicFallback();
   const params=new URLSearchParams({q,category,country,source});
   try{
    const backendResult=normalizeProviderResult(await json(searchBackend+'/api/search?'+params.toString(),signal));
    if(backendResult.results.length&&backendResult.warnings.length===0)return {...backendResult,results:dedupeArtwork(backendResult.results)};
    const fallback=await runPublicFallback();
    const result={...fallback,results:dedupeArtwork([...backendResult.results,...fallback.results]),warnings:uniqueStrings([...backendResult.warnings,...fallback.warnings])};
    onPartial?.(result);return result;
   }catch(error){
    if(signal?.aborted)throw error;
    const fallback=await runPublicFallback();
    const result={...fallback,warnings:uniqueStrings([...fallback.warnings,error instanceof Error?`RUPA search backend: ${error.message}`:'RUPA search backend unavailable'])};
    onPartial?.(result);return result;
   }
  }
  if(category==='games'&&import.meta.env?.DEV&&['vitahex','all','retro'].includes(source)){
   try{
    const local=await searchLocalVita(q,signal);
    if(source==='vitahex'||!searchBackend)return {...local,warnings:[...local.warnings,...(searchBackend?[]:['Searching the local PS Vita mirror only; connect the live search backend for other game sources.'])],unavailable:local.results.length?local.unavailable:category==='games'?['games']:local.unavailable};
   }catch(error){if(source==='vitahex'||!searchBackend)return {results:[],warnings:[error instanceof Error?error.message:'Local PS Vita mirror is unavailable.'],unavailable:['games']};}
  }
  if(!searchBackend)return {results:[],warnings:['This collection needs the live search backend. The offline art collection is available without it.'],unavailable:[category]};
  const local=category==='games'&&source==='all'?await searchLocalIndex(q,category,signal):null;
  const params=new URLSearchParams({q,category,country,source});
  if(category==='games'&&gameAssetFilter)params.set('asset',gameAssetFilter);
  try{
   const data=normalizeProviderResult(await json(searchBackend+'/api/search?'+params.toString(),signal));
   return {...data,results:dedupeArtwork([...(local?.results||[]),...localizeVitaImages(data.results)]),warnings:[...(local?.warnings||[]),...data.warnings]};
  }catch(error){
   if(signal?.aborted||!local?.results.length)throw error;
   return {...local,warnings:[...local.warnings,error instanceof Error?error.message:'Search sources unavailable']};
  }
 }
 if(searchBackend){const params=new URLSearchParams({q,category,country,source});const data=normalizeProviderResult(await json(searchBackend+'/api/search?'+params.toString(),signal));return withOfflineMatches({...data,results:dedupeArtwork(data.results)},q,category,source,signal);}
 const warnings:string[]=[],unavailable:string[]=[],results:Artwork[]=[];
 const runners:Record<AppleCategory,()=>Promise<Artwork[]>>={
  music:()=>music(q,country,signal),musicvideos:()=>appleCatalogSearch(q,'musicvideos',country,signal),
  books:()=>appleCatalogSearch(q,'books',country,signal),audiobooks:()=>appleCatalogSearch(q,'audiobooks',country,signal),
  podcasts:()=>podcasts(q,signal,country),podcastepisodes:()=>appleCatalogSearch(q,'podcastepisodes',country,signal),
  apps:()=>appleCatalogSearch(q,'apps',country,signal),appscreenshots:()=>appleCatalogSearch(q,'appscreenshots',country,signal),movies:()=>appleCatalogSearch(q,'movies',country,signal),tv:()=>appleCatalogSearch(q,'tv',country,signal)
 };
 const publish=()=>onPartial?.({results:[...results],warnings:[...warnings],unavailable:[...unavailable]});
 if(source!=='all'&&source!=='apple')return {results:[],warnings:['This source needs the live search backend.'],unavailable:[category]};
 try{results.push(...(await runners[category as AppleCategory]()).slice(0,category==='music'?200:20));}catch(error){if(!signal?.aborted)warnings.push(category+': '+(error instanceof Error?error.message:'unavailable'));}
 publish();return withOfflineMatches({results,warnings:uniqueStrings(warnings),unavailable:uniqueStrings(unavailable)},q,category,source,signal);
}
export async function searchArtwork(q:string,category:Category,signal?:AbortSignal,onPartial?:(result:ProviderResult)=>void,country:AppleStorefront='id',source='all',gameAssetFilter?:string):Promise<ProviderResult> {
 const normalized=q.trim().slice(0,180),key=(searchBackend?'server':'direct')+':'+country+':'+category+':'+source+':'+(gameAssetFilter||'-')+':'+normalized.toLocaleLowerCase();const cached=SEARCH_CACHE.get(key);
 if(cached&&Date.now()-cached.at<SEARCH_CACHE_TTL){onPartial?.(cached.value);return cached.value;}
 const result=await searchArtworkUncached(normalized,category,country,source,signal,onPartial,gameAssetFilter);
 if(!signal?.aborted&&!result.warnings.length){SEARCH_CACHE.set(key,{at:Date.now(),value:result});if(SEARCH_CACHE.size>80)SEARCH_CACHE.delete(SEARCH_CACHE.keys().next().value as string);}
 return result;
}
function validAppleArtistUrl(value:string):boolean {
  try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='music.apple.com'&&/\/artist\/[^/]+\/\d+\/?$/i.test(url.pathname);}catch{return false;}
}
export async function getAppleArtistImage(value:string,signal?:AbortSignal):Promise<string|undefined> {
  if(!backend||!validAppleArtistUrl(value))return undefined;
  const data=await json(`${backend}/api/artist-image?${new URLSearchParams({url:value})}`,signal);
  try{const image=new URL(data.imageUrl);return isAppleImageUrl(image)&&image.pathname.startsWith('/image/thumb/')?image.toString():undefined;}catch{return undefined;}
}
const motionCache=new Map<string,{at:number;value:MotionArtwork|null}>();
const motionRequests=new Map<string,Promise<MotionArtwork|null>>();
function validAppleMotionUrl(value:unknown):value is string {
  if(typeof value!=='string')return false;
  try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='mvod.itunes.apple.com'&&url.pathname.endsWith('.m3u8');}catch{return false;}
}
export async function getAppleMotionArtwork(a:Artwork):Promise<MotionArtwork|null> {
  if(a.category!=='music')return null;
  try{const source=new URL(a.sourceUrl);if(source.protocol!=='https:'||source.hostname!=='music.apple.com'||!source.pathname.includes('/album/'))return null;}catch{return null;}
  const albumUrl=a.sourceUrl;
  const key=albumUrl.split('?')[0];
  const cached=motionCache.get(key);
  if(cached&&Date.now()-cached.at<6*60*60*1000)return cached.value;
  const pending=motionRequests.get(key);if(pending)return pending;
  const request=(async()=>{
    const endpoint=new URL('https://artwork.m8tec.top/api/v1/artwork/url');endpoint.searchParams.set('url',albumUrl);
    const response=await fetch(endpoint,{signal:AbortSignal.timeout(10_000),headers:{Accept:'application/json'}});
    if(response.status===404){motionCache.set(key,{at:Date.now(),value:null});return null;}
    if(!response.ok)throw new Error(`Animated artwork lookup failed (HTTP ${response.status}).`);
    const data=await response.json() as {url?:unknown;url_tall?:unknown};
    if(!validAppleMotionUrl(data.url)){motionCache.set(key,{at:Date.now(),value:null});return null;}
    const result:MotionArtwork={url:data.url,...(validAppleMotionUrl(data.url_tall)?{tallUrl:data.url_tall}:{})};
    motionCache.set(key,{at:Date.now(),value:result});return result;
  })();
  motionRequests.set(key,request);
  try{return await request;}finally{motionRequests.delete(key);}
}
export function downloadLink(a:Artwork) {
 const url=a.downloadUrl||a.imageUrl,name=a.category==='music'?`${a.artist||a.subtitle}-${a.title}`:`${a.title}-${a.kind||'artwork'}`;
 try{const parsed=new URL(url);if(parsed.protocol==='https:'&&parsed.hostname.toLowerCase()==='upload.wikimedia.org'&&!parsed.username&&!parsed.password)return parsed.toString();}catch{}
 const endpoint=backend?`${backend}/api/image`:import.meta.env?.DEV?'/api/image':'';
 return endpoint?`${endpoint}?${new URLSearchParams({url,name})}`:url;
}
