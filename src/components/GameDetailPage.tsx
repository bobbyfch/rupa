import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Gamepad2, Heart, LoaderCircle } from 'lucide-react';
import type { Artwork } from '../lib/types';
import { groupGameArtworks, normalizeText, searchGameIndex, searchModernGameIndex, type GameAssetFilter } from '../lib/catalog';

type GameGroup = ReturnType<typeof groupGameArtworks>[number];
const FILTERS:[GameAssetFilter,string][]=[['covers','Covers'],['screenshots','Gameplay'],['wallpapers','Wallpapers'],['artworks','Publisher art'],['logos','Logos'],['icons','Icons'],['title-screens','Title screens'],['all','All assets']];
type SourceLink={label:string;url:string;kind?:string};
type GameSourceRegistry={entries?:{matches:string[];sources:SourceLink[]}[];catalogs?:{id:string;name:string;group:string;url?:string;urlTemplate?:string}[]};
type GameFacts={description?:string;publishers:string[];developers:string[];releaseDate?:string;platforms:string[];steamUrl?:string;wikidataUrl?:string};
type WikidataStatement={mainsnak?:{datavalue?:{value?:{id?:string;time?:string}|string}}};
type WikidataEntity={id:string;labels?:{en?:{value?:string}};descriptions?:{en?:{value?:string}};claims?:Record<string,WikidataStatement[]>};
function entityValues(entity:WikidataEntity,property:string){return(entity.claims?.[property]||[]).map(statement=>statement.mainsnak?.datavalue?.value).filter((value):value is {id:string}|string=>typeof value==='string'||Boolean(value&&typeof value==='object'&&'id'in value)).map(value=>typeof value==='string'?value:(value as {id?:string}).id||'').filter(Boolean);}
function entityDate(entity:WikidataEntity){const value=entity.claims?.P577?.[0]?.mainsnak?.datavalue?.value;if(!value||typeof value==='string'||!('time'in value))return;return value.time?.replace(/^\+/, '').slice(0,10);}
function cleanEntityLabels(values:string[]){return values.map(value=>value.trim()).filter(value=>value&&!/^Q\d+$/.test(value));}
function normalizePlatform(value:string){
  const normalized=value.trim().toLocaleLowerCase();
  if(!normalized||/^q\d+$/.test(normalized))return '';
  if(/microsoft windows|^windows$|pc \(microsoft windows\)/.test(normalized))return 'PC';
  if(/xbox series x and series s|xbox series x\/s/.test(normalized))return 'Xbox Series X/S';
  if(/playstation 5/.test(normalized))return 'PlayStation 5';
  if(/playstation 4/.test(normalized))return 'PlayStation 4';
  if(/nintendo switch/.test(normalized))return 'Nintendo Switch';
  if(normalized==='mac')return 'macOS';
  return value.trim();
}
async function wikidataFacts(title:string,signal:AbortSignal):Promise<Partial<GameFacts>>{
  const search=new URLSearchParams({action:'wbsearchentities',search:title,language:'en',uselang:'en',limit:'12',format:'json',origin:'*'});
  const response=await fetch('https://www.wikidata.org/w/api.php?'+search,{signal,headers:{Accept:'application/json'}});if(!response.ok)throw new Error('Wikidata search failed');
  const matches=(await response.json()).search as {id:string;label:string}[];
  const exact=matches.find(item=>normalizeText(item.label)===normalizeText(title));if(!exact)return{};
  const params=new URLSearchParams({action:'wbgetentities',ids:exact.id,props:'labels|descriptions|claims',languages:'en',format:'json',origin:'*'});
  const entityResponse=await fetch('https://www.wikidata.org/w/api.php?'+params,{signal,headers:{Accept:'application/json'}});if(!entityResponse.ok)throw new Error('Wikidata record failed');
  const entity=(await entityResponse.json()).entities?.[exact.id] as WikidataEntity|undefined;if(!entity)return{};
  const ids=[...entityValues(entity,'P123'),...entityValues(entity,'P178'),...entityValues(entity,'P400')].filter(value=>/^Q\d+$/.test(value));
  const labels=new Map<string,string>();
  if(ids.length){const labelsParams=new URLSearchParams({action:'wbgetentities',ids:[...new Set(ids)].slice(0,30).join('|'),props:'labels',languages:'en',format:'json',origin:'*'});const labelsResponse=await fetch('https://www.wikidata.org/w/api.php?'+labelsParams,{signal,headers:{Accept:'application/json'}});if(labelsResponse.ok){const data=await labelsResponse.json();for(const[id,value]of Object.entries(data.entities||{})){const label=(value as WikidataEntity).labels?.en?.value;if(label)labels.set(id,label);}}}
  const names=(property:string)=>cleanEntityLabels(entityValues(entity,property).map(value=>labels.get(value)||value));
  return{description:entity.descriptions?.en?.value,publishers:names('P123'),developers:names('P178'),releaseDate:entityDate(entity),platforms:names('P400'),wikidataUrl:`https://www.wikidata.org/wiki/${entity.id}`};
}
async function steamFacts(appId:string,signal:AbortSignal):Promise<Partial<GameFacts>>{
  if(!/^\d+$/.test(appId))return{};
  const url=`https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(appId)}&cc=us&l=en`;
  const response=await fetch(url,{signal,headers:{Accept:'application/json'}});if(!response.ok)throw new Error('Steam metadata unavailable');
  const root=await response.json(),record=root?.[appId];if(!record?.success||!record.data)return{};
  const data=record.data as {short_description?:string;publishers?:string[];developers?:string[];release_date?:{date?:string};platforms?:{windows?:boolean;mac?:boolean;linux?:boolean}};
  return{description:data.short_description,publishers:data.publishers||[],developers:data.developers||[],releaseDate:data.release_date?.date,platforms:Object.entries(data.platforms||{}).filter(([,available])=>available).map(([platform])=>platform==='mac'?'macOS':platform==='linux'?'Linux':'Windows'),steamUrl:`https://store.steampowered.com/app/${appId}/`};
}
function GameFacts({group}:{group:GameGroup}){
  const [facts,setFacts]=useState<GameFacts|null>(null),[loading,setLoading]=useState(true);
  useEffect(()=>{const controller=new AbortController();let active=true;const appId=group.editions.find(item=>item.provider==='Steam Store API'&&item.mediaId)?.mediaId;const timeout=window.setTimeout(()=>controller.abort(),12000);
    const wikidataRequest:Promise<Partial<GameFacts>>=wikidataFacts(group.title,controller.signal).catch(()=>({}));
    const steamRequest:Promise<Partial<GameFacts>>=appId?steamFacts(appId,controller.signal).catch(()=>({})):Promise.resolve({});
    const requests=[wikidataRequest,steamRequest];
    void Promise.all(requests).then(([wikidata,steam])=>{if(!active)return;const platformFacts=[...(wikidata.platforms||[]),...(steam.platforms||[])].map(normalizePlatform).filter(Boolean);setFacts({description:steam.description||wikidata.description,publishers:cleanEntityLabels(steam.publishers?.length?steam.publishers:wikidata.publishers||[]),developers:cleanEntityLabels(steam.developers?.length?steam.developers:wikidata.developers||[]),releaseDate:steam.releaseDate||wikidata.releaseDate,platforms:[...new Set([...group.platforms,...platformFacts].map(normalizePlatform).filter(Boolean))],steamUrl:steam.steamUrl,wikidataUrl:wikidata.wikidataUrl});}).finally(()=>{window.clearTimeout(timeout);if(active)setLoading(false);});
    return()=>{active=false;window.clearTimeout(timeout);controller.abort();};
  },[group.id,group.title,group.editions,group.platforms]);
  const year=facts?.releaseDate?.match(/(?:19|20)\d{2}/)?.[0];
  return <section className="game-facts" aria-label="Game metadata" aria-busy={loading}>
    <div className="game-facts-heading"><span className="tiny-kicker">GAME DETAILS</span>{loading&&<span><LoaderCircle size={13} className="game-finder-spinner"/> Updating metadata</span>}</div>
    {facts?.description&&<p className="game-facts-description">{facts.description.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim()}</p>}
    <div className="game-facts-grid">
      <div><small>RELEASE</small><strong>{year||'Not listed'}</strong></div>
      <div><small>PUBLISHER</small><strong>{facts?.publishers.join(', ')||'Not listed'}</strong></div>
      <div><small>DEVELOPER</small><strong>{facts?.developers.join(', ')||'Not listed'}</strong></div>
      <div><small>PLATFORMS</small><strong>{facts?.platforms.join(' · ')||group.platforms.join(' · ')||'Not listed'}</strong></div>
    </div>
    <div className="game-facts-sources">Metadata {facts?.steamUrl&&<a href={facts.steamUrl} target="_blank" rel="noreferrer">Steam <ArrowUpRight size={12}/></a>}{facts?.wikidataUrl&&<a href={facts.wikidataUrl} target="_blank" rel="noreferrer">Wikidata <ArrowUpRight size={12}/></a>}{!facts?.steamUrl&&!facts?.wikidataUrl&&<span>Source record unavailable</span>}</div>
  </section>;
}
export function GameDetailPage({group,favoriteIds,onBack,onOpen,onFavorite}:{group:GameGroup;favoriteIds:Set<string>;onBack:()=>void;onOpen:(item:Artwork)=>void;onFavorite:(item:Artwork)=>void}){
  const [filter,setFilter]=useState<GameAssetFilter>('all');
  const [results,setResults]=useState<Artwork[]>(group.editions);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [attempt,setAttempt]=useState(0);
  const [sourceRegistry,setSourceRegistry]=useState<GameSourceRegistry>({});
  useEffect(()=>{
    const controller=new AbortController();
    fetch(`${import.meta.env.BASE_URL}data/game-art-sources.json`,{signal:controller.signal,headers:{Accept:'application/json'}})
      .then(response=>response.ok?response.json() as Promise<GameSourceRegistry>:null)
      .then(data=>{if(data&&!controller.signal.aborted)setSourceRegistry(data);})
      .catch(()=>undefined);
    return()=>controller.abort();
  },[]);
  useEffect(()=>{
    const controller=new AbortController();let active=true;let timedOut=false;
    const timeout=window.setTimeout(()=>{timedOut=true;controller.abort();},20_000);
    setLoading(true);
    const modernOnly=group.platforms.some(platform=>/playstation 4|playstation 5|nintendo switch|xbox one|xbox series|\bpc\b/i.test(platform));
    void Promise.all([
      modernOnly?Promise.resolve([]):searchGameIndex(group.title,{assetFilter:filter,signal:controller.signal}),
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
  const curatedSources=(sourceRegistry.entries||[]).filter(entry=>entry.matches.some(match=>group.title.toLocaleLowerCase().includes(match.toLocaleLowerCase()))).flatMap(entry=>entry.sources);
  const communitySearches=(sourceRegistry.catalogs||[]).filter(source=>Boolean(source.urlTemplate)&&/community/i.test(source.group));
  const steamSource=display.find(item=>item.provider==='Steam Store API')?.sourceUrl;
  return <section className="content-width search-content game-detail-page" aria-labelledby="game-detail-title">
    <button type="button" className="back-to-collections" onClick={onBack}><ArrowLeft size={16}/> Back to games</button>
    <header className="game-detail-header"><div><span className="tiny-kicker">GAME / EDITIONS &amp; ARTWORK</span><h1 id="game-detail-title">{group.title}</h1><p>{group.platforms.join(' · ')} · {display.length} indexed visuals</p></div><div className="game-detail-links">{steamSource&&<a href={steamSource} target="_blank" rel="noreferrer">Steam Store <ArrowUpRight size={13}/></a>}<a href={'https://www.steamgriddb.com/search/grids?term='+encodeURIComponent(group.title)} target="_blank" rel="noreferrer">SteamGridDB <ArrowUpRight size={13}/></a><a href={'https://gamesdb.launchbox-app.com/games/results?id='+encodeURIComponent(group.title)} target="_blank" rel="noreferrer">LaunchBox <ArrowUpRight size={13}/></a></div></header>
    <GameFacts group={group}/>
    {curatedSources.length>0&&<nav className="game-source-band" aria-label="Additional publisher sources"><span>PUBLISHER SOURCES</span><div>{curatedSources.map(source=><a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label}<small>{source.kind||'Image archive'}</small><ArrowUpRight size={13}/></a>)}</div></nav>}
    {communitySearches.length>0&&<nav className="game-source-band" aria-label={`Other image catalogs for ${group.title}`}><span>SEARCH OTHER CATALOGS</span><div>{communitySearches.map(source=><a key={source.id} href={source.urlTemplate!.replace('{query}',encodeURIComponent(group.title))} target="_blank" rel="noreferrer">{source.name}<small>External title search</small><ArrowUpRight size={13}/></a>)}</div></nav>}
    <div className="game-asset-filters" role="group" aria-label="Game artwork type">{FILTERS.map(([id,label])=><button type="button" key={id} className={filter===id?'active':''} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label}</button>)}</div>
    <div className="results-head"><span>{loading?'LOADING ASSETS':display.length+' VISUALS'}</span><span>LINKED SOURCES / REFERENCE IMAGES</span></div>
    {loading&&display.length===0?<div className="game-finder-empty"><LoaderCircle size={18} className="game-finder-spinner"/> Gathering editions and artwork.</div>:error?<div className="game-finder-empty" role="status"><strong>Artwork could not be loaded</strong><span>{error}</span><button type="button" onClick={()=>setAttempt(value=>value+1)}>Try again</button></div>:display.length?<div className={`game-detail-assets-grid${filter==='artworks'?' is-masonry':''}`}>{display.map(item=><article className="game-detail-asset" key={item.id}><button type="button" className="game-detail-image" data-art-kind={item.provider==='Steam Store API'&&item.kind==='cover'?'wide-cover':item.kind || 'cover'} onClick={()=>onOpen(item)}>{item.previewUrl?<img src={item.previewUrl} alt={item.title+' '+item.subtitle} loading="lazy" decoding="async" onError={event=>{event.currentTarget.style.visibility='hidden';}}/>:<span className="game-cover-unavailable"><Gamepad2 size={18}/><small>Preview unavailable</small></span>}</button><div><span>{item.kind||'artwork'}{item.region?' · '+item.region:''}</span><strong>{item.subtitle}</strong><div className="game-detail-actions"><button type="button" className={favoriteIds.has(item.id)?'saved':''} onClick={()=>onFavorite(item)} aria-label={favoriteIds.has(item.id)?'Remove '+item.title+' from saved':'Save '+item.title+' to saved'} title={favoriteIds.has(item.id)?'Remove from saved':'Save to saved'}><Heart size={14} fill={favoriteIds.has(item.id)?'currentColor':'none'}/></button><a href={item.sourceUrl} target="_blank" rel="noreferrer">Source <ArrowUpRight size={12}/></a></div></div></article>)}</div>:<div className="game-finder-empty"><Gamepad2 size={22}/><strong>No indexed assets for this filter</strong><span>Try another artwork type or open the linked catalogs for broader promotional art.</span></div>}
    <p className="game-finder-footnote">Steam, publisher, and community catalogs keep serving the images. Rupa stores their URLs and source pages; a refresh can add new titles and media without changing this viewer.</p>
  </section>;
}
