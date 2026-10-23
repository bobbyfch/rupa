import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ArrowLeft, ArrowUpRight, BookOpen, Heart, LoaderCircle, RefreshCw } from 'lucide-react';
import type { Artwork, MangaSeriesDetail } from '../lib/types';
import { getMangaSeriesDetail } from '../lib/providers';

function MangaVolumeCard({item,isSaved,onOpen,onFavorite}:{item:Artwork;isSaved:boolean;onOpen:(item:Artwork)=>void;onFavorite:(item:Artwork)=>void}){
 const [failed,setFailed]=useState(false);
 return <article className="manga-volume-card">
  <button className="manga-volume-image" type="button" onClick={()=>onOpen(item)} aria-label={`Open ${item.title}`}>
   {failed?<span className="manga-volume-fallback"><BookOpen size={22}/><small>Cover unavailable</small></span>:<img src={item.previewUrl||item.imageUrl} alt={`${item.subtitle} cover`} loading="lazy" decoding="async" onError={()=>setFailed(true)}/>}
   <span className="manga-volume-glint" aria-hidden="true"/>
  </button>
  <div className="manga-volume-copy"><div><strong>{item.subtitle.split(' · ')[0]}</strong><small>{item.subtitle.split(' · ').slice(1).join(' · ')||`${item.source||'Manga'} cover art`}</small></div><button type="button" className={`heart ${isSaved?'saved':''}`} onClick={()=>onFavorite(item)} aria-label={isSaved?'Remove favorite':'Save favorite'} title={isSaved?'Remove favorite':'Save favorite'}><Heart size={17} fill={isSaved?'currentColor':'none'}/></button></div>
 </article>;
}

export function MangaDetailPage({series,favoriteIds,onFavorite,onOpen,onBack}:{series:Artwork;favoriteIds:Set<string>;onFavorite:(item:Artwork)=>void;onOpen:(item:Artwork)=>void;onBack:()=>void}){
 const [detail,setDetail]=useState<MangaSeriesDetail|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[sort,setSort]=useState<'ascending'|'descending'>('ascending');
 useEffect(()=>{
  const controller=new AbortController();let active=true,timedOut=false;const timer=window.setTimeout(()=>{timedOut=true;controller.abort();},30_000);
  setLoading(true);setError('');setDetail(null);
  void getMangaSeriesDetail(series.title,series.id,controller.signal,series.provider||series.source,series.mediaId).then(value=>{if(active)setDetail(value);}).catch(reason=>{if(active)setError(timedOut?'Loading manga artwork took too long. Try again.':reason instanceof Error?reason.message:'Manga artwork could not be loaded.');}).finally(()=>{window.clearTimeout(timer);if(active)setLoading(false);});
  return()=>{active=false;window.clearTimeout(timer);controller.abort();};
 },[series.id,series.title,series.provider,series.source,series.mediaId,attempt]);
 const volumes=useMemo(()=>{const items=detail?.volumes||[];return sort==='ascending'?items:[...items].reverse();},[detail?.volumes,sort]);
 const backdrop=useMemo(()=>{const images=[series.previewUrl,series.imageUrl,...(detail?.volumes||[]).slice(0,8).map(item=>item.previewUrl)].filter(Boolean);return images.length?images[Math.floor(Math.random()*images.length)]:'';},[series.id,detail?.id]);
 return <section className="content-width manga-detail-page" aria-labelledby="manga-detail-title">
  <button className="back-to-collections" type="button" onClick={onBack}><ArrowLeft size={15}/> Back to manga search</button>
  <header className="manga-series-header" style={backdrop?{'--manga-backdrop':`url("${backdrop.replaceAll('"','%22')}")` } as CSSProperties:undefined}>
   <div className="manga-series-backdrop" aria-hidden="true"/>
   <div className="manga-series-heading"><span className="tiny-kicker">MANGA / SERIES DETAILS</span><h1 id="manga-detail-title">{detail?.title||series.title}</h1><p>{[detail?.year||series.year,detail?.status,detail?.lastVolume?`Last volume ${detail.lastVolume}`:''].filter(Boolean).join(' · ')||'Series record and cover editions'}</p>{detail?.authors.length?<div className="manga-series-authors">{detail.authors.join(' · ')}</div>:null}</div>
   <div className="manga-series-actions"><a href={detail?.sourceUrl||series.sourceUrl} target="_blank" rel="noreferrer">{detail?.source||series.source||'Open source'} <ArrowUpRight size={14}/></a><span>{detail?`${detail.volumes.length} ${detail.galleryLabel||'volume covers'}`:'Series artwork'}</span></div>
  </header>
  {detail?.description&&<p className="manga-series-description">{detail.description}</p>}
  <div className="manga-volume-heading"><div><span className="tiny-kicker">SERIES ARTWORK</span><h2>{detail?.galleryLabel||'Volume covers'}</h2></div>{detail?.volumes.length?<label><span>Sort</span><select value={sort} onChange={event=>setSort(event.target.value as typeof sort)}><option value="ascending">{detail.volumesNumbered===false?'First added':'Volume · ascending'}</option><option value="descending">{detail.volumesNumbered===false?'Last added':'Volume · descending'}</option></select></label>:null}</div>
  {detail?.detailNote&&<p className="manga-series-description manga-series-note">{detail.detailNote}</p>}
  {loading?<div className="manga-volume-grid" aria-busy="true" role="status"><span className="manga-volume-loading"><LoaderCircle size={17} className="rupa-spinner"/> Loading manga artwork</span>{Array.from({length:10},(_,index)=><div className="manga-volume-skeleton" key={index}><span/><i/><i/></div>)}</div>:error?<><div className="manga-detail-state" role="status"><BookOpen size={24}/><h2>Volume data unavailable</h2><p>{error}</p><button type="button" className="ca-button ca-button-outline" onClick={()=>setAttempt(value=>value+1)}><RefreshCw size={14}/> Try again</button></div>{series.imageUrl&&<><div className="manga-volume-heading"><div><span className="tiny-kicker">SOURCE COVER</span><h2>Series artwork</h2></div></div><div className="manga-volume-grid"><MangaVolumeCard item={series} isSaved={favoriteIds.has(series.id)} onFavorite={onFavorite} onOpen={onOpen}/></div></>}</>:volumes.length?<div className="manga-volume-grid">{volumes.map(item=><MangaVolumeCard key={item.id} item={item} isSaved={favoriteIds.has(item.id)} onFavorite={onFavorite} onOpen={onOpen}/>)}</div>:<><div className="manga-detail-state"><BookOpen size={24}/><h2>No volume covers listed</h2><p>This source has no numbered volume covers for the series yet. The selected series cover is shown below.</p><button type="button" className="ca-button ca-button-outline" onClick={()=>setAttempt(value=>value+1)}><RefreshCw size={14}/> Try again</button></div>{series.imageUrl&&<div className="manga-volume-grid"><MangaVolumeCard item={series} isSaved={favoriteIds.has(series.id)} onFavorite={onFavorite} onOpen={onOpen}/></div>}</>}
 </section>;
}
