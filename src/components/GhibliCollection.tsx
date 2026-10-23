import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUpRight, RefreshCw } from 'lucide-react';
import type { Artwork } from '../lib/types';
import { Button } from './ui/button';
import { CollectionFilmTimeline } from './CollectionFilmTimeline';
import { CollectionArtworkGrid } from './CollectionArtworkGrid';

type GhibliStill = { key: string; thumbnailUrl: string | null; sourceUrl: string | null };
type GhibliPosterEdition = { id: string; label: string; region?: string; year?: number; artist?: string; imageUrl: string; sourceUrl: string; sourceName: string };
type GhibliFilm = { id: string; sourceUrl: string; title: string; englishTitle: string | null; year: number | null; releaseDate: string | null; sourceCredit: string | null; posterUrl?: string; posterEditions?: GhibliPosterEdition[]; stills: GhibliStill[] };
type GhibliFile = GhibliFilm[];
type PosterEntry = { film: GhibliFilm; edition: GhibliPosterEdition };
const PAGE_SIZE = 48;

function makeArtwork(film: GhibliFilm, still: GhibliStill): Artwork {
  const image = still.sourceUrl || still.thumbnailUrl || '';
  const number = still.key.match(/(\d+)$/)?.[1];
  return { id: `ghibli:${film.id}:${still.key}`, category: 'ghibli', title: `${film.englishTitle || film.title} · Still ${number || still.key}`, subtitle: `${film.year || ''} · ${film.title}`.replace(/^ · | · $/g, ''), year: film.year ? String(film.year) : undefined, source: 'Studio Ghibli', provider: 'Studio Ghibli', sourceUrl: film.sourceUrl, imageUrl: image, previewUrl: still.thumbnailUrl || image, downloadUrl: image, hdDownloadUrls: [image], kind: 'artwork', rights: 'source-only', rightsStatus: 'reference-only', attribution: film.sourceCredit || 'Studio Ghibli' };
}

function makePosterArtwork(film: GhibliFilm, edition: GhibliPosterEdition): Artwork {
  return { id: `ghibli:${film.id}:poster:${edition.id}`, category: 'ghibli', title: `${film.englishTitle || film.title} · ${edition.label}`, subtitle: `${film.year || ''} · ${edition.label}`.replace(/^ · | · $/g, ''), year: edition.year ? String(edition.year) : film.year ? String(film.year) : undefined, source: edition.sourceName, provider: edition.sourceName, sourceUrl: edition.sourceUrl, imageUrl: edition.imageUrl, previewUrl: edition.imageUrl, downloadUrl: edition.imageUrl, hdDownloadUrls: [edition.imageUrl], kind: 'poster', rights: 'source-only', rightsStatus: 'reference-only', attribution: edition.artist ? `${edition.artist} · ${edition.sourceName}` : edition.sourceName, artist: edition.artist, region: edition.region };
}

export function GhibliCollection({ favoriteIds, onFavorite, onOpen, onBack }: { favoriteIds: Set<string>; onFavorite: (item: Artwork) => void; onOpen: (item: Artwork) => void; onBack: () => void }) {
  const [films, setFilms] = useState<GhibliFile>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [filmFilter, setFilmFilter] = useState('all');
  const [posterRegion, setPosterRegion] = useState('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    fetch(`${import.meta.env.BASE_URL}collections/ghibli.json`, { signal: controller.signal, headers: { Accept: 'application/json' } })
      .then(async response => {
        if (!response.ok) throw new Error(`Ghibli index unavailable (HTTP ${response.status}).`);
        const data = await response.json() as GhibliFile;
        if (!Array.isArray(data)) throw new Error('Ghibli index format is invalid.');
        return data;
      })
      .then(data => { if (!controller.signal.aborted) setFilms(data); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load the Ghibli film index.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const orderedFilms = useMemo(() => [...films].sort((a, b) => (b.releaseDate || '').localeCompare(a.releaseDate || '') || b.id.localeCompare(a.id)), [films]);
  const years = useMemo(() => [...new Set(orderedFilms.flatMap(film => film.year ? [film.year] : []))].sort((a, b) => b - a), [orderedFilms]);
  const selectedFilm = orderedFilms.find(film => film.id === filmFilter);
  const regionalPosters = useMemo<PosterEntry[]>(() => orderedFilms.flatMap(film => (film.posterEditions || []).map(edition => ({ film, edition }))), [orderedFilms]);
  const posterEntries = useMemo<PosterEntry[]>(() => {
    if (!selectedFilm) return regionalPosters;
    const official = selectedFilm.posterUrl ? [{ id: 'official-japan', label: 'Japan · official film visual', region: 'Japan', year: selectedFilm.year || undefined, imageUrl: selectedFilm.posterUrl, sourceUrl: selectedFilm.sourceUrl, sourceName: 'Studio Ghibli' }] : [];
    return [...official, ...(selectedFilm.posterEditions || [])].map(edition => ({ film: selectedFilm, edition }));
  }, [regionalPosters, selectedFilm]);
  const posterRegions = useMemo(() => [...new Set(posterEntries.map(({ edition }) => edition.region || 'Other'))].sort(), [posterEntries]);
  const filteredPosters = posterEntries.filter(({ edition }) => posterRegion === 'all' || (edition.region || 'Other') === posterRegion);
  const filteredFilms = orderedFilms.filter(film => (filmFilter === 'all' || film.id === filmFilter) && (yearFilter === null || film.year === yearFilter));
  const stills = useMemo(() => filteredFilms.flatMap(film => film.stills.map((still, index) => ({ film, still, index }))), [filteredFilms]);
  const pageItems = stills.slice(0, visibleCount);
  const totalStills = films.reduce((count, film) => count + film.stills.length, 0);
  const totalPosterEditions = regionalPosters.length;
  const totalPosterVisuals = films.reduce((count, film) => count + (film.posterUrl ? 1 : 0), 0) + totalPosterEditions;
  const countLabel = loading ? '46 poster visuals · 19 regional editions' : `${totalPosterVisuals} poster visuals · ${totalPosterEditions} regional editions`;

  const setYear = (year: number | null) => { setYearFilter(year); setFilmFilter('all'); setVisibleCount(PAGE_SIZE); };
  const setFilm = (film: GhibliFilm) => { setFilmFilter(film.id); setYearFilter(null); setVisibleCount(PAGE_SIZE); setPosterRegion('all'); };
  const timelineEntries = orderedFilms.map(film => ({ id: film.id, title: film.englishTitle || film.title, year: film.year, image: film.posterUrl || film.posterEditions?.[0]?.imageUrl || '', detail: film.stills.length ? `${film.stills.length} stills` : 'Poster only' }));
  const posterCards = filteredPosters.map(({ film, edition }) => ({ artwork: makePosterArtwork(film, edition), image: edition.imageUrl, heading: film.englishTitle || film.title, detail: `${edition.label}${edition.year ? ` · ${edition.year}` : ''}${edition.artist ? ` · ${edition.artist}` : ''}`, badge: edition.region || 'Edition' }));

  return <section className="content-width ghibli-page" aria-labelledby="ghibli-title">
    <button className="back-to-collections" type="button" onClick={onBack}><ArrowLeft size={16}/> Tools &amp; collections</button>
    <div className="ghibli-header">
      <div><div className="hero-kicker"><span className="hero-kicker-line"/> RUPA / CURATED COLLECTION</div><h1 id="ghibli-title">Ghibli</h1><p>Browse 27 films, regional poster editions, and official stills. China editions are collected in the poster archive below.</p></div>
      <div className="ghibli-count"><strong>{totalStills.toLocaleString()}</strong><span>OFFICIAL STILLS / {films.length || 27} FILMS</span><small>{countLabel}</small><a href="https://www.ghibli.jp/works/" target="_blank" rel="noreferrer">Official works index <ArrowUpRight size={14}/></a></div>
    </div>

    <nav className="ghibli-quicknav" aria-label="Ghibli archive sections">
      <a href="#ghibli-timeline">Film timeline <ArrowDown size={13}/></a>
      <a href="#ghibli-posters">Regional posters <span>{loading ? 19 : totalPosterEditions}</span><ArrowDown size={13}/></a>
      <a href="#ghibli-stills">Film stills <span>{totalStills.toLocaleString()}</span><ArrowDown size={13}/></a>
    </nav>

    <div className="ghibli-timeline-block ghibli-anchor" id="ghibli-timeline">
      <div className="ghibli-section-label"><span>FILM TIMELINE</span><small>Newest release first · select a film</small></div>
      <div className="ghibli-year-tags" aria-label="Filter by release year"><button type="button" className={yearFilter === null && filmFilter === 'all' ? 'active' : ''} onClick={() => setYear(null)}>All films</button>{years.map(year => <button type="button" key={year} className={yearFilter === year ? 'active' : ''} onClick={() => setYear(year)}>{year}</button>)}</div>
      <CollectionFilmTimeline films={timelineEntries} selectedId={filmFilter === 'all' ? null : filmFilter} onSelect={id => { const film = orderedFilms.find(entry => entry.id === id); if (film) setFilm(film); }} label="Studio Ghibli films" className="ghibli-film-timeline"/>
    </div>

    <section className="ghibli-poster-archive ghibli-anchor" id="ghibli-posters" aria-labelledby="ghibli-poster-title">
      <div className="ghibli-poster-heading"><div><span className="tiny-kicker">{selectedFilm ? `${selectedFilm.year || ''} / ${selectedFilm.englishTitle || selectedFilm.title}` : 'REGIONAL RELEASE ART'}</span><h2 id="ghibli-poster-title">{selectedFilm ? 'Posters for this film.' : 'Poster archive.'}</h2></div><span>{selectedFilm ? `${posterEntries.length} visuals · selected film` : `${totalPosterEditions} regional editions`}</span></div>
      <p>{selectedFilm ? 'The official Japanese visual and regional releases are kept together. Open a poster to inspect its size and download options.' : 'China and other regional editions, grouped by film. Choose a film in the timeline to see its official poster beside its regional versions.'}</p>
      {posterEntries.length > 0 && <div className="ghibli-poster-regions" role="group" aria-label="Filter poster editions by region"><button type="button" className={posterRegion === 'all' ? 'active' : ''} aria-pressed={posterRegion === 'all'} onClick={() => setPosterRegion('all')}>All editions <span>{posterEntries.length}</span></button>{posterRegions.map(region => <button type="button" key={region} className={posterRegion === region ? 'active' : ''} aria-pressed={posterRegion === region} onClick={() => setPosterRegion(region)}>{region} <span>{posterEntries.filter(entry => (entry.edition.region || 'Other') === region).length}</span></button>)}</div>}
      {filteredPosters.length > 0 ? <CollectionArtworkGrid entries={posterCards} favorites={favoriteIds} onFavorite={onFavorite} onOpen={onOpen} mode="poster"/> : <div className="ghibli-empty"><strong>No poster editions for this filter</strong><p>Choose another region, or select a film with regional poster editions in the timeline.</p></div>}
    </section>

    <div className="ghibli-gallery-heading ghibli-anchor" id="ghibli-stills"><div><span className="tiny-kicker">{selectedFilm ? `${selectedFilm.year || ''} / ${selectedFilm.englishTitle || selectedFilm.title}` : yearFilter ? `RELEASE YEAR / ${yearFilter}` : 'ALL FILMS'}</span><h2>{selectedFilm?.englishTitle || selectedFilm?.title || (yearFilter ? `${yearFilter} releases` : 'Film stills')}</h2></div><a href={selectedFilm?.sourceUrl || 'https://www.ghibli.jp/works/'} target="_blank" rel="noreferrer">Open official film page <ArrowUpRight size={14}/></a></div>
    {loading ? <div className="ghibli-loading" role="status"><RefreshCw size={17}/> Loading the film index…</div> : error ? <div className="ghibli-loading ghibli-error" role="status"><span>{error}</span><Button variant="outline" onClick={() => window.location.reload()}>Reload</Button></div> : filteredFilms.every(film => !film.stills.length) ? <div className="ghibli-empty"><strong>No still gallery is listed for this film</strong><p>The official works index includes this title, but no still-image set was found on its film page.</p></div> : <><CollectionArtworkGrid entries={pageItems.map(({ film, still, index }) => ({ artwork: makeArtwork(film, still), image: still.thumbnailUrl || still.sourceUrl || '', fallbackImage: still.thumbnailUrl && still.sourceUrl ? still.sourceUrl : undefined, heading: film.englishTitle || film.title, detail: `${film.year || ''} · Still ${still.key.match(/(\d+)$/)?.[1] || index + 1}`, badge: String(film.year || '') }))} favorites={favoriteIds} onFavorite={onFavorite} onOpen={onOpen} mode="still"/>{stills.length > pageItems.length && <div className="ghibli-more"><Button variant="outline" onClick={() => setVisibleCount(count => count + PAGE_SIZE)}>Load more stills <span>({stills.length - pageItems.length} remaining)</span></Button></div>}</>}
    <p className="ghibli-source-note">Film stills link to Studio Ghibli’s official pages. Regional poster previews link to their credited source pages; source terms apply.</p>
  </section>;
}
