import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Gamepad2, Info, LoaderCircle, Search } from 'lucide-react';
import type { Artwork } from '../lib/types';
import { groupGameArtworks, loadManifest, searchGameIndex, searchModernGameIndex, MODERN_GAME_PLATFORMS } from '../lib/catalog';
import type { GameAssetFilter, IndexManifest } from '../lib/catalog';
import { Button } from './ui/button';
import { GameConsoleSelector } from './GameConsoleSelector';
import { GameDetailPage } from './GameDetailPage';
import { GameTrendingPanel } from './GameTrendingPanel';

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
    setLoading(true); setError(''); setWarnings([]); setResults([]); setFailedImages(new Set()); setSearched(true); setVisibleCount(72);
    let timedOut = false;
    const timeoutId = window.setTimeout(() => { timedOut = true; controller.abort(); }, 20_000);
    const platformMatch = MODERN_GAME_PLATFORMS.find(item => item.id === selectedPlatform);
    const cleanTerm = term.replace(/\b(?:playstation\s*[45]|ps[45]|nintendo\s*switch|switch|xbox\s*one|xbox\s*series(?:\s*x\s*\/\s*s)?|pc)\b/ig, ' ').replace(/\s+/g, ' ').trim() || term;
    try {
      if (platformMatch) {
        const modern = await searchModernGameIndex(cleanTerm, platformMatch.id, selectedAssets, controller.signal);
        if (!controller.signal.aborted) setResults(modern);
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
          if (selectedPlatform === 'all') {
            const modern = await searchModernGameIndex(cleanTerm, 'all', selectedAssets, controller.signal).catch(() => []);
            if (!controller.signal.aborted) setResults([...hits, ...modern]);
          }
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

  useEffect(() => {
    if (initialQuery.trim().length < 2) return;
    void runSearch(initialQuery, initialPlatform(), assetFilter);
  }, []); // Opened links with a query can be shared and searched on load.

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
  if(detailGroup)return <GameDetailPage group={detailGroup} favoriteIds={favoriteIds} onBack={()=>setDetailGroup(null)} onOpen={onOpen} onFavorite={onFavorite}/>;
  return <section className="content-width search-content game-finder-page" aria-labelledby="game-finder-title">
    <button type="button" className="back-to-collections" onClick={onBack}><ArrowLeft size={16}/> Tools & collections</button>
    <div className="listing-header game-finder-header">
      <div className="tiny-kicker">TOOL 03 / GAME ARTWORK</div>
      <h1 id="game-finder-title">Game artwork<br/><em>library.</em></h1>
      <p>Find a game across its editions, consoles, and visual assets. Search by title or product code.</p>
    </div>
    <form className="game-finder-search" onSubmit={submit}>
      <label className="game-search-label" htmlFor="game-cover-query">GAME TITLE OR PRODUCT CODE</label>
      <div className="game-query-field"><Search size={21}/><input id="game-cover-query" aria-label="Search game title or code" value={query} onChange={event => setQuery(event.target.value)} placeholder="Start typing · e.g. Final Fantasy X or SLUS-20312" autoComplete="off"/></div>
      <div className="console-choice"><span className="game-search-label">CHOOSE A CONSOLE · FILTER BY PLATFORM FAMILY</span><GameConsoleSelector options={platforms} value={platform} onChange={setPlatform}/></div>
      <div className="game-search-controls"><Button type="submit" disabled={loading}>{loading ? 'Searching…' : 'Search'} <ArrowRight size={16}/></Button></div>
    </form>
    <div className="game-asset-filters" role="group" aria-label="Game artwork type">{([['covers','Covers'],['screenshots','Gameplay'],['logos','Logos'],['icons','Icons'],['title-screens','Title screens'],['all','All assets']] as [GameAssetFilter,string][]).map(([id,label])=><button type="button" key={id} className={assetFilter===id?'active':''} aria-pressed={assetFilter===id} onClick={()=>{setAssetFilter(id);if(query.trim().length>=2)void runSearch(query,platform,id);}}>{label}</button>)}</div>
    <div className="game-finder-hints">
      <span>Try</span>
      {['Mario GBA', 'Zelda N64', 'Final Fantasy X PS2', 'PCSE00628'].map(example => <button type="button" key={example} onClick={() => { setQuery(example); void runSearch(example, 'all'); }}>{example}</button>)}
    </div>
    {!searched && <GameTrendingPanel onSelect={title => { setQuery(title); void runSearch(title, platform); window.scrollTo({ top: 0, behavior: 'smooth' }); }}/>}
    <div className="game-finder-source"><Info size={15}/><span>17 classic indexes plus PS4, PS5, Nintendo Switch, Xbox, and PC search. Modern results include Steam top sellers, Wikidata, and Wikimedia Commons.</span></div>
    {manifestError && <div className="search-warning" role="status"><Info size={16}/><span>Console list unavailable. {manifestError}</span></div>}
    <div className="results-head" aria-live="polite" aria-atomic="true"><span>{searched ? `${groupedResults.length} GAMES · ${results.length} ${assetFilter==='all'?'ASSETS':assetFilter.toUpperCase().replace('-',' ')}` : 'READY TO SEARCH'}</span><span>{platform === 'all' ? '23 SYSTEMS' : platforms.find(item => item.id === platform)?.label.toUpperCase() || 'CONSOLE INDEX'}</span></div>
    {warnings.length > 0 && <div className="search-warning" role="status" aria-live="polite"><Info size={16}/><span>Some indexes could not be reached: {warnings.join(' · ')}</span></div>}
    {loading && results.length === 0 && <div className="game-finder-empty" role="status"><LoaderCircle size={18} className="game-finder-spinner"/><span>Searching the selected console indexes…</span></div>}
    {!loading && error && <div className="game-finder-empty"><strong>Search needs a little more detail</strong><span>{error}</span></div>}
    {searched && results.length === 0 && !loading && !error && <div className="game-finder-empty"><Gamepad2 size={24}/><strong>{warnings.length ? 'No matching covers loaded' : 'No matching covers found'}</strong><span>{warnings.length ? 'Try the search again or select one platform to isolate an available index.' : 'Try a shorter title, another platform, or the game’s serial / App ID.'}</span></div>}
    {groupedResults.length > 0 && <div className="game-title-groups">
      {groupedResults.slice(0, visibleCount).map(group => {
        const lead = group.editions[0];
        const editionCount = new Set(group.editions.map(item => item.editionId || item.id)).size;
        return <article className="game-title-group" key={group.id}>
          <div className="game-title-summary">
            <button type="button" className="game-title-cover" data-art-kind={lead.kind || 'cover'} onClick={() => setDetailGroup(group)} aria-label={`Open ${group.title} details`}>
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
