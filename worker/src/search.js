import { additionalGames, deezerAlbums, mangaDexCovers, musicBrainzCaa, vitaHexCovers } from './expanded-sources.js';
const VALID_CATEGORIES = ['all', 'books', 'music', 'musicvideos', 'audiobooks', 'apps', 'appscreenshots', 'art', 'movies', 'tv', 'anime', 'manga', 'webtoons', 'games', 'videos', 'podcasts', 'podcastepisodes'];
const ACTIVE_SEARCH_CATEGORIES = new Set(['books','music','musicvideos','audiobooks','apps','appscreenshots','podcasts','podcastepisodes','movies','tv','art','anime','manga','webtoons','games','videos']);
const SOURCE_NAMES = { books: 'Apple Books / Open Library', music: 'Apple Music / Deezer / MusicBrainz', musicvideos: 'Apple Music videos', audiobooks: 'Apple Books / LibriVox', apps: 'App Store / F-Droid', appscreenshots: 'App Store screenshots', art: 'Offline CC0 / museums / Commons / Openverse', movies: 'Apple TV / Cinemeta', tv: 'Apple TV / Cinemeta / TVmaze', anime: 'Jikan / AniList', manga: 'MangaDex / Jikan', webtoons: 'MangaDex web comics', games: 'PS Vita / retro repositories', videos: 'YouTube thumbnails by link or ID', podcasts: 'Apple Podcasts', podcastepisodes: 'Apple Podcasts episodes' };
const SOURCE_LABELS = { books:{apple:'Apple Books',openlibrary:'Open Library'},music:{apple:'Apple Music',deezer:'Deezer','musicbrainz-caa':'MusicBrainz + Cover Art Archive'},audiobooks:{apple:'Apple Books',librivox:'LibriVox'},movies:{apple:'Apple TV / iTunes',cinemeta:'Cinemeta'},tv:{apple:'Apple TV seasons',cinemeta:'Cinemeta',tvmaze:'TVmaze'},art:{local:'Offline CC0 art',met:'The Met',cleveland:'Cleveland Museum of Art',commons:'Wikimedia Commons',openverse:'Openverse'},apps:{apple:'App Store',fdroid:'F-Droid'},anime:{jikan:'Jikan / MyAnimeList',anilist:'AniList'},manga:{mangadex:'MangaDex',jikan:'Jikan / MyAnimeList',anilist:'AniList'},webtoons:{mangadex:'MangaDex · web comics'},games:{retro:'PS1 / PS2 / Libretro',vitahex:'HexFlow · PS Vita'},videos:{youtube:'YouTube link / ID'} };
const sourceLabel = (category,source) => SOURCE_LABELS[category]?.[source] || SOURCE_NAMES[category] || category;
const SEARCH_CACHE = new Map();
const SEARCH_CACHE_TTL = 60_000;
const hasTransientFailures = warnings => warnings.some(message => !/not configured|are required for|before enabling|requires a configured Worker/i.test(message));

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': status === 200 ? 'public, max-age=60' : 'no-store', 'access-control-allow-origin': '*' },
});

async function fetchJson(url, init = {}) {
  const timeout=AbortSignal.timeout(11000),signal=init.signal?AbortSignal.any([init.signal,timeout]):timeout;
  const res = await fetch(url, { ...init, signal, headers: { 'Accept': 'application/json', ...(init.headers || {}) } });
  if (res.status === 429) throw new Error('API sedang membatasi permintaan. Coba lagi sebentar.');
  if (!res.ok) throw new Error(`Sumber merespons HTTP ${res.status}`);
  return res.json();
}

function str(value, max = 180) { return typeof value === 'string' ? value.slice(0, max).trim() : ''; }
function year(value) { const match = str(value).match(/\b(?:19|20)\d{2}\b/); return match ? match[0] : undefined; }

function appleSizedArtwork(value,size) {
  try {
    const url=new URL(value),host=url.hostname.toLowerCase();
    if(url.protocol!=='https:'||!(host==='mzstatic.com'||host.endsWith('.mzstatic.com')))return '';
    const suffix=/\/\d{2,6}x\d{2,6}(?:bb(?:-\d{1,3})?|-\d{1,3})?\.(jpe?g|png|webp|avif)$/i;
   if(!suffix.test(url.pathname))return '';
   if(!Number.isInteger(size)||size<32||size>10000)return '';
    url.pathname=url.pathname.replace(suffix,`/${size}x${size}bb.$1`);
    return url.toString();
  } catch { return ''; }
}
async function fdroidApps(query,limit,signal){
  const data=await fetchJson(`https://search.f-droid.org/api/search_apps?q=${encodeURIComponent(query)}`,{signal});
  const entries=Array.isArray(data.apps)?data.apps:[];
  return entries.slice(0,limit).flatMap((entry,index)=>{
    const title=str(entry.name,180),image=str(entry.icon,2048),rawUrl=str(entry.url,2048);
    if(!title||!image)return [];
    let sourceUrl='https://search.f-droid.org/';
    try{const candidate=new URL(rawUrl);if(candidate.protocol==='https:'&&(candidate.hostname==='f-droid.org'||candidate.hostname==='www.f-droid.org'))sourceUrl=candidate.toString();}catch{}
    let imageUrl='';
    try{const candidate=new URL(image);if(candidate.protocol==='https:'&&(candidate.hostname==='ftp.fau.de'||candidate.hostname==='f-droid.org'||candidate.hostname.endsWith('.f-droid.org')))imageUrl=candidate.toString();}catch{}
    if(!imageUrl)return [];
    return [{id:`apps:fdroid:${str(entry.packageName,180)||sourceUrl||index}`,category:'apps',title,subtitle:str(entry.summary,240)||'Open-source Android app',previewUrl:imageUrl,imageUrl,downloadUrl:imageUrl,sourceUrl,source:'F-Droid',provider:'F-Droid',kind:'icon',rights:'source-only'}];
  });
}
async function libriVoxAudiobooks(query,limit,signal,recent=false){
  const url=new URL('https://librivox.org/api/feed/audiobooks/');
  url.searchParams.set('format','json');url.searchParams.set('limit',String(Math.min(100,Math.max(24,limit*4))));url.searchParams.set('sort_order','desc');url.searchParams.set('coverart','1');
  if(!recent)url.searchParams.set('title',query);
  const data=await fetchJson(url,{signal}),books=Array.isArray(data.books)?data.books:[];
  return books.flatMap(book=>{
    const title=str(book.title,240),image=str(book.coverart_jpg,2048),thumbnail=str(book.coverart_thumbnail,2048);
    if(!title||!image)return [];
    let imageUrl='';try{const parsed=new URL(image);if(parsed.protocol==='https:'&&(parsed.hostname==='archive.org'||parsed.hostname.endsWith('.archive.org')))imageUrl=parsed.toString();}catch{}
    if(!imageUrl)return [];
    let previewUrl=imageUrl;try{const parsed=new URL(thumbnail);if(parsed.protocol==='https:'&&(parsed.hostname==='archive.org'||parsed.hostname.endsWith('.archive.org')))previewUrl=parsed.toString();}catch{}
    const authors=Array.isArray(book.authors)?book.authors.map(author=>[str(author.first_name,80),str(author.last_name,80)].filter(Boolean).join(' ')).filter(Boolean):[];
    const librivoxUrl=str(book.url_librivox,2048),rss=str(book.url_rss,2048);let sourceUrl='https://librivox.org/';for(const candidateUrl of [librivoxUrl,rss]){try{const parsed=new URL(candidateUrl);if(parsed.protocol==='https:'&&(parsed.hostname==='librivox.org'||parsed.hostname==='www.librivox.org')){sourceUrl=parsed.toString();break;}}catch{}}
    const id=str(book.id,80)||title;
    return [{id:`audiobooks:librivox:${id}`,category:'audiobooks',title,subtitle:authors.join(', ')||'LibriVox volunteer recording',previewUrl,imageUrl,downloadUrl:imageUrl,sourceUrl,source:'LibriVox',provider:'LibriVox',kind:'cover',rights:'source-only'}];
  }).slice(0,limit);
}
function appleMasterArtwork(value) {
  try {
    const url=new URL(value),host=url.hostname.toLowerCase();
    if(url.protocol!=='https:'||!(host==='mzstatic.com'||host.endsWith('.mzstatic.com'))||!url.pathname.startsWith('/image/thumb/'))return '';
    const parts=url.pathname.slice('/image/thumb/'.length).split('/').filter(Boolean),size=/^\d{2,6}x\d{2,6}(?:bb(?:-\d{1,3})?|-\d{1,3})?\.(?:jpe?g|png|webp|avif)$/i,inline=/^(.+)\.\d{2,6}x\d{2,6}(?:bb(?:-\d{1,3})?|-\d{1,3})?\.(jpe?g|png|webp|avif)$/i;
    if(size.test(parts.at(-1)||''))parts.pop();else{const match=(parts.at(-1)||'').match(inline);if(match)parts[parts.length-1]=`${match[1]}.${match[2]}`;}
    if(!parts.length||! /\.(?:jpe?g|png|webp|avif)$/i.test(parts.at(-1)||''))return '';
    return `https://a5.mzstatic.com/us/r1000/0/${parts.join('/')}`;
  } catch { return ''; }
}
function appleArtworkResult(x,category,entity) {
  const raw=str(x.artworkUrl100||x.artworkUrl600||x.artworkUrl512,2048),isMusic=category==='music';
  const preview=appleSizedArtwork(raw,600)||str(x.artworkUrl600||x.artworkUrl512)||raw;
  const image=appleSizedArtwork(raw,1200)||str(x.artworkUrl600||x.artworkUrl512)||preview;
  const hdDownloadUrls=[appleMasterArtwork(raw),appleSizedArtwork(raw,10000),appleSizedArtwork(raw,1200),image,preview].filter((url,index,all)=>url&&all.indexOf(url)===index);
  const isMovie=category==='movies',id=String(isMovie?x.trackId||x.collectionId||'':x.collectionId||x.trackId||x.artistId||'');
  if(!id||!preview)return null;
  const source=({music:'Apple Music',musicvideos:'Apple Music',books:'Apple Books',audiobooks:'Apple Books',podcasts:'Apple Podcasts',apps:'App Store',movies:'Apple TV',tv:'Apple TV'})[category]||'Apple';
  const kind=category==='movies'||category==='tv'?'poster':category==='musicvideos'?'thumbnail':'cover';
  const mediaPreviewUrl=category==='musicvideos'&&/^https:\/\//i.test(String(x.previewUrl||''))?String(x.previewUrl):undefined;
  return {
    id:category+':apple:'+id,category,title:str(isMovie?x.trackName||x.collectionName:x.collectionName||x.trackName||x.artistName)||'Untitled',
    subtitle:str(x.artistName||x.primaryGenreName||entity),artist:isMusic?str(x.artistName):undefined,artistUrl:str(x.artistViewUrl,2048)||undefined,year:year(x.releaseDate),
    previewUrl:preview,imageUrl:image||preview,mediaPreviewUrl,sourceUrl:str(x.collectionViewUrl||x.trackViewUrl||x.artistViewUrl,2048),sdDownloadUrl:preview,downloadUrl:hdDownloadUrls[0],hdDownloadUrls,
    kind,rights:'source-only',source,provider:source,
  };
}
function applePodcastEpisodeResults(rows) {
  const seen=new Set();
  return rows.flatMap(x=>{
    if(x.kind!=='podcast-episode'&&x.wrapperType!=='podcastEpisode')return [];
    const id=String(x.trackId||''),raw=str(x.artworkUrl600||x.artworkUrl100||x.artworkUrl160,2048);
    const preview=appleSizedArtwork(raw,600)||raw,image=appleSizedArtwork(raw,1200)||preview;
    if(!id||!preview||seen.has(id))return [];
    seen.add(id);
    const hdDownloadUrls=[appleMasterArtwork(raw),appleSizedArtwork(raw,10000),image,preview].filter((url,index,all)=>url&&all.indexOf(url)===index);
    return [{id:`podcastepisodes:apple:${id}`,category:'podcastepisodes',title:str(x.trackName)||'Untitled episode',subtitle:str(x.collectionName)||'Apple Podcasts',year:year(x.releaseDate),sourceUrl:str(x.trackViewUrl||x.collectionViewUrl,2048),mediaId:id,previewUrl:preview,imageUrl:image,sdDownloadUrl:preview,downloadUrl:hdDownloadUrls[0],hdDownloadUrls,kind:'cover',rights:'source-only',source:'Apple Podcasts',provider:'Apple Podcasts'}];
  });
}
function normalizeAppleTerm(value) {return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
function appleAppScreenshotResults(rows,limit=24,query='') {
  const seen=new Set(),candidates=[],devices=[['iPhone','screenshotUrls',0],['iPad','ipadScreenshotUrls',1],['Apple TV','appletvScreenshotUrls',3]],normalizedQuery=normalizeAppleTerm(query);
  for(const [order,app] of rows.entries()){
    const appId=String(app.trackId||''),appName=str(app.trackName||app.trackCensoredName)||'App Store app',developer=str(app.artistName)||'App Store',sourceUrl=str(app.trackViewUrl,2048);
    if(!appId||!sourceUrl)continue;
    const appDevices=String(app.kind||'').toLowerCase().includes('mac')?[['Mac','screenshotUrls',2]]:devices;
    for(const [device,key,deviceRank] of appDevices){
      for(const [index,value] of (Array.isArray(app[key])?app[key]:[]).entries()){
        const raw=str(value,2048),preview=appleSizedArtwork(raw,600),image=appleSizedArtwork(raw,1200);
        if(!preview||!image)continue;
        const hdDownloadUrls=[appleMasterArtwork(raw),appleSizedArtwork(raw,10000),image,preview].filter((url,index,all)=>url&&all.indexOf(url)===index);
        const item={id:`appscreenshots:apple:${appId}:${device.toLowerCase().replace(/\s+/g,'-')}:${index+1}`,category:'appscreenshots',title:`${appName} · ${device} ${index+1}`,subtitle:developer,source:'App Store',provider:'App Store',sourceUrl,mediaId:appId,previewUrl:preview,imageUrl:image,sdDownloadUrl:preview,downloadUrl:hdDownloadUrls[0],hdDownloadUrls,kind:'thumbnail',rights:'source-only'};
        if(seen.has(item.id))continue;
        seen.add(item.id);
        candidates.push({item,exact:Number(normalizeAppleTerm(appName)!==normalizedQuery),index,device:deviceRank,order});
      }
    }
  }
  return candidates.sort((a,b)=>a.exact-b.exact||a.index-b.index||a.device-b.device||a.order-b.order).slice(0,limit).map(candidate=>candidate.item);
}

async function mergeSources(sources) {
  const settled=await Promise.allSettled(sources.map(source=>source.search()));
  const results=[],warnings=[];
  settled.forEach((entry,index)=>{
    if(entry.status==='fulfilled')results.push(...entry.value);
    else {results.push(...(entry.reason?.partialResults||[]));warnings.push(`${sources[index].name}: ${entry.reason?.message||'Source unavailable'}`);}
  });
  if(warnings.length){
    const error=new Error(warnings.join(' · '));
    error.partialResults=results;
    error.unavailable=results.length===0&&settled.every(entry=>entry.status==='rejected'&&entry.reason?.unavailable);
    throw error;
  }
  return results;
}
async function appleSearch(query,media,entity,category,limit,country='id') {
  const url=new URL('https://itunes.apple.com/search');
  url.searchParams.set('term',query);url.searchParams.set('media',media);url.searchParams.set('entity',entity);
  url.searchParams.set('limit',String(Math.min(24,limit)));url.searchParams.set('country',country);
  const data=await fetchJson(url);
  if(category==='podcastepisodes')return applePodcastEpisodeResults(data.results||[]).slice(0,limit);
  if(category==='appscreenshots')return appleAppScreenshotResults(data.results||[],limit,query);
  return (data.results||[]).flatMap(x=>{const result=appleArtworkResult(x,category,entity);return result?[result]:[];});
}
async function openLibraryBooks(query, limit) {
  const url = new URL('https://openlibrary.org/search.json');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(Math.min(24, Math.max(10, limit * 2))));
  url.searchParams.set('fields', 'key,title,author_name,first_publish_year,cover_i');
  const data = await fetchJson(url);
  return (data.docs || []).filter(x => Number.isInteger(x.cover_i) && x.cover_i > 0).slice(0, limit).map(x => {
    const id = x.cover_i;
    const work = String(x.key||'').split('/').filter(Boolean).pop()||'';
    return {
      id: 'books:'+work, category: 'books', title: str(x.title) || 'Untitled book', subtitle: str(x.author_name?.[0]) || 'Unknown author',
      year: x.first_publish_year ? String(x.first_publish_year) : undefined,
      previewUrl: 'https://covers.openlibrary.org/b/id/'+id+'-M.jpg',
      imageUrl: 'https://covers.openlibrary.org/b/id/'+id+'-L.jpg?default=false',
      sourceUrl: 'https://openlibrary.org/works/'+encodeURIComponent(work), provider: 'Open Library', rights:'source-only',
    };
  });
}
function normalizeAppleIsbn(value) {
  const isbn=String(value||'').replace(/[\s-]/g,'').toUpperCase();
  if(/^\d{13}$/.test(isbn)){
    const sum=[...isbn.slice(0,12)].reduce((total,digit,index)=>total+Number(digit)*(index%2?3:1),0);
    return (10-sum%10)%10===Number(isbn[12])?isbn:null;
  }
  if(!/^\d{9}[\dX]$/.test(isbn))return null;
  if([...isbn].reduce((total,digit,index)=>total+(digit==='X'?10:Number(digit))*(10-index),0)%11!==0)return null;
  const prefix='978'+isbn.slice(0,9),sum=[...prefix].reduce((total,digit,index)=>total+Number(digit)*(index%2?3:1),0);
  return prefix+String((10-sum%10)%10);
}
async function books(query,limit,country,source='all') {
  const sourceSearches={
    apple:()=>appleBooks(query,limit,country),
    openlibrary:()=>openLibraryBooks(query,limit),
  };
  if(source==='all'&&/^https?:\/\//i.test(query.trim()))return sourceSearches.apple();
  if(source!=='all')return sourceSearches[source]?sourceSearches[source]():[];
  const merged=await mergeSources([
    {name:'Apple Books',search:sourceSearches.apple},
    {name:'Open Library',search:sourceSearches.openlibrary},
  ]);
  return merged;
}
async function appleBooks(query,limit,country) {
  if(/^https?:\/\//i.test(query.trim()))return appleCatalogUrlSearch(query.trim(),'books',limit,country);
  const isbn=normalizeAppleIsbn(query);
  if(isbn){
    const url=new URL('https://itunes.apple.com/lookup');url.searchParams.set('isbn',isbn);url.searchParams.set('country',country);
    const data=await fetchJson(url);
    return (data.results||[]).flatMap(x=>{const result=appleArtworkResult(x,'books','ebook');return result?[result]:[];}).slice(0,limit);
  }
  return appleSearch(query,'ebook','ebook','books',limit,country);
}
function parseAppleMusicUrl(value) {
  try {
    const url=new URL(value);
    if(url.protocol!=='https:'||url.hostname!=='music.apple.com')return null;
    const isArtist=/\/artist\//i.test(url.pathname),isAlbum=/\/album\//i.test(url.pathname);
    const id=url.pathname.match(/\/(\d{4,})(?:\/)?$/)?.[1];
    return id&&(isArtist||isAlbum)?{id,isArtist}:null;
  } catch { return null; }
}
async function appleMusicArtistAlbums(id,country) {
  const url=new URL('https://itunes.apple.com/lookup');url.searchParams.set('id',id);url.searchParams.set('country',country);url.searchParams.set('entity','album');url.searchParams.set('limit','200');
  const data=await fetchJson(url),rows=(data.results||[]).filter(x=>x.collectionId&&x.collectionName);
  const releaseTime=value=>{const time=Date.parse(String(value||''));return Number.isFinite(time)?time:0;};
  rows.sort((a,b)=>releaseTime(b.releaseDate)-releaseTime(a.releaseDate));
  return rows.flatMap(x=>{const result=appleArtworkResult(x,'music','album');return result?[result]:[];});
}
function normalizeMusicSearch(value) {
  return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}
async function appleMusicUrlSearch(query,limit,country) {
  const parsed=parseAppleMusicUrl(query);
  if(!parsed)throw new Error('Paste an Apple Music album or artist URL.');
  if(parsed.isArtist)return appleMusicArtistAlbums(parsed.id,country);
  const url=new URL('https://itunes.apple.com/lookup');url.searchParams.set('id',parsed.id);url.searchParams.set('country',country);
  const data=await fetchJson(url);
  return (data.results||[]).filter(x=>x.collectionId&&x.collectionName).flatMap(x=>{const result=appleArtworkResult(x,'music','album');return result?[result]:[];}).slice(0,limit);
}
async function appleCatalogUrlSearch(query,category,limit,country) {
  const allowed={movies:{hosts:['itunes.apple.com'],path:/\/movie\//i,entity:'movie'},tv:{hosts:['itunes.apple.com'],path:/\/tv-season\//i,entity:'tvSeason'},musicvideos:{hosts:['music.apple.com','itunes.apple.com'],path:/\/music-video\//i,entity:'musicVideo'},books:{hosts:['books.apple.com','itunes.apple.com'],path:/\/book\//i,entity:'ebook'},audiobooks:{hosts:['books.apple.com','itunes.apple.com'],path:/\/audiobook\//i,entity:'audiobook'},podcasts:{hosts:['podcasts.apple.com','itunes.apple.com'],path:/\/podcast\//i,entity:'podcast'},podcastepisodes:{hosts:['podcasts.apple.com','itunes.apple.com'],path:/\/podcast\//i,entity:'podcastEpisode'},apps:{hosts:['apps.apple.com','itunes.apple.com'],path:/\/app\//i,entity:'software'},appscreenshots:{hosts:['apps.apple.com','itunes.apple.com'],path:/\/app\//i,entity:'software'}};
  const config=allowed[category];let url,id;
  if((category==='movies'||category==='tv')&&/^\d{4,}$/.test(query.trim()))id=query.trim();
  else{
    try{url=new URL(query);}catch{throw new Error(`Paste a valid Apple ${category} URL or search by name.`);}
    if(!config||url.protocol!=='https:'||!config.hosts.includes(url.hostname.toLowerCase())||!config.path.test(url.pathname))throw new Error(`Paste a valid Apple ${category} URL or search by name.`);
    id=url.pathname.match(/\/(?:id)?(\d+)\/?$/i)?.[1];
  }
  if(!config||!id)throw new Error(`Paste a valid Apple ${category} URL or search by name.`);
  const lookup=new URL('https://itunes.apple.com/lookup');lookup.searchParams.set('id',id);lookup.searchParams.set('country',country);lookup.searchParams.set('entity',config.entity);lookup.searchParams.set('limit',category==='podcastepisodes'?'200':String(Math.min(24,limit)));
  const data=await fetchJson(lookup);
  if(category==='podcastepisodes'){
    const episodes=applePodcastEpisodeResults(data.results||[]),episodeId=url?.searchParams.get('i');
    return (episodeId?episodes.filter(x=>x.mediaId===episodeId):episodes).slice(0,limit);
  }
  if(category==='appscreenshots')return appleAppScreenshotResults(data.results||[],limit);
  return (data.results||[]).map(x=>appleArtworkResult(x,category,config.entity)).filter(x=>x?.previewUrl);
}
async function appleCatalogSearch(query,category,media,entity,limit,country) {
  if(/^https?:\/\//i.test(query.trim())||(category==='movies'&&/^\d{4,}$/.test(query.trim())))return appleCatalogUrlSearch(query.trim(),category,limit,country);
  if(category==='apps'||category==='appscreenshots')return appleSoftwareSearch(query,category,limit,country);
  return appleSearch(query,media,entity,category,limit,country);
}
async function appleSoftwareSearch(query,category,limit,country) {
  const entities=['software','iPadSoftware','desktopSoftware'];
  const settled=await Promise.allSettled(entities.map(entity=>appleSearch(query,'software',entity,category,limit,country)));
  const fulfilled=settled.filter(entry=>entry.status==='fulfilled');
  if(!fulfilled.length)throw settled.find(entry=>entry.status==='rejected')?.reason||new Error('Apple App Store search failed');
  const rows=fulfilled.flatMap(entry=>entry.value),byId=new Map(rows.map(item=>[item.id,item]));
  if(category==='appscreenshots')return [...byId.values()].sort((a,b)=>Number(normalizeAppleTerm(a.title.split(' · ')[0])!==normalizeAppleTerm(query))-Number(normalizeAppleTerm(b.title.split(' · ')[0])!==normalizeAppleTerm(query))).slice(0,limit);
  return [...byId.values()].sort((a,b)=>Number(normalizeAppleTerm(a.title)!==normalizeAppleTerm(query))-Number(normalizeAppleTerm(b.title)!==normalizeAppleTerm(query))).slice(0,limit);
}
async function music(query,limit,country,source='all') {
  const sourceSearches={
    apple:()=>appleMusicSearch(query,limit,country),
    deezer:()=>deezerAlbums(query,limit),
    'musicbrainz-caa':()=>musicBrainzCaa(query,Math.min(limit,8)),
  };
  if(source==='all'&&/deezer\.com\/(?:[a-z]{2}\/)?album\/\d+/i.test(query))return sourceSearches.deezer();
  if(source==='all'&&parseAppleMusicUrl(query))return sourceSearches.apple();
  if(source==='all'&&/(?:musicbrainz\.org\/release-group\/)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/i.test(query))return sourceSearches['musicbrainz-caa']();
  if(source!=='all')return sourceSearches[source]?sourceSearches[source]():[];
  const merged=await mergeSources([{name:'Apple Music',search:sourceSearches.apple},{name:'Deezer',search:sourceSearches.deezer},{name:'MusicBrainz + Cover Art Archive',search:sourceSearches['musicbrainz-caa']}]);
  return merged;
}
async function appleMusicSearch(query,limit,country) {
  if(/^https?:\/\//i.test(query.trim()))return appleMusicUrlSearch(query.trim(),limit,country);
  const results=await appleSearch(query,'music','album','music',limit,country),term=normalizeMusicSearch(query);
  if(!results.length){
    const songs=await appleSearch(query,'music','song','music',limit,country);
    return [...new Map(songs.map(item=>[item.id,item])).values()];
  }
  if(results.some(item=>normalizeMusicSearch(item.title)===term))return results;
  const artist=results.find(item=>normalizeMusicSearch(item.artist||item.subtitle)===term),artistUrl=artist&&parseAppleMusicUrl(artist.artistUrl||'');
  if(!artistUrl?.isArtist)return results;
  const discography=await appleMusicArtistAlbums(artistUrl.id,country);
  return discography.length?discography:results;
}
async function cinemetaSearch(query,limit,category) {
  const type=category==='movies'?'movie':'series';
  const url=`https://v3-cinemeta.strem.io/catalog/${type}/top/search=${encodeURIComponent(query)}.json`;
  const data=await fetchJson(url),metas=Array.isArray(data.metas)?data.metas:[];
  return metas.slice(0,limit).flatMap(meta=>{
    const title=str(meta.name,240),poster=str(meta.poster,2048),id=str(meta.id,180);
    if(!title||!poster||!id)return [];
    let imageUrl='',sourceUrl='https://www.imdb.com/';
    try{const image=new URL(poster);if(image.protocol==='https:'&&image.hostname==='images.metahub.space')imageUrl=image.toString();}catch{}
    if(!imageUrl)return [];
    if(/^tt\d{7,10}$/.test(id))sourceUrl=`https://www.imdb.com/title/${id}/`;
    const releaseInfo=str(meta.releaseInfo,32),year=releaseInfo.match(/\b(?:19|20)\d{2}\b/)?.[0];
    const genres=Array.isArray(meta.genres)?meta.genres.map(value=>str(value,60)).filter(Boolean).slice(0,3):[];
    return [{id:`${category}:cinemeta:${id}`,category,title,subtitle:genres.join(' · ')||`${category==='movies'?'Film':'Series'} · Cinemeta`,year,previewUrl:imageUrl,imageUrl,downloadUrl:imageUrl,sourceUrl,source:'Cinemeta',provider:'Cinemeta',kind:category==='movies'?'poster':'poster',rights:'source-only',mediaId:id}];
  });
}
async function tvMazeSearchShows(query,limit,signal) {
  const url=new URL('https://api.tvmaze.com/search/shows');url.searchParams.set('q',query);
  const records=await fetchJson(url,{signal});
  return records.slice(0,limit).flatMap(record=>{
    const show=record?.show||{},title=str(show.name,240),image=str(show.image?.original||show.image?.medium,2048),id=str(String(show.id??''),80);
    if(!title||!image||!id)return [];
    let sourceUrl='https://www.tvmaze.com/';try{const parsed=new URL(str(show.url,2048));if(parsed.protocol==='https:'&&parsed.hostname==='www.tvmaze.com')sourceUrl=parsed.toString();}catch{}
    const premiered=str(show.premiered,32),genres=Array.isArray(show.genres)?show.genres.map(value=>str(value,60)).filter(Boolean).slice(0,3):[];
    return [{id:`tv:tvmaze:show:${id}`,category:'tv',title,subtitle:genres.join(' · ')||'TVmaze series',year:premiered.slice(0,4)||undefined,releaseDate:premiered||undefined,previewUrl:str(show.image?.medium,2048)||image,imageUrl:image,downloadUrl:image,sourceUrl,source:'TVmaze',provider:'TVmaze',kind:'poster',rights:'source-only',mediaId:id}];
  });
}
async function moviesOrTv(query,limit,category,country='id',source='all',signal) {
  const apple=()=>category==='movies'
    ?appleCatalogSearch(query,'movies','movie','movie',limit,country)
    :appleCatalogSearch(query,'tv','tvShow','tvSeason',limit,country);
  if(source==='apple')return apple();
  if(source==='cinemeta')return cinemetaSearch(query,limit,category);
  if(source==='tvmaze'&&category==='tv')return tvMazeSearchShows(query,limit,signal);
  const sources=[{name:category==='movies'?'Apple TV / iTunes':'Apple TV seasons',search:apple},{name:'Cinemeta',search:()=>cinemetaSearch(query,limit,category)}];
  if(category==='tv')sources.push({name:'TVmaze',search:()=>tvMazeSearchShows(query,limit,signal)});
  return mergeSources(sources);
}
async function aniList(query,limit,category) {
  const gql=`query ($search:String,$type:MediaType){Page(page:1,perPage:20){media(search:$search,type:$type,isAdult:false){id title{userPreferred english romaji native} coverImage{large extraLarge} format seasonYear startDate{year} siteUrl}}}`;
  const data=await fetchJson('https://graphql.anilist.co',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:gql,variables:{search:query,type:category==='anime'?'ANIME':'MANGA'}})});
  return (data.data?.Page?.media||[]).flatMap(x=>{
    const title=str(x.title?.userPreferred||x.title?.english||x.title?.romaji||x.title?.native),image=str(x.coverImage?.extraLarge||x.coverImage?.large);
    if(!title||!image)return [];
    const releaseYear=Number(x.startDate?.year||x.seasonYear);
    return [{id:`${category}:anilist:${x.id}`,category,title,subtitle:`AniList ${category} catalogue`,year:Number.isInteger(releaseYear)&&releaseYear>0?String(releaseYear):undefined,previewUrl:str(x.coverImage?.large||image),imageUrl:image,sourceUrl:str(x.siteUrl),provider:'AniList',mediaId:String(x.id),rights:'source-only',kind:category==='anime'?'poster':'cover'}];
  }).slice(0,limit);
}
async function animeOrManga(query,limit,category,source='all') {
  if(category==='manga'&&source==='mangadex')return mangaDexCovers(query,limit);
  if(source==='anilist')return aniList(query,limit,category);
  if(source==='jikan')return jikanSearch(query,limit,category);
  const sources=category==='manga'
    ?[{name:'MangaDex',search:()=>mangaDexCovers(query,limit)},{name:'Jikan / MyAnimeList',search:()=>jikanSearch(query,limit,category)},{name:'AniList',search:()=>aniList(query,limit,category)}]
    :[{name:'Jikan / MyAnimeList',search:()=>jikanSearch(query,limit,category)},{name:'AniList',search:()=>aniList(query,limit,category)}];
  return mergeSources(sources);
}
async function jikanSearch(query,limit,category,{fallback=false}={}) {
  try{
    const type=category==='anime'?'anime':'manga',url=new URL(`https://api.jikan.moe/v4/${type}`);
    url.searchParams.set('q',query);url.searchParams.set('limit',String(Math.min(16,limit)));url.searchParams.set('sfw','true');
    const data=await fetchJson(url);
    const results=(data.data||[]).flatMap(x=>{
      const preview=x.images?.jpg?.image_url||x.images?.webp?.image_url,full=x.images?.jpg?.large_image_url||x.images?.webp?.large_image_url||preview;
      if(!preview||!full)return [];
      return [{id:`${category}:jikan:${x.mal_id}`,category,title:str(x.title_english||x.title||x.title_japanese)||'Untitled',subtitle:category==='anime'?str(x.type)||'Anime artwork':'Manga artwork',year:year(x.aired?.from||x.published?.from||''),previewUrl:preview,imageUrl:full,sourceUrl:`https://myanimelist.net/${type}/${x.mal_id}`,provider:'Jikan / MyAnimeList',rights:'source-only',kind:'cover'}];
    }).slice(0,limit);
    if(results.length)return results;
  }catch(error){if(error?.name==='AbortError')throw error;if(fallback)return aniList(query,limit,category);throw error;}
  return fallback?aniList(query,limit,category):[];
}
async function games(query,limit,source='all',signal) {
  const sources={
    vitahex:()=>vitaHexCovers(query,limit,signal),
    retro:()=>additionalGames(query,signal).then(x=>x.results),
  };
  if(source!=='all')return sources[source]?sources[source]():[];
  const merged=await mergeSources([
    {name:'HexFlow PS Vita',search:sources.vitahex},
    {name:'xlenore & Libretro exact matches',search:sources.retro},
  ]);
  return merged;
}
function youtubeVideoId(value){
  const input=value.trim();if(/^[A-Za-z0-9_-]{11}$/.test(input))return input;
  try{
    const url=new URL(input),host=url.hostname.toLowerCase();
    if(!['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be','www.youtu.be','youtube-nocookie.com','www.youtube-nocookie.com'].includes(host))return null;
    const id=host.endsWith('youtu.be')?url.pathname.split('/').filter(Boolean)[0]:url.searchParams.get('v')||url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/i)?.[1];
    return id&&/^[A-Za-z0-9_-]{11}$/.test(id)?id:null;
  }catch{return null;}
}
async function youtubeVideos(query,limit,signal) {
  const videoId=youtubeVideoId(query);
  if(!videoId)throw new Error('Paste a YouTube video URL or 11-character video ID to load its thumbnail.');
  const watchUrl=`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  let metadata={};
  try{metadata=await fetchJson(`https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`,{signal});}catch{}
  const preview=str(metadata.thumbnail_url,2048)||`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  try{const image=new URL(preview);if(image.protocol!=='https:'||image.hostname!=='i.ytimg.com')throw new Error('unsupported host');}catch{throw new Error('YouTube did not return a valid thumbnail URL.');}
  return [{id:`videos:youtube:${videoId}`,category:'videos',title:str(metadata.title)||`YouTube video ${videoId}`,subtitle:str(metadata.author_name)||'YouTube video',previewUrl:preview,imageUrl:preview,sourceUrl:watchUrl,provider:'YouTube thumbnails',kind:'thumbnail',rights:'source-only'}].slice(0,limit);
}
async function podcasts(query,limit,country){
  const data=/^https?:\/\//i.test(query.trim())
    ? await appleCatalogUrlSearch(query.trim(),'podcasts',limit,country)
    : await appleSearch(query,'podcast','podcast','podcasts',limit,country);
  return data.map(x=>({...x,provider:'Apple Podcasts Search'}));
}
async function podcastEpisodes(query,limit,country){
  if(/^https?:\/\//i.test(query.trim()))return appleCatalogUrlSearch(query.trim(),'podcastepisodes',limit,country);
  return appleSearch(query,'podcast','podcastEpisode','podcastepisodes',limit,country);
}
function plainMetadata(value,max=240){return str(value,max).replace(/<br\s*\/?\s*>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&#39;|&#039;/gi,"'").replace(/\s+/g,' ').trim();}
function isAllowedImageUrl(value,hosts){try{const url=new URL(value);return url.protocol==='https:'&&hosts.includes(url.hostname.toLowerCase())?url.toString():'';}catch{return '';}}
function wikimediaImageUrl(value){try{const url=new URL(value);if(url.protocol!=='https:'||!['thumb.wikimedia.org','upload.wikimedia.org'].includes(url.hostname.toLowerCase()))return '';if(url.hostname.toLowerCase()==='thumb.wikimedia.org')url.hostname='upload.wikimedia.org';return url.toString();}catch{return '';}}
async function metArtworks(query,limit,signal){
  const url=new URL('https://collectionapi.metmuseum.org/public/collection/v1.1/search');
  url.searchParams.set('q',query);url.searchParams.set('hasImages','true');url.searchParams.set('isPublicDomain','true');
  const detailLimit=Math.min(32,Math.max(12,Math.ceil(limit*1.3)));url.searchParams.set('limit',String(detailLimit));
  const found=await fetchJson(url,{signal}),ids=Array.isArray(found.objectIDs)?found.objectIDs.slice(0,detailLimit):[];
  const items=await Promise.allSettled(ids.map(id=>fetchJson(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`,{signal})));
  return items.flatMap(item=>{
    if(item.status!=='fulfilled')return [];
    const x=item.value;if(x.isPublicDomain!==true||!x.primaryImage)return [];
    const id=String(x.objectID),image=str(x.primaryImage),preview=str(x.primaryImageSmall||image);
    return [{id:`art:met:${id}`,category:'art',title:str(x.title)||'Untitled artwork',subtitle:str(x.artistDisplayName||x.medium)||'Open collection',artist:str(x.artistDisplayName),year:str(x.objectDate),
      previewUrl:preview,imageUrl:image,sdDownloadUrl:preview,downloadUrl:image,hdDownloadUrls:[image,preview].filter((url,index,all)=>url&&all.indexOf(url)===index),sourceUrl:str(x.objectURL)||`https://www.metmuseum.org/art/collection/search/${id}`,
      provider:'The Metropolitan Museum of Art',source:'The Met',kind:'artwork',rights:'open-license',licenseLabel:'Public domain',licenseUrl:'https://www.metmuseum.org/about-the-met/policies-and-documents/open-access'}];
  });
}
async function clevelandArtworks(query,limit,signal){
  const url=new URL('https://openaccess-api.clevelandart.org/api/artworks/');
  url.searchParams.set('q',query);url.searchParams.set('cc0','');url.searchParams.set('has_image','1');url.searchParams.set('limit',String(Math.min(8,limit)));
  url.searchParams.set('fields','id,title,creators,creation_date,technique,url,images,share_license_status');
  const data=await fetchJson(url,{signal});
  return (data.data||[]).filter(x=>x.share_license_status==='CC0'&&x.images?.web?.url).map(x=>{
    const id=String(x.id),creator=Array.isArray(x.creators)?x.creators.map(c=>str(c.description||c.name)).filter(Boolean).join(', '):'';
    const preview=str(x.images.web.url),full=str(x.images.full?.url||x.images.print?.url||preview),print=str(x.images.print?.url||x.images.full?.url||preview);
    return {id:`art:cleveland:${id}`,category:'art',title:str(x.title)||'Untitled artwork',subtitle:creator||str(x.technique)||'Open collection',artist:creator,year:str(x.creation_date),
      previewUrl:preview,imageUrl:print||full,sdDownloadUrl:preview,downloadUrl:print,hdDownloadUrls:[print,full,preview].filter((url,index,all)=>url&&all.indexOf(url)===index),sourceUrl:str(x.url)||`https://www.clevelandart.org/art/${id}`,provider:'Cleveland Museum of Art',source:'Cleveland Museum of Art',kind:'artwork',rights:'open-license',licenseLabel:'CC0',licenseUrl:'https://www.clevelandart.org/open-access'};
  });
}
async function commonsArtworks(query,limit,signal){
  const url=new URL('https://commons.wikimedia.org/w/api.php');
  for(const [key,value] of Object.entries({action:'query',generator:'search',gsrsearch:query,gsrnamespace:'6',gsrlimit:String(Math.min(12,limit)),prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'500',iiextmetadatafilter:'LicenseShortName|LicenseUrl|Artist|Credit',format:'json',origin:'*'}))url.searchParams.set(key,value);
  const data=await fetchJson(url,{signal,headers:{'User-Agent':'RUPA Artwork Index/0.3 (https://github.com/bobbyfch/rupa)'}});
  const pages=Object.values(data.query?.pages||{}).sort((a,b)=>(a.index||0)-(b.index||0));
  return pages.flatMap(page=>{
    const info=page.imageinfo?.[0],meta=info?.extmetadata||{},license=plainMetadata(meta.LicenseShortName?.value,80);
    if(!info||!license||!(/\bCC0\b|public domain|\bCC BY(?:-SA)?(?:\s|$)/i.test(license)))return [];
    const preview=wikimediaImageUrl(info.thumburl||info.url),image=isAllowedImageUrl(info.url,['upload.wikimedia.org']);
    if(!preview||!image)return [];
    const artist=plainMetadata(meta.Artist?.value||meta.Credit?.value,180),licenseValue=str(meta.LicenseUrl?.value,500),licenseHref=licenseValue.match(/href=["']([^"']+)["']/i)?.[1]||licenseValue;
    const licenseUrl=/^https:\/\//i.test(licenseHref)?licenseHref:undefined;
    const title=plainMetadata(page.title.replace(/^File:/,'').replace(/\.[a-z0-9]{2,5}$/i,''),180)||'Untitled image';
    return [{id:`art:commons:${page.pageid}`,category:'art',title,subtitle:artist||license,artist:artist||undefined,previewUrl:preview,imageUrl:image,downloadUrl:image,hdDownloadUrls:[image,preview],sourceUrl:isAllowedImageUrl(info.descriptionurl,['commons.wikimedia.org'])||`https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g,'_'))}`,provider:'Wikimedia Commons',source:'Wikimedia Commons',kind:'artwork',rights:'open-license',licenseLabel:license,licenseUrl,attribution:[artist,license].filter(Boolean).join(' · ')}];
  });
}
async function openverseArtworks(query,limit,signal){
  const url=new URL('https://api.openverse.org/v1/images/');
  url.searchParams.set('q',query);url.searchParams.set('page_size',String(Math.min(12,limit)));url.searchParams.set('license','cc0,pdm,by,by-sa');url.searchParams.set('mature','false');
  const data=await fetchJson(url,{signal,headers:{'User-Agent':'RUPA Artwork Index/0.3 (https://github.com/bobbyfch/rupa)'}});
  return (data.results||[]).flatMap(x=>{
    if(!['cc0','pdm','by','by-sa'].includes(String(x.license||'').toLowerCase()))return [];
    const image=isAllowedImageUrl(x.thumbnail||x.url,['api.openverse.org','images.openverse.org','upload.wikimedia.org']);
    if(!image)return [];
    const attribution=plainMetadata(x.attribution||[x.creator,x.license].filter(Boolean).join(' · '),300);
    const licenseLabel={cc0:'CC0',pdm:'Public Domain Mark',by:'CC BY',"by-sa":'CC BY-SA'}[String(x.license||'').toLowerCase()]||'Open license';
    return [{id:`art:openverse:${String(x.id)}`,category:'art',title:plainMetadata(x.title,180)||'Untitled image',subtitle:plainMetadata(x.creator,180)||'Openly licensed image',artist:plainMetadata(x.creator,180)||undefined,
      previewUrl:image,imageUrl:image,downloadUrl:image,sourceUrl:str(x.foreign_landing_url,2048),provider:'Openverse',source:'Openverse',kind:'artwork',rights:'open-license',licenseLabel,licenseUrl:str(x.license_url,1000)||undefined,attribution}];
  });
}
async function openArtworks(query,limit,source='all',signal){
  const providers=[
    {id:'met',name:'The Met',search:()=>metArtworks(query,limit,signal)},
    {id:'cleveland',name:'Cleveland Museum of Art',search:()=>clevelandArtworks(query,limit,signal)},
    {id:'commons',name:'Wikimedia Commons',search:()=>commonsArtworks(query,limit,signal)},
    {id:'openverse',name:'Openverse',search:()=>openverseArtworks(query,limit,signal)},
  ];
  const selected=source==='all'?providers:providers.filter(provider=>provider.id===source);
  const settled=await Promise.allSettled(selected.map(provider=>provider.search())),groups=[],warnings=[];
  for(const [index,result] of settled.entries()){
    if(result.status==='fulfilled')groups.push(result.value);
    else warnings.push(`${selected[index].name}: ${result.reason?.message||'Unavailable'}`);
  }
  const items=[];
  for(let row=0;items.length<limit;row++){
    let added=false;
    for(const group of groups){if(group[row]){items.push(group[row]);added=true;if(items.length===limit)break;}}
    if(!added)break;
  }
  if(warnings.length){const error=new Error(warnings.join(' · '));error.partialResults=items;error.unavailable=items.length===0;throw error;}
  return {items,warnings};
}
function streamedSearch({categories,selected,fetchCategory,cacheKey,query,category,source}){
  let cancelled=false;
  const body=new ReadableStream({
    start(controller){
      const encoder=new TextEncoder(),outcomes=[];
      const emit=event=>{if(!cancelled)controller.enqueue(encoder.encode(JSON.stringify(event)+'\n'));};
      const runKind=async kind=>{
        let entry;
        try{entry={kind,results:await fetchCategory(kind),warnings:[],unavailable:[]};}
        catch(error){entry={kind,results:error?.partialResults||[],warnings:[`${sourceLabel(kind,source)}: ${error?.message||'Tidak bisa diakses saat ini.'}`],unavailable:error?.unavailable?[kind]:[]};}
        entry.results=entry.results.map(item=>({...item,source:item.source||item.provider||SOURCE_NAMES[kind]||kind}));
        outcomes.push(entry);
        emit({type:'source',category:kind,results:entry.results,warnings:entry.warnings,unavailable:entry.unavailable});
      };
      void (async()=>{
        const tasks=selected.map(runKind);
        if(categories.includes('manga'))tasks.push((async()=>{if(categories.includes('anime'))await new Promise(resolve=>setTimeout(resolve,600));await runKind('manga');})());
        await Promise.all(tasks);
        const payload={results:outcomes.flatMap(x=>x.results),warnings:outcomes.flatMap(x=>x.warnings),unavailable:outcomes.flatMap(x=>x.unavailable),query,category};
        if(!hasTransientFailures(payload.warnings))SEARCH_CACHE.set(cacheKey,{at:Date.now(),value:payload});
        emit({type:'done'});
        if(!cancelled)controller.close();
      })().catch(error=>{emit({type:'error',error:error?.message||'Search stream failed'});if(!cancelled)controller.close();});
    },
    cancel(){cancelled=true;}
  });
  return new Response(body,{headers:{'content-type':'application/x-ndjson; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
}

export async function onRequestGet({ request, env }) {
  const requestUrl = new URL(request.url);
  const query = str(requestUrl.searchParams.get('q') || '', 90);
  const category = requestUrl.searchParams.get('category') || 'all';
  const source = str(requestUrl.searchParams.get('source') || 'all',40).toLowerCase();
  if (!VALID_CATEGORIES.includes(category)) return json({ error: 'Kategori tidak dikenal.' }, 400);
  const chartMode=str(requestUrl.searchParams.get('mode')||'',20).toLowerCase();
  const recentLibriVox=category==='audiobooks'&&source==='librivox'&&chartMode==='recent';
  if(query.length<2&&!recentLibriVox)return json({ error: 'Minimal 2 karakter untuk mencari artwork.' }, 400);
  if(!ACTIVE_SEARCH_CATEGORIES.has(category))return json({error:category==='all'?'Pilih satu kategori sebelum mencari.':'Kategori ini belum dibuka.'},409);
  const sourceOptions={
    music:['all','apple','deezer','musicbrainz-caa'],books:['all','apple','openlibrary'],
    movies:['all','apple','cinemeta'],tv:['all','apple','cinemeta','tvmaze'],art:['all','met','cleveland','commons','openverse'],
    anime:['all','jikan','anilist'],manga:['all','mangadex','jikan','anilist'],webtoons:['all','mangadex'],games:['all','retro','vitahex'],videos:['all','youtube'],
    musicvideos:['all','apple'],audiobooks:['all','apple','librivox'],apps:['all','apple','fdroid'],appscreenshots:['all','apple'],podcasts:['all','apple'],podcastepisodes:['all','apple'],
  };
  if(!sourceOptions[category]?.includes(source))return json({error:'Sumber tidak tersedia untuk kategori ini.'},400);
  const requestedCountry=(requestUrl.searchParams.get('country')||'id').toLowerCase();
  const country=['id','us','gb','au','ca','jp','de','fr'].includes(requestedCountry)?requestedCountry:'id';
  const cacheKey=`${country}:${category}:${source}:${chartMode}:${query.toLocaleLowerCase()}`;
  const cached=SEARCH_CACHE.get(cacheKey);
  if(cached&&Date.now()-cached.at<SEARCH_CACHE_TTL)return json(cached.value);
  if(SEARCH_CACHE.size>160)for(const [key,value] of SEARCH_CACHE)if(Date.now()-value.at>SEARCH_CACHE_TTL)SEARCH_CACHE.delete(key);

  const categories = [category];
  // Two Jikan requests would exceed its low public rate limits. Search them sequentially in "All".
  const selected = categories.filter(x => x !== 'manga');
  const fetchCategory = (kind) => {
    const limit = 24;
    switch (kind) {
      case 'books': return books(query, limit, country,source);
      case 'music': return music(query, limit, country,source);
      case 'musicvideos': return appleCatalogSearch(query,'musicvideos','musicVideo','musicVideo',limit,country);
      case 'audiobooks': return source==='librivox'?libriVoxAudiobooks(query,limit,request.signal,recentLibriVox):appleCatalogSearch(query,'audiobooks','audiobook','audiobook',limit,country);
      case 'apps': return source==='fdroid'?fdroidApps(query,limit,request.signal):appleCatalogSearch(query,'apps','software','software',limit,country);
      case 'appscreenshots': return appleCatalogSearch(query,'appscreenshots','software','software',limit,country);
      case 'podcasts': return podcasts(query, limit, country);
      case 'podcastepisodes': return podcastEpisodes(query,limit,country);
      case 'movies': case 'tv': return moviesOrTv(query,limit,kind,country,source,request.signal);
      case 'art': return openArtworks(query,limit,source,request.signal).then(data=>data.items);
      case 'anime': case 'manga': return animeOrManga(query,limit,kind,source);
      case 'webtoons': return mangaDexCovers(query,limit,request.signal,'webtoons');
      case 'games': return games(query,limit,source,request.signal);
      case 'videos': return youtubeVideos(query,limit,request.signal);
      default: return Promise.resolve([]);
    }
  };
  if(requestUrl.searchParams.get('stream')==='1')return streamedSearch({categories,selected,fetchCategory,cacheKey,query,category,source});
  const settled = await Promise.allSettled(selected.map(fetchCategory));
  const outcome = selected.map((kind, i) => ({ kind, result: settled[i] }));
  if (categories.includes('manga')) {
    // If anime was requested, separate Jikan calls with a short delay.
    if (categories.includes('anime')) await new Promise(resolve => setTimeout(resolve, 600));
    const result = await Promise.allSettled([fetchCategory('manga')]);
    outcome.push({ kind: 'manga', result: result[0] });
  }
  const results = [];
  const warnings = [];
  const unavailable = [];
  for (const { kind, result } of outcome) {
    if (result.status === 'fulfilled') results.push(...result.value);
    else {
      if(result.reason?.partialResults)results.push(...result.reason.partialResults);
      warnings.push(`${sourceLabel(kind,source)}: ${result.reason?.message || 'Tidak bisa diakses saat ini.'}`);
      if (result.reason?.unavailable) unavailable.push(kind);
    }
  }
  // Return clear errors only if there was an actual failure and nothing else loaded.
  const normalizedResults=results.map(item=>({...item,source:item.source||item.provider||SOURCE_NAMES[item.category]||item.category}));
  const payload={ results:normalizedResults, warnings, unavailable, query, category };
  if(!hasTransientFailures(payload.warnings))SEARCH_CACHE.set(cacheKey,{at:Date.now(),value:payload});
  return json(payload);
}
