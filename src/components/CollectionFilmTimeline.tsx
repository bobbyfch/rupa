import { ImageOff } from 'lucide-react';
import { useState } from 'react';

export type FilmTimelineEntry = { id: string; title: string; year: number | null; image: string; detail: string };

export function CollectionFilmTimeline({ films, selectedId, onSelect, label, className = '' }: {
  films: FilmTimelineEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  label: string;
  className?: string;
}) {
  return <div className={`collection-film-timeline ${className}`.trim()} aria-label={label}>
    {films.map(film => <TimelineCard key={film.id} film={film} selected={selectedId === film.id} onSelect={onSelect}/>)}
  </div>;
}

function TimelineCard({ film, selected, onSelect }: { film: FilmTimelineEntry; selected: boolean; onSelect: (id: string) => void }) {
  const [failed, setFailed] = useState(false);
  return <button type="button" aria-pressed={selected} className={`ghibli-film-tag${selected ? ' active' : ''}${film.detail === 'Poster only' ? ' no-stills' : ''}`} onClick={() => onSelect(film.id)} title={`${film.year || 'Year unknown'} · ${film.title}`}>
    {failed || !film.image ? <span className="ghibli-image-fallback" role="img" aria-label={`${film.title} artwork unavailable`}><ImageOff size={17}/></span> : <img src={film.image} alt={`${film.title} poster`} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)}/>}
    <span className="ghibli-film-tag-copy"><span>{film.year || '—'}</span><strong>{film.title}</strong><small>{film.detail}</small></span>
  </button>;
}
