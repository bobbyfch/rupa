import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, Gamepad2, LoaderCircle } from 'lucide-react';

type TrendingGame = { rank: number; appId: number; title: string; image: string; sourceUrl: string; source: string };
type Snapshot = { generatedAt?: string; sourceUrl?: string; items?: TrendingGame[] };

export function GameTrendingPanel({ onSelect }: { onSelect: (game: TrendingGame) => void }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [failed, setFailed] = useState<Set<number>>(() => new Set());
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}data/games-trending.json`, { signal: controller.signal, cache: 'no-cache', headers: { Accept: 'application/json' } })
      .then(async response => { if (!response.ok) throw new Error('Steam chart snapshot is unavailable.'); return response.json() as Promise<Snapshot>; })
      .then(data => { if (!controller.signal.aborted && Array.isArray(data.items)) setSnapshot(data); })
      .catch(() => undefined)
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  if (loading) return <div className="game-trending-loading" role="status"><LoaderCircle size={17} className="rupa-spinner"/> Loading current game charts…</div>;
  const games = snapshot?.items || [];
  if (!games.length) return <div className="game-trending-empty"><Gamepad2 size={18}/><span>Top sellers are unavailable right now. Search the indexed console archive below.</span></div>;
  const updated = snapshot?.generatedAt ? new Date(snapshot.generatedAt).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  return <section className="game-trending-section" aria-labelledby="game-trending-title">
    <div className="game-trending-heading"><div><span className="tiny-kicker">STEAM / US TOP SELLERS</span><h2 id="game-trending-title">Top sellers</h2><p>Choose a game to find editions and artwork in the archive.</p></div><div>{updated&&<small>Snapshot · {updated}</small>}<a href={snapshot?.sourceUrl || 'https://store.steampowered.com/charts/topselling/'} target="_blank" rel="noreferrer">Steam chart <ArrowUpRight size={13}/></a></div></div>
    <div className="game-trending-grid">{games.slice(0, 20).map(game => <article className="game-trending-card" key={game.appId}><button type="button" onClick={() => onSelect(game)} aria-label={`Open ${game.title} artwork`}>{failed.has(game.appId) ? <span className="game-trending-fallback"><Gamepad2 size={22}/></span> : <img src={game.image} alt={`${game.title} cover artwork`} loading="lazy" decoding="async" onError={() => setFailed(current => new Set(current).add(game.appId))}/>}<span className="game-trending-rank">{String(game.rank).padStart(2, '0')}</span><span className="game-trending-title">{game.title}</span><span className="game-trending-action">Open artwork <ArrowRight size={13}/></span></button><a href={game.sourceUrl} target="_blank" rel="noreferrer">Steam store page <ArrowUpRight size={12}/></a></article>)}</div>
    <p className="game-trending-note">Game names and cover images link to their Steam store pages.</p>
  </section>;
}
