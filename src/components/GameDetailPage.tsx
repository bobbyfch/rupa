import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Gamepad2, Heart, LoaderCircle } from 'lucide-react';
import type { Artwork } from '../lib/types';
import { groupGameArtworks, searchGameIndex, searchModernGameIndex, type GameAssetFilter } from '../lib/catalog';

type GameGroup = ReturnType<typeof groupGameArtworks>[number];
const FILTERS:[GameAssetFilter,string][]=[['covers','Covers'],['screenshots','Gameplay'],['logos','Logos'],['icons','Icons'],['title-screens','Title screens'],['all','All assets']];
export function GameDetailPage({group,favoriteIds,onBack,onOpen,onFavorite}:{group:GameGroup;favoriteIds:Set<string>;onBack:()=>void;onOpen:(item:Artwork)=>void;onFavorite:(item:Artwork)=>void}){
  const [filter,setFilter]=useState<GameAssetFilter>('all');
  const [results,setResults]=useState<Artwork[]>(group.editions);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();let active=true;let timedOut=false;
    const timeout=window.setTimeout(()=>{timedOut=true;controller.abort();},20_000);
    setLoading(true);
    void Promise.all([
      searchGameIndex(group.title,{assetFilter:filter,signal:controller.signal}),
      searchModernGameIndex(group.title,'all',filter,controller.signal),
    ]).then(([local,modern])=>{
      if(!active)return;
      const combined=[...local,...modern],matched=groupGameArtworks(combined).find(entry=>entry.id===group.id);
      setResults(matched?.editions||combined.filter(item=>item.title.toLowerCase().includes(group.title.toLowerCase())||group.title.toLowerCase().includes(item.title.toLowerCase())));
      setError('');
    }).catch(reason=>{if(active)setError(timedOut?'Artwork search timed out. Try again.':reason instanceof Error?reason.message:'Artwork search is temporarily unavailable.');}).finally(()=>{window.clearTimeout(timeout);if(active)setLoading(false);});
    return()=>{active=false;window.clearTimeout(timeout);controller.abort();};
  },[group.id,group.title,filter,attempt]);
  const display=useMemo(()=>results,[results]);
  return <section className="content-width search-content game-detail-page" aria-labelledby="game-detail-title">
    <button type="button" className="back-to-collections" onClick={onBack}><ArrowLeft size={16}/> Back to games</button>
    <header className="game-detail-header"><div><span className="tiny-kicker">GAME / EDITIONS &amp; ARTWORK</span><h1 id="game-detail-title">{group.title}</h1><p>{group.platforms.join(' · ')} · {display.length} indexed visuals</p></div><div className="game-detail-links"><a href={'https://www.steamgriddb.com/search/grids?term='+encodeURIComponent(group.title)} target="_blank" rel="noreferrer">SteamGridDB <ArrowUpRight size={13}/></a><a href={'https://gamesdb.launchbox-app.com/games/results?id='+encodeURIComponent(group.title)} target="_blank" rel="noreferrer">LaunchBox <ArrowUpRight size={13}/></a></div></header>
    <div className="game-asset-filters" role="group" aria-label="Game artwork type">{FILTERS.map(([id,label])=><button type="button" key={id} className={filter===id?'active':''} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label}</button>)}</div>
    <div className="results-head"><span>{loading?'LOADING ASSETS':display.length+' VISUALS'}</span><span>LINKED SOURCES / REFERENCE IMAGES</span></div>
    {loading&&display.length===0?<div className="game-finder-empty"><LoaderCircle size={18} className="game-finder-spinner"/> Gathering editions and artwork.</div>:error?<div className="game-finder-empty" role="status"><strong>Artwork could not be loaded</strong><span>{error}</span><button type="button" onClick={()=>setAttempt(value=>value+1)}>Try again</button></div>:display.length?<div className="game-detail-assets-grid">{display.map(item=><article className="game-detail-asset" key={item.id}><button type="button" className="game-detail-image" data-art-kind={item.kind || 'cover'} onClick={()=>onOpen(item)}>{item.previewUrl?<img src={item.previewUrl} alt={item.title+' '+item.subtitle} loading="lazy" decoding="async" onError={event=>{event.currentTarget.style.visibility='hidden';}}/>:<span className="game-cover-unavailable"><Gamepad2 size={18}/><small>Preview unavailable</small></span>}</button><div><span>{item.kind||'artwork'}{item.region?' · '+item.region:''}</span><strong>{item.subtitle}</strong><div className="game-detail-actions"><button type="button" className={favoriteIds.has(item.id)?'saved':''} onClick={()=>onFavorite(item)} aria-label={favoriteIds.has(item.id)?'Remove '+item.title+' from saved':'Save '+item.title+' to saved'} title={favoriteIds.has(item.id)?'Remove from saved':'Save to saved'}><Heart size={14} fill={favoriteIds.has(item.id)?'currentColor':'none'}/></button><a href={item.sourceUrl} target="_blank" rel="noreferrer">Source <ArrowUpRight size={12}/></a></div></div></article>)}</div>:<div className="game-finder-empty"><Gamepad2 size={22}/><strong>No indexed assets for this filter</strong><span>Try another artwork type or open the linked catalogs for broader promotional art.</span></div>}
    <p className="game-finder-footnote">Game art remains with its publisher or contributor. Wikidata and Wikimedia Commons show their source pages; the linked catalog search may contain more editions, screenshots, icons, and logos.</p>
  </section>;
}
