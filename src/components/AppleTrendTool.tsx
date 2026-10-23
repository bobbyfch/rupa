import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, ArrowUpRight, ChevronDown, Heart, Image as ImageIcon, LoaderCircle, Search, Sparkles } from 'lucide-react';
import type { AppleChartKind } from '../lib/providers';
import { fetchAppleTrendArtworkWithAvailability } from '../lib/providers';
import { APPLE_STOREFRONTS } from '../lib/appleStorefronts';
import type { AppleCategory, AppleStorefront, Artwork } from '../lib/types';
import { fetchPublicChart, getPublicCharts, PUBLIC_PROVIDERS, PUBLIC_SOURCE_URL, type ChartCategory, type ChartProvider, type PublicChartProvider } from '../lib/publicCharts';
import { Button } from './ui/button';

const CATEGORIES: { id: ChartCategory; label: string }[] = [
  { id: 'music', label: 'Music' },
  { id: 'musicvideos', label: 'Music videos' },
  { id: 'movies', label: 'Film' },
  { id: 'tv', label: 'TV' },
  { id: 'books', label: 'Books' },
  { id: 'audiobooks', label: 'Audiobooks' },
  { id: 'podcasts', label: 'Podcasts' },
  { id: 'apps', label: 'Apps' },
  { id: 'anime', label: 'Anime' },
  { id: 'manga', label: 'Manga' },
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
  const [imageStatus, setImageStatus] = useState<'loading'|'ready'|'failed'>(sources.length ? 'loading' : 'failed');
  useEffect(() => { setSourceIndex(0); setImageStatus(sources.length ? 'loading' : 'failed'); }, [item.id, sources]);
  useEffect(() => {
    if (imageStatus !== 'loading' || !sources[sourceIndex]) return;
    const timer = window.setTimeout(() => {
      if (sourceIndex + 1 < sources.length) setSourceIndex(sourceIndex + 1);
      else setImageStatus('failed');
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [imageStatus, sourceIndex, sources]);
  const source = sources[sourceIndex];
  const failSource = () => {
    const next = sourceIndex + 1;
    if (next < sources.length) { setSourceIndex(next); setImageStatus('loading'); }
    else setImageStatus('failed');
  };
  return <span className="apple-trend-image" aria-busy={imageStatus === 'loading'}>
    {imageStatus === 'loading' && <span className="apple-trend-image-skeleton" role="status" aria-label={`Loading ${item.title} cover`}><LoaderCircle size={19} className="rupa-spinner"/></span>}
    {source ? <img className={imageStatus === 'ready' ? 'is-ready' : ''} src={source} alt={`${item.title} artwork`} loading="eager" decoding="async" onLoad={() => setImageStatus('ready')} onError={failSource}/> : <span className="apple-trend-art-missing" role="img" aria-label={`${item.title} artwork unavailable`}><ImageIcon size={20}/><small>Artwork unavailable</small></span>}
  </span>;
}

export function AppleTrendTool({ initialCategory = 'music', storefront, onStorefrontChange, onSearch, onOpen, onFavorite, favoriteIds }: {
  initialCategory?: ChartCategory;
  storefront: AppleStorefront;
  onStorefrontChange: (value: AppleStorefront) => void;
  onSearch: (category: ChartCategory, query: string, provider: ChartProvider) => void;
  onOpen: (item: Artwork) => void;
  onFavorite: (item: Artwork) => void;
  favoriteIds: Set<string>;
}) {
  const [category] = useState<ChartCategory>(initialCategory);
  const [provider, setProvider] = useState<ChartProvider>(initialCategory === 'anime' || initialCategory === 'manga' ? 'anilist' : 'apple');
  const [chart, setChart] = useState<string>('albums');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Artwork[]>([]);
  const [heroImages, setHeroImages] = useState<string[]>([]);
  const [availableStorefronts, setAvailableStorefronts] = useState<AppleStorefront[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState<'top' | 'newest'>('top');

  const chartOptions = provider === 'apple' ? CHARTS[category as AppleCategory] || [] : getPublicCharts(category, provider);
  const activeChart = chartOptions.find(option => option.id === chart)?.id || chartOptions[0]?.id;
  const chartLabel = useMemo(() => chartOptions.find(option => option.id === activeChart)?.label || '', [activeChart, chartOptions]);
  const chartHeading = chartLabel;
  const categoryLabel = CATEGORIES.find(option => option.id === category)?.label || 'Catalog';
  const providerOptions = [...(category === 'anime' || category === 'manga' ? [] : [{ id: 'apple' as const, label: 'Apple catalog' }]), ...(PUBLIC_PROVIDERS[category] || [])];
  const providerSourceUrl = provider === 'anilist' && category === 'manga' ? 'https://anilist.co/search/manga' : provider === 'anilist' && category === 'anime' ? 'https://anilist.co/search/anime' : provider === 'apple' ? 'https://rss.marketingtools.apple.com/' : PUBLIC_SOURCE_URL[provider];
  const visibleItems = useMemo(() => order === 'newest'
    ? [...items].sort((a, b) => (b.releaseDate || '').localeCompare(a.releaseDate || ''))
    : items, [items, order]);
  const storefrontOptions = availableStorefronts.length
    ? APPLE_STOREFRONTS.filter(option => availableStorefronts.includes(option.id))
    : APPLE_STOREFRONTS;

  useEffect(() => {
    const controller = new AbortController();
    setItems([]);
    setHeroImages([]);
    setAvailableStorefronts([]);
    setError('');
    if (!activeChart) {
      setLoading(false);
      return () => controller.abort();
    }

    setLoading(true);
    const load = provider === 'apple'
      ? fetchAppleTrendArtworkWithAvailability(category as AppleCategory, activeChart as AppleChartKind, storefront, controller.signal)
          .then(result => ({ items: result.items, availableStorefronts: result.availableStorefronts, storefront: result.storefront }))
      : fetchPublicChart(category, provider as PublicChartProvider, activeChart, controller.signal)
          .then(nextItems => ({ items: nextItems, availableStorefronts: [] as AppleStorefront[], storefront }));
    load
      .then(result => {
        if (controller.signal.aborted) return;
        setItems(result.items);
        const images = [...new Set(result.items.map(item => item.previewUrl || item.imageUrl).filter(Boolean))];
        for (let index = images.length - 1; index > 0; index--) {
          const swapIndex = Math.floor(Math.random() * (index + 1));
          [images[index], images[swapIndex]] = [images[swapIndex], images[index]];
        }
        setHeroImages(images.slice(0, 5));
        setAvailableStorefronts(result.availableStorefronts);
        if (result.storefront !== storefront) onStorefrontChange(result.storefront);
      })
      .catch(reason => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : `${provider} chart could not be loaded.`);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [activeChart, category, onStorefrontChange, provider, storefront]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (query.trim().length < 2) return;
    onSearch(category, query.trim(), provider);
  }

  return <section className="content-width apple-tool-section" id="apple-tool" aria-labelledby="apple-tool-title">
    <div className="apple-tool-heading category-immersive-hero">
      <div className="category-immersive-art" aria-hidden="true">{heroImages.map((image, index) => <span key={`${image}-${index}`}><img src={image} alt="" loading={index > 1 ? 'lazy' : 'eager'} decoding="async"/></span>)}</div>
      <div>
        <div className="hero-kicker"><span className="hero-kicker-line"/> RUPA / CATEGORY / {categoryLabel.toUpperCase()}</div>
        <h1 id="apple-tool-title">{categoryLabel}<br/><em>on view.</em></h1>
        <p>Search this collection, then browse current picks and recent releases. Every result keeps its catalog source.</p>
      </div>
      <div className="apple-tool-mark" aria-hidden="true"><Sparkles size={19}/><span>RUPA<br/>INDEX</span></div>
    </div>

    <div className="apple-search-section">
      <label className="apple-search-label" htmlFor="apple-artwork-query">SEARCH {categoryLabel.toUpperCase()}</label>
      <form className="apple-tool-search" onSubmit={submit}>
        <div className="apple-query-field"><Search size={20}/><input id="apple-artwork-query" value={query} onChange={event => setQuery(event.target.value)} aria-label={`Search ${categoryLabel} artwork`} placeholder={`${categoryLabel} title, creator, or Apple link…`}/></div>
        <Button type="submit" disabled={query.trim().length < 2}>Search <ArrowRight size={16}/></Button>
      </form>
    </div>

    <div className="apple-tool-controls">
      <div className="apple-tool-filters">
        {providerOptions.length > 1 && <label className="apple-filter"><span>Source</span><span className="category-filter-select"><select value={provider} onChange={event => { setProvider(event.target.value as ChartProvider); setItems([]); }} aria-label="Chart source">{providerOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select><ChevronDown size={15} aria-hidden="true" focusable="false"/></span></label>}
        {activeChart && chartOptions.length > 1 && <label className="apple-filter"><span>{provider === 'apple' ? 'Apple chart' : 'Chart'}</span><span className="category-filter-select"><select value={activeChart} onChange={event => setChart(event.target.value)} aria-label="Chart">{chartOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select><ChevronDown size={15} aria-hidden="true" focusable="false"/></span></label>}
        {provider === 'apple' && activeChart && <label className="apple-filter"><span>Storefront</span><span className="category-filter-select"><select value={storefront} onChange={event => onStorefrontChange(event.target.value as AppleStorefront)} aria-label="Apple storefront">{storefrontOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select><ChevronDown size={15} aria-hidden="true" focusable="false"/></span></label>}
      </div>
    </div>

    {provider === 'fdroid' ? <div className="apple-trend-empty">
      <strong>Search the F-Droid app catalogue.</strong>
      <p>Enter an app name above. Results use F-Droid’s public app search and keep each app’s source page attached.</p>
    </div> : !activeChart ? <div className="apple-trend-empty">
      <strong>No chart is available for this category.</strong>
      <p>Use the search field above for artwork. Chart availability differs by Apple catalog and storefront.</p>
    </div> : <>
      <div className="apple-trend-header">
        <div><span className="tiny-kicker">{categoryLabel.toUpperCase()} / {chartHeading.toUpperCase()}</span><h2>{order === 'newest' ? `Newest ${categoryLabel.toLowerCase()} in this chart` : chartHeading}</h2></div>
        <a href={providerSourceUrl} target="_blank" rel="noreferrer">{provider === 'apple' ? 'Apple RSS charts' : providerOptions.find(option => option.id === provider)?.label || provider}<ArrowUpRight size={14}/></a>
      </div>
      {items.some(item => item.releaseDate) && <div className="apple-release-order" role="group" aria-label={`Order ${categoryLabel} artwork`}><button type="button" className={order === 'top' ? 'active' : ''} aria-pressed={order === 'top'} onClick={() => setOrder('top')}>Top</button><button type="button" className={order === 'newest' ? 'active' : ''} aria-pressed={order === 'newest'} onClick={() => setOrder('newest')}>Newest</button></div>}
      {loading ? <div className="apple-trend-grid" aria-busy="true" aria-label={`Loading ${provider} chart snapshot`}><div className="apple-chart-progress" role="status"><LoaderCircle size={16} className="rupa-spinner"/> Loading {provider === 'apple' ? 'Apple’s chart feed' : `${provider} feed`}</div>{Array.from({ length: 10 }, (_, index) => <div className="apple-trend-skeleton" data-category={category} key={index}/>)}</div>
        : error ? <div className="apple-trend-empty" role="status"><strong>{provider === 'apple' ? 'Apple charts could not be loaded' : `${provider} data could not be loaded`}</strong><p>{error} You can still use the search field above or switch sources.</p></div>
          : visibleItems.length === 0 ? <div className="apple-trend-empty"><strong>No chart items are available for this catalog.</strong><p>{provider === 'apple' ? 'Try another storefront or search this Apple catalog below.' : 'Try another chart or search term.'}</p></div>
            : <div className="apple-trend-grid">{visibleItems.map((item, index) => <article className="apple-trend-card" key={item.id}>
              <button className="apple-trend-art" data-category={category} type="button" onClick={() => onOpen(item)} aria-label={`Inspect ${item.title}`}><AppleTrendImage item={item}/><span className="apple-trend-rank">{String(index + 1).padStart(2, '0')}</span></button>
              <div className="apple-trend-meta"><button type="button" className="apple-trend-title" onClick={() => onOpen(item)}>{item.title}</button><span>{item.subtitle}</span><a className="apple-trend-store-link" href={item.sourceUrl} target="_blank" rel="noreferrer">View in {item.provider || 'source'} <ArrowUpRight size={12}/></a></div>
              <button type="button" className={`apple-trend-heart${favoriteIds.has(item.id) ? ' saved' : ''}`} onClick={() => onFavorite(item)} aria-label={favoriteIds.has(item.id) ? `Remove ${item.title} from favorites` : `Save ${item.title} to favorites`}><Heart size={17} fill={favoriteIds.has(item.id) ? 'currentColor' : 'none'}/></button>
            </article>)}</div>}
    </>}
    <p className="apple-tool-source-note">{provider === 'apple' ? 'Artwork is displayed from Apple’s catalog.' : `Results are linked to ${providerOptions.find(option => option.id === provider)?.label || provider} and its original image source.`} Downloaded file dimensions, format and size are measured from the actual file.</p>
  </section>;
}
