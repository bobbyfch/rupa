import { useEffect, useState } from 'react';
import { ArrowUpRight, Heart, ImageOff } from 'lucide-react';
import type { Artwork } from '../lib/types';

export type CollectionArtworkEntry = { artwork: Artwork; image: string; fallbackImage?: string; heading: string; detail: string; badge: string };

export function CollectionArtworkGrid({ entries, favorites, onFavorite, onOpen, mode }: {
  entries: CollectionArtworkEntry[];
  favorites: Set<string>;
  onFavorite: (item: Artwork) => void;
  onOpen: (item: Artwork) => void;
  mode: 'poster' | 'still';
}) {
  return <div className={mode === 'poster' ? 'ghibli-poster-grid' : 'ghibli-still-grid'}>
    {entries.map(entry => <CollectionArtworkCard key={entry.artwork.id} entry={entry} mode={mode} saved={favorites.has(entry.artwork.id)} onFavorite={onFavorite} onOpen={onOpen}/>) }
  </div>;
}

function CollectionArtworkCard({ entry, mode, saved, onFavorite, onOpen }: {
  entry: CollectionArtworkEntry; mode: 'poster' | 'still'; saved: boolean; onFavorite: (item: Artwork) => void; onOpen: (item: Artwork) => void;
}) {
  const { artwork, image, fallbackImage, heading, detail, badge } = entry;
  const [failed, setFailed] = useState(false);
  const [source, setSource] = useState(image);
  useEffect(() => { setFailed(false); setSource(image); }, [image]);
  const still = mode === 'still';
  return <article className={still ? 'ghibli-still-card' : 'ghibli-poster-card'}>
    <button type="button" className={still ? 'ghibli-still-image' : 'ghibli-poster-image'} onClick={() => onOpen(artwork)} aria-label={`Inspect ${heading}`}>
      {failed || !source ? <span className="ghibli-image-fallback" role="img" aria-label={`${heading} preview unavailable`}><ImageOff size={18}/><small>Preview unavailable</small></span> : <img src={source} alt={heading} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => { if (fallbackImage && source !== fallbackImage) setSource(fallbackImage); else setFailed(true); }}/>}
      <span>{badge}</span>
    </button>
    <div className={still ? 'ghibli-still-info' : 'ghibli-poster-info'}><div><strong>{heading}</strong><small>{detail}</small><small>{artwork.attribution || artwork.source}</small></div><button type="button" onClick={() => onFavorite(artwork)} className={saved ? 'saved' : ''} aria-label={saved ? `Remove ${heading} from favorites` : `Save ${heading} to favorites`} title={saved ? 'Remove from favorites' : 'Save to favorites'}><Heart size={17} fill={saved ? 'currentColor' : 'none'}/></button></div>
    <a className={still ? 'collection-art-source' : 'ghibli-poster-source'} href={artwork.sourceUrl} target="_blank" rel="noreferrer">Source: {artwork.source} <ArrowUpRight size={13}/></a>
  </article>;
}
