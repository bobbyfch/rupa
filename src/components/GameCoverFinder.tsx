import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown, Database, Gamepad2, Info, LoaderCircle, Search } from 'lucide-react';
import type { Artwork } from '../lib/types';
import { browseGamePlatform, groupGameArtworks, loadManifest, normalizeText, searchGameIndex, searchModernGameIndex, MODERN_GAME_PLATFORMS } from '../lib/catalog';
import type { GameAssetFilter, IndexManifest, PlatformBrowse } from '../lib/catalog';
import { Button } from './ui/button';
import { GameConsoleSelector } from './GameConsoleSelector';
import { GameDetailPage } from './GameDetailPage';
import { GameTrendingPanel } from './GameTrendingPanel';
const GameSourceIndex = lazy(() => import('./GameSourceIndex').then(module => ({ default: module.GameSourceIndex })));

const initialPlatform = () => new URLSearchParams(window.location.search).get('platform') || 'all';
type TrendingGame = { rank: number; appId: number; title: string; image: string; sourceUrl: string; source: string };

export function GameCoverFinder({ initialQuery = '', favoriteIds, onFavorite, onOpen, onBack }: {
  initialQuery?: string;
  favoriteIds: Set<string>;
  onFavorite: (item: Artwork) => void;
  onOpen: (item: Artwork) => void;
  onBack: () => void;
}) {
  const [manifest, setManifest] = useState<IndexManifest | null>(null);
  const [manifestError, setManifestError] = useState('');
  const [query, setQuery] = useState(initialQuery);
  const [platform, setPlatform] = useState(initialPlatform);
  const [results, setResults] = useState<Artwork[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [visibleCount, setVisibleCount] = useState(72);
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set());
  const [detailGroup,setDetailGroup]=useState<ReturnType<typeof groupGameArtworks>[number]|null>(null);
  const [sourcePanelOpen,setSourcePanelOpen]=useState(false);
  const [sourcePanelLoaded,setSourcePanelLoaded]=useState(false);
  const [browseMeta,setBrowseMeta]=useState<PlatformBrowse|null>(null);
  const [heroImages,setHeroImages]=useState<string[]>([]);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    loadManifest(controller.signal)
      .then(value => { if (!controller.signal.aborted) setManifest(value); })
      .catch(reason => { if (!controller.signal.aborted) setManifestError(reason instanceof Error ? reason.message : 'Game index could not be loaded.'); });
    return () => { controller.abort(); request.current?.abort(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}data/games-trending.json`, { signal: controller.signal, cache: 'force-cache', headers: { Accept: 'application/json' } })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Game chart snapshot unavailable')))
      .then(data => {
        if (controller.signal.aborted) return;
        const chartIndex = data?.charts && typeof data.charts === 'object' ? data.charts as Record<string, { items?: { title?: string; image?: string }[] }> : {};
        const charts = [chartIndex.top_sellers, chartIndex.most_played].filter((chart): chart is { items?: { title?: string; image?: string }[] } => Boolean(chart));
        const images = [...new Set(charts.flatMap(chart => chart.items || [])
          .filter(item => !/\b(?:adult|erotic|hentai|nsfw|sex|waifu)\b/i.test(item.title || ''))
          .map(item => item.image)
          .filter((image): image is string => Boolean(image)))];
        for (let index = images.length - 1; index > 0; index--) {
          const swapIndex = Math.floor(Math.random() * (index + 1));
          [images[index], images[swapIndex]] = [images[swapIndex], images[index]];
        }
        setHeroImages(images.slice(0, 5));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const platforms = useMemo(() => (manifest?.shards || [])
    .filter(shard => shard.kind === 'games')
    .map(shard => ({ id: shard.platform || shard.id.replace(/^games-/, ''), label: shard.label || shard.platform || shard.id }))
    .concat(MODERN_GAME_PLATFORMS.map(item=>({id:item.id,label:item.label}))).sort((a, b) => a.label.localeCompare(b.label)), [manifest]);
  const gameShards = (manifest?.shards || []).filter(shard => shard.kind === 'games');
  const classicRecordCount = gameShards.reduce((total, shard) => total + shard.rows, 0);
  const groupedResults = useMemo(() => groupGameArtworks(results), [results]);

  const runSearch = useCallback(async (value: string, selectedPlatform: string): Promise<ReturnType<typeof groupGameArtworks>> => {
    const selectedAssets: GameAssetFilter = 'covers';
    const term = value.trim();
    if (term.length < 2) { setError('Enter at least two characters, a game title, or a full game code.'); setResults([]); setSearched(false); return []; }
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setBrowseMeta(null);
    setLoading(true); setError(''); setWarnings([]); setResults([]); setFailedImages(new Set()); setSearched(true); setVisibleCount(72);
    let timedOut = false;
    const timeoutId = window.setTimeout(() => { timedOut = true; controller.abort(); }, 20_000);
    const platformMatch = MODERN_GAME_PLATFORMS.find(item => item.id === selectedPlatform);
    const cleanTerm = term.replace(/\b(?:playstation\s*[45]|ps[45]|nintendo\s*switch(?:\s*2)?|switch(?:\s*2)?|xbox\s*one|xbox\s*series(?:\s*x\s*\/\s*s)?|pc)\b/ig, ' ').replace(/\s+/g, ' ').trim() || term;
    try {
      if (platformMatch) {
        const modern = await searchModernGameIndex(cleanTerm, platformMatch.id, selectedAssets, controller.signal);
        if (!controller.signal.aborted) setResults(modern);
        if (controller.signal.aborted) return [];
        return groupGameArtworks(modern);
      } else if (selectedPlatform === 'all') {
        let classicResults: Artwork[] = [];
        let modernResults: Artwork[] = [];
        const publishCombined = () => {
          if (controller.signal.aborted) return;
          const unique = new Map([...classicResults, ...modernResults].map(item => [item.id, item]));
          setResults([...unique.values()]);
        };
        const classicSearch = searchGameIndex(term, {
          assetFilter: selectedAssets,
          signal: controller.signal,
          onPartial: items => { classicResults = items; publishCombined(); },
          onWarning: message => { if (!controller.signal.aborted) setWarnings(current => current.includes(message) ? current : [...current, message]); },
        });
        const modernSearch = searchModernGameIndex(cleanTerm, 'all', selectedAssets, controller.signal);
        const [classicOutcome, modernOutcome] = await Promise.allSettled([classicSearch, modernSearch]);
        if (controller.signal.aborted) return [];
        if (classicOutcome.status === 'fulfilled') classicResults = classicOutcome.value;
        else setWarnings(current => current.includes('Classic console indexes could not be loaded.') ? current : [...current, 'Classic console indexes could not be loaded.']);
        if (modernOutcome.status === 'fulfilled') modernResults = modernOutcome.value;
        else setWarnings(current => current.includes('Modern game sources could not be reached.') ? current : [...current, 'Modern game sources could not be reached.']);
        publishCombined();
        if (classicOutcome.status === 'rejected' && modernOutcome.status === 'rejected') throw classicOutcome.reason;
        return groupGameArtworks([...new Map([...classicResults, ...modernResults].map(item => [item.id, item])).values()]);
      } else {
        const hits = await searchGameIndex(term, {
          platform: selectedPlatform === 'all' ? undefined : selectedPlatform,
          assetFilter: selectedAssets,
          signal: controller.signal,
          onPartial: items => { if (!controller.signal.aborted) setResults(items); },
          onWarning: message => { if (!controller.signal.aborted) setWarnings(current => current.includes(message) ? current : [...current, message]); },
        });
        if (!controller.signal.aborted) {
          setResults(hits);
        }
        if (controller.signal.aborted) return [];
        return groupGameArtworks(hits);
      }
    } catch (reason) {
      if (timedOut) setError('Search timed out. Choose one console family or try again.');
      else if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'The game index could not be searched.');
      return [];
    } finally {
      window.clearTimeout(timeoutId);
      if (request.current === controller) setLoading(false);
    }
  }, []);

  const browsePlatform = useCallback(async (selectedPlatform: string) => {
    const selectedAssets: GameAssetFilter = 'covers';
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setLoading(true); setError(''); setWarnings([]); setResults([]); setFailedImages(new Set()); setSearched(true); setBrowseMeta(null); setVisibleCount(72);
    const timeoutId = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const result = await browseGamePlatform(selectedPlatform, controller.signal, 36, selectedAssets);
      if (!controller.signal.aborted) { setBrowseMeta(result); setResults(result.items); }
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'This platform index could not be loaded.');
    } finally {
      window.clearTimeout(timeoutId);
      if (request.current === controller) setLoading(false);
    }
  }, []);

  const selectPlatform = useCallback((selectedPlatform: string) => {
    setPlatform(selectedPlatform);
    if (query.trim().length >= 2) { void runSearch(query, selectedPlatform); return; }
    if (selectedPlatform === 'all') { request.current?.abort(); setBrowseMeta(null); setResults([]); setSearched(false); setLoading(false); setError(''); return; }
    void browsePlatform(selectedPlatform);
  }, [browsePlatform, query, runSearch]);

  useEffect(() => {
    const selectedPlatform = initialPlatform();
    if (initialQuery.trim().length >= 2) void runSearch(initialQuery, selectedPlatform);
    else if (selectedPlatform !== 'all') void browsePlatform(selectedPlatform);
  }, []); // Opened links with a query or platform can be shared and opened directly.

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'games');
    if (query.trim()) url.searchParams.set('q', query.trim()); else url.searchParams.delete('q');
    if (platform !== 'all') url.searchParams.set('platform', platform); else url.searchParams.delete('platform');
    window.history.replaceState(null, '', url);
    void runSearch(query, platform);
  }

  const toggleFailed = (id: string) => setFailedImages(current => new Set(current).add(id));
  async function openTrendingGame(game:TrendingGame){
    setQuery(game.title);setPlatform('all');
    const groups=await runSearch(game.title,'all');
    const appId=String(game.appId);
    const exact=groups.find(group=>group.editions.some(item=>item.mediaId===appId))
      ||groups.find(group=>normalizeText(group.title)===normalizeText(game.title));
    const chartArtwork:Artwork={id:`steam:${game.appId}:chart-cover`,category:'games',title:game.title,subtitle:'PC · Steam chart',source:'Steam Store',provider:'Steam Store API',sourceUrl:game.sourceUrl,imageUrl:game.image,previewUrl:game.image,downloadUrl:game.image,mediaId:appId,editionId:`steam:${game.appId}`,kind:'cover',rights:'source-only',availability:'link-only'};
    setDetailGroup(exact?{...exact,editions:[chartArtwork,...exact.editions.filter(item=>item.mediaId!==appId)],platforms:[...new Set([...exact.platforms,'PC'])]}:{id:normalizeText(game.title),title:game.title,editions:[chartArtwork],platforms:['PC']});
    const url=new URL(window.location.href);url.search='';url.searchParams.set('view','games');url.searchParams.set('q',game.title);window.history.replaceState(null,'',url);
    window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  }
  if(detailGroup)return <GameDetailPage group={detailGroup} favoriteIds={favoriteIds} onBack={()=>setDetailGroup(null)} onOpen={onOpen} onFavorite={onFavorite} onPlatformBrowse={id=>{setDetailGroup(null);setQuery('');setPlatform(id);void browsePlatform(id);}}/>;
  return <section className="content-width search-content game-finder-page" aria-labelledby="game-finder-title">
    <button type="button" className="back-to-collections" onClick={onBack}><ArrowLeft size={16}/> Categories</button>
    <div className="listing-header game-finder-header">
      <div className="game-finder-title"><div className="tiny-kicker">CATEGORY / GAME ARCHIVE</div><h1 id="game-finder-title">Games<br/><em>in view.</em></h1><p>Find a game across its editions, consoles, and visual assets. Search by title or product code.</p></div>
      <aside className="game-finder-overview" aria-label="Game archive coverage"><div className="game-finder-art-ribbon" aria-hidden="true">{heroImages.map((image,index)=><span key={`${image}-${index}`}><img src={image} alt="" loading={index>1?'lazy':'eager'} decoding="async"/></span>)}</div><span className="tiny-kicker">ARCHIVE COVERAGE</span><div className="game-finder-overview-count"><strong>{platforms.length||MODERN_GAME_PLATFORMS.length}</strong><span>systems mapped</span></div><div className="game-finder-overview-stats"><span><b>{classicRecordCount.toLocaleString()}</b> classic title records</span><span><b>{MODERN_GAME_PLATFORMS.length}</b> modern catalogs</span></div><div className="game-finder-overview-tags"><span>Covers</span><span>Gameplay</span><span>Logos</span><span>Publisher art</span></div></aside>
    </div>
    <form className="game-finder-search" onSubmit={submit}>
      <label className="game-search-label" htmlFor="game-cover-query">GAME TITLE OR PRODUCT CODE</label>
      <div className="game-query-field"><Search size={21}/><input id="game-cover-query" aria-label="Search game title or code" value={query} onChange={event => setQuery(event.target.value)} placeholder="Start typing · e.g. Final Fantasy X or SLUS-20312" autoComplete="off"/></div>
      <div className="console-choice"><span className="game-search-label">CHOOSE A CONSOLE · BROWSE BY PLATFORM FAMILY</span><GameConsoleSelector options={platforms} value={platform} onChange={selectPlatform}/></div>
      <div className="game-search-controls"><Button type="submit" disabled={loading}>{loading ? 'Searching…' : 'Search'} <ArrowRight size={16}/></Button></div>
    </form>
    <div className="game-finder-hints">
      <span>Try</span>
      {['Mario GBA', 'Zelda N64', 'Final Fantasy X PS2', 'PCSE00628'].map(example => <button type="button" key={example} onClick={() => { setQuery(example); void runSearch(example, 'all'); }}>{example}</button>)}
    </div>
    {!searched && <GameTrendingPanel onSelect={game => { void openTrendingGame(game); }}/>}
    {manifestError && <div className="search-warning" role="status"><Info size={16}/><span>Console list unavailable. {manifestError}</span></div>}
    {browseMeta&&<div className="game-platform-browse-heading"><div><span className="tiny-kicker">{browseMeta.sourceLabel}</span><h2>{browseMeta.items.length ? browseMeta.heading : 'No indexed titles yet'}</h2><p>{browseMeta.items.length ? 'Select a title to open its details and artwork.' : 'This platform index has no current game records. Search by title or browse the platform store.'}</p></div><a href={browseMeta.sourceUrl} target="_blank" rel="noreferrer">Open official catalog <ArrowRight size={14}/></a></div>}
    <div id="game-results" className="results-head" aria-live="polite" aria-atomic="true"><span>{searched ? `${groupedResults.length} GAMES · ${results.length} COVERS` : 'READY TO SEARCH'}</span><span>{platform === 'all' ? `${platforms.length} SYSTEMS` : platforms.find(item => item.id === platform)?.label.toUpperCase() || 'CONSOLE INDEX'}</span></div>
    {warnings.length > 0 && <div className="search-warning" role="status" aria-live="polite"><Info size={16}/><span>Some indexes could not be reached: {warnings.join(' · ')}</span></div>}
    {loading && results.length === 0 && <div className="game-finder-empty" role="status"><LoaderCircle size={18} className="game-finder-spinner"/><span>Searching the selected console indexes…</span></div>}
    {!loading && error && <div className="game-finder-empty"><strong>Search needs a little more detail</strong><span>{error}</span></div>}
    {searched && results.length === 0 && !loading && !error && <div className="game-finder-empty"><Gamepad2 size={24}/><strong>{browseMeta ? 'No game records in this platform index' : warnings.length ? 'No matching covers loaded' : 'No matching covers found'}</strong><span>{browseMeta ? 'Public metadata coverage varies by platform. Search for a specific game or use the official catalog link above.' : warnings.length ? 'Try the search again or select one platform to isolate an available index.' : 'Try a shorter title, another platform, or the game’s serial / App ID.'}</span></div>}
    {groupedResults.length > 0 && <div className="game-title-groups">
      {groupedResults.slice(0, visibleCount).map(group => {
        const lead = group.editions[0];
        const editionCount = new Set(group.editions.map(item => item.editionId || item.id)).size;
        return <article className="game-title-group" key={group.id}>
          <div className="game-title-summary">
            <button type="button" className="game-title-cover" data-art-kind={lead.provider==='Steam Store API'&&lead.kind==='cover'?'wide-cover':lead.kind || 'cover'} onClick={() => setDetailGroup(group)} aria-label={`Open ${group.title} details`}>
              {failedImages.has(lead.id) || !lead.previewUrl ? <span className="game-cover-unavailable"><Gamepad2 size={21}/><small>Preview unavailable</small></span> : <img src={lead.previewUrl} alt={`${group.title} · ${lead.subtitle}`} loading="lazy" decoding="async" onError={() => toggleFailed(lead.id)}/>}
            </button>
            <div className="game-title-copy"><button type="button" className="game-cover-title" onClick={() => setDetailGroup(group)}>{group.title}</button><small>{group.platforms.length} {group.platforms.length === 1 ? 'platform' : 'platforms'} · {editionCount} {editionCount === 1 ? 'edition' : 'editions'} · {group.editions.length} visuals</small><div className="game-platform-chips">{group.platforms.slice(0, 4).map(name => <span key={name}>{name.replace(/^Sony /, '').replace(/^Nintendo /, '')}</span>)}{group.platforms.length > 4 && <span>+{group.platforms.length - 4}</span>}</div></div>
            <button type="button" className="game-group-toggle" onClick={() => setDetailGroup(group)}>View details <ArrowRight size={15}/></button>
          </div>
        </article>;
      })}
    </div>}
    {groupedResults.length > visibleCount && <div className="ghibli-more"><Button variant="outline" onClick={() => setVisibleCount(count => count + 72)}>Load more games <span>({groupedResults.length - visibleCount} remaining)</span></Button></div>}
    <p className="game-finder-footnote">Connected feeds can be searched here. Catalogs without a supported feed are linked in the coverage details below.</p>
    <details className="game-source-disclosure" open={sourcePanelOpen} onToggle={event=>{const open=event.currentTarget.open;setSourcePanelOpen(open);if(open)setSourcePanelLoaded(true);}}><summary><span className="game-source-disclosure-icon"><Database size={17}/></span><span className="game-source-disclosure-copy"><strong>Platform &amp; image coverage</strong><small>Systems, active feeds, and the catalogs behind results</small></span><ChevronDown size={18} className="game-source-disclosure-chevron"/></summary>{sourcePanelLoaded&&<Suspense fallback={<div className="game-source-loading" role="status"><LoaderCircle size={18} className="game-finder-spinner"/> Loading source coverage…</div>}><GameSourceIndex query={query} onOpenGames={(selectedPlatform,term)=>{setSourcePanelOpen(false);const selected=selectedPlatform||'all',searchTerm=(term||query).trim();setPlatform(selected);if(searchTerm){setQuery(searchTerm);void runSearch(searchTerm,selected);}else if(selected!=='all')void browsePlatform(selected);document.getElementById('game-results')?.scrollIntoView({behavior:'smooth',block:'start'});}}/></Suspense>}</details>
  </section>;
}
