import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, ArrowUpRight, Image as ImageIcon, Info, Search } from 'lucide-react';
import { Button } from './ui/button';
import LocalCollection from './LocalCollection';
import { WIKIDATA_CATEGORIES, loadManifest, loadSources, loadWorks, searchAnimeIndex, searchGameIndex, searchTitleIndex, searchWorks, type IndexManifest, type SourcesFile, type Work, type WorkHit, type WorksFile } from '../lib/catalog';
import { searchOfflineArt } from '../lib/providers';
import { resolutionLabel } from '../lib/quality';
import { isSearchableCollection } from '../lib/sourceCatalog';
import { imageCors } from '../lib/utils';
import type { Artwork, Category } from '../lib/types';

const FILTERS: { id: string; label: string }[] = [
  { id: 'all', label: 'Everything' }, { id: 'movies', label: 'Film' }, { id: 'tv', label: 'TV' }, { id: 'anime', label: 'Anime' },
  { id: 'music', label: 'Music' }, { id: 'musicvideos', label: 'Music videos' }, { id: 'books', label: 'Books' }, { id: 'audiobooks', label: 'Audiobooks' },
  { id: 'podcasts', label: 'Podcasts' }, { id: 'apps', label: 'Apps' }, { id: 'games', label: 'Games' }, { id: 'boardgames', label: 'Board games' },
  { id: 'manga', label: 'Manga' }, { id: 'webtoons', label: 'Webtoons' }, { id: 'comics', label: 'Comics' }, { id: 'magazines', label: 'Magazines' }, { id: 'physicalmedia', label: 'Blu-ray & physical' },
];
const TITLE_INDEX_CATEGORIES = [...WIKIDATA_CATEGORIES, 'audiobooks'] as string[];
const isLive = (category: string) => isSearchableCollection(category as Category);
const SAMPLES = ['Spirited Away 2019 China', 'Princess Mononoke Japanese poster', 'Final Fantasy X PS2', 'One Piece', 'Toulouse-Lautrec poster 1895', 'BTS 방탄소년단'];
const wiki = (work: Work) => work.url ||  `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(`${work.title} ${work.year || ''}`.trim())}`;
const label = (value: string) => value.replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase());

function ArtTile({ item, onOpen }: { item: Artwork; onOpen: (item: Artwork) => void }) {
  const [failed, setFailed] = useState(false);
  const preview = item.previewUrl;
  return <button className="cat-art" onClick={() => onOpen(item)} aria-label={`Open ${item.title}`}>
    <span className="cat-art-frame">{failed || !preview ? <span className="cat-art-missing"><ImageIcon size={18} />Preview unavailable</span> : <img src={preview} crossOrigin={imageCors(preview)} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />}</span>
    <strong>{item.title}</strong><small>{item.subtitle}</small>
    <em className={`cat-badge cat-badge-${item.availability || 'link-only'}`}>{item.availability === 'local-copy' ? 'On this computer · not in the repo' : item.availability === 'mirrored' ? 'Mirrored · works offline' : item.availability === 'index-only' ? 'Indexed · image stays upstream' : 'Source link'}</em>
  </button>;
}

// Only the first cards load a thumbnail: a long list of third-party images made the largest paint take 13 s on a throttled phone.
const THUMBS_PER_LIST = 6;
function WorkCard({ hit, onLive, thumb = true }: { hit: WorkHit; onLive: (category: Category, query: string) => void; thumb?: boolean }) {
  const { work: full, editions, matchedEditions } = hit;
  const work = thumb ? full : { ...full, image: undefined };
  const aliases = work.aliases.slice(0, 5);
  return <article className={'cat-work' + (work.image ? ' has-thumb' : '')}>
    <div className="cat-work-head"><span className="tiny-kicker">{work.category.toUpperCase()} / {label(work.collection)}</span><span className="cat-badge cat-badge-link-only">{work.image ? 'Metadata + Commons image' : 'Metadata only'}</span></div>
    <h3>{work.title}</h3>
    {work.image && <img className="cat-work-thumb" fetchPriority="low" decoding="async" src={work.image} crossOrigin={imageCors(work.image)} alt="" loading="lazy" width="96" height="128" onError={event => { event.currentTarget.hidden = true; }} />}
    <p className="cat-work-meta">{[work.kind === 'artist' ? 'Artist' : work.kind === 'franchise' ? 'Franchise' : FILTERS.find(f => f.id === work.category)?.label || 'Work', work.year, work.creators, work.note].filter(Boolean).join(' · ')}</p>
    {aliases.length > 0 && <p className="cat-aliases">{aliases.map(alias => <span key={alias.value} lang={alias.script === 'latin' ? undefined : alias.script}>{alias.value}</span>)}</p>}
    {editions.length > 0 && <ul className="cat-editions" aria-label="Known editions">{editions.map(edition => <li key={edition.id} className={matchedEditions.has(edition.id) ? 'is-match' : ''}><b>{edition.region}</b> {edition.year} · {edition.version}<small>no image mirrored</small></li>)}</ul>}
    <div className="cat-work-actions">
      {isLive(work.category) && <Button variant="outline" size="sm" onClick={() => onLive(work.category as Category, work.aliases.find(a => a.script === 'latin' && a.value === work.title)?.value || work.title)}>Find artwork live <ArrowRight size={14} /></Button>}
      <a className="source-link" href={wiki(work)} target="_blank" rel="noreferrer">Reference <ArrowUpRight size={14} /></a>
    </div>
  </article>;
}

const SOURCE_LABELS: Record<string, string> = { 'cleveland-cc0': 'Cleveland Museum', met: 'The Met', commons: 'Wikimedia Commons', standardebooks: 'Standard Ebooks', wellcome: 'Wellcome Collection', smithsonian: 'Smithsonian', 'nasa-posters': 'NASA' };
const sourceOf = (item: Artwork) => item.sourceId || 'cleveland-cc0';
const STATUS_LABEL: Record<string, string> = { 'confirmed-working': 'Working', candidate: 'Candidate', 'metadata-only': 'Index only', 'needs-permission': 'Needs permission', 'blocked-here': 'Blocked from here', 'unreachable-here': 'Unreachable from here' };

/** Every mirrored, open-licensed file, browsable without typing a query. */
function MirroredBrowser({ onOpen }: { onOpen: (item: Artwork) => void }) {
  const [items, setItems] = useState<Artwork[]>([]), [kind, setKind] = useState('all'), [source, setSource] = useState('all'), [sort, setSort] = useState('title'), [shown, setShown] = useState(24);
  useEffect(() => { const controller = new AbortController(); searchOfflineArt('', controller.signal).then(setItems).catch(() => undefined); return () => controller.abort(); }, []);
  const sources = [...new Set(items.map(sourceOf))];
  const list = useMemo(() => items
    .filter(item => (kind === 'all' || (kind === 'poster' ? item.kind === 'poster' : kind === 'books' ? item.category === 'books' : item.category === 'art')) && (source === 'all' || sourceOf(item) === source))
    .sort((a, b) => sort === 'resolution' ? Math.max(b.originalWidth || 0, b.originalHeight || 0) - Math.max(a.originalWidth || 0, a.originalHeight || 0) : a.title.localeCompare(b.title)), [items, kind, source, sort]);
  if (!items.length) return null;
  const chip = (value: string, current: string, set: (v: string) => void, text: string) => <button key={value} className={current === value ? 'active' : ''} aria-pressed={current === value} onClick={() => { set(value); setShown(24); }}>{text}</button>;
  return <section aria-label="Browse mirrored artwork">
    <h2 className="cat-h">Browse the open-licensed archive <span>{list.length} of {items.length}</span></h2>
    <div className="cat-filters" role="group" aria-label="Type">{[['all', 'All'], ['art', 'Art & prints'], ['poster', 'Posters'], ['books', 'Book covers']].map(([v, t]) => chip(v, kind, setKind, t))}</div>
    <div className="cat-filters" role="group" aria-label="Source">{chip('all', source, setSource, 'Any source')}{sources.map(id => chip(id, source, setSource, SOURCE_LABELS[id] || id))}
      <label className="cat-sort">Sort <select value={sort} onChange={event => setSort(event.target.value)}><option value="title">Title</option><option value="resolution">Resolution, high first</option></select></label></div>
    <div className="cat-grid">{list.slice(0, shown).map(item => <div key={item.id}><ArtTile item={item} onOpen={onOpen} /><small className="cat-res">{resolutionLabel(item.originalWidth, item.originalHeight)} · {SOURCE_LABELS[sourceOf(item)] || item.source}</small></div>)}</div>
    {list.length > shown && <div className="cat-work-actions"><Button variant="outline" onClick={() => setShown(count => count + 24)}>Show more</Button></div>}
  </section>;
}

/** What each source is, how it is licensed, and whether it was reachable when last measured. */
function SourcesPanel() {
  const [data, setData] = useState<SourcesFile | null>(null);
  useEffect(() => { loadSources().then(setData).catch(() => undefined); }, []);
  useEffect(() => { if (data && window.location.hash === '#sources') document.getElementById('sources')?.scrollIntoView({ block: 'start' }); }, [data]);
  if (!data) return null;
  const used = data.sources.filter(s => s.role !== 'rejected'), rejected = data.sources.filter(s => s.role === 'rejected');
  return <details id="sources" className="cat-local cat-sources" open={window.location.hash === '#sources'}><summary>Sources &amp; rights <span>{used.length}</span></summary>
    <p className="cat-status">Measured {data.generatedAt}. Only files whose own record allows redistribution are mirrored. Everything else is indexed or linked.</p>
    <div className="cat-table-wrap"><table className="cat-table"><thead><tr><th scope="col">Source</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Rights</th><th scope="col">Mirrored</th></tr></thead><tbody>
      {used.map(s => <tr key={s.id}><th scope="row">{s.upstream?.startsWith('http') ? <a href={s.upstream} target="_blank" rel="noreferrer">{s.name}</a> : s.name}</th><td>{s.role.replace(/-/g, ' ')}</td><td><span className={'cat-badge cat-status-' + s.status}>{STATUS_LABEL[s.status] || s.status}</span>{s.lastChecked && <small> {s.lastChecked}</small>}</td><td>{s.rightsMode || '-'}</td><td>{s.mirrored || '-'}</td></tr>)}
    </tbody></table></div>
    {data.linkOnly && <><h3 className="cat-sub">Archives we link to and never copy</h3><ul className="cat-linkonly">{data.linkOnly.map(a => <li key={a.url}><a href={a.url} target="_blank" rel="noreferrer">{a.name} <ArrowUpRight size={12} /></a><small>{a.about}</small></li>)}</ul></>}
    <p className="cat-status">Not used because they need an API key: {rejected.map(s => s.name).join(', ')}.</p>
  </details>;
}

export default function CatalogPage({ initialQuery, profileId, notify, onOpen, onLive }: { initialQuery: string; profileId: string; notify: (text: string) => void; onOpen: (item: Artwork) => void; onLive: (category: Category, query: string) => void }) {
  const [works, setWorks] = useState<WorksFile | null>(null), [manifest, setManifest] = useState<IndexManifest | null>(null), [error, setError] = useState('');
  const [query, setQuery] = useState(initialQuery), [submitted, setSubmitted] = useState(initialQuery), [filter, setFilter] = useState(() => { const value = new URLSearchParams(window.location.search).get('type'); return FILTERS.some(f => f.id === value) ? value! : 'all'; });
  const [indexHits, setIndexHits] = useState<Artwork[]>([]), [titleHits, setTitleHits] = useState<WorkHit[]>([]), [includeLarge, setIncludeLarge] = useState(false), [mirrored, setMirrored] = useState<Artwork[]>([]), [busy, setBusy] = useState(false);
  useEffect(() => { loadWorks().then(setWorks).catch(e => setError(e instanceof Error ? e.message : 'Offline catalog unavailable')); loadManifest().then(setManifest).catch(() => undefined); }, []);
  const searching = submitted.trim().length >= 2;
  // No query lists nothing under Everything, but choosing a collection browses its works.
  const hits = useMemo(() => works && (searching || filter !== 'all') ? searchWorks(works, submitted, { category: filter === 'all' ? undefined : filter }, 60) : [], [works, submitted, filter, searching]);
  useEffect(() => {
    if (!searching && filter === 'all') { setIndexHits([]); setMirrored([]); setTitleHits([]); return; }
    if (!searching) { setTitleHits([]); return; }
    const controller = new AbortController(), { signal } = controller;
    setBusy(true);
    // Everything searches the small indexes first. The game, anime and audiobook shards (about 4 MB gzipped together) load when their own filter is chosen or on request.
    const large = filter === 'all' && includeLarge;
    const wantsGames = filter === 'games' || large, wantsAnime = filter === 'anime' || large, wantsArt = filter === 'all';
    // Each source reports as soon as it is ready: small indexes paint at once, the 3-4 MB game, anime and audiobook shards fill in later.
    let pending = 0;
    const run = <T,>(promise: Promise<T>, apply: (value: T) => void) => {
      pending++;
      promise.then(value => { if (!signal.aborted) apply(value); }).catch(() => undefined).finally(() => { if (--pending === 0 && !signal.aborted) setBusy(false); });
    };
    setIndexHits([]); setTitleHits([]); setMirrored([]);
    if (wantsArt) run(searchOfflineArt(submitted, signal), art => setMirrored(art.map(item => ({ ...item, availability: 'mirrored' as const })).slice(0, 12)));
    if (wantsGames) run(searchGameIndex(submitted, { signal }), games => setIndexHits(current => [...games.slice(0, 24), ...current.filter(item => item.category !== 'games')]));
    if (wantsAnime) run(searchAnimeIndex(submitted, signal), anime => setIndexHits(current => [...current.filter(item => item.category !== 'anime'), ...anime.slice(0, 12)]));
    for (const category of filter === 'all' ? TITLE_INDEX_CATEGORIES.filter(name => large || name !== 'audiobooks') : TITLE_INDEX_CATEGORIES.filter(name => name === filter)) {
      run(searchTitleIndex(category, submitted, signal, filter === 'all' ? 5 : 60), hits => setTitleHits(current => [...current.filter(hit => hit.work.category !== category), ...hits]));
    }
    if (pending === 0) setBusy(false);
    return () => controller.abort();
  }, [submitted, filter, searching, includeLarge]);
  // The URL carries the search so back, share and reload keep it.
  const commit = (value: string, nextFilter = filter) => {
    setSubmitted(value);
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'catalog');
    if (value) url.searchParams.set('q', value); else url.searchParams.delete('q');
    if (nextFilter !== 'all') url.searchParams.set('type', nextFilter); else url.searchParams.delete('type');
    window.history.replaceState(null, '', url);
  };
  const submit = (event: FormEvent) => { event.preventDefault(); commit(query.trim()); };
  const totals = manifest ? { works: manifest.shards.find(s => s.kind === 'works')?.rows || 0, games: manifest.shards.filter(s => s.kind === 'games').length, titles: manifest.shards.filter(s => s.kind !== 'works').reduce((n, s) => n + s.rows, 0) } : null;
  const nothing = searching && !busy && works && !hits.length && !indexHits.length && !mirrored.length && !titleHits.length;
  const curatedTitles = new Set(hits.map(hit => hit.work.title.toLocaleLowerCase()));
  const catalogTitles = titleHits.filter(hit => hit.work.category !== 'audiobooks' && !curatedTitles.has(hit.work.title.toLocaleLowerCase()));
  // The 2.6 MB audiobook index arrives last, so it renders last and pushes nothing above it.
  const audiobookTitles = titleHits.filter(hit => hit.work.category === 'audiobooks');
  return <section className="content-width search-content catalog-page">
    <div className="listing-header"><div className="tiny-kicker">EDITIONS / OFFLINE INDEX</div><h1>Works, editions &amp; variants.</h1>
      <p>Search a title in any language across every collection: known regional editions, where artwork exists, and a Wikidata or LibriVox catalog entry for titles without a free image. Only open-licensed files are mirrored; everything else is indexed and linked, never copied.</p></div>
    <form className="search-bar" onSubmit={submit}><Search size={21} /><input aria-label="Search works and editions" value={query} onChange={e => setQuery(e.target.value)} placeholder="千と千尋, Final Fantasy X PS2, Toulouse-Lautrec 1895…" /><Button type="submit">Search <ArrowRight size={16} /></Button></form>
    <div className="cat-filters" role="group" aria-label="Collection filter">{FILTERS.map(f => <button key={f.id} className={filter === f.id ? 'active' : ''} aria-pressed={filter === f.id} onClick={() => { setFilter(f.id); commit(submitted, f.id); }}>{f.label}</button>)}</div>
    <p className="cat-status" role="status">{error || (busy ? 'Searching offline indexes…' : totals ? `${totals.works.toLocaleString('en-US')} works · ${totals.games} game platforms · ${totals.titles.toLocaleString('en-US')} indexed titles · searchable offline` : 'Loading offline index…')}</p>
    <div className="cat-body">
    {!searching && !works && !error && <div className="cat-start" aria-hidden="true"><div className="skeleton-art cat-skel" /><div className="skeleton-art cat-skel" /></div>}
    {!searching && works && <div className="cat-start">
      <div><span className="tiny-kicker">TRY</span><div className="cat-chips">{SAMPLES.map(sample => <button key={sample} onClick={() => { setQuery(sample); commit(sample); }}>{sample}</button>)}</div></div>
      <div><span className="tiny-kicker">THEMES</span><div className="cat-chips">{works.themes.map(theme => <button key={theme.id} onClick={() => { setQuery(theme.query); commit(theme.query); }}>{theme.label}</button>)}</div></div>
      <details><summary>Variant types Rupa tracks</summary><p className="cat-facets">Packaging: {works.facets.packaging.join(', ')}.<br />Artwork: {works.facets.artwork.join(', ')}.</p></details>
    </div>}
    {mirrored.length > 0 && <section aria-label="Mirrored artwork"><h2 className="cat-h">Mirrored &amp; open-licensed</h2><div className="cat-grid">{mirrored.map(item => <div key={item.id}><ArtTile item={item} onOpen={onOpen} /><small className="cat-res">{resolutionLabel(item.originalWidth, item.originalHeight)} · {item.licenseLabel || 'Open license'}</small></div>)}</div></section>}
    {hits.length > 0 && <section aria-label="Works and editions"><h2 className="cat-h">Works &amp; editions <span>{hits.length}</span></h2><div className="cat-works">{hits.map(hit => <WorkCard key={hit.work.id} hit={hit} onLive={onLive} />)}</div></section>}
    {catalogTitles.length > 0 && <section aria-label="Catalog titles"><h2 className="cat-h">Catalog titles <span>{catalogTitles.length}</span></h2><div className="cat-works">{catalogTitles.map((hit, index) => <WorkCard key={hit.work.id} hit={hit} onLive={onLive} thumb={index < THUMBS_PER_LIST} />)}</div></section>}
    {indexHits.length > 0 && <section aria-label="Indexed titles"><h2 className="cat-h">Indexed titles <span>{indexHits.length}</span></h2><div className="cat-grid">{indexHits.map(item => <ArtTile key={item.id} item={item} onOpen={onOpen} />)}</div></section>}
    {audiobookTitles.length > 0 && <section aria-label="Audiobooks"><h2 className="cat-h">Audiobooks (LibriVox) <span>{audiobookTitles.length}</span></h2><div className="cat-works">{audiobookTitles.map(hit => <WorkCard key={hit.work.id} hit={hit} onLive={onLive} thumb={false} />)}</div></section>}
    {!searching && <MirroredBrowser onOpen={onOpen} />}
    </div>
    <LocalCollection profileId={profileId} notify={notify} />
    <SourcesPanel />
    {searching && filter === 'all' && !includeLarge && !busy && <div className="cat-work-actions"><Button variant="outline" onClick={() => setIncludeLarge(true)}>Also search games, anime and audiobooks (about 4 MB)</Button></div>}
    {nothing && <div className="cat-empty"><Info size={18} /><div><strong>No local match for “{submitted}”.</strong><p>RUPA does not invent covers. Try another spelling or language, or search live sources.</p><div className="cat-work-actions">{FILTERS.filter(f => f.id !== 'all' && isLive(f.id)).slice(0, 8).map(f => <Button key={f.id} variant="outline" size="sm" onClick={() => onLive(f.id as Category, submitted)}>{f.label}</Button>)}</div></div></div>}
  </section>;
}
