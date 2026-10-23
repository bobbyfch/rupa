import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, Gamepad2, LoaderCircle } from 'lucide-react';

type ChartId = 'top_sellers' | 'most_played' | 'new_releases' | 'coming_soon' | 'specials';
type TrendingGame = { rank: number; appId: number; title: string; image: string; sourceUrl: string; source: string };
type ChartSnapshot = { label: string; sourceUrl: string; items: TrendingGame[] };
type Snapshot = { generatedAt?: string; sourceUrl?: string; items?: TrendingGame[]; charts?: Partial<Record<ChartId, ChartSnapshot>> };

const CHARTS: { id: ChartId; label: string; eyebrow: string; sourceUrl: string }[] = [
  { id: 'top_sellers', label: 'Top sellers', eyebrow: 'STEAM / US TOP SELLERS', sourceUrl: 'https://store.steampowered.com/charts/topselling/' },
  { id: 'most_played', label: 'Most played', eyebrow: 'STEAM / MOST PLAYED', sourceUrl: 'https://store.steampowered.com/charts/mostplayed?language=english' },
  { id: 'new_releases', label: 'New releases', eyebrow: 'STEAM / NEW RELEASES', sourceUrl: 'https://store.steampowered.com/explore/new/' },
  { id: 'coming_soon', label: 'Coming soon', eyebrow: 'STEAM / COMING SOON', sourceUrl: 'https://store.steampowered.com/search/?filter=comingsoon' },
  { id: 'specials', label: 'On sale', eyebrow: 'STEAM / SPECIALS', sourceUrl: 'https://store.steampowered.com/search/?specials=1' },
];

export function GameTrendingPanel({ onSelect }: { onSelect: (game: TrendingGame) => void }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [activeChart, setActiveChart] = useState<ChartId>('top_sellers');
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

  const active = CHARTS.find(chart => chart.id === activeChart) || CHARTS[0];
  const chartData = snapshot?.charts?.[activeChart];
  const games = chartData?.items || (activeChart === 'top_sellers' ? snapshot?.items || [] : []);
  const updated = snapshot?.generatedAt ? new Date(snapshot.generatedAt).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  const chartSourceUrl = chartData?.sourceUrl || (activeChart === 'top_sellers' ? snapshot?.sourceUrl : undefined) || active.sourceUrl;

  return <section className="game-trending-section" aria-labelledby="game-trending-title">
    <div className="game-chart-options" role="group" aria-label="Game charts">
      {CHARTS.map(chart => {
        const count = snapshot?.charts?.[chart.id]?.items?.length || (chart.id === 'top_sellers' ? snapshot?.items?.length || 0 : 0);
        return <button type="button" key={chart.id} className={activeChart === chart.id ? 'active' : ''} aria-pressed={activeChart === chart.id} disabled={!count} onClick={() => { setActiveChart(chart.id); setFailed(new Set()); }}>
          <span>{chart.label}</span><small>{count || '—'}</small>
        </button>;
      })}
    </div>
    <div className="game-trending-heading"><div><span className="tiny-kicker">{chartData?.label || active.eyebrow}</span><h2 id="game-trending-title">{active.label}</h2><p>Choose a game to open its details, editions, and artwork.</p></div><div>{updated&&<small>Snapshot · {updated}</small>}<a href={chartSourceUrl} target="_blank" rel="noreferrer">Open Steam chart <ArrowUpRight size={13}/></a></div></div>
    {games.length ? <>
      <div className="game-trending-grid">{games.slice(0, 20).map(game => <article className="game-trending-card" key={`${activeChart}:${game.appId}`}><button type="button" onClick={() => onSelect(game)} aria-label={`Open ${game.title} details`}>{failed.has(game.appId) ? <span className="game-trending-fallback"><Gamepad2 size={22}/></span> : <img src={game.image} alt={`${game.title} artwork`} loading="lazy" decoding="async" onError={() => setFailed(current => new Set(current).add(game.appId))}/>}<span className="game-trending-rank">{String(game.rank).padStart(2, '0')}</span><span className="game-trending-title">{game.title}</span><span className="game-trending-action">Open details <ArrowRight size={13}/></span></button><a href={game.sourceUrl} target="_blank" rel="noreferrer">Steam store page <ArrowUpRight size={12}/></a></article>)}</div>
      <p className="game-trending-note">Steam chart snapshots refresh through the archive feed. Select a title to open its artwork detail.</p>
    </> : <div className="game-trending-empty"><Gamepad2 size={18}/><span>This Steam chart is temporarily unavailable. Search the game archive below or try another chart.</span></div>}
  </section>;
}
