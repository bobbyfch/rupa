import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUpRight, Compass, Image as ImageIcon, RefreshCw } from 'lucide-react';
import type { Artwork } from '../lib/types';
import { Button } from './ui/button';
import { CollectionFilmTimeline } from './CollectionFilmTimeline';
import { CollectionArtworkGrid, type CollectionArtworkEntry } from './CollectionArtworkGrid';

type Film = { id: string; title: string; originalTitle: string; year: number; kind: string; image: string; sourceUrl: string };
type Still = { id: string; title: string; image: string; sourceUrl: string; source: string };
type FilmAssets = { filmId: string; poster?: string; posterSourceUrl?: string; posterSource?: string; stills: Still[] };
type Exhibition = { id: string; title: string; year: number; location: string; image: string; sourceUrl: string };
const FILMOGRAPHY_URL = 'https://en.shinkaiworks.com/film-works/';

function makeArtwork(film: Film, title: string, image: string, sourceUrl: string, source: string, kind: 'poster' | 'artwork'): Artwork {
  return { id: `shinkai:${film.id}:${title}`, category: 'anime', title, subtitle: `${film.title} · ${film.year}`, year: String(film.year), source, provider: source, sourceUrl, imageUrl: image, previewUrl: image, downloadUrl: image, hdDownloadUrls: [image], kind, rights: 'source-only', attribution: source };
}

export function ShinkaiCollection({ onBrowseAnime, onBack, favoriteIds, onFavorite, onOpen }: {
  onBrowseAnime: (title: string) => void;
  onBack: () => void;
  favoriteIds: Set<string>;
  onFavorite: (item: Artwork) => void;
  onOpen: (item: Artwork) => void;
}) {
  const [films, setFilms] = useState<Film[]>([]);
  const [assets, setAssets] = useState<FilmAssets[]>([]);
  const [exhibitions, setExhibitions] = useState<Exhibition[]>([]);
  const [failedExhibitions, setFailedExhibitions] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [filmFilter, setFilmFilter] = useState('all');

  useEffect(() => {
    const base = import.meta.env.BASE_URL;
    const controller = new AbortController();
    let active = true;
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 12_000);
    setLoading(true);
    setError('');
    const load = async <T,>(path: string): Promise<T> => {
      const response = await fetch(base + path, { cache: 'no-cache', signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Collection unavailable (HTTP ${response.status}).`);
      return response.json() as Promise<T>;
    };
    void Promise.all([
      load<Film[]>('collections/shinkai.json'),
      load<FilmAssets[]>('collections/shinkai-assets.v2.json'),
      load<Exhibition[]>('collections/shinkai-exhibitions.json').catch(() => []),
    ]).then(([filmData, assetData, exhibitionData]) => {
      if (!controller.signal.aborted && Array.isArray(filmData) && Array.isArray(assetData) && Array.isArray(exhibitionData)) {
        setFilms(filmData);
        setAssets(assetData);
        setExhibitions(exhibitionData);
      } else if (!controller.signal.aborted) throw new Error('Collection data is not in the expected format.');
    }).catch(reason => {
      if (active) setError(timedOut ? 'The collection took too long to load.' : reason instanceof Error ? reason.message : 'Could not load film artwork.');
    }).finally(() => {
      window.clearTimeout(timeout);
      if (active) setLoading(false);
    });
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [attempt]);

  const orderedFilms = useMemo(() => [...films].sort((a, b) => b.year - a.year || a.title.localeCompare(b.title)), [films]);
  const selectedFilm = orderedFilms.find(film => film.id === filmFilter);
  const selectedAssets = selectedFilm ? assets.find(entry => entry.filmId === selectedFilm.id) : undefined;
  const filteredFilms = selectedFilm ? [selectedFilm] : orderedFilms;
  const posterEntries = useMemo<CollectionArtworkEntry[]>(() => filteredFilms.map(film => {
    const source = assets.find(entry => entry.filmId === film.id);
    const image = source?.poster || film.image;
    const sourceName = source?.posterSource || 'Makoto Shinkai Works';
    const sourceUrl = source?.posterSourceUrl || film.sourceUrl;
    return { artwork: makeArtwork(film, `${film.title} · Poster`, image, sourceUrl, sourceName, 'poster'), image, fallbackImage: image !== film.image ? film.image : undefined, heading: film.title, detail: `${film.originalTitle} · ${film.year}`, badge: `Poster · ${film.year}` };
  }), [assets, filteredFilms]);
  const stillEntries = useMemo<CollectionArtworkEntry[]>(() => filteredFilms.flatMap(film => (assets.find(entry => entry.filmId === film.id)?.stills || []).map(still => ({
    artwork: makeArtwork(film, still.title, still.image, still.sourceUrl, still.source, 'artwork'),
    image: still.image,
    heading: film.title,
    detail: `${film.year} · ${still.title.replace(`${film.title} · `, '')}`,
    badge: String(film.year),
  }))), [assets, filteredFilms]);
  const totalStills = assets.reduce((count, asset) => count + asset.stills.length, 0);
  const timelineEntries = orderedFilms.map(film => ({ id: film.id, title: film.title, year: film.year, image: film.image, detail: film.kind }));

  return <section className="content-width shinkai-page ghibli-page" aria-labelledby="shinkai-title">
    <button className="back-to-collections" type="button" onClick={onBack}><ArrowLeft size={16}/> Collections</button>
    <header className="shinkai-header ghibli-header"><div><span className="hero-kicker"><span className="hero-kicker-line"/> COLLECTION / ANIMATION</span><h1 id="shinkai-title">Makoto Shinkai</h1><p>Films, posters, and image galleries linked to official film sites and the Makoto Shinkai Works archive.</p></div><div className="ghibli-count"><strong>{totalStills.toLocaleString()}</strong><span>OFFICIAL IMAGE LINKS / {films.length || 9} FILMS</span><small>{assets.length} film galleries · {exhibitions.length} exhibition records</small><a href={FILMOGRAPHY_URL} target="_blank" rel="noreferrer">Official filmography <ArrowUpRight size={14}/></a></div></header>

    <nav className="ghibli-quicknav" aria-label="Makoto Shinkai archive sections"><a href="#shinkai-timeline">Film timeline <ArrowDown size={13}/></a><a href="#shinkai-posters">Posters <span>{films.length}</span><ArrowDown size={13}/></a><a href="#shinkai-stills">Film stills <span>{totalStills}</span><ArrowDown size={13}/></a>{exhibitions.length > 0 && <a href="#shinkai-exhibitions">Exhibitions <span>{exhibitions.length}</span><ArrowDown size={13}/></a>}</nav>

    {loading ? <div className="ghibli-loading" role="status"><RefreshCw size={17} className="rupa-spinner"/> Loading the film archive…</div> : error ? <div className="ghibli-loading ghibli-error" role="status"><span>{error}</span><Button variant="outline" onClick={() => setAttempt(value => value + 1)}>Try again</Button></div> : films.length === 0 ? <div className="ghibli-loading ghibli-error" role="status"><span>No film artwork is listed yet.</span><Button variant="outline" onClick={() => setAttempt(value => value + 1)}>Reload</Button></div> : <>
      <div className="ghibli-timeline-block ghibli-anchor" id="shinkai-timeline"><div className="ghibli-section-label"><span>FILM TIMELINE</span><small>Newest release first · select a film</small></div><div className="ghibli-year-tags" aria-label="Filter films"><button type="button" className={filmFilter === 'all' ? 'active' : ''} aria-pressed={filmFilter === 'all'} onClick={() => setFilmFilter('all')}>All films</button></div><CollectionFilmTimeline films={timelineEntries} selectedId={filmFilter === 'all' ? null : filmFilter} onSelect={setFilmFilter} label="Makoto Shinkai films" className="ghibli-film-timeline"/></div>

      <section className="ghibli-poster-archive ghibli-anchor" id="shinkai-posters" aria-labelledby="shinkai-poster-title"><div className="ghibli-poster-heading"><div><span className="tiny-kicker">OFFICIAL FILM VISUALS</span><h2 id="shinkai-poster-title">{selectedFilm ? `${selectedFilm.title}.` : 'Poster archive.'}</h2></div><span>{selectedFilm ? 'Selected film' : `${posterEntries.length} film posters`}</span>{selectedFilm&&<button type="button" className="collection-browse-anime" onClick={()=>onBrowseAnime(selectedFilm.title)}><Compass size={14}/> Find anime references</button>}</div><p>Each image opens its credited film or archive source. Select a title in the timeline to focus the archive.</p><CollectionArtworkGrid entries={posterEntries} favorites={favoriteIds} onFavorite={onFavorite} onOpen={onOpen} mode="poster"/></section>

      <div className="ghibli-gallery-heading ghibli-anchor" id="shinkai-stills"><div><span className="tiny-kicker">{selectedFilm ? `${selectedFilm.year} / ${selectedFilm.originalTitle}` : 'ALL FILMS'}</span><h2>{selectedFilm?.title || 'Film stills'}</h2></div><a href={selectedAssets?.stills[0]?.sourceUrl || selectedFilm?.sourceUrl || FILMOGRAPHY_URL} target="_blank" rel="noreferrer">Open image source <ArrowUpRight size={14}/></a></div>
      {stillEntries.length ? <CollectionArtworkGrid entries={stillEntries} favorites={favoriteIds} onFavorite={onFavorite} onOpen={onOpen} mode="still"/> : <div className="ghibli-empty"><strong>No gallery images are linked for this film yet</strong><p>Open its official film page for source imagery and film details.</p></div>}

      {exhibitions.length > 0 && <section className="shinkai-gallery-section ghibli-anchor" id="shinkai-exhibitions" aria-labelledby="shinkai-exhibitions-title"><div className="shinkai-section-heading"><span className="tiny-kicker">EXHIBITIONS / ARCHIVE</span><h2 id="shinkai-exhibitions-title">Exhibition archive</h2></div><div className="shinkai-exhibition-grid">{exhibitions.map(exhibition => <article className="shinkai-exhibition-card" key={exhibition.id}><a className="shinkai-exhibition-image" href={exhibition.sourceUrl} target="_blank" rel="noreferrer">{failedExhibitions.has(exhibition.id) ? <span className="shinkai-image-fallback"><ImageIcon size={20}/> Image unavailable</span> : <img src={exhibition.image} alt={`${exhibition.title} exhibition in ${exhibition.location}`} loading="lazy" decoding="async" onError={() => setFailedExhibitions(current => new Set(current).add(exhibition.id))}/>}<span>{exhibition.year}</span></a><div><small>{exhibition.location}</small><strong>{exhibition.title}</strong><a className="shinkai-gallery-source" href={exhibition.sourceUrl} target="_blank" rel="noreferrer">Source <ArrowUpRight size={12}/></a></div></article>)}</div></section>}
    </>}
    <p className="shinkai-collection-note">Image links come from the <a href={FILMOGRAPHY_URL} target="_blank" rel="noreferrer">Makoto Shinkai Works filmography <ArrowUpRight size={12}/></a>, official film sites, and the linked exhibition archive.</p>
  </section>;
}
