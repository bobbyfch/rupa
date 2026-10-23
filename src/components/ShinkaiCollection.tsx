import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Compass, Image as ImageIcon, RefreshCw } from 'lucide-react';

type Film = { id: string; title: string; originalTitle: string; year: number; kind: string; image: string; sourceUrl: string };
type Exhibition = { id: string; title: string; year: number; location: string; image: string; sourceUrl: string };
const FILMOGRAPHY_URL = 'https://en.shinkaiworks.com/film-works/movie';
const SHORTS_URL = 'https://en.shinkaiworks.com/film-works/short-movie';

export function ShinkaiCollection({ onBrowseAnime, onBack }: { onBrowseAnime: (title: string) => void; onBack: () => void }) {
  const [films, setFilms] = useState<Film[]>([]);
  const [exhibitions, setExhibitions] = useState<Exhibition[]>([]);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const [failedExhibitions, setFailedExhibitions] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const base = import.meta.env.BASE_URL;
    const controller = new AbortController();
    let active = true;
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 12_000);
    setLoading(true);
    setError('');
    const load = async <T,>(path: string): Promise<T> => { const response = await fetch(base + path, { cache: 'force-cache', signal: controller.signal }); if (!response.ok) throw new Error(`Collection unavailable (HTTP ${response.status}).`); return response.json() as Promise<T>; };
    void Promise.all([load<Film[]>('collections/shinkai.json'), load<Exhibition[]>('collections/shinkai-exhibitions.json').catch(() => [])])
      .then(([data, exhibitionData]) => { if (!controller.signal.aborted && Array.isArray(data) && Array.isArray(exhibitionData)) { setFilms(data); setExhibitions(exhibitionData); } else if (!controller.signal.aborted) throw new Error('Collection data is not in the expected format.'); })
      .catch(reason => { if (active) setError(timedOut ? 'The collection took too long to load.' : reason instanceof Error ? reason.message : 'Could not load the film artwork.'); })
      .finally(() => { window.clearTimeout(timeout); if (active) setLoading(false); });
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [attempt]);
  const featureFilms = useMemo(() => films.filter(film => film.kind === 'Feature film'), [films]);
  const shortFilms = useMemo(() => films.filter(film => film.kind !== 'Feature film'), [films]);

  return <section className="content-width shinkai-page" aria-labelledby="shinkai-title">
    <button className="back-to-collections" type="button" onClick={onBack}><ArrowLeft size={16}/> Collections</button>
    <header className="shinkai-header"><div><span className="hero-kicker"><span className="hero-kicker-line"/> COLLECTION / ANIMATION</span><h1 id="shinkai-title">Makoto Shinkai</h1><p>Feature films and shorts, linked to the official film pages and the images published by Makoto Shinkai Works.</p></div><a href="https://en.shinkaiworks.com/film-works/" target="_blank" rel="noreferrer">Official filmography <ArrowUpRight size={14}/></a></header>
    {loading ? <div className="shinkai-loading" role="status"><ImageIcon size={18}/> Loading film artwork…</div> : error ? <div className="shinkai-load-error" role="status"><ImageIcon size={18}/><span>{error}</span><button type="button" onClick={() => setAttempt(value => value + 1)}><RefreshCw size={14}/> Try again</button></div> : films.length === 0 ? <div className="shinkai-load-error" role="status"><ImageIcon size={18}/><span>No film artwork is listed yet.</span><button type="button" onClick={() => setAttempt(value => value + 1)}><RefreshCw size={14}/> Reload</button></div> : <>
      <section className="shinkai-gallery-section" aria-labelledby="shinkai-features-title"><div className="shinkai-section-heading"><span className="tiny-kicker">01 / FILMS</span><h2 id="shinkai-features-title">Feature films</h2></div><div className="shinkai-gallery-grid">
        {featureFilms.map(film => <article className="shinkai-gallery-card" key={film.id}>
          <a className="shinkai-gallery-image" href={film.sourceUrl} target="_blank" rel="noreferrer" aria-label={'Open official page for ' + film.title}>
            {failed.has(film.id) ? <span className="shinkai-image-fallback"><ImageIcon size={20}/> Image unavailable</span> : <img src={film.image} alt={film.title + ' official artwork'} loading="lazy" decoding="async" onError={() => setFailed(current => new Set(current).add(film.id))}/>}
            <span className="shinkai-image-year">{film.year}</span>
          </a>
          <div className="shinkai-gallery-copy"><div><span className="tiny-kicker">{film.kind}</span><h3>{film.title}</h3><small>{film.originalTitle}</small></div><button type="button" onClick={() => onBrowseAnime(film.title)}><Compass size={14}/> Anime / Japan</button></div>
        </article>)}
      </div></section>
      <section className="shinkai-gallery-section" aria-labelledby="shinkai-shorts-title"><div className="shinkai-section-heading"><span className="tiny-kicker">02 / SHORT WORKS</span><h2 id="shinkai-shorts-title">Short films</h2></div><div className="shinkai-gallery-grid shinkai-short-grid">
        {shortFilms.map(film => <article className="shinkai-gallery-card" key={film.id}>
          <a className="shinkai-gallery-image" href={film.sourceUrl} target="_blank" rel="noreferrer" aria-label={'Open official page for ' + film.title}>
            {failed.has(film.id) ? <span className="shinkai-image-fallback"><ImageIcon size={20}/> Image unavailable</span> : <img src={film.image} alt={film.title + ' official artwork'} loading="lazy" decoding="async" onError={() => setFailed(current => new Set(current).add(film.id))}/>}
            <span className="shinkai-image-year">{film.year}</span>
          </a>
          <div className="shinkai-gallery-copy"><div><span className="tiny-kicker">{film.kind}</span><h3>{film.title}</h3><small>{film.originalTitle}</small></div><button type="button" onClick={() => onBrowseAnime(film.title)}><Compass size={14}/> Anime / Japan</button></div>
        </article>)}
      </div></section>
      {exhibitions.length > 0 && <section className="shinkai-gallery-section" aria-labelledby="shinkai-exhibitions-title"><div className="shinkai-section-heading"><span className="tiny-kicker">03 / ARCHIVE</span><h2 id="shinkai-exhibitions-title">Exhibitions</h2></div><p className="shinkai-exhibition-intro">Official exhibition photographs with storyboards, keyframes, background art, and theatrical posters. Images open their source page.</p><div className="shinkai-exhibition-grid">{exhibitions.map(exhibition => <article className="shinkai-exhibition-card" key={exhibition.id}><a className="shinkai-exhibition-image" href={exhibition.sourceUrl} target="_blank" rel="noreferrer">{failedExhibitions.has(exhibition.id) ? <span className="shinkai-image-fallback"><ImageIcon size={20}/> Image unavailable</span> : <img src={exhibition.image} alt={`${exhibition.title} exhibition in ${exhibition.location}`} loading="lazy" decoding="async" onError={() => setFailedExhibitions(current => new Set(current).add(exhibition.id))}/>}<span>{exhibition.year}</span></a><div><small>{exhibition.location}</small><strong>{exhibition.title}</strong></div></article>)}</div></section>}
    </>}
    <p className="shinkai-collection-note">Artwork is served by the official film portal. <a href={FILMOGRAPHY_URL} target="_blank" rel="noreferrer">Feature films <ArrowUpRight size={12}/></a> · <a href={SHORTS_URL} target="_blank" rel="noreferrer">Short films <ArrowUpRight size={12}/></a></p>
  </section>;
}
