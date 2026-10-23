import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent, type RefObject } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Aperture, ArrowRight, ArrowUpRight, BookOpen, Check, ChevronDown, Clapperboard, Columns2, Download, Expand, FolderHeart, Gamepad2, Grid2X2, Headphones, Heart, Home, Image, Info, LoaderCircle, Moon, Music2, Pause, Play, Plus, Podcast, QrCode, RefreshCw, Search, Share2, Sun, Tv, Upload, UserRound, Video, X, ZoomIn, type LucideIcon } from 'lucide-react';
import { Button } from './components/ui/button';
import { Dialog } from './components/ui/dialog';
import { AppleMotionVideo } from './components/AppleMotionVideo';
import { db, createFavoriteFolder, createProfile, deleteFavoriteFolder, getActiveId, getSnapshot, importSnapshot, moveFavoriteToFolder, renameFavoriteFolder, setActiveId, toggleFavorite, updatePreferences } from './lib/db';
import { CATEGORIES, DEFAULT_PREFERENCES, type AppleCategory, type AppleStorefront, type Artwork, type Category, type FavoriteFolder, type LocalProfile, type MotionLookupState, type Preferences } from './lib/types';
import { downloadLink, getAppleArtistImage, getAppleMotionArtwork, hasBackend, searchArtwork, searchMusicArtists } from './lib/providers';
import { createSync, joinSync, syncProfile } from './lib/sync';
import { exportEncrypted, importEncrypted } from './lib/crypto';
import { safeFileName } from './lib/utils';
import { getSourceOptions, isSearchableCollection } from './lib/sourceCatalog';
import { LocaleProvider, translate, useLocale, type Locale } from './lib/i18n';
import { AppleTrendTool } from './components/AppleTrendTool';
import { GhibliCollection } from './components/GhibliCollection';
import { ShinkaiCollection } from './components/ShinkaiCollection';
import { WallpaperEditor } from './components/WallpaperEditor';
import { APPLE_STOREFRONTS } from './lib/appleStorefronts';
import { AppleVideoPreview } from './components/AppleVideoPreview';
import { DownloadExportPanel } from './components/DownloadExportPanel';
import { MangaDetailPage } from './components/MangaDetailPage';
import { MovingArtworkStrip } from './components/MovingArtworkStrip';
import { convertImageBlob, readImageResponse } from './lib/musicDownloads';
import { createZip } from './lib/zip';

type Page = 'discover'|'tools'|'trends'|'search'|'archive'|'ghibli'|'shinkai'|'games';
type MusicMode = 'albums'|'artists';
type SyncUiState={profileId:string;status:'idle'|'syncing'|'success'|'error';lastSuccess?:number;error?:string};
type BrowseCategory = Exclude<AppleCategory, 'appscreenshots'> | 'games' | 'anime' | 'manga';
const ImageLightbox = lazy(()=>import('./components/ImageLightbox'));
const GameCoverFinder = lazy(()=>import('./components/GameCoverFinder').then(module=>({default:module.GameCoverFinder})));
function BrandMark({size=34,className=''}:{size?:number;className?:string}){return <img className={`brand-mark ${className}`.trim()} src={`${import.meta.env.BASE_URL}favicon.svg`} width={size} height={size} alt="" aria-hidden="true"/>;}
const COLLECTION_LABELS:Record<Exclude<Category,'all'>,string>={
  books:'Books',music:'Music',musicvideos:'Music videos',audiobooks:'Audiobooks',apps:'Apps',appscreenshots:'App screenshots',art:'Art & archives',movies:'Film',tv:'TV / Series',videos:'YouTube',anime:'Anime',manga:'Manga',games:'Games',podcasts:'Podcasts',podcastepisodes:'Podcast episodes',webtoons:'Webtoons',comics:'Comics',boardgames:'Board games',magazines:'Magazines',physicalmedia:'Blu-ray & physical',ghibli:'Studio Ghibli stills'
};
const APPLE_COLLECTIONS:Exclude<AppleCategory,'appscreenshots'>[]=['music','musicvideos','books','audiobooks','podcasts','podcastepisodes','apps','movies','tv'];
function isAppleCollection(category:Category):category is AppleCategory{return APPLE_COLLECTIONS.includes(category as Exclude<AppleCategory,'appscreenshots'>)||category==='appscreenshots';}
function isAppleArtwork(item:Artwork){const label=item.provider||item.source;return isAppleCollection(item.category)&&(label==='App Store'||label.startsWith('Apple'));}
function isCurrentProductArtwork(item:Artwork){return item.category==='ghibli'||item.category==='games'||isAppleArtwork(item);}
function isAppleMusicArtwork(item:Artwork){return item.category==='music'&&item.kind!=='artist-image'&&(item.provider||item.source)==='Apple Music';}
function isStorefront(value:string|null):value is AppleStorefront{return APPLE_STOREFRONTS.some(store=>store.id===value);}
function isKnownCategory(value:string|null):value is Category{return value==='appscreenshots'||Boolean(value&&CATEGORIES.some(item=>item.id!=='all'&&item.id===value));}
function getInitialRoute(){
  const params=new URLSearchParams(window.location.search);
  const view=params.get('view');
  const query=(params.get('q')||'').slice(0,180);
  const legacyType=params.get('type');
  const candidate=params.get('category');
  const chosenCategory:Category=isKnownCategory(candidate)?candidate:isKnownCategory(legacyType)?legacyType:'all';
  let page:Page=view==='sources'?'games':view==='tools'||view==='trends'||view==='search'||view==='archive'||view==='ghibli'||view==='shinkai'||view==='games'?view:'discover';
  // Old Work Index links now resolve to the selected category's own search route.
  if(view==='catalog')page=chosenCategory!=='all'&&query.trim().length>=2?'search':'tools';
  if(page==='search'&&chosenCategory==='games')page='games';
  const category:Category=page==='trends'&&chosenCategory==='all'?'music':chosenCategory;
  const musicMode:MusicMode=params.get('asset')==='artists'?'artists':'albums';
  const country=isStorefront(params.get('country'))?params.get('country') as AppleStorefront:'id';
  const requestedSource=params.get('source')||'all';
  const source=getSourceOptions(category).some(option=>option.id===requestedSource)?requestedSource:'all';
  const mangaId=params.get('manga')||'',mangaTitle=(params.get('manga_title')||'').slice(0,180),mangaProvider=params.get('manga_provider')||'MangaDex';
  const mangaSourceUrl=params.get('manga_source')||'';
  const safeMangaProvider=['MangaDex','AniList','Jikan / MyAnimeList'].includes(mangaProvider)?mangaProvider:'MangaDex';
  const safeMangaUrl=/^https:\/\/(?:mangadex\.org|anilist\.co|myanimelist\.net)(?:\/|$)/i.test(mangaSourceUrl)?mangaSourceUrl:'https://mangadex.org/';
  const mangaSelection:Artwork|null=category==='manga'&&page==='search'&&mangaId.startsWith('manga:')&&mangaTitle?{id:mangaId,category:'manga',title:mangaTitle,subtitle:'Manga series',source:safeMangaProvider,provider:safeMangaProvider,sourceUrl:safeMangaUrl,imageUrl:'',previewUrl:'',kind:'cover'}:null;
  return {page,query,category,musicMode,country,source,mangaSelection};
}
function triggerDownload(text:string,filename:string,mime='application/json') {const url=URL.createObjectURL(new Blob([text],{type:mime}));const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function artworkCaption(item:Artwork):string {const subtitle=item.subtitle.trim(),year=item.year?.trim();if(!year||subtitle.split(' · ').some(part=>part.trim().toLocaleLowerCase()===year.toLocaleLowerCase()))return subtitle||year||'';return subtitle?`${subtitle} · ${year}`:year;}
const CATEGORY_TILES:{id:BrowseCategory;label:string;description:string;eyebrow:string;icon:LucideIcon}[]=[
  {id:'games',label:'Games',description:'Search titles, editions, systems, and visual assets.',eyebrow:'GAME INDEX / ARTWORK',icon:Gamepad2},
  {id:'music',label:'Music',description:'Album covers, artist images, and release artwork.',eyebrow:'ALBUMS / ARTISTS',icon:Music2},
  {id:'books',label:'Books',description:'Book editions, covers, and author searches.',eyebrow:'BOOK COVERS',icon:BookOpen},
  {id:'movies',label:'Film',description:'Film posters and catalog artwork.',eyebrow:'FILM / POSTERS',icon:Clapperboard},
  {id:'tv',label:'TV',description:'Series, seasons, and episode artwork.',eyebrow:'SERIES / SEASONS',icon:Tv},
  {id:'anime',label:'Anime',description:'Trending series, posters, and source-linked metadata.',eyebrow:'ANILIST / ANIME',icon:Clapperboard},
  {id:'manga',label:'Manga',description:'Ranked manga covers and title information.',eyebrow:'ANILIST / MANGA',icon:BookOpen},
  {id:'apps',label:'Apps',description:'App icons and store artwork.',eyebrow:'APP ICONS',icon:Grid2X2},
  {id:'musicvideos',label:'Music videos',description:'Video artwork and official stills.',eyebrow:'MUSIC / VIDEO',icon:Video},
  {id:'audiobooks',label:'Audiobooks',description:'Narrated editions, covers, and author credits.',eyebrow:'AUDIO / BOOKS',icon:Headphones},
  {id:'podcasts',label:'Podcasts',description:'Show artwork and creator catalogs.',eyebrow:'PODCAST / SHOWS',icon:Podcast},
];
const CATEGORY_TONES:[string,string,string][]=[
  ['#d9f15b','#b6e96d','#f7fba8'],['#91c2ff','#78b5f4','#d7efff'],['#ffc3a6','#ffad9d','#fff0d5'],
  ['#ff99bb','#f783a8','#ffe2f0'],['#b7a9ff','#a291f2','#e8ddff'],['#75e1cd','#5dcfbd','#d7fff2'],
  ['#ffad63','#f99558','#ffedc5'],['#87d3ec','#65c4e1','#dcf8ff'],['#ffa6dd','#ed8ccb','#ffe3f4'],
  ['#ffdc63','#f5c64b','#fff6c6'],['#ff8f7c','#ef766f','#ffe4d6'],
];
function shuffledCategoryTones(){
  const tones=[...CATEGORY_TONES];
  for(let index=tones.length-1;index>0;index--){const swap=Math.floor(Math.random()*(index+1));[tones[index],tones[swap]]=[tones[swap],tones[index]];}
  return tones;
}
type BrowseSort='featured'|'name'|'pinned';
function BrowseGridControls({sort,onSort,pinnedOnly,onTogglePinnedOnly}:{sort:BrowseSort;onSort:(value:BrowseSort)=>void;pinnedOnly:boolean;onTogglePinnedOnly:()=>void}){
  return <div className="browse-grid-controls"><label><span>Sort by</span><select value={sort} onChange={event=>onSort(event.target.value as BrowseSort)}><option value="featured">Featured</option><option value="name">Name · A–Z</option><option value="pinned">Pinned first</option></select></label><button type="button" className={pinnedOnly?'active':''} onClick={onTogglePinnedOnly}><Heart size={14} fill={pinnedOnly?'currentColor':'none'}/>{pinnedOnly?'Pinned only':'Pinned favorites'}</button></div>;
}
function CategoryGrid({onSelect,compact=false,preferences,onPreferencesChange}:{onSelect:(category:BrowseCategory)=>void;compact?:boolean;preferences:Preferences;onPreferencesChange:(value:Partial<Preferences>)=>void}){
  const [tones]=useState(shuffledCategoryTones);
  const [pinnedOnly,setPinnedOnly]=useState(false),pinned=new Set(preferences.pinnedCategories||[]);
  const sort=preferences.categorySort||'featured';
  const categories=[...CATEGORY_TILES].filter(item=>!pinnedOnly||pinned.has(item.id)).sort((a,b)=>sort==='name'?a.label.localeCompare(b.label):sort==='pinned'?(Number(pinned.has(b.id))-Number(pinned.has(a.id))||CATEGORY_TILES.findIndex(item=>item.id===a.id)-CATEGORY_TILES.findIndex(item=>item.id===b.id)):0);
  const togglePin=(id:BrowseCategory)=>onPreferencesChange({pinnedCategories:pinned.has(id)?pinnedCategories.filter(value=>value!==id):[...pinnedCategories,id]});
  const pinnedCategories=preferences.pinnedCategories||[];
  return <div className={`category-card-grid${compact?' is-compact':''}`}>
    <BrowseGridControls sort={sort} onSort={value=>onPreferencesChange({categorySort:value})} pinnedOnly={pinnedOnly} onTogglePinnedOnly={()=>setPinnedOnly(value=>!value)}/>
    {categories.map((item,index)=>{const Icon=item.icon;const [tone,mid,glow]=tones[index%tones.length];const style={'--category-tone':tone,'--category-tone-mid':mid,'--category-glow':glow,'--category-delay':`${index*-0.61}s`} as CSSProperties;return <div className="category-card-shell" key={item.id}><button type="button" className={`category-card category-card-${item.id}`} style={style} onClick={()=>onSelect(item.id)} aria-label={`Browse ${item.label}`}>
      <span className="category-card-top"><span>{String(index+1).padStart(2,'0')}</span><ArrowUpRight size={17}/></span>
      <span className="category-card-art" aria-hidden="true"><span className="category-card-orbit"/><Icon size={31} strokeWidth={1.6}/></span>
      <span className="category-card-copy"><small>{item.eyebrow}</small><strong>{item.label}</strong><span>{item.description}</span></span>
    </button><button type="button" className={`category-card-pin${pinned.has(item.id)?' is-pinned':''}`} onClick={()=>togglePin(item.id)} aria-label={`${pinned.has(item.id)?'Unpin':'Pin'} ${item.label}`} title={`${pinned.has(item.id)?'Unpin':'Pin'} ${item.label}`}><Heart size={15} fill={pinned.has(item.id)?'currentColor':'none'}/></button></div>;})}
    {!categories.length&&<div className="browse-grid-empty">No pinned categories yet. Pin a category to keep it here.</div>}
  </div>;
}
function CategoryDirectory({onSelect,preferences,onPreferencesChange}:{onSelect:(category:BrowseCategory)=>void;preferences:Preferences;onPreferencesChange:(value:Partial<Preferences>)=>void}){
  return <section className="content-width category-directory" aria-labelledby="categories-title">
    <header className="category-directory-heading"><div><span className="tiny-kicker">RUPA / IMAGE CATALOGS</span><h1 id="categories-title">Categories</h1></div><p>Search a catalog, browse its current picks, and open each image with its source attached.</p></header>
    <CategoryGrid onSelect={onSelect} preferences={preferences} onPreferencesChange={onPreferencesChange}/>
  </section>;
}
function CollectionChooser({onOpenCategory,onOpenGhibli,onOpenShinkai,preferences,onPreferencesChange}:{onOpenCategory:(category:BrowseCategory)=>void;onOpenGhibli:()=>void;onOpenShinkai:()=>void;preferences:Preferences;onPreferencesChange:(value:Partial<Preferences>)=>void}){
  const [ghibliCover,setGhibliCover]=useState('https://www.ghibli.jp/images/totoro.jpg');
  const [shinkaiCover,setShinkaiCover]=useState('https://en.shinkaiworks.com/wp-content/uploads/2018/12/tenkinoko_thumb_ec.jpg');
  const [shinkaiYears,setShinkaiYears]=useState('2002 — 2022');
  const [pinnedOnly,setPinnedOnly]=useState(false);
  useEffect(()=>{
    let active=true;
    const base=import.meta.env.BASE_URL;
    const choose=<T,>(values:T[])=>values.length?values[Math.floor(Math.random()*values.length)]:undefined;
    Promise.allSettled([
      fetch(`${base}collections/ghibli.json`,{cache:'no-cache',signal:AbortSignal.timeout(12_000)}).then(response=>response.ok?response.json():Promise.reject(new Error('Ghibli collection unavailable'))),
      fetch(`${base}collections/shinkai.json`,{cache:'no-cache',signal:AbortSignal.timeout(12_000)}).then(response=>response.ok?response.json():Promise.reject(new Error('Shinkai collection unavailable'))),
    ]).then(([ghibliResult,shinkaiResult])=>{
      if(!active)return;
      if(ghibliResult.status==='fulfilled'){
        const stills=(ghibliResult.value as {stills?:{thumbnailUrl?:string}[]}[]).flatMap(film=>film.stills||[]).map(still=>still.thumbnailUrl).filter((url):url is string=>Boolean(url));
        const cover=choose(stills);if(cover)setGhibliCover(cover);
      }
      if(shinkaiResult.status==='fulfilled'){
        const films=shinkaiResult.value as {image?:string;year?:number}[];
        const covers=films.map(film=>film.image).filter((url):url is string=>Boolean(url));
        const cover=choose(covers);if(cover)setShinkaiCover(cover);
        const years=films.map(film=>film.year).filter((year):year is number=>Number.isFinite(year));
        if(years.length)setShinkaiYears(`${Math.min(...years)} — ${Math.max(...years)}`);
      }
    });
    return()=>{active=false;};
  },[]);
  const curatedCollections=[
    {id:'ghibli',title:'Ghibli',image:ghibliCover,years:'1984 — 2023',open:onOpenGhibli,onError:()=>setGhibliCover('https://www.ghibli.jp/images/totoro.jpg')},
    {id:'shinkai',title:'Makoto Shinkai',image:shinkaiCover,years:shinkaiYears,open:onOpenShinkai,onError:()=>setShinkaiCover('https://en.shinkaiworks.com/wp-content/uploads/2018/12/tenkinoko_thumb_ec.jpg')},
  ];
  const pinned=new Set(preferences.pinnedCollections||[]),collectionSort=preferences.collectionSort||'featured';
  const collections=[...curatedCollections].filter(item=>!pinnedOnly||pinned.has(item.id)).sort((a,b)=>collectionSort==='name'?a.title.localeCompare(b.title):collectionSort==='pinned'?(Number(pinned.has(b.id))-Number(pinned.has(a.id))||curatedCollections.findIndex(item=>item.id===a.id)-curatedCollections.findIndex(item=>item.id===b.id)):0);
  const pinnedCollections=preferences.pinnedCollections||[];
  const toggleCollectionPin=(id:string)=>onPreferencesChange({pinnedCollections:pinned.has(id)?pinnedCollections.filter(value=>value!==id):[...pinnedCollections,id]});
  return <div className="rupa-home content-width">
    <section className="home-hero" aria-labelledby="home-tools-title"><div className="home-intro"><div><span className="tiny-kicker">RUPA / VISUAL CULTURE INDEX</span><h1 id="home-tools-title" className="home-title">See the image.<br/><em>Find its story.</em></h1><p>An image archive across art, film, music, books, apps and games—with each source close at hand.</p></div><span className="home-intro-index" aria-hidden="true">01 — 04</span></div><MovingArtworkStrip/></section>
        <section className="home-tools-section" aria-labelledby="home-tool-list-title"><div className="collections-section-head"><div><span className="tiny-kicker">IMAGE CATALOGS / 11</span><h2 id="home-tool-list-title">All categories</h2></div><p>Search by medium, follow a trend, and trace every image back to its source.</p></div><CategoryGrid onSelect={onOpenCategory} compact preferences={preferences} onPreferencesChange={onPreferencesChange}/></section>
    <section className="collections-section" id="collections" aria-labelledby="collections-title"><div className="collections-section-head"><div><span className="tiny-kicker">COLLECTIONS</span><h2 id="collections-title">Curated collections</h2></div><p>Browse image collections by artist and studio.</p></div><div className="curated-collection-grid"><BrowseGridControls sort={collectionSort} onSort={value=>onPreferencesChange({collectionSort:value})} pinnedOnly={pinnedOnly} onTogglePinnedOnly={()=>setPinnedOnly(value=>!value)}/>{collections.map(collection=><div className="curated-collection-shell" key={collection.id}><button type="button" className="curated-collection-card" onClick={collection.open} aria-label={`Open ${collection.title} collection`}><img src={collection.image} alt="" loading="lazy" decoding="async" onError={collection.onError}/><span className="curated-collection-overlay"><span className="curated-collection-years">{collection.years}</span><strong>{collection.title}</strong></span></button><button type="button" className={`curated-collection-pin${pinned.has(collection.id)?' is-pinned':''}`} onClick={()=>toggleCollectionPin(collection.id)} aria-label={`${pinned.has(collection.id)?'Unpin':'Pin'} ${collection.title}`} title={`${pinned.has(collection.id)?'Unpin':'Pin'} ${collection.title}`}><Heart size={17} fill={pinned.has(collection.id)?'currentColor':'none'}/></button></div>)}{!collections.length&&<div className="browse-grid-empty">No pinned collections yet. Pin a collection to keep it here.</div>}</div></section>
  </div>;
}
function getInitialProfile():LocalProfile {return {id:'guest',name:'Guest Archive',createdAt:0,updatedAt:0,preferences:{...DEFAULT_PREFERENCES}};}
function appScreenshotArtwork(app:Artwork,shot:{url:string;device:string},index:number):Artwork {
  const deviceKey=shot.device.toLowerCase().replace(/\s+/g,'-');
  return {id:`appscreenshots:apple:${app.mediaId||app.id}:${deviceKey}:${index+1}`,category:'appscreenshots',title:`${app.title} · ${shot.device} screenshot ${index+1}`,subtitle:shot.device,source:'App Store',sourceUrl:app.sourceUrl,mediaId:app.mediaId,previewUrl:shot.url,imageUrl:shot.url,sdDownloadUrl:shot.url,downloadUrl:shot.url,hdDownloadUrls:[shot.url],kind:'screenshot',rights:'source-only'};
}
function AppScreenshotRail({item,onOpen}:{item:Artwork;onOpen:(item:Artwork)=>void}) {
  const [screenshots,setScreenshots]=useState(item.screenshots||[]),[loading,setLoading]=useState(false),[unavailable,setUnavailable]=useState(false);
  useEffect(()=>{
    if(item.screenshots?.length){setScreenshots(item.screenshots.slice(0,8));setLoading(false);setUnavailable(false);return;}
    if(!item.sourceUrl){setScreenshots([]);setLoading(false);setUnavailable(true);return;}
    const controller=new AbortController();let active=true;
    setScreenshots([]);setLoading(true);setUnavailable(false);
    let storefront:AppleStorefront='us';
    try{const locale=new URL(item.sourceUrl).pathname.match(/^\/([a-z]{2})\//i)?.[1]?.toLowerCase();if(locale&&isStorefront(locale))storefront=locale;}catch{}
    searchArtwork(item.sourceUrl,'appscreenshots',controller.signal,undefined,storefront,'apple').then(result=>{
      if(!active)return;
      const devices:Record<string,string>={'iphone':'iPhone','ipad':'iPad','apple-tv':'Apple TV','mac':'Mac'};
      const found=result.results.flatMap(asset=>{
        const deviceSlug=asset.id.split(':')[3]||'';
        const device=devices[deviceSlug];
        const url=asset.previewUrl||asset.imageUrl;
        return device&&url?[{url,device}]:[];
      }).slice(0,8);
      setScreenshots(found);setUnavailable(found.length===0);
    }).catch(()=>{if(active)setUnavailable(true);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;controller.abort();};
  },[item.id,item.sourceUrl,item.screenshots]);
  if(!screenshots.length&&!loading&&!unavailable)return null;
  return <section className="inspector-app-screenshots" aria-label={`${item.title} App Store screenshots`}>
    <div className="app-screenshot-heading"><span>APP STORE SCREENSHOTS</span><small>{loading?'Loading…':screenshots.length?`${screenshots.length} screens`:'Unavailable'}</small></div>
    {loading?<div className="app-screenshot-loading" role="status" aria-live="polite" aria-busy="true"><span className="skeleton-art"/><span className="skeleton-art"/><span className="skeleton-art"/></div>:screenshots.length?<div className="app-screenshot-rail">{screenshots.map((shot,index)=><button type="button" key={`${shot.device}:${shot.url}`} onClick={()=>onOpen(appScreenshotArtwork(item,shot,index))} aria-label={`Open ${item.title}, ${shot.device} screenshot ${index+1}`}><img src={shot.url} alt="" loading="lazy" decoding="async"/><span>{shot.device}</span></button>)}</div>:<p className="app-screenshot-empty" role="status">No App Store screenshots are listed for this app.</p>}
  </section>;
}

function ArtworkCard({item,onOpen,isSaved,onFavorite,motion,onCheckMotion,folderOptions,folderId,onMoveFolder,onToggleSelection,selected}:{item:Artwork;onOpen:(a:Artwork)=>void;isSaved:boolean;onFavorite:(a:Artwork)=>void;motion?:MotionLookupState;onCheckMotion?:(a:Artwork)=>void;folderOptions?:FavoriteFolder[];folderId?:string;onMoveFolder?:(item:Artwork,folderId?:string)=>void;onToggleSelection?:(id:string)=>void;selected?:boolean}) {
  const locale=useLocale(),tr=(value:string)=>translate(locale,value);
  const [bad,setBad]=useState(false),[imageLoaded,setImageLoaded]=useState(false),[retryNonce,setRetryNonce]=useState(0);
  const imageCandidates=useMemo(()=>[...new Set([item.previewUrl,item.imageUrl,item.downloadUrl,...(item.hdDownloadUrls||[])].filter((value):value is string=>Boolean(value)))],[item.id,item.previewUrl,item.imageUrl,item.downloadUrl,item.hdDownloadUrls]);
  const [imageIndex,setImageIndex]=useState(0);
  const [imageSrc,setImageSrc]=useState(imageCandidates[0]||'');
  const [hovered,setHovered]=useState(false),[playing,setPlaying]=useState(false),cardRef=useRef<HTMLElement|null>(null),checkMotionRef=useRef(onCheckMotion);
  useEffect(()=>{checkMotionRef.current=onCheckMotion;},[onCheckMotion]);
  useEffect(()=>{setBad(false);setImageLoaded(false);setImageIndex(0);setImageSrc(imageCandidates[0]||'');},[item.id,imageCandidates]);
  const appleMotionEligible=isAppleMusicArtwork(item);
  useEffect(()=>{
    if(!appleMotionEligible||motion||!cardRef.current)return;
    const node=cardRef.current;
    if(!('IntersectionObserver' in window)){checkMotionRef.current?.(item);return;}
    const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();checkMotionRef.current?.(item);}},{rootMargin:'180px'});
    observer.observe(node);return()=>observer.disconnect();
  },[item.id,appleMotionEligible,motion]);
  const markPreviewUnavailable=()=>{const next=imageIndex+1;if(imageCandidates[next]){setImageIndex(next);setImageSrc(imageCandidates[next]);setImageLoaded(false);}else setBad(true);};
  return <article className={`art-card${item.category==='music'?' art-card-music':''}`} ref={cardRef}>
    <div className="art-visual">
      {onToggleSelection&&<label className="art-select"><input type="checkbox" checked={Boolean(selected)} onChange={()=>onToggleSelection(item.id)}/><span>{selected?'Selected':'Select'}</span></label>}
      <button className="art-img-button" onClick={()=>onOpen(item)} onPointerEnter={event=>{setHovered(event.pointerType==='mouse'&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches);if(appleMotionEligible&&!motion)checkMotionRef.current?.(item);}} onPointerLeave={()=>setHovered(false)} onFocus={()=>{if(appleMotionEligible&&!motion)checkMotionRef.current?.(item);}} aria-label={`${tr('View')} ${item.title}${motion?.status==='available'&&appleMotionEligible?`, ${tr('animated cover available')}`:''}`}>
        <div className={`art-img-wrap${(hovered||playing)&&appleMotionEligible?' is-motion-preview':''}`} data-art-category={item.category} data-art-kind={item.kind||"artwork"} aria-busy={!bad&&!imageLoaded}>{!bad&&!imageLoaded&&<span className="art-image-skeleton skeleton-art" aria-hidden="true"/>}{bad?<div className="art-fallback"><Image size={22}/><span>{tr('Artwork unavailable')}</span><small>{tr('Open the artwork details for its source')}</small></div>:<img key={retryNonce} className={imageLoaded?'image-ready':''} src={imageSrc} loading="lazy" decoding="async" onLoad={()=>setImageLoaded(true)} onError={markPreviewUnavailable} alt={`${item.title}${item.kind==='artist-image'?` ${tr('artist image')}`:` ${tr('artwork')}`}`}/>} {appleMotionEligible&&motion?.status==='available'&&motion.artwork&&<AppleMotionVideo url={motion.artwork.url} title={item.title} active={hovered||playing}/>}<div className="art-hover"><Expand size={17}/><span>{tr('Inspect artwork')}</span></div></div>
      </button>
      {bad&&<button type="button" className="art-retry-image" onClick={()=>{setBad(false);setImageLoaded(false);setImageIndex(0);setImageSrc(imageCandidates[0]||'');setRetryNonce(value=>value+1);}}><RefreshCw size={13}/> Retry image</button>}
      {appleMotionEligible&&motion?.status==='available'&&motion.artwork&&<button type="button" className="music-motion-badge" onClick={()=>setPlaying(value=>!value)} aria-label={playing?'Pause animated cover':tr('Play animated cover')} title={playing?'Pause animated cover':tr('Play animated cover')}>{playing?<Pause size={13} fill="currentColor"/>:<Play size={13} fill="currentColor"/>}</button>}
    </div>
    <div className="art-info"><div className="art-info-main"><div className="art-source">{item.category==='music'?`${item.source} · ${item.kind==='artist-image'?tr('ARTIST IMAGE'):tr('ALBUM')}`:<>{tr(COLLECTION_LABELS[item.category as Exclude<Category,'all'>])} <span className="interpunct">·</span> {item.source}</>}</div><button className="art-name" onClick={()=>onOpen(item)} title={item.title}>{item.title}</button><div className="art-caption">{artworkCaption(item)}</div>{onMoveFolder&&<select className="art-folder-select" aria-label={`Folder for ${item.title}`} value={folderId||''} onChange={event=>onMoveFolder(item,event.target.value||undefined)}><option value="">Unsorted</option>{folderOptions?.filter(folder=>!folder.deleted).map(folder=><option key={folder.id} value={folder.id}>{folder.name}</option>)}</select>}</div><button onClick={()=>onFavorite(item)} title={tr(isSaved?'Remove from archive':'Save to archive')} className={`heart ${isSaved?'saved':''}`} aria-label={tr(isSaved?'Remove favorite':'Save favorite')}><Heart size={17} fill={isSaved?'currentColor':'none'}/></button></div>

  </article>;
}
function Compare({a,b,onClose}:{a:Artwork;b:Artwork;onClose:()=>void}){
  const [pos,setPos]=useState(50);
  return <div className="compare-panel"><div className="compare-header"><div><span className="tiny-kicker">IMAGE COMPARISON STUDIO</span><h3>Read between the pixels.</h3></div><Button variant="ghost" size="icon" onClick={onClose} aria-label="Close compare"><X size={19}/></Button></div><div className="compare-stage">
    <img src={a.imageUrl} alt={a.title} className="compare-under"/>
    <img src={b.imageUrl} alt={b.title} className="compare-over" style={{clipPath:`inset(0 ${100-pos}% 0 0)`}}/>
    <div className="compare-line" style={{left:`${pos}%`}}><span><Columns2 size={16}/></span></div>
    <input type="range" min={0} max={100} value={pos} onChange={e=>setPos(Number(e.target.value))} aria-label="Image comparison slider" className="compare-range"/>
  </div><div className="compare-labels"><span>A — {a.title}</span><span>B — {b.title}</span></div></div>;
}
function StorefrontControl({value,onChange,options=APPLE_STOREFRONTS}:{value:AppleStorefront;onChange:(country:AppleStorefront)=>void;options?:readonly {id:AppleStorefront;label:string}[]}){
  const locale=useLocale(),tr=(value:string)=>translate(locale,value);
  const choices=options.some(option=>option.id===value)?options:[{id:value,label:APPLE_STOREFRONTS.find(option=>option.id===value)?.label||value.toUpperCase()},...options];
  return <label className="storefront-control"><span>{tr('Storefront')}</span><span className="storefront-select"><select value={value} onChange={event=>onChange(event.target.value as AppleStorefront)} aria-label={tr('Apple storefront')}>{choices.map(store=><option key={store.id} value={store.id}>{store.label}</option>)}</select><ChevronDown size={15} aria-hidden="true" focusable="false"/></span></label>;
}
function ArtInspector({item,close,isSaved,onFavorite,onCompare,onPrepareImage,onWallpaper,compared,notify,motionState,onCheckMotion,onOpen}:{item:Artwork|null;close:()=>void;isSaved:boolean;onFavorite:(a:Artwork)=>void;onCompare:(a:Artwork)=>void;onPrepareImage:(a:Artwork)=>void;onWallpaper:(a:Artwork)=>void;compared:Artwork|null;notify:(text:string)=>void;motionState?:MotionLookupState;onCheckMotion:(a:Artwork,force?:boolean)=>void;onOpen:(item:Artwork)=>void}) {
  const [width,setWidth]=useState(0),[height,setHeight]=useState(0),[zoomOpen,setZoomOpen]=useState(false);
  const [imageSrc,setImageSrc]=useState(''),[imageFailed,setImageFailed]=useState(false),[imageLoading,setImageLoading]=useState(false),[motionActive,setMotionActive]=useState(false),[artistImage,setArtistImage]=useState('');
  const current=item;
  const appleMusicAlbum=Boolean(current&&isAppleMusicArtwork(current)),appleArtistImage=current?.category==='music'&&current.kind==='artist-image',appleItem=Boolean(current&&isAppleArtwork(current)),appleMusicVideo=Boolean(current&&current.category==='musicvideos'&&isAppleArtwork(current));
  useEffect(()=>{setWidth(0);setHeight(0);setZoomOpen(false);setMotionActive(false);setArtistImage('');},[item]);
  useEffect(()=>{const source=current?.imageUrl||current?.previewUrl||'';setImageSrc(source);setImageFailed(false);setImageLoading(Boolean(source&&!appleMusicVideo));},[current?.id,current?.imageUrl,current?.previewUrl,current?.category,current?.kind]);
  useEffect(()=>{if(!current)return;let cancelled=false,index=0;const sources=[current.imageUrl,current.previewUrl].filter((src,i,list)=>Boolean(src)&&list.indexOf(src)===i);const img=new window.Image();img.onload=()=>{if(!cancelled){setWidth(img.naturalWidth);setHeight(img.naturalHeight);}};img.onerror=()=>{index++;if(sources[index]){img.src=sources[index];return;}if(!cancelled){setWidth(0);setHeight(0);}};img.src=sources[0]||'';return()=>{cancelled=true;};},[current]);
  useEffect(()=>{if(current?.category!=='music'||current.kind==='artist-image'||!current.artistUrl||!hasBackend)return;let active=true;getAppleArtistImage(current.artistUrl).then(value=>{if(active&&value)setArtistImage(value);}).catch(()=>{});return()=>{active=false;};},[current?.id,current?.artistUrl,current?.kind]);
  useEffect(()=>{if(current&&isAppleMusicArtwork(current)&&!motionState)onCheckMotion(current);},[current?.id,current?.category,current?.kind,current?.provider,current?.source,motionState?.status]);
  return <><Dialog open={!!item&&!zoomOpen} onOpenChange={(o)=>{if(!o)close();}} title="Artwork details" wide>
     {current&&<div className="inspector-grid"><div className="inspector-visual"><div className={`inspection-canvas${appleMusicAlbum?' inspection-canvas-music':''}${appleMusicVideo?' inspection-canvas-video':''}`} aria-busy={imageLoading} style={{'--inspection-art':imageSrc?`url("${imageSrc.replace(/"/g,'%22')}")`:'none'} as import('react').CSSProperties}>{appleMusicVideo?<AppleVideoPreview item={current}/>:imageFailed?<div className="inspector-image-fallback" role="status"><Image size={24}/><span>Artwork image unavailable</span><a href={current.sourceUrl} target="_blank" rel="noreferrer">Open the source page</a></div>:<>{imageLoading&&<div className="inspection-image-loading" role="status"><LoaderCircle size={21} className="rupa-spinner"/><span>Loading artwork…</span></div>}<img className={imageLoading?'is-loading':''} src={imageSrc||current.imageUrl} alt={current.kind==='artist-image'?`${current.title} artist image`:current.title} onClick={()=>setZoomOpen(true)} onLoad={event=>{setImageLoading(false);setWidth(event.currentTarget.naturalWidth);setHeight(event.currentTarget.naturalHeight);}} onError={()=>{if(current.previewUrl&&imageSrc!==current.previewUrl){setImageLoading(true);setImageSrc(current.previewUrl);return;}setImageLoading(false);setImageFailed(true);}} title="Open immersive zoom viewer"/></>}{appleMusicAlbum&&motionState?.status==='available'&&motionState.artwork&&motionActive&&<AppleMotionVideo url={motionState.artwork.url} title={current.title} active controls loop={false} onClose={()=>setMotionActive(false)}/>} {!appleMusicVideo&&<button className="inspect-zoom" onClick={()=>setZoomOpen(true)} disabled={imageFailed||imageLoading||motionActive}><ZoomIn size={16}/> Zoom / Fullscreen</button>}{appleMusicAlbum&&motionState?.status==='available'&&motionState.artwork&&!motionActive&&<button className="inspect-motion-toggle" onClick={()=>setMotionActive(true)}><Play size={14} fill="currentColor"/>Play motion</button>}</div><div className="inspection-caption"><span>{appleMusicVideo?'Apple Music hosted player':appleMusicAlbum?'Apple Music album artwork':appleArtistImage?'Apple Music artist image':`Image provided by ${current.source}`}</span></div></div>
      <div className="inspector-sidebar">{appleMusicVideo?<>
        <div className="tiny-kicker">APPLE MUSIC / MUSIC VIDEO</div><h2>{current.title}</h2><p className="muted inspector-subtitle">{artworkCaption(current)}</p>
        <div className="inspector-stats"><div><small>PLAYER</small><strong>Apple-hosted preview</strong></div><div><small>IMAGE SOURCE</small><strong>Apple Music</strong></div><div><small>STILL CAPTURE</small><strong>Apple-hosted preview</strong></div></div>
        <DownloadExportPanel item={current} onPrepareImage={onPrepareImage} notify={notify}/>
        <div className="music-inspector-actions"><Button variant="outline" onClick={()=>onFavorite(current)}><Heart size={16} fill={isSaved?'currentColor':'none'}/>{isSaved?'Saved to archive':'Save video cover'}</Button><a href={current.sourceUrl} target="_blank" rel="noreferrer" className="ca-button ca-button-primary">Open in Apple Music <ArrowUpRight size={15}/></a></div>
        <p className="rights-note"><Info size={15}/> Apple’s hosted player needs a network connection and may require sign-in. Open the source page for regional availability.</p>
      </>:appleMusicAlbum?<>
        <div className="tiny-kicker">APPLE MUSIC / ALBUM</div><h2>{current.title}</h2><div className="music-artist-line">{artistImage&&<img src={artistImage} alt="" loading="lazy"/>}<div><small>ARTIST</small>{current.artistUrl?<a href={current.artistUrl} target="_blank" rel="noreferrer">{current.artist||current.subtitle}<ArrowUpRight size={13}/></a>:<span>{current.artist||current.subtitle}</span>}</div></div>{current.year&&<p className="music-release-year">Released {current.year}</p>}
        <div className="music-inspector-actions"><Button variant="outline" onClick={()=>onFavorite(current)}><Heart size={16} fill={isSaved?'currentColor':'none'}/>{isSaved?'Saved to archive':'Save album to archive'}</Button><a href={current.sourceUrl} target="_blank" rel="noreferrer" className="ca-button ca-button-primary">Open in Apple Music <ArrowUpRight size={15}/></a></div>
        <DownloadExportPanel item={current} motionState={motionState} onCheckMotion={onCheckMotion} onPrepareImage={onPrepareImage} onWallpaper={onWallpaper} notify={notify}/>
        <p className="rights-note"><Info size={15}/> Source: Apple Music. Open the source page for the original album and release details.</p>
      </>:appleArtistImage?<>
        <div className="tiny-kicker">APPLE MUSIC / ARTIST IMAGE</div><h2>{current.title}</h2>
        <div className="inspector-stats music-artist-stats"><div><small>IMAGE DIMENSIONS</small><strong>{width?`${width.toLocaleString()} × ${height.toLocaleString()} px`:'Not measurable'}</strong></div><div><small>IMAGE SOURCE</small><strong>Apple Music</strong></div><div><small>RIGHTS</small><strong>Source-only</strong></div></div>
        <DownloadExportPanel item={current} onPrepareImage={onPrepareImage} onWallpaper={onWallpaper} notify={notify}/>
        <div className="music-inspector-actions"><Button variant="outline" onClick={()=>onFavorite(current)}><Heart size={16} fill={isSaved?'currentColor':'none'}/>{isSaved?'Saved to archive':'Save artist image'}</Button><a href={current.sourceUrl} target="_blank" rel="noreferrer" className="ca-button ca-button-primary">Open artist in Apple Music <ArrowUpRight size={15}/></a></div>
        <p className="rights-note"><Info size={15}/> Source: Apple Music. Open the source page for the artist and image context.</p>
      </>:<>
        <div className="tiny-kicker">{current.category.toUpperCase()} / {current.kind||'COVER'}</div><h2>{current.title}</h2><p className="muted inspector-subtitle">{artworkCaption(current)}</p>
         <div className="inspector-stats"><div><small>IMAGE DIMENSIONS</small><strong>{width?`${width.toLocaleString()} × ${height.toLocaleString()} px`:'Not measurable'}</strong></div><div><small>IMAGE SOURCE</small><strong>{current.source}</strong></div></div>
         {current.category==='apps'&&<AppScreenshotRail key={current.id} item={current} onOpen={onOpen}/>}<DownloadExportPanel item={current} onPrepareImage={onPrepareImage} onWallpaper={onWallpaper} notify={notify}/>
         <div className="inspect-actions"><Button variant="outline" onClick={()=>onFavorite(current)}><Heart size={16} fill={isSaved?'currentColor':'none'}/>{isSaved?'Saved':'Save artwork'}</Button><Button variant="outline" onClick={()=>onCompare(current)}><Columns2 size={16}/>{compared?'Compare with selected':'Select for comparison'}</Button>{appleItem?<a className="ca-button ca-button-outline" href={current.sourceUrl} target="_blank" rel="noreferrer"><ArrowUpRight size={16}/> Open Apple source</a>:<a className="ca-button ca-button-outline" href={current.sourceUrl} target="_blank" rel="noreferrer"><ArrowUpRight size={16}/> Open source</a>}</div>
         <a href={current.sourceUrl} target="_blank" rel="noreferrer" className="source-link">Visit original source <ArrowUpRight size={15}/></a>
         <p className="rights-note"><Info size={15}/> Source: {current.source}. Use the source link above for the original work and its context.</p>
      </>}</div></div>}
  </Dialog>
  {current&&zoomOpen&&<Suspense fallback={<div className="viewer-loading" role="status">Opening image viewer…</div>}><ImageLightbox image={imageSrc||current.imageUrl} title={current.title} onClose={()=>setZoomOpen(false)}/></Suspense>}</>;
}
function MyArchiveModal({open,onClose,profile,onChange,notify,syncState,onSyncNow,onLocaleChange,onPreferencesChange}:{open:boolean;onClose:()=>void;profile:LocalProfile;onChange:(id:string)=>void;notify:(text:string)=>void;syncState:SyncUiState;onSyncNow:()=>Promise<void>;onLocaleChange:(locale:Locale)=>void;onPreferencesChange:(preferences:Partial<Preferences>)=>void}) {
  const locale=useLocale(),tr=(value:string)=>translate(locale,value);
  const profiles=useLiveQuery(()=>db.profiles.toArray(),[])||[];
  const [name,setName]=useState(''),[backupPwd,setBackupPwd]=useState(''),[syncCode,setSyncCode]=useState(''),[showSecret,setShowSecret]=useState(false),[qr,setQr]=useState(''),[busy,setBusy]=useState(false);
  const file=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(!showSecret||!profile.syncCode){setQr('');return;}let cancelled=false;import('qrcode').then(({default:QRCode})=>QRCode.toDataURL(profile.syncCode!,{width:220,margin:1,color:{dark:'#111111',light:'#ffffff'}})).then(value=>{if(!cancelled)setQr(value);}).catch(()=>{if(!cancelled)setQr('');});return()=>{cancelled=true;};},[profile.syncCode,showSecret]);
  async function safeRun(action:()=>Promise<void>){setBusy(true);try{await action();}catch(e){notify(e instanceof Error?e.message:'Operation failed');}finally{setBusy(false);}}
  async function backup(){const data=await getSnapshot(profile);const output=backupPwd?await exportEncrypted(data,backupPwd):data;triggerDownload(JSON.stringify(output,null,2),`rupa-${safeFileName(profile.name)}-${new Date().toISOString().slice(0,10)}.json`);notify(backupPwd?'Encrypted backup exported':'Unencrypted backup exported');}
  async function restore(ev:ChangeEvent<HTMLInputElement>){const input=ev.currentTarget;const chosen=input.files?.[0];if(!chosen)return;await safeRun(async()=>{
    if(chosen.size>5e6)throw new Error('Backup too large');let data=JSON.parse(await chosen.text());if(data?.format==='RUPA Encrypted Backup'){if(!backupPwd)throw new Error('Enter backup password before importing');data=await importEncrypted(data,backupPwd);}
    const p=await importSnapshot(data);onChange(p.id);notify('Archive imported into a new local profile');onClose();
  });input.value='';}
  return <Dialog open={open} onOpenChange={onClose} title={tr('Profile & settings')}>
    <div className="profile-block"><label className="locale-row"><span>{tr('Language')}</span><select aria-label={tr('Language')} value={profile.preferences.uiLocale||'id'} onChange={event=>onLocaleChange(event.target.value as Locale)}><option value="id">Bahasa Indonesia</option><option value="en">English</option><option value="ja">日本語</option></select></label></div>
    <div className="profile-block profile-settings-block"><div className="tiny-kicker">{tr('SETTINGS')}</div><label className="locale-row"><span>{tr('Gallery layout')}</span><select aria-label={tr('Gallery layout')} value={profile.preferences.gallery} onChange={event=>onPreferencesChange({gallery:event.target.value as Preferences['gallery']})}><option value="masonry">{tr('Masonry / Original ratios')}</option><option value="grid">{tr('Uniform grid')}</option></select></label><label className="locale-row"><span>{tr('Appearance')}</span><select aria-label={tr('Appearance')} value={profile.preferences.theme} onChange={event=>onPreferencesChange({theme:event.target.value as Preferences['theme']})}><option value="light">{tr('Light')}</option><option value="dark">{tr('Dark')}</option></select></label><div className="accent-setting"><span>{tr('Accent color')}</span><div className="accent-picker" role="group" aria-label={tr('Accent color')}>{([{id:'vermilion',label:'Signal red',color:'#fa4f43'},{id:'cobalt',label:'Electric blue',color:'#245dff'},{id:'citron',label:'Acid lime',color:'#c8e93b'},{id:'forest',label:'Pool green',color:'#08a994'},{id:'coral',label:'Pop pink',color:'#e8418b'}] as const).map(option=><button key={option.id} type="button" className={(profile.preferences.accent||'vermilion')===option.id?'active':''} aria-pressed={(profile.preferences.accent||'vermilion')===option.id} aria-label={option.label} title={option.label} onClick={()=>onPreferencesChange({accent:option.id})}><span style={{backgroundColor:option.color}}/></button>)}</div></div>{profile.preferences.theme==='dark'&&<label className="locale-row"><span>{tr('OLED black')}</span><input aria-label={tr('OLED black')} type="checkbox" checked={profile.preferences.oled||false} onChange={event=>onPreferencesChange({oled:event.target.checked})}/></label>}</div>
    <div className="profile-block"><div className="tiny-kicker">{tr('LOCAL PROFILES')}</div><p className="muted small">{tr('Profiles stay on this browser. They are not online accounts.')}</p><div className="profile-list">{profiles.map(p=><button key={p.id} onClick={()=>{onChange(p.id);onClose();}} className={profile.id===p.id?'profile-selected':''}><span className="profile-avatar"><UserRound size={17}/></span><span>{p.name}</span>{profile.id===p.id?<Check size={16}/>:<ArrowRight size={16}/>}</button>)}</div><form className="inline-input" onSubmit={e=>{e.preventDefault();safeRun(async()=>{const p=await createProfile(name);onChange(p.id);setName('');notify('New local archive created');onClose();});}}><input aria-label="New local archive name" value={name} onChange={e=>setName(e.target.value)} placeholder="Name a new archive" maxLength={50} required/><Button disabled={busy}><Plus size={16}/> Create</Button></form></div>
    <div className="profile-block"><div className="tiny-kicker">{tr('BACKUP / RESTORE')}</div><p className="muted small">{tr('Optional password encrypts your exported backup. Without one, JSON is readable. Passwords cannot be recovered.')}</p><input aria-label="Backup encryption password" type="password" value={backupPwd} onChange={e=>setBackupPwd(e.target.value)} placeholder={tr('Optional backup password (min. 8 chars)')}/><div className="inline-actions"><Button variant="outline" disabled={busy} onClick={()=>safeRun(backup)}><Download size={16}/> {tr('Export archive')}</Button><Button variant="outline" onClick={()=>file.current?.click()}><Upload size={16}/> {tr('Import backup')}</Button><input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={restore}/></div></div>
    <div className="profile-block"><div className="tiny-kicker">{tr('ENCRYPTED DEVICE SYNC')}</div><p className="muted small">{tr('Sync your collection and settings across devices with a secret chain code. No email needed. Requires your Cloudflare Worker and D1 database.')}</p><div className="sync-status"><span className={`status-dot ${hasBackend?'on':''}`}/>{tr(hasBackend?'Worker URL configured':'Worker not configured — local mode')}</div>
      <div className="inline-actions"><Button disabled={busy||!hasBackend} variant="outline" onClick={()=>safeRun(async()=>{await createSync(profile);notify('Encrypted chain created');setShowSecret(true);})}><QrCode size={16}/> {tr('Create chain')}</Button><Button disabled={busy||!profile.syncCode||!hasBackend||syncState.status==='syncing'} variant="outline" onClick={()=>safeRun(onSyncNow)}><RefreshCw size={16}/> {tr(syncState.status==='syncing'?'Syncing…':'Sync now')}</Button></div>
      <p className={`sync-result sync-result-${syncState.status}`} role="status" aria-live="polite" aria-atomic="true">{syncState.status==='syncing'?tr('Syncing this archive…'):syncState.status==='error'?tr('Sync failed. Check your connection and try again.'):syncState.lastSuccess?`${tr('Last successful sync')}: ${new Date(syncState.lastSuccess).toLocaleString(locale)}`:tr('No successful sync recorded on this device yet.')}</p>
      {profile.syncCode&&<><Button size="sm" variant="ghost" onClick={()=>setShowSecret(s=>!s)}>{tr(showSecret?'Hide secret pairing code':'Show QR / pairing code')} <ChevronDown size={15}/></Button>{showSecret&&<div className="sync-secret">{qr&&<img src={qr} width="175" height="175" alt="Sync chain QR containing your secret"/>}<p className="micro">Treat this code like a password. Anyone with it can read and change your synced archive.</p><div className="sync-code">{profile.syncCode}</div><Button variant="outline" onClick={()=>{navigator.clipboard.writeText(profile.syncCode||'').then(()=>notify('Secret code copied')).catch(()=>notify('Could not copy'));}} size="sm"><Share2 size={15}/> Copy pairing code</Button></div>}</>}
      <div className="join-row"><input aria-label="Sync chain code" value={syncCode} onChange={e=>setSyncCode(e.target.value)} placeholder={tr('Paste chain code from another device')} autoComplete="off"/><Button variant="outline" disabled={!hasBackend||busy||!syncCode} onClick={()=>safeRun(async()=>{const p=await joinSync(syncCode,'');onChange(p.id);setSyncCode('');notify('Device paired and archive restored');onClose();})}>Join</Button></div>
      <p className="micro muted">{tr('Cloud sync is end-to-end encrypted, but local browser storage and locally saved chain keys are not password-encrypted in this version. Sync happens while the app is open.')}</p>
    </div>
  </Dialog>;
}
function SearchSkeletons({gallery,count,compact=false,query,category}:{gallery:Preferences['gallery'];count:number;compact?:boolean;query:string;category:Category}){
  const message=compact?'More catalog results are still loading…':'Searching '+category+' catalogs for '+query;
  return <div className={`skeleton-grid gallery-${gallery}${compact?' skeleton-grid-more':''}`} role="status" aria-live="polite" aria-busy="true" aria-label={message}>
    <span className="sr-only">{message}</span><span className="search-progress-indicator"><LoaderCircle size={15} className="rupa-spinner"/> {message}</span>{Array.from({length:count},(_,i)=><div key={i} className={`skeleton-item skeleton-item-${i%4+1}`} aria-hidden="true"><div className="skeleton-art" data-art-category={category}/><i/><i/></div>)}
  </div>;
}
function readableSearchWarning(warning:string,category:Category){
  return warning===category?`Some connected ${COLLECTION_LABELS[category as Exclude<Category,'all'>]} sources are unavailable; showing any image-backed results.`:warning;
}
const APPLE_PAGE_COPY:Record<Exclude<AppleCategory,'music'|'appscreenshots'>,{eyebrow:string;title:string;description:string;placeholder:string;source:string;empty:string}>={
  musicvideos:{eyebrow:'APPLE MUSIC / MUSIC VIDEOS',title:'Music video artwork.',description:'Find Apple Music video covers by title or paste a music video link.',placeholder:'Video title or Apple Music video URL…',source:'APPLE MUSIC · MUSIC VIDEOS',empty:'Try another video title or paste an Apple Music video URL.'},
  books:{eyebrow:'APPLE BOOKS / EBOOKS',title:'Book covers.',description:'Search Apple Books by title or author, use an ISBN, or paste an Apple Books link.',placeholder:'Book title, author, ISBN, or Apple Books URL…',source:'APPLE BOOKS · BOOK COVERS',empty:'Try a different title, author, or ISBN, or choose another storefront.'},
  movies:{eyebrow:'APPLE TV / ITUNES MOVIES',title:'Film artwork.',description:'Search film posters and artwork across connected catalogs, or narrow the results to a specific source.',placeholder:'Film title, Apple TV link, or Apple ID…',source:'FILM ARTWORK',empty:'No film artwork came back from this source. Try all connected sources or another storefront.'},
  tv:{eyebrow:'APPLE TV / ITUNES TV',title:'TV season artwork.',description:'Search Apple’s iTunes TV catalog by show or season, or paste an iTunes TV season link or numeric ID. Apple TV+ share links are not the same catalog IDs.',placeholder:'Show, season, iTunes TV URL, or numeric ID…',source:'APPLE TV · TV SEASON ARTWORK',empty:'Try a show or season available in the selected iTunes storefront, or paste its iTunes TV season link or numeric ID.'},
  audiobooks:{eyebrow:'APPLE BOOKS / AUDIOBOOKS',title:'Audiobook covers.',description:'Search audiobook editions or paste an Apple Books audiobook link.',placeholder:'Audiobook title, author, or Apple Books URL…',source:'APPLE BOOKS · AUDIOBOOKS',empty:'Availability changes by storefront. Try the United States or another storefront.'},
  podcasts:{eyebrow:'APPLE PODCASTS',title:'Podcast covers.',description:'Search podcast titles or authors, or paste an Apple Podcasts link.',placeholder:'Podcast, creator, or Apple Podcasts URL…',source:'APPLE PODCASTS · SHOWS',empty:'Try another show title or creator, or change the storefront.'},
  podcastepisodes:{eyebrow:'APPLE PODCASTS / EPISODES',title:'Podcast episode art.',description:'Search episode titles or paste a show or episode link from Apple Podcasts.',placeholder:'Episode, show, or Apple Podcasts URL…',source:'APPLE PODCASTS · EPISODE ART',empty:'Try an episode title, a different storefront, or an Apple Podcasts episode link.'},
  apps:{eyebrow:'APP STORE',title:'App icons.',description:'Find App Store icons by app name or paste an App Store link.',placeholder:'App name or App Store URL…',source:'APP STORE · APP ICONS',empty:'Try another app name or select a different storefront.'},
};
type SearchableCategory=Exclude<Category,'all'|'games'|'ghibli'>;
function SearchableCollectionPage({category,query,onQueryChange,onSubmit,storefront,onStorefrontChange,source,onSourceChange,loading,searched,results,warnings,hasPartialResults,gallery,favoriteIds,onFavorite,onOpen,onBack,inputRef}:{category:SearchableCategory;query:string;onQueryChange:(value:string)=>void;onSubmit:(event:FormEvent<HTMLFormElement>)=>void;storefront:AppleStorefront;onStorefrontChange:(value:AppleStorefront)=>void;source:string;onSourceChange:(value:string)=>void;loading:boolean;searched:boolean;results:Artwork[];warnings:string[];hasPartialResults:boolean;gallery:Preferences['gallery'];favoriteIds:Set<string>;onFavorite:(artwork:Artwork)=>void;onOpen:(artwork:Artwork)=>void;onBack:()=>void;inputRef:RefObject<HTMLInputElement|null>}){
  const locale=useLocale(),tr=(value:string)=>translate(locale,value);
  const backLabel=isAppleCollection(category)||category==='anime'||category==='manga'?'Back to Trends':'All categories';
  const sources=getSourceOptions(category);
  const sourceLabel=sources.find(option=>option.id===source)?.label||'All sources';
  const copy=APPLE_PAGE_COPY[category as keyof typeof APPLE_PAGE_COPY]||{
    eyebrow:`${COLLECTION_LABELS[category].toUpperCase()} / SOURCED SEARCH`,
    title:`${COLLECTION_LABELS[category]} artwork.`,
    description:`Search ${COLLECTION_LABELS[category]} with the connected catalog sources for this category.`,
    placeholder:`${COLLECTION_LABELS[category]} title or creator…`,
    source:'TITLE RECORDS',
    empty:`Try another title, an alternate spelling, or a different available source.`,
  };
  const controls=<form className="search-bar" onSubmit={onSubmit}><Search size={21}/><input ref={inputRef} aria-label={`${tr('Search')} ${tr(COLLECTION_LABELS[category])}`} value={query} onChange={event=>onQueryChange(event.target.value)} placeholder={tr(copy.placeholder)}/><Button type="submit" disabled={loading}>{loading?tr('Searching…'):tr('Search')} <ArrowRight size={16}/></Button></form>;
  const info=isAppleCollection(category)?'Images keep their original catalog or provider link. Dimensions and file size are measured from the actual downloaded file.':'Searches stay inside this category. Results keep the chosen service and original image source attached.';
  return <section className="content-width search-content music-page catalog-category-page"><button className="back-to-collections" onClick={onBack}><ArrowRight size={15}/> {tr(backLabel)}</button><div className="listing-header"><div className="tiny-kicker">{tr(copy.eyebrow)}</div><h1>{tr(copy.title)}</h1><p>{tr(copy.description)}</p></div><div className={`category-search-controls${isAppleCollection(category)?' has-storefront':''}`}>{controls}{sources.length>1&&<label className="apple-filter"><span>Source</span><span className="category-filter-select"><select aria-label={`Search source for ${COLLECTION_LABELS[category]}`} value={source} onChange={event=>onSourceChange(event.target.value)}>{sources.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select><ChevronDown size={15} aria-hidden="true" focusable="false"/></span></label>}{isAppleCollection(category)&&<StorefrontControl value={storefront} onChange={onStorefrontChange}/>}</div><p className="music-search-tip">{tr(info)}</p><div className="results-head" aria-live="polite" aria-atomic="true"><span>{searched?`${results.length} ${tr('ITEMS FOUND')}`:tr('READY TO SEARCH')}</span><span>{isAppleCollection(category)?`${tr(sourceLabel.toUpperCase())} · ${tr(copy.source)}`:tr(sourceLabel.toUpperCase())}</span></div>{warnings.length>0&&<div className="search-warning" role="status" aria-live="polite" aria-atomic="true"><Info size={17}/><span>{warnings.map(warning=>tr(readableSearchWarning(warning,category))).join(' · ')}</span></div>}{loading&&(!hasPartialResults||results.length===0)?<SearchSkeletons gallery={gallery} count={8} query={query} category={category}/>:results.length>0?<div className={'gallery gallery-'+gallery}>{results.map(item=><ArtworkCard key={item.id} item={item} onOpen={onOpen} isSaved={favoriteIds.has(item.id)} onFavorite={onFavorite}/>)}</div>:<div className="music-empty"><span>{tr(searched?'NO MATCHES':'READY WHEN YOU ARE')}</span><p>{searched?(warnings.length?'Some sources returned an error. Try again or choose another service.':tr(copy.empty)):tr(`Search ${COLLECTION_LABELS[category]} by title, creator, or source link.`)}</p>{searched&&source!=='all'&&<Button type="button" variant="outline" onClick={()=>onSourceChange('all')}>{tr('Search all sources')} <ArrowRight size={15}/></Button>}</div>}</section>;
}
export default function App(){
  const [page,setPage]=useState<Page>(()=>getInitialRoute().page),[query,setQuery]=useState(()=>getInitialRoute().query),[category,setCategory]=useState<Category>(()=>getInitialRoute().category),[results,setResults]=useState<Artwork[]>([]),[warnings,setWarnings]=useState<string[]>([]),[loading,setLoading]=useState(false),[hasPartialResults,setHasPartialResults]=useState(false),[searched,setSearched]=useState(false);
  const [selectedManga,setSelectedManga]=useState<Artwork|null>(()=>getInitialRoute().mangaSelection);
  const [musicMode,setMusicMode]=useState<MusicMode>(()=>getInitialRoute().musicMode),[storefront,setStorefront]=useState<AppleStorefront>(()=>getInitialRoute().country),[source,setSource]=useState(()=>getInitialRoute().source);
  const [activeId,setId]=useState(getActiveId),[modalOpen,setModalOpen]=useState(false),[art,setArt]=useState<Artwork|null>(null),[wallpaperArt,setWallpaperArt]=useState<Artwork|null>(null),[prepareMode,setPrepareMode]=useState<'artwork'|'wallpaper'>('wallpaper'),[compareBase,setCompareBase]=useState<Artwork|null>(null),[comparePair,setComparePair]=useState<Artwork|null>(null);
  const [syncUiState,setSyncUiState]=useState<SyncUiState>({profileId:'',status:'idle'});
  const mangaReturnRoute=useRef<{page:'trends'|'search';category:Category;query:string;source:string}|null>(null);
  const [motionLookup,setMotionLookup]=useState<Record<string,MotionLookupState>>({});
  const [notice,setNotice]=useState('');
  const [activeFavoriteFolder,setActiveFavoriteFolder]=useState('all'),[newFolderName,setNewFolderName]=useState(''),[renameFolderName,setRenameFolderName]=useState('');
  const [archiveSelectMode,setArchiveSelectMode]=useState(false),[selectedArtworkIds,setSelectedArtworkIds]=useState<Set<string>>(()=>new Set()),[batchFormat,setBatchFormat]=useState<'original'|'png'|'jpeg'|'webp'>('original'),[batchBusy,setBatchBusy]=useState(false);
  const input=useRef<HTMLInputElement>(null),currentReq=useRef<AbortController|null>(null);
  const preferenceQueue=useRef<Promise<void>>(Promise.resolve());
  const profile=useLiveQuery(async()=> (await db.profiles.get(activeId)) || (activeId==='guest'?getInitialProfile():getInitialProfile()),[activeId])||getInitialProfile();
  const favorites=useLiveQuery(()=>db.favorites.where('profileId').equals(activeId).toArray(),[activeId])||[];
  const favoriteFolders=useLiveQuery(()=>db.favoriteFolders.where('profileId').equals(activeId).toArray(),[activeId])||[];
  const favoriteIds=useMemo(()=>new Set(favorites.filter(f=>!f.deleted&&isCurrentProductArtwork(f.artwork)).map(f=>f.artwork.id)),[favorites]);
  const activeFolders=favoriteFolders.filter(folder=>!folder.deleted).sort((a,b)=>a.name.localeCompare(b.name));
  const activeFavorites=favorites.filter(favorite=>!favorite.deleted&&isCurrentProductArtwork(favorite.artwork));
  const preferences=profile.preferences||DEFAULT_PREFERENCES;
  const locale:Locale=preferences.uiLocale||'id',tr=(value:string)=>translate(locale,value);
  useEffect(()=>{db.profiles.get('guest').then(p=>{if(!p)db.profiles.add(getInitialProfile()).catch(()=>{});});},[]);
  useEffect(()=>{const root=document.documentElement;root.dataset.theme=preferences.theme;root.dataset.accent=preferences.accent||'vermilion';root.dataset.oled=preferences.theme==='dark'&&preferences.oled?'true':'false';const themeColor=document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');if(themeColor)themeColor.content=preferences.theme==='dark'?(preferences.oled?'#000000':'#11121a'):'#f4f6fb';},[preferences.theme,preferences.accent,preferences.oled]);
  useEffect(()=>{document.documentElement.lang=locale;},[locale]);
  useEffect(()=>{setActiveFavoriteFolder('all');},[activeId]);
  useEffect(()=>{
    let lastSuccess:number|undefined;
    try{const value=localStorage.getItem(`rupa:sync-last-success:${profile.id}`);if(value&&Number.isFinite(Number(value)))lastSuccess=Number(value);}catch{}
    setSyncUiState({profileId:profile.id,status:'idle',lastSuccess});
  },[profile.id]);
  useEffect(()=>{const handler=()=>setId(getActiveId());window.addEventListener('ca-profile-change',handler);return()=>window.removeEventListener('ca-profile-change',handler);},[]);
  useEffect(()=>{
    const restoreRoute=()=>{
      const route=getInitialRoute();
      currentReq.current?.abort();
      setLoading(false);setResults([]);setWarnings([]);setHasPartialResults(false);setSearched(false);setMotionLookup({});
      setPage(route.page);setCategory(route.category);setMusicMode(route.musicMode);setStorefront(route.country);setSource(route.source);setQuery(route.page==='search'||route.page==='games'?route.query:'');
      setSelectedManga(route.mangaSelection);
      if(route.page==='search'&&isSearchableCollection(route.category)&&route.query.trim().length>=2){
        void runSearch(route.query,route.category,route.musicMode,route.country,route.source,'none');
      }
    };
    window.addEventListener('popstate',restoreRoute);
    return()=>window.removeEventListener('popstate',restoreRoute);
  },[]);
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search),view=params.get('view');
    if(view!=='catalog'&&view!=='sources')return;
    const route=getInitialRoute(),url=new URL(window.location.href);
    url.search='';
    if(route.page==='search'){
      url.searchParams.set('view','search');url.searchParams.set('category',route.category);url.searchParams.set('q',route.query);
      url.searchParams.set('country',route.country);url.searchParams.set('source',route.source);
      if(route.category==='music')url.searchParams.set('asset',route.musicMode);
    }else if(route.page==='games'){
      url.searchParams.set('view','games');
      const platform=params.get('platform');if(platform)url.searchParams.set('platform',platform);
      const query=params.get('q');if(query)url.searchParams.set('q',query);
    }else url.searchParams.set('view','tools');
    window.history.replaceState(null,'',url);
  },[]);
  // Foreground-only best-effort sync: startup, reconnect, visibility, and every two minutes.
  // Browser tab closure may interrupt the operation; sync is never represented as a background daemon.
  useEffect(()=>{
    if(!hasBackend||!profile.syncCode)return;
    let inFlight=false,stopped=false,lastSync=0;
    const doSync=async()=>{
      if(stopped||inFlight||document.visibilityState!=='visible'||!navigator.onLine||Date.now()-lastSync<25000)return;
      inFlight=true;lastSync=Date.now();
      setSyncUiState(current=>({profileId:profile.id,status:'syncing',lastSuccess:current.profileId===profile.id?current.lastSuccess:undefined}));
      try{
        await syncProfile(profile);
        const lastSuccess=Date.now();
        try{localStorage.setItem(`rupa:sync-last-success:${profile.id}`,String(lastSuccess));}catch{}
        setSyncUiState({profileId:profile.id,status:'success',lastSuccess});
      }catch(error){
        setSyncUiState(current=>({profileId:profile.id,status:'error',lastSuccess:current.profileId===profile.id?current.lastSuccess:undefined,error:error instanceof Error?error.message:'Sync failed'}));
      }
      finally{inFlight=false;}
    };
    void doSync();
    const onReconnect=()=>{void doSync();};
    const tick=setInterval(()=>{void doSync();},120000);
    window.addEventListener('online',onReconnect);
    document.addEventListener('visibilitychange',onReconnect);
    return()=>{stopped=true;clearInterval(tick);window.removeEventListener('online',onReconnect);document.removeEventListener('visibilitychange',onReconnect);};
  },[profile.id,profile.syncCode]);

  useEffect(()=>{const initial=getInitialRoute();if(initial.page==='search'&&isSearchableCollection(initial.category)&&initial.query.trim().length>=2)void runSearch(initial.query,initial.category,initial.musicMode,initial.country,initial.source,'none');},[]);
  useEffect(()=>{const handler=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();navTo('discover');}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[]);
  useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),4500);return()=>clearTimeout(t);},[notice]);
  async function checkMotion(item:Artwork,force=false){
    if(item.category!=='music'||item.kind==='artist-image'||!['Apple Music','Apple Music API'].includes(item.provider||item.source))return;
    const state=motionLookup[item.id];if(!force&&state&&state.status!=='error')return;
    setMotionLookup(current=>({...current,[item.id]:{status:'checking'}}));
    try{const artwork=await getAppleMotionArtwork(item);setMotionLookup(current=>({...current,[item.id]:artwork?{status:'available',artwork}:{status:'none'}}));}
    catch{setMotionLookup(current=>({...current,[item.id]:{status:'error'}}));}
  }
  async function syncNow(){
    setSyncUiState(current=>({profileId:profile.id,status:'syncing',lastSuccess:current.profileId===profile.id?current.lastSuccess:undefined}));
    try{
      await syncProfile(profile);
      const lastSuccess=Date.now();
      try{localStorage.setItem(`rupa:sync-last-success:${profile.id}`,String(lastSuccess));}catch{}
      setSyncUiState({profileId:profile.id,status:'success',lastSuccess});
      setNotice('Sync completed');
    }catch(error){
      setSyncUiState(current=>({profileId:profile.id,status:'error',lastSuccess:current.profileId===profile.id?current.lastSuccess:undefined,error:error instanceof Error?error.message:'Sync failed'}));
      throw error;
    }
  }
  async function runSearch(q:string=query,c:Category=category,mode:MusicMode=musicMode,country:AppleStorefront=storefront,selectedSource:string=source,historyMode:'push'|'replace'|'none'='push'){
    if(!isSearchableCollection(c)||c==='games'){setNotice('Choose a searchable category first.');return;}
    if(q.trim().length<2){setNotice('Type at least 2 characters to search');return;}
    if(mode==='artists'&&c==='music')selectedSource='apple';
    else if(!getSourceOptions(c).some(option=>option.id===selectedSource))selectedSource='all';
    currentReq.current?.abort();
    const controller=new AbortController();currentReq.current=controller;
    let timedOut=false;
    const timeoutId=window.setTimeout(()=>{timedOut=true;controller.abort();},20_000);
    setPage('search');setSelectedManga(null);setQuery(q.trim());setCategory(c);setMusicMode(mode);setStorefront(country);setSource(selectedSource);setLoading(true);setHasPartialResults(false);setResults([]);setMotionLookup({});setSearched(true);setWarnings([]);
    const url=new URL(window.location.href);for(const key of ['manga','manga_title','manga_provider','manga_source'])url.searchParams.delete(key);url.searchParams.set('view','search');url.searchParams.set('q',q.trim());url.searchParams.set('category',c);url.searchParams.set('country',country);url.searchParams.set('source',selectedSource);if(c==='music')url.searchParams.set('asset',mode);else url.searchParams.delete('asset');if(historyMode==='push')window.history.pushState(null,'',url);else if(historyMode==='replace')window.history.replaceState(null,'',url);
    try{
      if(c==='music'&&mode==='artists'){
        const artistResults=await searchMusicArtists(q.trim(),controller.signal,country);
        if(!controller.signal.aborted)setResults(artistResults);
      }else{
        const data=await searchArtwork(q.trim(),c,controller.signal,partial=>{if(controller.signal.aborted)return;setHasPartialResults(true);setResults(partial.results);setWarnings([...partial.warnings,...partial.unavailable]);},country,selectedSource);
        if(!controller.signal.aborted){setResults(data.results);setWarnings([...data.warnings,...data.unavailable]);}
      }
    }catch(e){
      if(timedOut)setWarnings(current=>[...current,'Search took too long. Try again or choose a different storefront.']);
      else if(!controller.signal.aborted){setResults([]);setWarnings([e instanceof Error?e.message:'Could not search']);}
    }finally{
      window.clearTimeout(timeoutId);
      if(currentReq.current===controller)setLoading(false);
    }
  }  function chooseMusicMode(mode:MusicMode){
    currentReq.current?.abort();setLoading(false);setQuery('');setResults([]);setWarnings([]);setHasPartialResults(false);setSearched(false);setMusicMode(mode);setSource('all');setMotionLookup({});
    const url=new URL(window.location.href);url.searchParams.set('view','search');url.searchParams.set('category','music');url.searchParams.set('asset',mode);url.searchParams.set('source','all');url.searchParams.delete('q');window.history.pushState(null,'',url);
    requestAnimationFrame(()=>input.current?.focus());
  }
async function favorite(a:Artwork){try{const removing=favoriteIds.has(a.id);await toggleFavorite(activeId,a);if(removing)setSelectedArtworkIds(current=>{if(!current.has(a.id))return current;const next=new Set(current);next.delete(a.id);return next;});}catch{setNotice('Could not save artwork');}}
  async function makeFavoriteFolder(event:FormEvent<HTMLFormElement>){event.preventDefault();try{const folder=await createFavoriteFolder(activeId,newFolderName);setNewFolderName('');setActiveFavoriteFolder('all');setNotice(`Folder “${folder.name}” created`);}catch(error){setNotice(error instanceof Error?error.message:'Could not create folder');}}
  async function moveArtworkToFolder(artwork:Artwork,folderId?:string){try{await moveFavoriteToFolder(`${activeId}:${artwork.id}`,folderId);}catch(error){setNotice(error instanceof Error?error.message:'Could not move favorite');}}
  async function saveFolderRename(event:FormEvent<HTMLFormElement>){event.preventDefault();try{await renameFavoriteFolder(activeFavoriteFolder,renameFolderName);setRenameFolderName('');setNotice('Folder renamed');}catch(error){setNotice(error instanceof Error?error.message:'Could not rename folder');}}
  async function removeFavoriteFolder(){const folder=activeFolders.find(item=>item.id===activeFavoriteFolder);if(!folder||!window.confirm(`Delete “${folder.name}”? Its favorites will move to Unsorted.`))return;try{await deleteFavoriteFolder(folder.id);setActiveFavoriteFolder('all');setNotice('Folder deleted; favorites were kept.');}catch{setNotice('Could not delete folder');}}
  function compareSelect(a:Artwork){if(compareBase&&compareBase.id!==a.id){setComparePair(a);setArt(null);return;}setCompareBase(a);setNotice('First artwork selected. Open another artwork and press Compare.');}
  const display=page==='archive'?activeFavorites.filter(favorite=>activeFavoriteFolder==='all'||(activeFavoriteFolder==='unsorted'?!favorite.folderId:favorite.folderId===activeFavoriteFolder)).map(favorite=>favorite.artwork):results;
  const selectedDisplayCount=display.reduce((count,item)=>count+(selectedArtworkIds.has(item.id)?1:0),0);
  useEffect(()=>{setSelectedArtworkIds(new Set());},[activeId,activeFavoriteFolder]);
  function toggleArchiveSelection(id:string){setSelectedArtworkIds(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next;});}
  async function exportSelectedArchive(){
    const chosen=display.filter(item=>selectedArtworkIds.has(item.id));
    if(!chosen.length){setNotice('Select at least one saved image.');return;}
    if(chosen.length>25){setNotice('Batch export is limited to 25 images at a time.');return;}
    setBatchBusy(true);const entries:{name:string;data:Uint8Array}[]=[],names=new Set<string>(),failures:string[]=[];let totalBytes=0;
    try{
      for(const item of chosen){
        try{
          const source=item.downloadUrl||item.imageUrl||item.previewUrl;if(!source)throw new Error('No image URL');
          const parsed=new URL(source,window.location.href),requestUrl=parsed.origin===window.location.origin?parsed.href:downloadLink({...item,downloadUrl:parsed.href,imageUrl:parsed.href});
          const response=await fetch(requestUrl,{signal:AbortSignal.timeout(20_000)});if(!response.ok)throw new Error(`HTTP ${response.status}`);
          const raw=await readImageResponse(response,15*1024*1024);if(!raw.size)throw new Error('Empty file');
          const output=await convertImageBlob(raw,batchFormat);if(totalBytes+output.blob.size>40*1024*1024)throw new Error('Batch reached 40 MB');
          const stem=(safeFileName(`${item.title} ${item.subtitle}`)||`artwork-${entries.length+1}`).slice(0,100);let name=`${stem}${output.extension}`,index=2;
          while(names.has(name.toLocaleLowerCase()))name=`${stem}-${index++}${output.extension}`;
          names.add(name.toLocaleLowerCase());entries.push({name,data:new Uint8Array(await output.blob.arrayBuffer())});totalBytes+=output.blob.size;
        }catch(error){failures.push(`${item.title}: ${error instanceof Error?error.message:'download failed'}`);}
      }
      if(!entries.length){setNotice(`No files could be exported. ${failures.slice(0,2).join(' · ')}`);return;}
      const archive=new Blob([createZip(entries)],{type:'application/zip'}),url=URL.createObjectURL(archive),anchor=document.createElement('a');anchor.href=url;anchor.download=`rupa-saved-${new Date().toISOString().slice(0,10)}.zip`;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),30_000);
      setNotice(`${entries.length} images added to ZIP${failures.length?` · ${failures.length} skipped`:''}.`);
    }catch(error){setNotice(error instanceof Error?error.message:'Could not create the batch archive.');}
    finally{setBatchBusy(false);}
  }
  function resetCompare(){setCompareBase(null);setComparePair(null);}
  async function pref(p:Partial<Preferences>){
    const profileId=activeId;
    const operation=preferenceQueue.current.then(async()=>{const actual=await db.profiles.get(profileId);if(actual)await updatePreferences(actual,p);});
    preferenceQueue.current=operation.catch(()=>{});
    try{await operation;}catch{setNotice('Could not save preferences');}
  }
  function navTo(p:Page){currentReq.current?.abort();setLoading(false);setSelectedManga(null);setPage(p);if(p==='discover'){setCategory('all');setQuery('');setResults([]);setWarnings([]);setSearched(false);}else if(p==='search'){setCategory('all');setQuery('');}else if(p==='games'||p==='tools'){setQuery('');setResults([]);setWarnings([]);setSearched(false);}const url=new URL(window.location.href);if(p==='discover'){url.search='';}else{url.searchParams.set('view',p);for(const key of ['manga','manga_title','manga_provider','manga_source'])url.searchParams.delete(key);if(p!=='search'){url.searchParams.delete('q');url.searchParams.delete('asset');url.searchParams.delete('source');url.searchParams.delete('platform');if(p==='trends'&&(isAppleCollection(category)||category==='anime'||category==='manga'))url.searchParams.set('category',category);else url.searchParams.delete('category');}}window.history.pushState(null,'',url);window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
  function openGames(platform?:string,term=''){
    currentReq.current?.abort();setLoading(false);setPage('games');setQuery(term);setResults([]);setWarnings([]);setSearched(false);
    const url=new URL(window.location.href);url.search='';url.searchParams.set('view','games');if(platform&&platform!=='all')url.searchParams.set('platform',platform);if(term.trim())url.searchParams.set('q',term.trim());window.history.pushState(null,'',url);window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  }
  function openCategory(next:BrowseCategory){
    if(next==='games'){openGames();return;}
    currentReq.current?.abort();setLoading(false);setPage('trends');setCategory(next);setSource('all');setQuery('');setResults([]);setWarnings([]);setSearched(false);
    const url=new URL(window.location.href);url.search='';url.searchParams.set('view','trends');url.searchParams.set('category',next);window.history.pushState(null,'',url);window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  }
  function searchCategoryTitle(title:string,type:'anime'|'manga'='anime',selectedSource='all'){void runSearch(title,type,'albums',storefront,selectedSource);}
  function openMangaDetail(item:Artwork){
    mangaReturnRoute.current={page:page==='trends'?'trends':'search',category,query,source};
    setSelectedManga(item);setCategory('manga');setPage('search');
    const url=new URL(window.location.href);url.searchParams.set('view','search');url.searchParams.set('category','manga');url.searchParams.set('manga',item.id);url.searchParams.set('manga_title',item.title);url.searchParams.set('manga_provider',item.provider||item.source||'MangaDex');url.searchParams.set('manga_source',item.sourceUrl||'https://mangadex.org/');
    window.history.pushState(null,'',url);window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  }
  function closeMangaDetail(){
    setSelectedManga(null);
    const previous=mangaReturnRoute.current;mangaReturnRoute.current=null;
    const url=new URL(window.location.href);
    for(const key of ['manga','manga_title','manga_provider','manga_source'])url.searchParams.delete(key);
    if(previous){
      setPage(previous.page);setCategory(previous.category);setQuery(previous.query);setSource(previous.source);
      url.search='';url.searchParams.set('view',previous.page);url.searchParams.set('category',previous.category);
      if(previous.query)url.searchParams.set('q',previous.query);
      if(previous.source!=='all')url.searchParams.set('source',previous.source);
    }
    window.history.replaceState(null,'',url);
    window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  }
  function goToCollections(){
    const scroll=()=>document.getElementById('collections')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
    if(page==='discover')scroll();
    else{navTo('discover');window.requestAnimationFrame(()=>window.requestAnimationFrame(scroll));}
  }
  return <LocaleProvider locale={locale}><div className="app-root">
    <a className="skip-link" href="#main-content">{tr('Skip to artwork')}</a>
    <div className="top-rule"/>
    <header className="site-header"><div className="header-inner"><button className="brand" onClick={()=>navTo('discover')} aria-label={tr('Rupa home')}><BrandMark/><span>Rupa</span></button><nav className="desktop-nav" aria-label={tr("Main navigation")}><button className={page==='discover'?'active':''} onClick={()=>navTo('discover')}>{tr('Home')}</button><button className={['tools','trends','search','games'].includes(page)?'active':''} onClick={()=>navTo('tools')}>{tr('Categories')}</button><button className={page==='ghibli'||page==='shinkai'?'active':''} onClick={goToCollections}>{tr('Collections')}</button><button className={page==='archive'?'active':''} onClick={()=>navTo('archive')}>{tr('Saved')}</button></nav><div className="header-actions"><button className="icon-action" aria-label="Change theme" title={tr("Toggle light/dark mode")} onClick={()=>pref({theme:preferences.theme==='light'?'dark':'light'})}>{preferences.theme==='light'?<Moon size={18}/>:<Sun size={18}/>}</button><button className="profile-control" aria-label={tr("Profile & settings")} onClick={()=>setModalOpen(true)}><UserRound size={16}/><span>{profile.name}</span><ChevronDown size={14}/></button></div></div></header>
    <main id="main-content">
      {page==='tools'&&<CategoryDirectory onSelect={openCategory} preferences={preferences} onPreferencesChange={value=>void pref(value)}/>}
      {page==='discover'&&<CollectionChooser onOpenCategory={openCategory} onOpenGhibli={()=>navTo('ghibli')} onOpenShinkai={()=>navTo('shinkai')} preferences={preferences} onPreferencesChange={value=>void pref(value)}/>}
      {page==='trends'&&<AppleTrendTool key={category} initialCategory={isAppleCollection(category)||category==='anime'||category==='manga'?category:'music'} storefront={storefront} onStorefrontChange={setStorefront} onSearch={(c,q,provider)=>{const requested=provider==='listenbrainz'?'musicbrainz-caa':provider;const selected=getSourceOptions(c).some(option=>option.id===requested)?requested:'all';void runSearch(q,c,'albums',storefront,selected);}} onOpen={category==='manga'?openMangaDetail:setArt} onFavorite={favorite} favoriteIds={favoriteIds}/>}
      {page==='ghibli'&&<GhibliCollection favoriteIds={favoriteIds} onFavorite={favorite} onOpen={setArt} onBack={()=>navTo('discover')}/>}
      {page==='shinkai'&&<ShinkaiCollection onBrowseAnime={title=>searchCategoryTitle(title,'anime','all')} onBack={()=>navTo('discover')} favoriteIds={favoriteIds} onFavorite={favorite} onOpen={setArt}/>}
      {page==='games'&&<Suspense fallback={<div className="content-width game-finder-empty" role="status">Opening the game index…</div>}><GameCoverFinder initialQuery={query} favoriteIds={favoriteIds} onFavorite={favorite} onOpen={setArt} onBack={()=>navTo('discover')}/></Suspense>}
      {page==='search'&&category==='manga'&&selectedManga&&<MangaDetailPage series={selectedManga} favoriteIds={favoriteIds} onFavorite={favorite} onOpen={setArt} onBack={closeMangaDetail}/>}
      {page==='search'&&category==='music'&&<section className="content-width search-content music-page"><button className="back-to-collections" onClick={()=>navTo('trends')}><ArrowRight size={15}/>{tr('Back to Trends')}</button><div className="listing-header"><div className="tiny-kicker">MUSIC / ALBUM & ARTIST IMAGES</div><h1>{tr(musicMode==='albums'?'Album artwork.':'Artist images.')}</h1><p>{tr(musicMode==='albums'?'Search Apple Music for album and artist artwork, then inspect file details.':'Find Apple Music artist photos by name or artist URL.')}</p></div><div className="music-mode-switch" role="radiogroup" aria-label={tr("Music image type")}><label className={musicMode==='albums'?'active':''}><input type="radio" name="music-image-type" value="albums" checked={musicMode==='albums'} onChange={()=>chooseMusicMode('albums')}/><span>{tr('Album covers')}</span></label><label className={musicMode==='artists'?'active':''}><input type="radio" name="music-image-type" value="artists" checked={musicMode==='artists'} onChange={()=>chooseMusicMode('artists')}/><span>{tr('Artist images')}</span></label></div>{musicMode==='albums'&&<div className="music-source-select"><label className="apple-filter"><span>Source</span><select aria-label="Music search source" value={source} onChange={event=>{const selected=event.target.value;setSource(selected);if(query.trim().length>=2)void runSearch(query,'music','albums',storefront,selected);}}>{getSourceOptions('music').map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select></label></div>}<div className={`category-search-controls music-search-controls${musicMode==='artists'?' has-storefront':''}`}><div id="music-search-panel"><form className="search-bar" onSubmit={event=>{event.preventDefault();void runSearch();}}><Search size={21}/><input aria-label={tr(musicMode==='albums'?'Search album artwork':'Search Apple Music artist images')} ref={input} value={query} onChange={event=>setQuery(event.target.value)} placeholder={tr(musicMode==='albums'?'Album, artist, or source URL…':'Artist name or Apple Music artist URL…')}/><Button type="submit" disabled={loading}>{loading?tr('Searching…'):tr('Search')} <ArrowRight size={16}/></Button></form></div><StorefrontControl value={storefront} onChange={country=>{setStorefront(country);if(query.trim().length>=2)void runSearch(query,'music',musicMode,country,source);}}/></div><p className="music-search-tip">{musicMode==='albums'?'Apple Music album art can include motion; exported dimensions and format are measured from the downloaded file.':'Artist photos are sourced from Apple Music.'}</p><div className="results-head" aria-live="polite" aria-atomic="true"><span>{searched?`${results.length} ${tr(musicMode==='albums'?'ALBUMS FOUND':'ARTIST IMAGES FOUND')}`:tr('MUSIC CATALOG')}</span><span>{musicMode==='artists'?'APPLE MUSIC · ARTISTS':'APPLE MUSIC · ALBUM ART'}</span></div>{warnings.length>0&&<div className="search-warning" role="status" aria-live="polite" aria-atomic="true"><Info size={17}/><span>{warnings.map(warning=>tr(readableSearchWarning(warning,category))).join(' · ')}</span></div>}{loading&&(!hasPartialResults||results.length===0)?<SearchSkeletons gallery={preferences.gallery} count={8} query={query} category="music"/>:results.length>0?<div className={'gallery gallery-'+preferences.gallery}>{results.map(a=><ArtworkCard key={a.id} item={a} onOpen={setArt} isSaved={favoriteIds.has(a.id)} onFavorite={favorite} motion={motionLookup[a.id]} onCheckMotion={checkMotion}/>)}</div>:<div className="music-empty"><span>{tr(searched?'NO MATCHES':'READY WHEN YOU ARE')}</span><p>{searched?(warnings.length?'Some music sources returned an error. Switch source or retry.':tr('Try a different album, artist, or URL.')):tr(musicMode==='albums'?'Search by album, artist name, or a provider link.':'Search an artist name or paste an Apple Music artist link.')}</p></div>}</section>}
      {page==='search'&&isSearchableCollection(category)&&category!=='music'&&category!=='games'&&!(category==='manga'&&selectedManga)&&<SearchableCollectionPage category={category as SearchableCategory} query={query} onQueryChange={setQuery} onSubmit={event=>{event.preventDefault();void runSearch(query,category,musicMode,storefront,source);}} storefront={storefront} onStorefrontChange={country=>{setStorefront(country);if(query.trim().length>=2)void runSearch(query,category,musicMode,country,source);}} source={source} onSourceChange={selected=>{setSource(selected);if(query.trim().length>=2)void runSearch(query,category,musicMode,storefront,selected);}} loading={loading} searched={searched} results={results} warnings={warnings} hasPartialResults={hasPartialResults} gallery={preferences.gallery} favoriteIds={favoriteIds} onFavorite={favorite} onOpen={category==='manga'?openMangaDetail:setArt} onBack={()=>isAppleCollection(category)||category==='anime'||category==='manga'?navTo('trends'):navTo('tools')} inputRef={input}/>}
      {page==='search'&&category!=='all'&&!isSearchableCollection(category)&&<section className="content-width coming-soon-page"><button className="back-to-collections" onClick={()=>navTo('discover')}><ArrowRight size={15}/>{tr('All collections')}</button><div className="tiny-kicker">{tr('COLLECTION / IN PREPARATION')}</div><h1>{COLLECTION_LABELS[category as Exclude<Category,'all'>]}<br/><em>{tr('coming soon.')}</em></h1><p>{tr('This collection is being indexed. More image sources and catalog records will be added.')}</p></section>}
      {page==='archive'&&<section className="content-width search-content favorites-page"><div className="listing-header"><div className="tiny-kicker">YOUR VISUAL LIBRARY</div><h1>Saved.</h1><p>Keep the images you find, add context, and export one item or a batch from the same archive.</p></div><div className="favorite-folder-bar"><div className="favorite-folder-list"><button type="button" className={activeFavoriteFolder==='all'?'active':''} onClick={()=>setActiveFavoriteFolder('all')}>All saved <span>{activeFavorites.length}</span></button><button type="button" className={activeFavoriteFolder==='unsorted'?'active':''} onClick={()=>setActiveFavoriteFolder('unsorted')}>Unsorted <span>{activeFavorites.filter(favorite=>!favorite.folderId).length}</span></button>{activeFolders.map(folder=><button type="button" key={folder.id} className={activeFavoriteFolder===folder.id?'active':''} onClick={()=>{setActiveFavoriteFolder(folder.id);setRenameFolderName(folder.name);}}><FolderHeart size={15}/>{folder.name}<span>{activeFavorites.filter(favorite=>favorite.folderId===folder.id).length}</span></button>)}</div><form className="favorite-folder-create" onSubmit={makeFavoriteFolder}><input value={newFolderName} onChange={event=>setNewFolderName(event.target.value)} aria-label="New saved folder name" placeholder="Create a folder" maxLength={40}/><Button type="submit" disabled={!newFolderName.trim()}><Plus size={15}/> Add folder</Button></form>{activeFavoriteFolder!=='all'&&activeFavoriteFolder!=='unsorted'&&<form className="favorite-folder-edit" onSubmit={saveFolderRename}><input value={renameFolderName} onChange={e=>setRenameFolderName(e.target.value)} aria-label="Rename selected folder" maxLength={40}/><Button variant="outline" type="submit" disabled={!renameFolderName.trim()}>Rename</Button><Button variant="ghost" type="button" onClick={()=>void removeFavoriteFolder()}>Delete folder</Button></form>}</div><div className="archive-batch-toolbar"><button type="button" className={`archive-select-toggle${archiveSelectMode?' active':''}`} onClick={()=>{setArchiveSelectMode(value=>!value);if(archiveSelectMode)setSelectedArtworkIds(new Set());}}>{archiveSelectMode?'Done selecting':'Select items'}</button>{archiveSelectMode&&<><button type="button" onClick={()=>setSelectedArtworkIds(selectedDisplayCount===display.length?new Set():new Set(display.map(item=>item.id)))}>{selectedDisplayCount===display.length&&display.length?'Clear selection':'Select all shown'}</button><label><span>Export format</span><select value={batchFormat} onChange={event=>setBatchFormat(event.target.value as typeof batchFormat)}><option value="original">Original</option><option value="png">PNG</option><option value="jpeg">JPEG</option><option value="webp">WebP</option></select></label><Button onClick={()=>void exportSelectedArchive()} disabled={!selectedDisplayCount||batchBusy}><Download size={15}/>{batchBusy?'Building ZIP…':`Download ZIP · ${selectedDisplayCount}`}</Button></>}<small>Batch limit: 25 images · 40 MB total</small></div><div className="results-head" aria-live="polite" aria-atomic="true"><span>{display.length} SAVED ITEMS</span><span>{activeFavoriteFolder==='all'?'ALL SAVED':activeFavoriteFolder==='unsorted'?'UNSORTED':activeFolders.find(folder=>folder.id===activeFavoriteFolder)?.name.toUpperCase()}</span></div>{display.length>0?<div className={'gallery gallery-'+preferences.gallery}>{display.map(artwork=>{const row=activeFavorites.find(favorite=>favorite.artwork.id===artwork.id);return <ArtworkCard key={artwork.id} item={artwork} onOpen={setArt} isSaved={favoriteIds.has(artwork.id)} onFavorite={favorite} motion={motionLookup[artwork.id]} onCheckMotion={checkMotion} folderOptions={activeFolders} folderId={row?.folderId} onMoveFolder={moveArtworkToFolder} onToggleSelection={archiveSelectMode?toggleArchiveSelection:undefined} selected={selectedArtworkIds.has(artwork.id)}/>;})}</div>:<div className="empty-state"><Aperture size={32} strokeWidth={1}/><h2>{activeFavoriteFolder==='all'?'Nothing saved yet.':activeFavoriteFolder==='unsorted'?'No unsorted favorites.':'This folder is empty.'}</h2><p>Save an image from a tool or curated collection, then organize it here.</p><Button variant="outline" onClick={()=>navTo('discover')}>Browse artwork <ArrowRight size={16}/></Button></div>}</section>}
    </main>
    <footer className="site-footer"><div className="content-width foot-inner"><div><span className="foot-brand"><BrandMark size={26} className="brand-mark-footer"/> RUPA.</span><p>{tr('An independent space for visual culture.')}<br/>{tr('Sources stay attached to the images.')}</p></div><div className="foot-owner"><span>MADE BY</span><strong>Bobby Fajar Christian</strong><a className="foot-contact" href="mailto:kikuluc@gmail.com?subject=Rupa%20request%20or%20report">Request or report by email <ArrowUpRight size={13}/></a><nav className="foot-socials" aria-label="Bobby Fajar Christian links"><a href="https://bobbyfajarc.github.io/" target="_blank" rel="noreferrer">Portfolio <ArrowUpRight size={12}/></a><a href="https://instagram.com/bobby.fch" target="_blank" rel="noreferrer">Instagram <ArrowUpRight size={12}/></a><a href="https://www.linkedin.com/in/bobbyfajarc/" target="_blank" rel="noreferrer">LinkedIn <ArrowUpRight size={12}/></a><a href="https://linktr.ee/limaraya" target="_blank" rel="noreferrer">Limaraya <ArrowUpRight size={12}/></a></nav></div><div className="foot-end">© 2026 RUPA <span>{tr('INDEPENDENT VISUAL ARCHIVE')}</span></div></div></footer>
    <nav className="mobile-nav" aria-label={tr("Mobile navigation")}><button className={page==='discover'?'current':''} onClick={()=>navTo('discover')}><Home size={19}/>{tr('Home')}</button><button className={page==='tools'||page==='trends'||page==='search'||page==='games'?'current':''} onClick={()=>navTo('tools')}><Aperture size={19}/>{tr('Categories')}</button><button className={page==='archive'?'current':''} onClick={()=>navTo('archive')}><Heart size={19}/>{tr('Saved')}</button><button className={modalOpen?'current':''} aria-haspopup="dialog" aria-expanded={modalOpen} onClick={()=>setModalOpen(true)}><UserRound size={19}/>{tr('Profile')}</button></nav>
    <MyArchiveModal open={modalOpen} onClose={()=>setModalOpen(false)} profile={profile} onChange={id=>{setActiveId(id);setId(id);}} notify={setNotice} syncState={syncUiState.profileId===profile.id?syncUiState:{profileId:profile.id,status:'idle'}} onSyncNow={syncNow} onLocaleChange={uiLocale=>void pref({uiLocale})} onPreferencesChange={preferences=>void pref(preferences)}/>
    <ArtInspector item={art} close={()=>setArt(null)} isSaved={art?favoriteIds.has(art.id):false} onFavorite={favorite} onCompare={compareSelect} onPrepareImage={item=>{setPrepareMode('artwork');setWallpaperArt(item);}} onWallpaper={item=>{setPrepareMode('wallpaper');setWallpaperArt(item);}} compared={compareBase} notify={setNotice} motionState={art?motionLookup[art.id]:undefined} onCheckMotion={checkMotion} onOpen={setArt}/>
    <WallpaperEditor item={wallpaperArt} mode={prepareMode} onClose={()=>setWallpaperArt(null)} notify={setNotice}/>
    {compareBase&&!comparePair&&<div className="compare-dock"><Columns2 size={17}/><span>Compare mode: select another artwork</span><button onClick={()=>resetCompare()}><X size={16}/></button></div>}
    {compareBase&&comparePair&&<Dialog open={true} onOpenChange={(open)=>{if(!open)resetCompare();}} title={tr("Artwork comparison")} wide><Compare a={compareBase} b={comparePair} onClose={resetCompare}/></Dialog>}
    {notice&&<div className="toast" role="status"><Info size={17}/>{notice}<button aria-label={tr("Dismiss notice")} onClick={()=>setNotice('')}><X size={16}/></button></div>}
  </div></LocaleProvider>;
}
