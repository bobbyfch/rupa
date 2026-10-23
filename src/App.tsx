import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type RefObject } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Aperture, ArrowRight, ArrowUpRight, Check, ChevronDown, Columns2, Download, Expand, FolderHeart, Gamepad2, Heart, Home, Image, Info, LoaderCircle, Moon, Pause, Play, Plus, QrCode, RefreshCw, Search, Share2, Smartphone, Sun, Upload, UserRound, X, ZoomIn } from 'lucide-react';
import { Button } from './components/ui/button';
import { Dialog } from './components/ui/dialog';
import { AppleMotionVideo } from './components/AppleMotionVideo';
import { db, createFavoriteFolder, createProfile, deleteFavoriteFolder, getActiveId, getSnapshot, importSnapshot, moveFavoriteToFolder, renameFavoriteFolder, setActiveId, toggleFavorite, updatePreferences } from './lib/db';
import { DEFAULT_PREFERENCES, type AppleCategory, type AppleStorefront, type Artwork, type Category, type FavoriteFolder, type LocalProfile, type MotionLookupState, type Preferences } from './lib/types';
import { downloadLink, getAppleArtistImage, getAppleMotionArtwork, hasBackend, searchArtwork, searchMusicArtists } from './lib/providers';
import { createSync, joinSync, syncProfile } from './lib/sync';
import { exportEncrypted, importEncrypted } from './lib/crypto';
import { safeFileName } from './lib/utils';
import { isSearchableCollection } from './lib/sourceCatalog';
import { LocaleProvider, translate, useLocale, type Locale } from './lib/i18n';
import { AppleTrendTool } from './components/AppleTrendTool';
import { GhibliCollection } from './components/GhibliCollection';
import { ShinkaiCollection } from './components/ShinkaiCollection';
import { WallpaperEditor } from './components/WallpaperEditor';
import { APPLE_STOREFRONTS } from './lib/appleStorefronts';
import { appleMusicVideoEmbedUrl } from './lib/appleEmbeds';
import { MusicVideoStills } from './components/MusicVideoStills';
import { DownloadExportPanel } from './components/DownloadExportPanel';
import { MovingArtworkStrip } from './components/MovingArtworkStrip';
import { convertImageBlob, readImageResponse } from './lib/musicDownloads';
import { createZip } from './lib/zip';

type Page = 'discover'|'tools'|'catalog'|'trends'|'search'|'archive'|'ghibli'|'shinkai'|'games';
type MusicMode = 'albums'|'artists';
type SyncUiState={profileId:string;status:'idle'|'syncing'|'success'|'error';lastSuccess?:number;error?:string};
const ImageLightbox = lazy(()=>import('./components/ImageLightbox'));
const GameCoverFinder = lazy(()=>import('./components/GameCoverFinder').then(module=>({default:module.GameCoverFinder})));
const CatalogPage = lazy(()=>import('./components/CatalogPage'));
function BrandMark({size=34,className=''}:{size?:number;className?:string}){return <img className={`brand-mark ${className}`.trim()} src={`${import.meta.env.BASE_URL}favicon.svg`} width={size} height={size} alt="" aria-hidden="true"/>;}
const COLLECTION_LABELS:Record<Exclude<Category,'all'>,string>={
  books:'Books',music:'Music',musicvideos:'Music videos',audiobooks:'Audiobooks',apps:'App icons',appscreenshots:'App screenshots',art:'Art & archives',movies:'Film',tv:'TV / Series',videos:'YouTube',anime:'Anime',manga:'Manga',games:'Games',podcasts:'Podcasts',podcastepisodes:'Podcast episodes',webtoons:'Webtoons',comics:'Comics',boardgames:'Board games',magazines:'Magazines',physicalmedia:'Blu-ray & physical',ghibli:'Studio Ghibli stills'
};
const APPLE_COLLECTIONS:AppleCategory[]=['music','musicvideos','books','audiobooks','podcasts','podcastepisodes','apps','appscreenshots','movies','tv'];
function isAppleCollection(category:Category):category is AppleCategory{return APPLE_COLLECTIONS.includes(category as AppleCategory);}
function isAppleArtwork(item:Artwork){const label=item.provider||item.source;return isAppleCollection(item.category)&&(label==='App Store'||label.startsWith('Apple'));}
function isCurrentProductArtwork(item:Artwork){return item.category==='ghibli'||item.category==='games'||isAppleArtwork(item);}
function isAppleMusicArtwork(item:Artwork){return item.category==='music'&&item.kind!=='artist-image'&&(item.provider||item.source)==='Apple Music';}
function isStorefront(value:string|null):value is AppleStorefront{return APPLE_STOREFRONTS.some(store=>store.id===value);}
function getInitialRoute(){
  const params=new URLSearchParams(window.location.search);
  const view=params.get('view');
  const page:Page=view==='tools'||view==='catalog'||view==='trends'||view==='search'||view==='archive'||view==='ghibli'||view==='shinkai'||view==='games'?view:'discover';
  const candidate=params.get('category');
  const category:Category=APPLE_COLLECTIONS.includes(candidate as AppleCategory)?candidate as Category:'all';
  const musicMode:MusicMode=params.get('asset')==='artists'?'artists':'albums';
  const country=isStorefront(params.get('country'))?params.get('country') as AppleStorefront:'id';
  const source='apple';
  return {page,query:(params.get('q')||'').slice(0,180),category,musicMode,country,source};
}
function triggerDownload(text:string,filename:string,mime='application/json') {const url=URL.createObjectURL(new Blob([text],{type:mime}));const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function artworkCaption(item:Artwork):string {const subtitle=item.subtitle.trim(),year=item.year?.trim();if(!year||subtitle.split(' · ').some(part=>part.trim().toLocaleLowerCase()===year.toLocaleLowerCase()))return subtitle||year||'';return subtitle?`${subtitle} · ${year}`:year;}
function ToolCards({onOpenCatalog,onOpenTrends,onOpenGames}:{onOpenCatalog:()=>void;onOpenTrends:()=>void;onOpenGames:()=>void}){
  return <div className="rupa-tool-grid">
    <button type="button" className="home-tool-card catalog-tool-card" onClick={onOpenCatalog}><span className="home-tool-index">01</span><span className="home-tool-icon"><Search size={21}/></span><span className="home-tool-copy"><span className="tiny-kicker">WORKS / EDITIONS / COLLECTIONS</span><strong>Work &amp; edition finder</strong><small>Browse titles, versions, aliases, and source-linked artwork in one place.</small></span><span className="home-tool-action">Open tool <ArrowRight size={17}/></span></button>
    <button type="button" className="home-tool-card" onClick={onOpenTrends}><span className="home-tool-index">02</span><span className="home-tool-icon"><Aperture size={21}/></span><span className="home-tool-copy"><span className="tiny-kicker">MUSIC / BOOKS / FILM / TV</span><strong>Apple catalogs &amp; charts</strong><small>Search artwork and browse charts across Apple storefronts.</small></span><span className="home-tool-action">Open tool <ArrowRight size={17}/></span></button>
    <button type="button" className="home-tool-card game-tool-card" onClick={onOpenGames}><span className="home-tool-index">03</span><span className="home-tool-icon"><Gamepad2 size={21}/></span><span className="home-tool-copy"><span className="tiny-kicker">CONSOLE FAMILIES / GAME ART</span><strong>Game artwork finder</strong><small>Search covers, editions, screenshots, logos, and title screens.</small></span><span className="home-tool-action">Open tool <ArrowRight size={17}/></span></button>
  </div>;
}
function ToolDirectory({onOpenCatalog,onOpenTrends,onOpenGames}:{onOpenCatalog:()=>void;onOpenTrends:()=>void;onOpenGames:()=>void}){
  return <section className="content-width tool-directory"><header className="tool-directory-head"><span className="tiny-kicker">RUPA / TOOLS</span><h1>Browse by<br/><em>what you need.</em></h1><p>Find a work, inspect its editions, or follow the artwork back to its source.</p></header><ToolCards onOpenCatalog={onOpenCatalog} onOpenTrends={onOpenTrends} onOpenGames={onOpenGames}/></section>;
}
function CollectionChooser({onOpenCatalog,onOpenTrends,onOpenGames,onOpenGhibli,onOpenShinkai}:{onOpenCatalog:()=>void;onOpenTrends:()=>void;onOpenGames:()=>void;onOpenGhibli:()=>void;onOpenShinkai:()=>void}){
  return <div className="rupa-home content-width">
    <section className="home-intro" aria-labelledby="home-tools-title"><div><span className="tiny-kicker">A PERSONAL VISUAL LIBRARY</span><h1 id="home-tools-title" className="home-title">Art, in its<br/><em>many forms.</em></h1><p>Find an image. Learn where it belongs. Keep the source with it.</p></div><span className="home-intro-index" aria-hidden="true">01 — 04</span></section>
    <MovingArtworkStrip/>
    <section className="home-tools-section" aria-labelledby="home-tool-list-title"><div className="collections-section-head"><div><span className="tiny-kicker">TOOLS</span><h2 id="home-tool-list-title">Start anywhere.</h2></div><p>Three ways into the artwork.</p></div><ToolCards onOpenCatalog={onOpenCatalog} onOpenTrends={onOpenTrends} onOpenGames={onOpenGames}/></section>
    <section className="collections-section" id="collections" aria-labelledby="collections-title"><div className="collections-section-head"><div><span className="tiny-kicker">COLLECTIONS</span><h2 id="collections-title">Curated places.</h2></div><p>Browse the films by the worlds they made.</p></div><div className="curated-collection-grid"><button type="button" className="ghibli-collection-card" onClick={onOpenGhibli}><span className="ghibli-collection-image"><img src="https://www.ghibli.jp/images/totoro.jpg" alt="" loading="lazy" decoding="async"/><span>1984 — 2023</span></span><span className="ghibli-collection-copy"><span className="tiny-kicker">ANIMATION / JAPAN</span><strong>Ghibli</strong><small>Films, posters, and official stills.</small><span className="ghibli-collection-link">Open collection <ArrowRight size={16}/></span></span></button><button type="button" className="shinkai-collection-card" onClick={onOpenShinkai}><span className="shinkai-card-art"><img src="https://en.shinkaiworks.com/wp-content/uploads/2018/12/tenkinoko_thumb_ec.jpg" alt="" loading="lazy" decoding="async"/></span><span className="ghibli-collection-copy"><span className="tiny-kicker">ANIMATION / JAPAN</span><strong>Makoto Shinkai</strong><small>Features, shorts, and official film artwork.</small><span className="ghibli-collection-link">Open collection <ArrowRight size={16}/></span></span></button></div></section>
  </div>;
}
function getInitialProfile():LocalProfile {return {id:'guest',name:'Guest Archive',createdAt:0,updatedAt:0,preferences:{...DEFAULT_PREFERENCES}};}
function ArtworkCard({item,onOpen,isSaved,onFavorite,motion,onCheckMotion,folderOptions,folderId,onMoveFolder,onToggleSelection,selected}:{item:Artwork;onOpen:(a:Artwork)=>void;isSaved:boolean;onFavorite:(a:Artwork)=>void;motion?:MotionLookupState;onCheckMotion?:(a:Artwork)=>void;folderOptions?:FavoriteFolder[];folderId?:string;onMoveFolder?:(item:Artwork,folderId?:string)=>void;onToggleSelection?:(id:string)=>void;selected?:boolean}) {
  const locale=useLocale(),tr=(value:string)=>translate(locale,value);
  const [bad,setBad]=useState(false),[imageLoaded,setImageLoaded]=useState(false);
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
        <div className={`art-img-wrap${(hovered||playing)&&appleMotionEligible?' is-motion-preview':''}`} data-art-category={item.category} data-art-kind={item.kind||"artwork"} aria-busy={!bad&&!imageLoaded}>{!bad&&!imageLoaded&&<span className="art-image-skeleton skeleton-art" aria-hidden="true"/>}{bad?<div className="art-fallback"><Image size={22}/><span>{tr('Artwork unavailable')}</span><small>{tr('Open the source link to check this image')}</small></div>:<img className={imageLoaded?'image-ready':''} src={imageSrc} loading="lazy" decoding="async" onLoad={()=>setImageLoaded(true)} onError={markPreviewUnavailable} alt={`${item.title}${item.kind==='artist-image'?` ${tr('artist image')}`:` ${tr('artwork')}`}`}/>} {appleMotionEligible&&motion?.status==='available'&&motion.artwork&&<AppleMotionVideo url={motion.artwork.url} title={item.title} active={hovered||playing}/>}<div className="art-hover"><Expand size={17}/><span>{tr('Inspect artwork')}</span></div></div>
      </button>
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
function AppleMusicVideoPlayer({item}:{item:Artwork}){
  const embed=appleMusicVideoEmbedUrl(item.sourceUrl);
  return embed?<iframe className="apple-video-embed" src={embed} title={`${item.title} · Apple Music video player`} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin"/>:<div className="inspector-image-fallback"><span>Apple video player unavailable for this source link.</span><a href={item.sourceUrl} target="_blank" rel="noreferrer">Open in Apple Music <ArrowUpRight size={13}/></a></div>;
}
function ArtInspector({item,close,isSaved,onFavorite,onCompare,onPrepareImage,onWallpaper,compared,notify,motionState,onCheckMotion,profileId}:{item:Artwork|null;close:()=>void;isSaved:boolean;onFavorite:(a:Artwork)=>void;onCompare:(a:Artwork)=>void;onPrepareImage:(a:Artwork)=>void;onWallpaper:(a:Artwork)=>void;compared:Artwork|null;notify:(text:string)=>void;motionState?:MotionLookupState;onCheckMotion:(a:Artwork,force?:boolean)=>void;profileId:string}) {
  const [width,setWidth]=useState(0),[height,setHeight]=useState(0),[zoomOpen,setZoomOpen]=useState(false);
  const [imageSrc,setImageSrc]=useState(''),[imageFailed,setImageFailed]=useState(false),[motionActive,setMotionActive]=useState(false),[artistImage,setArtistImage]=useState('');
  const current=item;
  const appleMusicAlbum=Boolean(current&&isAppleMusicArtwork(current)),appleArtistImage=current?.category==='music'&&current.kind==='artist-image',appleItem=Boolean(current&&isAppleArtwork(current)),appleMusicVideo=Boolean(current&&current.category==='musicvideos'&&isAppleArtwork(current));
  useEffect(()=>{setWidth(0);setHeight(0);setZoomOpen(false);setMotionActive(false);setArtistImage('');},[item]);
  useEffect(()=>{setImageSrc(current?.imageUrl||current?.previewUrl||'');setImageFailed(false);},[current?.id,current?.imageUrl,current?.previewUrl]);
  useEffect(()=>{if(!current)return;let cancelled=false,index=0;const sources=[current.imageUrl,current.previewUrl].filter((src,i,list)=>Boolean(src)&&list.indexOf(src)===i);const img=new window.Image();img.onload=()=>{if(!cancelled){setWidth(img.naturalWidth);setHeight(img.naturalHeight);}};img.onerror=()=>{index++;if(sources[index]){img.src=sources[index];return;}if(!cancelled){setWidth(0);setHeight(0);}};img.src=sources[0]||'';return()=>{cancelled=true;};},[current]);
  useEffect(()=>{if(current?.category!=='music'||current.kind==='artist-image'||!current.artistUrl||!hasBackend)return;let active=true;getAppleArtistImage(current.artistUrl).then(value=>{if(active&&value)setArtistImage(value);}).catch(()=>{});return()=>{active=false;};},[current?.id,current?.artistUrl,current?.kind]);
  useEffect(()=>{if(current&&isAppleMusicArtwork(current)&&!motionState)onCheckMotion(current);},[current?.id,current?.category,current?.kind,current?.provider,current?.source,motionState?.status]);
  return <><Dialog open={!!item&&!zoomOpen} onOpenChange={(o)=>{if(!o)close();}} title="Artwork / Inspection" wide>
    {current&&<div className="inspector-grid"><div className="inspector-visual"><div className={`inspection-canvas${appleMusicAlbum?' inspection-canvas-music':''}${appleMusicVideo?' inspection-canvas-video':''}`}>{appleMusicVideo?<AppleMusicVideoPlayer item={current}/>:imageFailed?<div className="inspector-image-fallback" role="status"><Image size={24}/><span>Artwork image unavailable</span><a href={current.sourceUrl} target="_blank" rel="noreferrer">Open the source page</a></div>:<img src={imageSrc||current.imageUrl} alt={current.kind==='artist-image'?`${current.title} artist image`:current.title} onClick={()=>setZoomOpen(true)} onError={()=>{if(current.previewUrl&&imageSrc!==current.previewUrl){setImageSrc(current.previewUrl);return;}setImageFailed(true);}} title="Open immersive zoom viewer"/>}{appleMusicAlbum&&motionState?.status==='available'&&motionState.artwork&&motionActive&&<AppleMotionVideo url={motionState.artwork.url} title={current.title} active controls loop={false} onClose={()=>setMotionActive(false)}/>} {!appleMusicVideo&&<button className="inspect-zoom" onClick={()=>setZoomOpen(true)} disabled={imageFailed||motionActive}><ZoomIn size={16}/> Zoom / Fullscreen</button>}{appleMusicAlbum&&motionState?.status==='available'&&motionState.artwork&&!motionActive&&<button className="inspect-motion-toggle" onClick={()=>setMotionActive(true)}><Play size={14} fill="currentColor"/>Play motion</button>}</div>{appleMusicVideo&&<MusicVideoStills item={current} profileId={profileId} notify={notify}/>}<div className="inspection-caption"><span>{appleMusicVideo?'Apple Music hosted player':appleMusicAlbum?'Apple Music album artwork':appleArtistImage?'Apple Music artist image':`Image provided by ${current.source} · Original/master status not independently verified`}</span><div className="inspection-caption-actions">{!appleMusicVideo&&<Button variant="outline" size="sm" onClick={()=>onWallpaper(current)}><Smartphone size={15}/> Set as wallpaper</Button>}</div></div></div>
      <div className="inspector-sidebar">{appleMusicVideo?<>
        <div className="tiny-kicker">APPLE MUSIC / MUSIC VIDEO</div><h2>{current.title}</h2><p className="muted inspector-subtitle">{artworkCaption(current)}</p>
        <div className="inspector-stats"><div><small>PLAYER</small><strong>Apple Music embed</strong></div><div><small>IMAGE SOURCE</small><strong>Apple Music</strong></div><div><small>STILL CAPTURE</small><strong>Your local video only</strong></div></div>
        <DownloadExportPanel item={current} onPrepareImage={onPrepareImage} notify={notify}/>
        <div className="music-inspector-actions"><Button variant="outline" onClick={()=>onFavorite(current)}><Heart size={16} fill={isSaved?'currentColor':'none'}/>{isSaved?'Saved to archive':'Save video artwork'}</Button><a href={current.sourceUrl} target="_blank" rel="noreferrer" className="ca-button ca-button-primary">Open in Apple Music <ArrowUpRight size={15}/></a></div>
        <p className="rights-note"><Info size={15}/> Apple’s hosted player needs a network connection; full MusicKit playback can require sign-in. Browser rules and Apple’s preview terms do not allow extracting frames from its stream.</p>
      </>:appleMusicAlbum?<>
        <div className="tiny-kicker">APPLE MUSIC / ALBUM</div><h2>{current.title}</h2><div className="music-artist-line">{artistImage&&<img src={artistImage} alt="" loading="lazy"/>}<div><small>ARTIST</small>{current.artistUrl?<a href={current.artistUrl} target="_blank" rel="noreferrer">{current.artist||current.subtitle}<ArrowUpRight size={13}/></a>:<span>{current.artist||current.subtitle}</span>}</div></div>{current.year&&<p className="music-release-year">Released {current.year}</p>}
        <DownloadExportPanel item={current} motionState={motionState} onCheckMotion={onCheckMotion} onPrepareImage={onPrepareImage} notify={notify}/>
        <div className="music-inspector-actions"><Button variant="outline" onClick={()=>onFavorite(current)}><Heart size={16} fill={isSaved?'currentColor':'none'}/>{isSaved?'Saved to archive':'Save album'}</Button><a href={current.sourceUrl} target="_blank" rel="noreferrer" className="ca-button ca-button-primary">Open in Apple Music <ArrowUpRight size={15}/></a></div>
        <p className="rights-note"><Info size={15}/> Artwork stays linked to Apple Music. Check its rights before reusing or publishing it.</p>
      </>:appleArtistImage?<>
        <div className="tiny-kicker">APPLE MUSIC / ARTIST IMAGE</div><h2>{current.title}</h2>
        <div className="inspector-stats music-artist-stats"><div><small>IMAGE DIMENSIONS</small><strong>{width?`${width.toLocaleString()} × ${height.toLocaleString()} px`:'Not measurable'}</strong></div><div><small>IMAGE SOURCE</small><strong>Apple Music</strong></div><div><small>RIGHTS</small><strong>Source-only</strong></div></div>
        <DownloadExportPanel item={current} onPrepareImage={onPrepareImage} notify={notify}/>
        <div className="music-inspector-actions"><Button variant="outline" onClick={()=>onFavorite(current)}><Heart size={16} fill={isSaved?'currentColor':'none'}/>{isSaved?'Saved to archive':'Save artist image'}</Button><a href={current.sourceUrl} target="_blank" rel="noreferrer" className="ca-button ca-button-primary">Open artist in Apple Music <ArrowUpRight size={15}/></a></div>
        <p className="rights-note"><Info size={15}/> This image is provided by Apple Music. Check its rights before reusing or publishing it.</p>
      </>:<>
        <div className="tiny-kicker">{current.category.toUpperCase()} / {current.kind||'COVER'}</div><h2>{current.title}</h2><p className="muted inspector-subtitle">{artworkCaption(current)}</p>
         <div className="inspector-stats"><div><small>IMAGE DIMENSIONS</small><strong>{width?`${width.toLocaleString()} × ${height.toLocaleString()} px`:'Not measurable'}</strong></div><div><small>ARTWORK SOURCE</small><strong>{current.source}</strong></div><div><small>LICENSE</small><strong>{current.licenseLabel|| (current.rights==='source-only'?'Source viewing / check rights':current.rights==='open-license'?'Open license / verify terms':'Check rights at source')}</strong></div></div>
         <DownloadExportPanel item={current} onPrepareImage={onPrepareImage} notify={notify}/>
         <div className="inspect-actions"><Button variant="outline" onClick={()=>onFavorite(current)}><Heart size={16} fill={isSaved?'currentColor':'none'}/>{isSaved?'Saved':'Save artwork'}</Button><Button variant="outline" onClick={()=>onCompare(current)}><Columns2 size={16}/>{compared?'Compare with selected':'Select for comparison'}</Button>{appleItem?<a className="ca-button ca-button-outline" href={current.sourceUrl} target="_blank" rel="noreferrer"><ArrowUpRight size={16}/> Open Apple source</a>:<a className="ca-button ca-button-outline" href={current.sourceUrl} target="_blank" rel="noreferrer"><ArrowUpRight size={16}/> Open source</a>}</div>
         <a href={current.sourceUrl} target="_blank" rel="noreferrer" className="source-link">Visit original source <ArrowUpRight size={15}/></a>
         <p className="rights-note"><Info size={15}/> Public access does not grant reuse rights. Check the source terms before reproducing or publishing artwork.</p>
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
    <div className="profile-block profile-settings-block"><div className="tiny-kicker">{tr('SETTINGS')}</div><label className="locale-row"><span>{tr('Gallery layout')}</span><select aria-label={tr('Gallery layout')} value={profile.preferences.gallery} onChange={event=>onPreferencesChange({gallery:event.target.value as Preferences['gallery']})}><option value="masonry">{tr('Masonry / Original ratios')}</option><option value="grid">{tr('Uniform grid')}</option></select></label><label className="locale-row"><span>{tr('Appearance')}</span><select aria-label={tr('Appearance')} value={profile.preferences.theme} onChange={event=>onPreferencesChange({theme:event.target.value as Preferences['theme']})}><option value="light">{tr('Light')}</option><option value="dark">{tr('Dark')}</option></select></label></div>
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
const APPLE_PAGE_COPY:Record<Exclude<AppleCategory,'music'>,{eyebrow:string;title:string;description:string;placeholder:string;source:string;empty:string}>={
  musicvideos:{eyebrow:'APPLE MUSIC / MUSIC VIDEOS',title:'Music video artwork.',description:'Find Apple Music video covers by title or paste a music video link.',placeholder:'Video title or Apple Music video URL…',source:'APPLE MUSIC · MUSIC VIDEOS',empty:'Try another video title or paste an Apple Music video URL.'},
  books:{eyebrow:'APPLE BOOKS / EBOOKS',title:'Book covers.',description:'Search Apple Books by title or author, use an ISBN, or paste an Apple Books link.',placeholder:'Book title, author, ISBN, or Apple Books URL…',source:'APPLE BOOKS · BOOK COVERS',empty:'Try a different title, author, or ISBN, or choose another storefront.'},
  movies:{eyebrow:'APPLE TV / ITUNES MOVIES',title:'Film artwork.',description:'Search Apple’s movie catalog or paste an iTunes movie link or numeric Apple ID. Title search can miss films that direct ID lookup still finds.',placeholder:'Movie title, iTunes movie URL, or Apple ID…',source:'APPLE TV · MOVIE ARTWORK',empty:'Apple title search is inconsistent. Paste the iTunes movie link or numeric ID and choose its storefront.'},
  tv:{eyebrow:'APPLE TV / ITUNES TV',title:'TV season artwork.',description:'Search Apple’s iTunes TV catalog by show or season, or paste an iTunes TV season link or numeric ID. Apple TV+ share links are not the same catalog IDs.',placeholder:'Show, season, iTunes TV URL, or numeric ID…',source:'APPLE TV · TV SEASON ARTWORK',empty:'Try a show or season available in the selected iTunes storefront, or paste its iTunes TV season link or numeric ID.'},
  audiobooks:{eyebrow:'APPLE BOOKS / AUDIOBOOKS',title:'Audiobook covers.',description:'Search audiobook editions or paste an Apple Books audiobook link.',placeholder:'Audiobook title, author, or Apple Books URL…',source:'APPLE BOOKS · AUDIOBOOKS',empty:'Availability changes by storefront. Try the United States or another storefront.'},
  podcasts:{eyebrow:'APPLE PODCASTS',title:'Podcast covers.',description:'Search podcast titles or authors, or paste an Apple Podcasts link.',placeholder:'Podcast, creator, or Apple Podcasts URL…',source:'APPLE PODCASTS · SHOWS',empty:'Try another show title or creator, or change the storefront.'},
  podcastepisodes:{eyebrow:'APPLE PODCASTS / EPISODES',title:'Podcast episode art.',description:'Search episode titles or paste a show or episode link from Apple Podcasts.',placeholder:'Episode, show, or Apple Podcasts URL…',source:'APPLE PODCASTS · EPISODE ART',empty:'Try an episode title, a different storefront, or an Apple Podcasts episode link.'},
  apps:{eyebrow:'APP STORE',title:'App icons.',description:'Find App Store icons by app name or paste an App Store link.',placeholder:'App name or App Store URL…',source:'APP STORE · APP ICONS',empty:'Try another app name or select a different storefront.'},
  appscreenshots:{eyebrow:'APP STORE / SCREENSHOTS',title:'App screenshots.',description:'Search an app name or paste its App Store link to browse Apple’s available device screenshots.',placeholder:'App name or App Store URL…',source:'APP STORE · APP SCREENSHOTS',empty:'Try another app name, select a different storefront, or paste an App Store link.'}
};
type SearchableCategory=Exclude<AppleCategory,'music'>;
function SearchableCollectionPage({category,query,onQueryChange,onSubmit,storefront,onStorefrontChange,loading,searched,results,warnings,hasPartialResults,gallery,favoriteIds,onFavorite,onOpen,onBack,inputRef}:{category:SearchableCategory;query:string;onQueryChange:(value:string)=>void;onSubmit:(event:FormEvent<HTMLFormElement>)=>void;storefront:AppleStorefront;onStorefrontChange:(value:AppleStorefront)=>void;loading:boolean;searched:boolean;results:Artwork[];warnings:string[];hasPartialResults:boolean;gallery:Preferences['gallery'];favoriteIds:Set<string>;onFavorite:(artwork:Artwork)=>void;onOpen:(artwork:Artwork)=>void;onBack:()=>void;inputRef:RefObject<HTMLInputElement|null>}){
  const locale=useLocale(),tr=(value:string)=>translate(locale,value);
  const copy=APPLE_PAGE_COPY[category];
  const controls=<><form className="search-bar" onSubmit={onSubmit}><Search size={21}/><input ref={inputRef} aria-label={`${tr('Search')} ${tr(COLLECTION_LABELS[category])}`} value={query} onChange={event=>onQueryChange(event.target.value)} placeholder={tr(copy.placeholder)}/><Button type="submit" disabled={loading}>{loading?tr('Searching…'):tr('Search')} <ArrowRight size={16}/></Button></form><StorefrontControl value={storefront} onChange={onStorefrontChange}/></>;
  const info='Apple catalog results link back to Apple. Image dimensions and file size are measured from the actual downloaded file.';
  return <section className="content-width search-content music-page catalog-category-page"><button className="back-to-collections" onClick={onBack}><ArrowRight size={15}/> {tr('Back to Trends')}</button><div className="listing-header"><div className="tiny-kicker">{tr(copy.eyebrow)}</div><h1>{tr(copy.title)}</h1><p>{tr(copy.description)}</p></div><div className="category-search-controls has-storefront">{controls}</div><p className="music-search-tip">{tr(info)}</p><div className="results-head" aria-live="polite" aria-atomic="true"><span>{searched?`${results.length} ${tr('ITEMS FOUND')}`:tr('READY TO SEARCH')}</span><span>APPLE · {tr(copy.source)}</span></div>{warnings.length>0&&<div className="search-warning" role="status" aria-live="polite" aria-atomic="true"><Info size={17}/><span>{warnings.map(warning=>tr(warning)).join(' · ')}</span></div>}{loading&&(!hasPartialResults||results.length===0)?<SearchSkeletons gallery={gallery} count={8} query={query} category={category}/>:results.length>0?<div className={'gallery gallery-'+gallery}>{results.map(item=><ArtworkCard key={item.id} item={item} onOpen={onOpen} isSaved={favoriteIds.has(item.id)} onFavorite={onFavorite}/>)}</div>:<div className="music-empty"><span>{tr(searched?'NO MATCHES':'READY WHEN YOU ARE')}</span><p>{searched?(warnings.length?tr('Apple returned an error. Try again or switch storefront.'):tr(copy.empty)):tr(`Search ${COLLECTION_LABELS[category]} by title, creator, ISBN, or Apple link.`)}</p></div>}</section>;
}
export default function App(){
  const [page,setPage]=useState<Page>(()=>getInitialRoute().page),[query,setQuery]=useState(()=>getInitialRoute().query),[category,setCategory]=useState<Category>(()=>getInitialRoute().category),[results,setResults]=useState<Artwork[]>([]),[warnings,setWarnings]=useState<string[]>([]),[loading,setLoading]=useState(false),[hasPartialResults,setHasPartialResults]=useState(false),[searched,setSearched]=useState(false);
  const [musicMode,setMusicMode]=useState<MusicMode>(()=>getInitialRoute().musicMode),[storefront,setStorefront]=useState<AppleStorefront>(()=>getInitialRoute().country),[source,setSource]=useState(()=>getInitialRoute().source);
  const [activeId,setId]=useState(getActiveId),[modalOpen,setModalOpen]=useState(false),[art,setArt]=useState<Artwork|null>(null),[wallpaperArt,setWallpaperArt]=useState<Artwork|null>(null),[prepareMode,setPrepareMode]=useState<'artwork'|'wallpaper'>('wallpaper'),[compareBase,setCompareBase]=useState<Artwork|null>(null),[comparePair,setComparePair]=useState<Artwork|null>(null);
  const [syncUiState,setSyncUiState]=useState<SyncUiState>({profileId:'',status:'idle'});
  const [motionLookup,setMotionLookup]=useState<Record<string,MotionLookupState>>({});
  const [notice,setNotice]=useState('');
  const [activeFavoriteFolder,setActiveFavoriteFolder]=useState('all'),[newFolderName,setNewFolderName]=useState(''),[renameFolderName,setRenameFolderName]=useState('');
  const [archiveSelectMode,setArchiveSelectMode]=useState(false),[selectedArtworkIds,setSelectedArtworkIds]=useState<Set<string>>(()=>new Set()),[batchFormat,setBatchFormat]=useState<'original'|'png'|'jpeg'|'webp'>('original'),[batchBusy,setBatchBusy]=useState(false);
  const input=useRef<HTMLInputElement>(null),currentReq=useRef<AbortController|null>(null);
  const profile=useLiveQuery(async()=> (await db.profiles.get(activeId)) || (activeId==='guest'?getInitialProfile():getInitialProfile()),[activeId])||getInitialProfile();
  const favorites=useLiveQuery(()=>db.favorites.where('profileId').equals(activeId).toArray(),[activeId])||[];
  const favoriteFolders=useLiveQuery(()=>db.favoriteFolders.where('profileId').equals(activeId).toArray(),[activeId])||[];
  const favoriteIds=useMemo(()=>new Set(favorites.filter(f=>!f.deleted&&isCurrentProductArtwork(f.artwork)).map(f=>f.artwork.id)),[favorites]);
  const activeFolders=favoriteFolders.filter(folder=>!folder.deleted).sort((a,b)=>a.name.localeCompare(b.name));
  const activeFavorites=favorites.filter(favorite=>!favorite.deleted&&isCurrentProductArtwork(favorite.artwork));
  const preferences=profile.preferences||DEFAULT_PREFERENCES;
  const locale:Locale=preferences.uiLocale||'id',tr=(value:string)=>translate(locale,value);
  useEffect(()=>{db.profiles.get('guest').then(p=>{if(!p)db.profiles.add(getInitialProfile()).catch(()=>{});});},[]);
  useEffect(()=>{document.documentElement.dataset.theme=preferences.theme;const themeColor=document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');if(themeColor)themeColor.content=preferences.theme==='dark'?'#10131a':'#f2f4f8';},[preferences.theme]);
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
      setPage(route.page);setCategory(route.category);setMusicMode(route.musicMode);setStorefront(route.country);setSource(route.source);setQuery(route.page==='search'||route.page==='games'||route.page==='catalog'?route.query:'');
      if(route.page==='search'&&isSearchableCollection(route.category)&&route.query.trim().length>=2){
        void runSearch(route.query,route.category,route.musicMode,route.country,route.source,'none');
      }
    };
    window.addEventListener('popstate',restoreRoute);
    return()=>window.removeEventListener('popstate',restoreRoute);
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
    if(!isAppleCollection(c)||!isSearchableCollection(c)){setNotice('Choose an Apple catalog before searching.');return;}
    if(q.trim().length<2){setNotice('Type at least 2 characters to search');return;}
    selectedSource='apple';
    currentReq.current?.abort();
    const controller=new AbortController();currentReq.current=controller;
    let timedOut=false;
    const timeoutId=window.setTimeout(()=>{timedOut=true;controller.abort();},20_000);
    setPage('search');setQuery(q.trim());setCategory(c);setMusicMode(mode);setStorefront(country);setSource(selectedSource);setLoading(true);setHasPartialResults(false);setResults([]);setMotionLookup({});setSearched(true);setWarnings([]);
    const url=new URL(window.location.href);url.searchParams.set('view','search');url.searchParams.set('q',q.trim());url.searchParams.set('category',c);url.searchParams.set('country',country);url.searchParams.set('source',selectedSource);if(c==='music')url.searchParams.set('asset',mode);else url.searchParams.delete('asset');if(historyMode==='push')window.history.pushState(null,'',url);else if(historyMode==='replace')window.history.replaceState(null,'',url);
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
  async function pref(p:Partial<Preferences>){try{const actual=await db.profiles.get(activeId);if(actual)await updatePreferences(actual,p);}catch{setNotice('Could not save preferences');}}
  function navTo(p:Page){currentReq.current?.abort();setLoading(false);setPage(p);if(p==='discover'){setCategory('all');setQuery('');setResults([]);setWarnings([]);setSearched(false);}else if(p==='search'){setCategory('all');setQuery('');}else if(p==='games'||p==='tools'||p==='catalog'){setQuery('');setResults([]);setWarnings([]);setSearched(false);}const url=new URL(window.location.href);if(p==='discover'){url.search='';}else{url.searchParams.set('view',p);if(p!=='search'){url.searchParams.delete('q');url.searchParams.delete('category');url.searchParams.delete('asset');url.searchParams.delete('source');url.searchParams.delete('platform');}}window.history.pushState(null,'',url);window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
  function browseAnimeTitle(title:string){currentReq.current?.abort();setLoading(false);setPage('catalog');setQuery(title);setResults([]);setWarnings([]);setSearched(false);const url=new URL(window.location.href);url.search='';url.searchParams.set('view','catalog');url.searchParams.set('type','anime');url.searchParams.set('q',title);window.history.pushState(null,'',url);window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
  function goToCollections(){
    const scroll=()=>document.getElementById('collections')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
    if(page==='discover')scroll();
    else{navTo('discover');window.requestAnimationFrame(()=>window.requestAnimationFrame(scroll));}
  }
  return <LocaleProvider locale={locale}><div className="app-root">
    <a className="skip-link" href="#main-content">{tr('Skip to artwork')}</a>
    <div className="top-rule"/>
    <header className="site-header"><div className="header-inner"><button className="brand" onClick={()=>navTo('discover')} aria-label={tr('Rupa home')}><BrandMark/><span>Rupa</span></button><nav className="desktop-nav" aria-label={tr("Main navigation")}><button className={page==='discover'?'active':''} onClick={()=>navTo('discover')}>{tr('Home')}</button><button className={['tools','catalog','trends','search','games'].includes(page)?'active':''} onClick={()=>navTo('tools')}>{tr('Tools')}</button><button className={page==='ghibli'||page==='shinkai'?'active':''} onClick={goToCollections}>{tr('Collections')}</button><button className={page==='archive'?'active':''} onClick={()=>navTo('archive')}>{tr('Saved')}</button></nav><div className="header-actions"><button className="icon-action" aria-label="Change theme" title={tr("Toggle light/dark mode")} onClick={()=>pref({theme:preferences.theme==='light'?'dark':'light'})}>{preferences.theme==='light'?<Moon size={18}/>:<Sun size={18}/>}</button><button className="profile-control" aria-label={tr("Profile & settings")} onClick={()=>setModalOpen(true)}><UserRound size={16}/><span>{profile.name}</span><ChevronDown size={14}/></button></div></div></header>
    <main id="main-content">
      {page==='tools'&&<ToolDirectory onOpenCatalog={()=>navTo('catalog')} onOpenTrends={()=>navTo('trends')} onOpenGames={()=>navTo('games')}/>}
      {page==='discover'&&<CollectionChooser onOpenCatalog={()=>navTo('catalog')} onOpenTrends={()=>navTo('trends')} onOpenGames={()=>navTo('games')} onOpenGhibli={()=>navTo('ghibli')} onOpenShinkai={()=>navTo('shinkai')}/>}
      {page==='catalog'&&<Suspense fallback={<div className="content-width game-finder-empty" role="status">Opening the work finder…</div>}><CatalogPage initialQuery={query} profileId={activeId} notify={setNotice} onOpen={setArt} onLive={(collection,term)=>{navTo('search');setQuery(term);setCategory(collection);void runSearch(term,collection,musicMode,storefront,'all');}}/></Suspense>}
      {page==='trends'&&<AppleTrendTool storefront={storefront} onStorefrontChange={setStorefront} onSearch={(c,q)=>void runSearch(q,c,'albums',storefront,'apple')} onOpen={setArt} onFavorite={favorite} favoriteIds={favoriteIds}/>}
      {page==='ghibli'&&<GhibliCollection favoriteIds={favoriteIds} onFavorite={favorite} onOpen={setArt} onBack={()=>navTo('discover')}/>}
      {page==='shinkai'&&<ShinkaiCollection onBrowseAnime={browseAnimeTitle} onBack={()=>navTo('discover')}/>}
      {page==='games'&&<Suspense fallback={<div className="content-width game-finder-empty" role="status">Opening the console index…</div>}><GameCoverFinder initialQuery={query} favoriteIds={favoriteIds} onFavorite={favorite} onOpen={setArt} onBack={()=>navTo('discover')}/></Suspense>}
      {page==='search'&&category==='music'&&<section className="content-width search-content music-page"><button className="back-to-collections" onClick={()=>navTo('trends')}><ArrowRight size={15}/>{tr('Back to Trends')}</button><div className="listing-header"><div className="tiny-kicker">MUSIC / ALBUM & ARTIST IMAGES</div><h1>{tr(musicMode==='albums'?'Album artwork.':'Artist images.')}</h1><p>{tr(musicMode==='albums'?'Search Apple Music for album and artist artwork, then inspect file details.':'Find Apple Music artist photos by name or artist URL.')}</p></div><div className="music-mode-switch" role="radiogroup" aria-label={tr("Music image type")}><label className={musicMode==='albums'?'active':''}><input type="radio" name="music-image-type" value="albums" checked={musicMode==='albums'} onChange={()=>chooseMusicMode('albums')}/><span>{tr('Album covers')}</span></label><label className={musicMode==='artists'?'active':''}><input type="radio" name="music-image-type" value="artists" checked={musicMode==='artists'} onChange={()=>chooseMusicMode('artists')}/><span>{tr('Artist images')}</span></label></div><div className={`category-search-controls music-search-controls${musicMode==='artists'?' has-storefront':''}`}><div id="music-search-panel"><form className="search-bar" onSubmit={event=>{event.preventDefault();void runSearch();}}><Search size={21}/><input aria-label={tr(musicMode==='albums'?'Search album artwork':'Search Apple Music artist images')} ref={input} value={query} onChange={event=>setQuery(event.target.value)} placeholder={tr(musicMode==='albums'?'Album, artist, or source URL…':'Artist name or Apple Music artist URL…')}/><Button type="submit" disabled={loading}>{loading?tr('Searching…'):tr('Search')} <ArrowRight size={16}/></Button></form></div><StorefrontControl value={storefront} onChange={country=>{setStorefront(country);if(query.trim().length>=2)void runSearch(query,'music',musicMode,country,source);}}/></div><p className="music-search-tip">{musicMode==='albums'?'Apple Music album art can include motion; exported dimensions and format are measured from the downloaded file.':'Artist photos are sourced from Apple Music.'}</p><div className="results-head" aria-live="polite" aria-atomic="true"><span>{searched?`${results.length} ${tr(musicMode==='albums'?'ALBUMS FOUND':'ARTIST IMAGES FOUND')}`:tr('MUSIC CATALOG')}</span><span>{musicMode==='artists'?'APPLE MUSIC · ARTISTS':'APPLE MUSIC · ALBUM ART'}</span></div>{warnings.length>0&&<div className="search-warning" role="status" aria-live="polite" aria-atomic="true"><Info size={17}/><span>{warnings.map(warning=>tr(warning)).join(' · ')}</span></div>}{loading&&(!hasPartialResults||results.length===0)?<SearchSkeletons gallery={preferences.gallery} count={8} query={query} category="music"/>:results.length>0?<div className={'gallery gallery-'+preferences.gallery}>{results.map(a=><ArtworkCard key={a.id} item={a} onOpen={setArt} isSaved={favoriteIds.has(a.id)} onFavorite={favorite} motion={motionLookup[a.id]} onCheckMotion={checkMotion}/>)}</div>:<div className="music-empty"><span>{tr(searched?'NO MATCHES':'READY WHEN YOU ARE')}</span><p>{searched?(warnings.length?'Some music sources returned an error. Switch source or retry.':tr('Try a different album, artist, or URL.')):tr(musicMode==='albums'?'Search by album, artist name, or a provider link.':'Search an artist name or paste an Apple Music artist link.')}</p></div>}</section>}
      {page==='search'&&isSearchableCollection(category)&&category!=='music'&&<SearchableCollectionPage category={category as SearchableCategory} query={query} onQueryChange={setQuery} onSubmit={event=>{event.preventDefault();void runSearch(query,category,musicMode,storefront,source);}} storefront={storefront} onStorefrontChange={country=>{setStorefront(country);if(query.trim().length>=2)void runSearch(query,category,musicMode,country,source);}} loading={loading} searched={searched} results={results} warnings={warnings} hasPartialResults={hasPartialResults} gallery={preferences.gallery} favoriteIds={favoriteIds} onFavorite={favorite} onOpen={setArt} onBack={()=>navTo('trends')} inputRef={input}/>}
      {page==='search'&&category!=='all'&&!isSearchableCollection(category)&&<section className="content-width coming-soon-page"><button className="back-to-collections" onClick={()=>navTo('discover')}><ArrowRight size={15}/>{tr('All collections')}</button><div className="tiny-kicker">{tr('COLLECTION / IN PREPARATION')}</div><h1>{COLLECTION_LABELS[category as Exclude<Category,'all'>]}<br/><em>{tr('coming soon.')}</em></h1><p>{tr('This category has a place in the archive. Its best image source and offline rights are still being checked.')}</p></section>}
      {page==='archive'&&<section className="content-width search-content favorites-page"><div className="listing-header"><div className="tiny-kicker">YOUR VISUAL LIBRARY</div><h1>Saved.</h1><p>Keep the images you find, add context, and export one item or a batch from the same archive.</p></div><div className="favorite-folder-bar"><div className="favorite-folder-list"><button type="button" className={activeFavoriteFolder==='all'?'active':''} onClick={()=>setActiveFavoriteFolder('all')}>All saved <span>{activeFavorites.length}</span></button><button type="button" className={activeFavoriteFolder==='unsorted'?'active':''} onClick={()=>setActiveFavoriteFolder('unsorted')}>Unsorted <span>{activeFavorites.filter(favorite=>!favorite.folderId).length}</span></button>{activeFolders.map(folder=><button type="button" key={folder.id} className={activeFavoriteFolder===folder.id?'active':''} onClick={()=>{setActiveFavoriteFolder(folder.id);setRenameFolderName(folder.name);}}><FolderHeart size={15}/>{folder.name}<span>{activeFavorites.filter(favorite=>favorite.folderId===folder.id).length}</span></button>)}</div><form className="favorite-folder-create" onSubmit={makeFavoriteFolder}><input value={newFolderName} onChange={event=>setNewFolderName(event.target.value)} aria-label="New saved folder name" placeholder="Create a folder" maxLength={40}/><Button type="submit" disabled={!newFolderName.trim()}><Plus size={15}/> Add folder</Button></form>{activeFavoriteFolder!=='all'&&activeFavoriteFolder!=='unsorted'&&<form className="favorite-folder-edit" onSubmit={saveFolderRename}><input value={renameFolderName} onChange={e=>setRenameFolderName(e.target.value)} aria-label="Rename selected folder" maxLength={40}/><Button variant="outline" type="submit" disabled={!renameFolderName.trim()}>Rename</Button><Button variant="ghost" type="button" onClick={()=>void removeFavoriteFolder()}>Delete folder</Button></form>}</div><div className="archive-batch-toolbar"><button type="button" className={`archive-select-toggle${archiveSelectMode?' active':''}`} onClick={()=>{setArchiveSelectMode(value=>!value);if(archiveSelectMode)setSelectedArtworkIds(new Set());}}>{archiveSelectMode?'Done selecting':'Select items'}</button>{archiveSelectMode&&<><button type="button" onClick={()=>setSelectedArtworkIds(selectedDisplayCount===display.length?new Set():new Set(display.map(item=>item.id)))}>{selectedDisplayCount===display.length&&display.length?'Clear selection':'Select all shown'}</button><label><span>Export format</span><select value={batchFormat} onChange={event=>setBatchFormat(event.target.value as typeof batchFormat)}><option value="original">Original</option><option value="png">PNG</option><option value="jpeg">JPEG</option><option value="webp">WebP</option></select></label><Button onClick={()=>void exportSelectedArchive()} disabled={!selectedDisplayCount||batchBusy}><Download size={15}/>{batchBusy?'Building ZIP…':`Download ZIP · ${selectedDisplayCount}`}</Button></>}<small>Batch limit: 25 images · 40 MB total</small></div><div className="results-head" aria-live="polite" aria-atomic="true"><span>{display.length} SAVED ITEMS</span><span>{activeFavoriteFolder==='all'?'ALL SAVED':activeFavoriteFolder==='unsorted'?'UNSORTED':activeFolders.find(folder=>folder.id===activeFavoriteFolder)?.name.toUpperCase()}</span></div>{display.length>0?<div className={'gallery gallery-'+preferences.gallery}>{display.map(artwork=>{const row=activeFavorites.find(favorite=>favorite.artwork.id===artwork.id);return <ArtworkCard key={artwork.id} item={artwork} onOpen={setArt} isSaved={favoriteIds.has(artwork.id)} onFavorite={favorite} motion={motionLookup[artwork.id]} onCheckMotion={checkMotion} folderOptions={activeFolders} folderId={row?.folderId} onMoveFolder={moveArtworkToFolder} onToggleSelection={archiveSelectMode?toggleArchiveSelection:undefined} selected={selectedArtworkIds.has(artwork.id)}/>;})}</div>:<div className="empty-state"><Aperture size={32} strokeWidth={1}/><h2>{activeFavoriteFolder==='all'?'Nothing saved yet.':activeFavoriteFolder==='unsorted'?'No unsorted favorites.':'This folder is empty.'}</h2><p>Save an image from a tool or curated collection, then organize it here.</p><Button variant="outline" onClick={()=>navTo('discover')}>Browse artwork <ArrowRight size={16}/></Button></div>}</section>}
    </main>
    <footer className="site-footer"><div className="content-width foot-inner"><div><span className="foot-brand"><BrandMark size={26} className="brand-mark-footer"/> RUPA.</span><p>{tr('An independent space for visual culture.')}<br/>{tr('Art belongs to its creators.')}</p></div><div><span>{tr('BUILT TO APPRECIATE')}</span><p>{tr('Respect artists. Verify rights. Preserve the details.')}</p></div><div className="foot-end">© 2026 RUPA <span>{tr('INDEPENDENT ARTWORK RESEARCH PROJECT')}</span></div></div></footer>
    <nav className="mobile-nav" aria-label={tr("Mobile navigation")}><button className={page==='discover'?'current':''} onClick={()=>navTo('discover')}><Home size={19}/>{tr('Home')}</button><button className={page==='tools'||page==='catalog'||page==='trends'||page==='search'||page==='games'?'current':''} onClick={()=>navTo('tools')}><Aperture size={19}/>{tr('Tools')}</button><button className={page==='archive'?'current':''} onClick={()=>navTo('archive')}><Heart size={19}/>{tr('Saved')}</button><button className={modalOpen?'current':''} aria-haspopup="dialog" aria-expanded={modalOpen} onClick={()=>setModalOpen(true)}><UserRound size={19}/>{tr('Profile')}</button></nav>
    <MyArchiveModal open={modalOpen} onClose={()=>setModalOpen(false)} profile={profile} onChange={id=>{setActiveId(id);setId(id);}} notify={setNotice} syncState={syncUiState.profileId===profile.id?syncUiState:{profileId:profile.id,status:'idle'}} onSyncNow={syncNow} onLocaleChange={uiLocale=>void pref({uiLocale})} onPreferencesChange={preferences=>void pref(preferences)}/>
    <ArtInspector item={art} close={()=>setArt(null)} isSaved={art?favoriteIds.has(art.id):false} onFavorite={favorite} onCompare={compareSelect} onPrepareImage={item=>{setPrepareMode('artwork');setWallpaperArt(item);}} onWallpaper={item=>{setPrepareMode('wallpaper');setWallpaperArt(item);}} compared={compareBase} notify={setNotice} motionState={art?motionLookup[art.id]:undefined} onCheckMotion={checkMotion} profileId={activeId}/>
    <WallpaperEditor item={wallpaperArt} mode={prepareMode} onClose={()=>setWallpaperArt(null)} notify={setNotice}/>
    {compareBase&&!comparePair&&<div className="compare-dock"><Columns2 size={17}/><span>Compare mode: select another artwork</span><button onClick={()=>resetCompare()}><X size={16}/></button></div>}
    {compareBase&&comparePair&&<Dialog open={true} onOpenChange={(open)=>{if(!open)resetCompare();}} title={tr("Artwork comparison")} wide><Compare a={compareBase} b={comparePair} onClose={resetCompare}/></Dialog>}
    {notice&&<div className="toast" role="status"><Info size={17}/>{notice}<button aria-label={tr("Dismiss notice")} onClick={()=>setNotice('')}><X size={16}/></button></div>}
  </div></LocaleProvider>;
}
