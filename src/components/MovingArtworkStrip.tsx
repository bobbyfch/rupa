import { useEffect, useState } from 'react';
import { LoaderCircle, Pause, Play, RefreshCw } from 'lucide-react';

type GalleryItem = { id: string; title: string; image: string; source: string; href: string };
type GhibliCollection = { id: string; englishTitle?: string; title: string; sourceUrl: string; stills?: { key: string; thumbnailUrl: string; sourceUrl: string }[] }[];
type ShinkaiCollection = { id: string; title: string; year: number; image: string; sourceUrl: string }[];
type AppleFeedItem = { title?: { label?: string }; link?: { attributes?: { href?: string } }; im?: { image?: { label?: string }[] } };
type AppleFeedFile = { feeds?: Record<string, { entries?: AppleFeedItem[] }> };
type GameShardFile = { imageBase?: string; rows?: [string, number][] };

function sample<T>(items: T[], count: number): T[] {
  const pool = [...items];
  for (let index = pool.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swap]] = [pool[swap], pool[index]];
  }
  return pool.slice(0, count);
}

export function MovingArtworkStrip() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const base = import.meta.env.BASE_URL;
    const getJson = async <T,>(path: string): Promise<T> => {
      const response = await fetch(base + path, { cache: 'force-cache', signal: AbortSignal.timeout(12_000) });
      if (!response.ok) throw new Error('Could not load ' + path);
      return response.json() as Promise<T>;
    };

    let current = true;
    setLoading(true);
    setError('');
    void Promise.allSettled([
      getJson<GhibliCollection>('collections/ghibli.json'),
      getJson<ShinkaiCollection>('collections/shinkai.json'),
      getJson<AppleFeedFile>('data/apple-trends.json'),
      getJson<GameShardFile>('offline/index/games-ps2.json'),
    ]).then(results => {
      if (!current) return;
      const [ghibliResult, shinkaiResult, appleResult, gamesResult] = results;
      const ghibli = ghibliResult.status === 'fulfilled'
        ? ghibliResult.value.flatMap(film => sample(film.stills || [], 1).map(still => ({
          id: 'ghibli:' + still.key, title: film.englishTitle || film.title, image: still.thumbnailUrl,
          source: 'Studio Ghibli', href: still.sourceUrl,
        })))
        : [];
      const shinkai = shinkaiResult.status === 'fulfilled'
        ? shinkaiResult.value.map(film => ({ id: 'shinkai:' + film.id, title: film.title, image: film.image, source: 'Makoto Shinkai Works', href: film.sourceUrl }))
        : [];
      const apple = appleResult.status === 'fulfilled'
        ? Object.entries(appleResult.value.feeds || {})
          .filter(([key]) => key.includes('/music/albums'))
          .flatMap(([, feed]) => (feed.entries || []).flatMap(item => {
            const raw = item.im?.image?.at(-1)?.label;
            const href = item.link?.attributes?.href;
            if (!raw || !href || !item.title?.label) return [];
            const image = raw.replace(/\/\d+x\d+bb\.(?:png|jpg|webp)(?:\?.*)?$/i, '/600x600bb.webp');
            return [{ id: 'apple:' + href, title: item.title.label, image, source: 'Apple Music', href }];
          }))
        : [];
      const games = gamesResult.status === 'fulfilled'
        ? (gamesResult.value.rows || []).filter(([, flags]) => Number(flags) & 1).map(([title]) => ({
          id: 'game:' + title, title: title.replace(/\s*\([^)]*\).*$/, ''), image: (gamesResult.value.imageBase || '') + 'Named_Boxarts/' + encodeURIComponent(title) + '.png',
          source: 'Libretro thumbnails', href: 'https://github.com/libretro-thumbnails/Sony_-_PlayStation_2',
        }))
        : [];
      const balanced = [
        ...sample(ghibli, 6),
        ...sample(shinkai, 5),
        ...sample(apple, 7),
        ...sample(games, 6),
      ];
      setItems(sample(balanced, balanced.length));
      if (!balanced.length) setError('Artwork sources are temporarily unavailable.');
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [attempt]);

  const keepLoaded = (id: string) => setItems(current => current.filter(item => item.id !== id));
  const renderCard = (item: GalleryItem, duplicate = false) => (
    <a className="art-strip-card" href={item.href} target="_blank" rel="noreferrer" key={(duplicate ? 'copy:' : '') + item.id} tabIndex={duplicate ? -1 : undefined}>
      <img src={item.image} alt="" loading="lazy" decoding="async" onError={() => { if (!duplicate) keepLoaded(item.id); }} />
      <span className="art-strip-caption"><strong>{item.title}</strong><small>{item.source}</small></span>
    </a>
  );

  if (loading) return <div className="moving-artwork-strip is-loading" role="status" aria-label="Artwork is loading"><span/><span/><span/><span/><span/><span/><small><LoaderCircle size={14} className="rupa-spinner"/> Loading artwork</small></div>;
  if (!items.length) return <div className="moving-artwork-strip is-unavailable" role="status"><span>{error || 'No artwork is available right now.'}</span><button type="button" onClick={() => setAttempt(value => value + 1)}><RefreshCw size={14}/> Try again</button></div>;

  return (
    <section className={'moving-artwork-strip' + (paused ? ' is-paused' : '')} aria-label="Artwork from Rupa collections and tools">
      <div className="art-strip-heading"><span className="tiny-kicker">A LITTLE OF EVERYTHING</span><button type="button" onClick={() => setPaused(value => !value)} aria-label={paused ? 'Play moving artwork' : 'Pause moving artwork'}>{paused ? <Play size={14} fill="currentColor"/> : <Pause size={14} fill="currentColor"/>}<span>{paused ? 'Play' : 'Pause'}</span></button></div>
      <div className="art-strip-viewport">
        <div className="art-strip-belt"><div className="art-strip-track">{items.map(item => renderCard(item))}</div>
          <div className="art-strip-track" aria-hidden="true">{items.map(item => renderCard(item, true))}</div></div>
      </div>
    </section>
  );
}
