import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, ArrowUpRight, Heart, Image as ImageIcon, LoaderCircle, Search, Sparkles } from 'lucide-react';
import type { AppleChartKind } from '../lib/providers';
import { fetchAppleTrendArtworkWithAvailability } from '../lib/providers';
import { APPLE_STOREFRONTS } from '../lib/appleStorefronts';
import type { AppleCategory, AppleStorefront, Artwork } from '../lib/types';
import { Button } from './ui/button';

const CATEGORIES: { id: AppleCategory; label: string }[] = [
  { id: 'music', label: 'Music' },
  { id: 'musicvideos', label: 'Music videos' },
  { id: 'movies', label: 'Movies' },
  { id: 'tv', label: 'TV' },
  { id: 'books', label: 'Books' },
  { id: 'audiobooks', label: 'Audiobooks' },
  { id: 'podcasts', label: 'Podcasts' },
  { id: 'apps', label: 'Apps' },
  { id: 'appscreenshots', label: 'App screenshots' },
];
const CHARTS: Partial<Record<AppleCategory, { id: AppleChartKind; label: string }[]>> = {
  music: [{ id: 'albums', label: 'Top albums' }, { id: 'songs', label: 'Top songs' }],
  musicvideos: [{ id: 'music-videos', label: 'Top music videos' }],
  movies: [{ id: 'movies', label: 'Top movies' }],
  tv: [{ id: 'tv-seasons', label: 'Top TV seasons' }, { id: 'tv-episodes', label: 'Top TV episodes' }],
  books: [{ id: 'top-free', label: 'Top free' }, { id: 'top-paid', label: 'Top paid' }],
  audiobooks: [{ id: 'top', label: 'Top audiobooks' }],
  podcasts: [{ id: 'top', label: 'Top shows' }],
  apps: [{ id: 'top-free', label: 'Top free' }, { id: 'top-paid', label: 'Top paid' }],
};

function AppleTrendImage({ item }: { item: Artwork }) {
  const sources = useMemo(() => [...new Set([item.previewUrl, item.imageUrl, item.downloadUrl, ...(item.hdDownloadUrls || [])].filter((url): url is string => Boolean(url)))], [item.id, item.previewUrl, item.imageUrl, item.downloadUrl, item.hdDownloadUrls]);
  const [sourceIndex, setSourceIndex] = useState(0);
  useEffect(() => setSourceIndex(0), [item.id, sources]);
  const source = sources[sourceIndex];
  return source ? <img src={source} alt={`${item.title} artwork`} loading="lazy" decoding="async" onError={() => setSourceIndex(index => index + 1)}/> : <span className="apple-trend-art-missing" role="img" aria-label={`${item.title} artwork unavailable`}><ImageIcon size={20}/><small>Artwork unavailable</small></span>;
}

export function AppleTrendTool({ storefront, onStorefrontChange, onSearch, onOpen, onFavorite, favoriteIds }: {
  storefront: AppleStorefront;
  onStorefrontChange: (value: AppleStorefront) => void;
  onSearch: (category: AppleCategory, query: string) => void;
  onOpen: (item: Artwork) => void;
  onFavorite: (item: Artwork) => void;
  favoriteIds: Set<string>;
}) {
  const [category, setCategory] = useState<AppleCategory>('music');
  const [chart, setChart] = useState<AppleChartKind>('albums');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Artwork[]>([]);
  const [availableStorefronts, setAvailableStorefronts] = useState<AppleStorefront[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState<'top' | 'newest'>('top');

  const chartOptions = CHARTS[category] || [];
  const activeChart = chartOptions.find(option => option.id === chart)?.id || chartOptions[0]?.id;
  const chartLabel = useMemo(() => chartOptions.find(option => option.id === activeChart)?.label || '', [activeChart, chartOptions]);
  const categoryLabel = CATEGORIES.find(option => option.id === category)?.label || 'Apple';
  const visibleItems = useMemo(() => order === 'newest' && category === 'music'
    ? [...items].sort((a, b) => (b.releaseDate || '').localeCompare(a.releaseDate || ''))
    : items, [items, order, category]);
  const storefrontOptions = availableStorefronts.length
    ? APPLE_STOREFRONTS.filter(option => availableStorefronts.includes(option.id))
    : APPLE_STOREFRONTS;

  useEffect(() => {
    const controller = new AbortController();
    setItems([]);
    setAvailableStorefronts([]);
    setError('');
    if (!activeChart) {
      setLoading(false);
      return () => controller.abort();
    }

    setLoading(true);
    fetchAppleTrendArtworkWithAvailability(category, activeChart, storefront, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        setItems(result.items);
        setAvailableStorefronts(result.availableStorefronts);
        if (result.storefront !== storefront) onStorefrontChange(result.storefront);
      })
      .catch(reason => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Apple charts could not be loaded.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [activeChart, category, onStorefrontChange, storefront]);

  function chooseCategory(next: AppleCategory) {
    setCategory(next);
    setChart(CHARTS[next]?.[0]?.id || 'top');
    setOrder('top');
    setItems([]);
    setAvailableStorefronts([]);
    setError('');
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (query.trim().length >= 2) onSearch(category, query.trim());
  }

  return <section className="apple-tool-section" id="apple-tool" aria-labelledby="apple-tool-title">
    <div className="apple-tool-heading">
      <div>
        <div className="hero-kicker"><span className="hero-kicker-line"/> RUPA / TRENDS · APPLE CATALOGS</div>
        <h1 id="apple-tool-title">Apple<br/><em>trends.</em></h1>
        <p>Browse current charts or search for covers, posters, icons and other visual artwork across Apple catalogs.</p>
      </div>
      <div className="apple-tool-mark" aria-hidden="true"><Sparkles size={19}/><span>APPLE<br/>CATALOGS</span></div>
    </div>

    <div className="apple-search-section">
      <label className="apple-search-label" htmlFor="apple-artwork-query">SEARCH THIS APPLE CATALOG</label>
      <form className="apple-tool-search" onSubmit={submit}>
        <div className="apple-query-field"><Search size={20}/><input id="apple-artwork-query" value={query} onChange={event => setQuery(event.target.value)} aria-label={`Search ${categoryLabel} artwork`} placeholder={`${categoryLabel} title, creator, or Apple link…`}/></div>
        <Button type="submit" disabled={query.trim().length < 2}>Search <ArrowRight size={16}/></Button>
      </form>
    </div>

    <div className="apple-tool-controls">
      <div className="apple-media-tabs" role="tablist" aria-label="Apple catalog categories">
        {CATEGORIES.map(option => <button type="button" key={option.id} role="tab" aria-selected={category === option.id} className={category === option.id ? 'active' : ''} onClick={() => chooseCategory(option.id)}>{option.label}</button>)}
      </div>
      <div className="apple-tool-filters">
        {activeChart && <>
          <label className="apple-filter"><span>Apple chart</span><select value={activeChart} onChange={event => setChart(event.target.value as AppleChartKind)} aria-label="Apple chart">{chartOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
          <label className="apple-filter"><span>Storefront</span><select value={storefront} onChange={event => onStorefrontChange(event.target.value as AppleStorefront)} aria-label="Apple storefront">{storefrontOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
        </>}
      </div>
    </div>

    {!activeChart ? <div className="apple-trend-empty">
      <strong>Apple does not publish a chart for this catalog.</strong>
      <p>Use the search field above for artwork. Chart availability differs by Apple catalog and storefront.</p>
    </div> : <>
      <div className="apple-trend-header">
        <div><span className="tiny-kicker">APPLE / {categoryLabel.toUpperCase()} / {chartLabel.toUpperCase()}</span><h2>{order === 'newest' && category === 'music' ? 'Newest in the album chart' : chartLabel}</h2></div>
        <a href="https://rss.marketingtools.apple.com/" target="_blank" rel="noreferrer">Apple RSS charts <ArrowUpRight size={14}/></a>
      </div>
      {category === 'music' && <div className="apple-release-order" role="group" aria-label="Order Apple album artwork"><button type="button" className={order === 'top' ? 'active' : ''} aria-pressed={order === 'top'} onClick={() => setOrder('top')}>Top</button><button type="button" className={order === 'newest' ? 'active' : ''} aria-pressed={order === 'newest'} onClick={() => setOrder('newest')}>Newest</button></div>}
      {loading ? <div className="apple-trend-grid" aria-busy="true" aria-label="Loading Apple chart snapshot"><div className="apple-chart-progress" role="status"><LoaderCircle size={16} className="rupa-spinner"/> Loading Apple’s chart feed</div>{Array.from({ length: 10 }, (_, index) => <div className="apple-trend-skeleton" key={index}/>)}</div>
        : error ? <div className="apple-trend-empty" role="status"><strong>Apple charts could not be loaded</strong><p>{error} You can still search the Apple catalog below.</p></div>
          : visibleItems.length === 0 ? <div className="apple-trend-empty"><strong>No chart items are available for this catalog.</strong><p>Try another storefront or search this Apple catalog below.</p></div>
            : <div className="apple-trend-grid">{visibleItems.map((item, index) => <article className="apple-trend-card" key={item.id}>
              <button className="apple-trend-art" type="button" onClick={() => onOpen(item)} aria-label={`Inspect ${item.title}`}><AppleTrendImage item={item}/><span className="apple-trend-rank">{String(index + 1).padStart(2, '0')}</span></button>
              <div className="apple-trend-meta"><button type="button" className="apple-trend-title" onClick={() => onOpen(item)}>{item.title}</button><span>{item.subtitle}</span><a className="apple-trend-store-link" href={item.sourceUrl} target="_blank" rel="noreferrer">View in Apple <ArrowUpRight size={12}/></a></div>
              <button type="button" className={`apple-trend-heart${favoriteIds.has(item.id) ? ' saved' : ''}`} onClick={() => onFavorite(item)} aria-label={favoriteIds.has(item.id) ? `Remove ${item.title} from favorites` : `Save ${item.title} to favorites`}><Heart size={17} fill={favoriteIds.has(item.id) ? 'currentColor' : 'none'}/></button>
            </article>)}</div>}
    </>}
    <p className="apple-tool-source-note">Artwork is displayed from Apple’s catalog. Downloaded file dimensions, format and size are measured from the actual file.</p>
  </section>;
}
