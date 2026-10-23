import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Gamepad2, Info, LoaderCircle, Search } from 'lucide-react';
import type { Artwork } from '../lib/types';
import { browseGamePlatform, groupGameArtworks, loadManifest, normalizeText, searchGameIndex, searchModernGameIndex, MODERN_GAME_PLATFORMS } from '../lib/catalog';
import type { GameAssetFilter, IndexManifest, PlatformBrowse } from '../lib/catalog';
import { Button } from './ui/button';
import { GameConsoleSelector } from './GameConsoleSelector';
import { GameDetailPage } from './GameDetailPage';
import { GameTrendingPanel } from './GameTrendingPanel';
const GameSourceIndex = lazy(() => import('./GameSourceIndex').then(module => ({ default: module.GameSourceIndex })));

const initialPlatform = () => new URLSearchParams(window.location.search).get('platform') || 'all';

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
  const [assetFilter, setAssetFilter] = useState<GameAssetFilter>('covers');
  const [results, setResults] = useState<Artwork[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [visibleCount, setVisibleCount] = useState(72);
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set());
  const [detailGroup,setDetailGroup]=useState<ReturnType<typeof groupGameArtworks>[number]|null>(null);
  const [showSources,setShowSources]=useState(false);
  const [browseMeta,setBrowseMeta]=useState<PlatformBrowse|null>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    loadManifest(controller.signal)
      .then(value => { if (!controller.signal.aborted) setManifest(value); })
      .catch(reason => { if (!controller.signal.aborted) setManifestError(reason instanceof Error ? reason.message : 'Game index could not be loaded.'); });
    return () => { controller.abort(); request.current?.abort(); };
  }, []);

  const platforms = useMemo(() => (manifest?.shards || [])
    .filter(shard => shard.kind === 'games')
    .map(shard => ({ id: shard.platform || shard.id.replace(/^games-/, ''), label: shard.label || shard.platform || shard.id }))
    .concat(MODERN_GAME_PLATFORMS.map(item=>({id:item.id,label:item.label}))).sort((a, b) => a.label.localeCompare(b.label)), [manifest]);
  const groupedResults = useMemo(() => groupGameArtworks(results), [results]);

  const runSearch = useCallback(async (value: string, selectedPlatform: string, selectedAssets: GameAssetFilter = assetFilter) => {
    const term = value.trim();
    if (term.length < 2) { setError('Enter at least two characters, a game title, or a full game code.'); setResults([]); setSearched(false); return; }
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
        if (controller.signal.aborted) return;
        if (classicOutcome.status === 'fulfilled') classicResults = classicOutcome.value;
        else setWarnings(current => current.includes('Classic console indexes could not be loaded.') ? current : [...current, 'Classic console indexes could not be loaded.']);
        if (modernOutcome.status === 'fulfilled') modernResults = modernOutcome.value;
        else setWarnings(current => current.includes('Modern game sources could not be reached.') ? current : [...current, 'Modern game sources could not be reached.']);
        publishCombined();
        if (classicOutcome.status === 'rejected' && modernOutcome.status === 'rejected') throw classicOutcome.reason;
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
      }
    } catch (reason) {
      if (timedOut) setError('Search timed out. Choose one console family or try again.');
      else if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'The game index could not be searched.');
    } finally {
      window.clearTimeout(timeoutId);
      if (request.current === controller) setLoading(false);
    }
  }, [assetFilter]);

  const browsePlatform = useCallback(async (selectedPlatform: string, selectedAssets: GameAssetFilter = assetFilter) => {
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
  }, [assetFilter]);

  const selectPlatform = useCallback((selectedPlatform: string) => {
    setPlatform(selectedPlatform);
    if (query.trim().length >= 2) { void runSearch(query, selectedPlatform); return; }
    if (selectedPlatform === 'all') { request.current?.abort(); setBrowseMeta(null); setResults([]); setSearched(false); setLoading(false); setError(''); return; }
    void browsePlatform(selectedPlatform);
  }, [browsePlatform, query, runSearch]);

  useEffect(() => {
    const selectedPlatform = initialPlatform();
    if (initialQuery.trim().length >= 2) void runSearch(initialQuery, selectedPlatform, assetFilter);
    else if (selectedPlatform !== 'all') void browsePlatform(selectedPlatform, assetFilter);
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
  if(detailGroup)return <GameDetailPage group={detailGroup} favoriteIds={favoriteIds} onBack={()=>setDetailGroup(null)} onOpen={onOpen} onFavorite={onFavorite} onPlatformBrowse={id=>{setDetailGroup(null);setQuery('');setPlatform(id);void browsePlatform(id);}}/>;
  if(showSources)return <Suspense fallback={<div className="content-width game-source-loading" role="status"><LoaderCircle size={18} className="game-finder-spinner"/> Opening the Games source map…</div>}><GameSourceIndex onOpenGames={(selectedPlatform,term)=>{setShowSources(false);setPlatform(selectedPlatform||'all');if(term){setQuery(term);void runSearch(term,selectedPlatform||'all');}}}/></Suspense>;
  return <section className="content-width search-content game-finder-page" aria-labelledby="game-finder-title">
    <button type="button" className="back-to-collections" onClick={onBack}><ArrowLeft size={16}/> Categories</button>
    <div className="listing-header game-finder-header">
      <div className="tiny-kicker">CATEGORY / GAME ARCHIVE</div>
      <h1 id="game-finder-title">Games<br/><em>in view.</em></h1>
      <p>Find a game across its editions, consoles, and visual assets. Search by title or product code.</p>
    </div>
    <form className="game-finder-search" onSubmit={submit}>
      <label className="game-search-label" htmlFor="game-cover-query">GAME TITLE OR PRODUCT CODE</label>
      <div className="game-query-field"><Search size={21}/><input id="game-cover-query" aria-label="Search game title or code" value={query} onChange={event => setQuery(event.target.value)} placeholder="Start typing · e.g. Final Fantasy X or SLUS-20312" autoComplete="off"/></div>
      <div className="console-choice"><span className="game-search-label">CHOOSE A CONSOLE · BROWSE BY PLATFORM FAMILY</span><GameConsoleSelector options={platforms} value={platform} onChange={selectPlatform}/></div>
      <div className="game-search-controls"><Button type="submit" disabled={loading}>{loading ? 'Searching…' : 'Search'} <ArrowRight size={16}/></Button></div>
    </form>
    <div className="game-asset-filters" role="group" aria-label="Game artwork type">{([['covers','Covers'],['screenshots','Gameplay'],['wallpapers','Wallpapers'],['artworks','Publisher art'],['logos','Logos'],['icons','Icons'],['title-screens','Title screens'],['all','All assets']] as [GameAssetFilter,string][]).map(([id,label])=><button type="button" key={id} className={assetFilter===id?'active':''} aria-pressed={assetFilter===id} onClick={()=>{setAssetFilter(id);if(query.trim().length>=2)void runSearch(query,platform,id);else if(browseMeta&&platform!=='all')void browsePlatform(platform,id);}}>{label}</button>)}</div>
    <div className="game-finder-hints">
      <span>Try</span>
      {['Mario GBA', 'Zelda N64', 'Final Fantasy X PS2', 'PCSE00628'].map(example => <button type="button" key={example} onClick={() => { setQuery(example); void runSearch(example, 'all'); }}>{example}</button>)}
    </div>
    {!searched && <GameTrendingPanel onSelect={game => {
      setQuery(game.title);
      setDetailGroup({ id: normalizeText(game.title), title: game.title, editions: [{ id: `steam:${game.appId}:cover`, category: 'games', title: game.title, subtitle: 'PC · Steam chart', source: 'Steam Store', provider: 'Steam Store API', sourceUrl: game.sourceUrl, imageUrl: game.image, previewUrl: game.image, downloadUrl: game.image, mediaId: String(game.appId), editionId: `steam:${game.appId}`, kind: 'cover', rights: 'source-only', availability: 'link-only' }], platforms: ['PC'] });
      const url = new URL(window.location.href);
      url.searchParams.set('view', 'games');
      url.searchParams.set('q', game.title);
      window.history.replaceState(null, '', url);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }}/>}
    <div className="game-finder-source"><Info size={15}/><span>Classic and modern platform indexes, trending games, metadata, and image sources live inside this category.</span><button type="button" onClick={()=>setShowSources(true)}>Browse all game sources <ArrowRight size={14}/></button></div>
    {manifestError && <div className="search-warning" role="status"><Info size={16}/><span>Console list unavailable. {manifestError}</span></div>}
    {browseMeta&&<div className="game-platform-browse-heading"><div><span className="tiny-kicker">{browseMeta.sourceLabel}</span><h2>{browseMeta.items.length ? browseMeta.heading : 'No indexed titles yet'}</h2><p>{browseMeta.items.length ? 'Select a title to open its details and artwork.' : 'This platform index has no current game records. Search by title or browse the platform store.'}</p></div><a href={browseMeta.sourceUrl} target="_blank" rel="noreferrer">Open official catalog <ArrowRight size={14}/></a></div>}
    <div className="results-head" aria-live="polite" aria-atomic="true"><span>{searched ? `${groupedResults.length} GAMES · ${results.length} ${assetFilter==='all'?'ASSETS':assetFilter.toUpperCase().replace('-',' ')}` : 'READY TO SEARCH'}</span><span>{platform === 'all' ? '23 SYSTEMS' : platforms.find(item => item.id === platform)?.label.toUpperCase() || 'CONSOLE INDEX'}</span></div>
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
    <p className="game-finder-footnote">The indexed Libretro thumbnails are capped at 512 px wide. SteamGridDB and LaunchBox open separate catalogs for additional artwork; their results are not merged into Rupa’s index.</p>
  </section>;
}
