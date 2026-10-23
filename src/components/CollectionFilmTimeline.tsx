import { ArrowLeft, ArrowRight, ImageOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export type FilmTimelineEntry = { id: string; title: string; year: number | null; image: string; detail: string };

export function CollectionFilmTimeline({ films, selectedId, onSelect, label, className = '' }: {
  films: FilmTimelineEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  label: string;
  className?: string;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });

  useEffect(() => {
    const element = rail.current;
    if (!element) return;
    const measure = () => setCanScroll({
      left: element.scrollLeft > 2,
      right: element.scrollLeft + element.clientWidth < element.scrollWidth - 2,
    });
    measure();
    element.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => {
      element.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [films.length]);

  const move = (direction: -1 | 1) => {
    const element = rail.current;
    if (element) element.scrollBy({ left: direction * Math.max(element.clientWidth * .82, 220), behavior: 'smooth' });
  };

  return <div className="collection-film-timeline-shell" aria-label={label}>
    <button type="button" className="collection-timeline-arrow" aria-label="Scroll films left" disabled={!canScroll.left} onClick={() => move(-1)}><ArrowLeft size={17}/></button>
    <div ref={rail} className={`collection-film-timeline ${className}`.trim()} tabIndex={0}>
      {films.map(film => <TimelineCard key={film.id} film={film} selected={selectedId === film.id} onSelect={onSelect}/>)}
    </div>
    <button type="button" className="collection-timeline-arrow" aria-label="Scroll films right" disabled={!canScroll.right} onClick={() => move(1)}><ArrowRight size={17}/></button>
  </div>;
}

function TimelineCard({ film, selected, onSelect }: { film: FilmTimelineEntry; selected: boolean; onSelect: (id: string) => void }) {
  const [failed, setFailed] = useState(false);
  return <button type="button" aria-pressed={selected} className={`ghibli-film-tag${selected ? ' active' : ''}${film.detail === 'Poster only' ? ' no-stills' : ''}`} onClick={() => onSelect(film.id)} title={`${film.year || 'Year unknown'} · ${film.title}`}>
    {failed || !film.image ? <span className="ghibli-image-fallback" role="img" aria-label={`${film.title} artwork unavailable`}><ImageOff size={17}/></span> : <img src={film.image} alt={`${film.title} poster`} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)}/>}
    <span className="ghibli-film-tag-copy"><span>{film.year || '—'}</span><strong>{film.title}</strong><small>{film.detail}</small></span>
  </button>;
}
