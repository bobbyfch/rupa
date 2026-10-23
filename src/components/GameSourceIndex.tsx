import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Database, Gamepad2, LoaderCircle, Search } from 'lucide-react';
import { loadManifest, MODERN_GAME_PLATFORMS, type IndexManifest } from '../lib/catalog';
import { Button } from './ui/button';

type GameSource = {
  id: string;
  name: string;
  group: string;
  description: string;
  mode: string;
  url?: string;
  urlTemplate?: string;
  assets: string[];
  platforms: string[];
};
type GameSourceData = {
  catalogs?: GameSource[];
  entries?: { matches: string[]; sources: { label: string; kind?: string; url: string }[] }[];
};
type SteamIndex = { games?: unknown[] };
type Platform = { id: string; label: string; url?: string; count?: number; modern?: boolean };

const FAMILY_ORDER = ['Nintendo', 'PlayStation', 'Sega', 'Xbox', 'PC'] as const;
function familyOf(platform: Platform): typeof FAMILY_ORDER[number] {
  if (/^(ps|psp|psvita)/i.test(platform.id)) return 'PlayStation';
  if (/^(xbox)/i.test(platform.id)) return 'Xbox';
  if (/^(gb|gba|gbc|gc|3ds|nds|nes|n64|snes|wii|switch)/i.test(platform.id)) return 'Nintendo';
  if (/^(dreamcast|genesis|saturn)/i.test(platform.id)) return 'Sega';
  return 'PC';
}
function urlFor(source: GameSource, query = 'game title') {
  return source.urlTemplate?.replace('{query}', encodeURIComponent(query)) || source.url || '#';
}

export function GameSourceIndex({ onOpenGames }: { onOpenGames: (platform?: string, query?: string) => void }) {
  const [manifest, setManifest] = useState<IndexManifest | null>(null);
  const [data, setData] = useState<GameSourceData | null>(null);
  const [steamCount, setSteamCount] = useState(0);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const base = import.meta.env.BASE_URL;
    setError('');
    Promise.all([
      loadManifest(controller.signal),
      fetch(`${base}data/game-art-sources.json`, { signal: controller.signal, cache: 'no-cache', headers: { Accept: 'application/json' } })
        .then(response => { if (!response.ok) throw new Error('Game source index could not be loaded.'); return response.json() as Promise<GameSourceData>; }),
      fetch(`${base}offline/index/games-steam.json`, { signal: controller.signal, cache: 'no-cache', headers: { Accept: 'application/json' } })
        .then(response => response.ok ? response.json() as Promise<SteamIndex> : { games: [] }),
    ]).then(([nextManifest, nextData, steam]) => {
      if (controller.signal.aborted) return;
      setManifest(nextManifest);
      setData(nextData);
      setSteamCount(steam.games?.length || 0);
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Game source index could not be loaded.');
    });
    return () => controller.abort();
  }, [attempt]);

  const platformGroups = useMemo(() => {
    const classic: Platform[] = (manifest?.shards || []).filter(shard => shard.kind === 'games').map(shard => ({
      id: shard.platform || shard.id.replace(/^games-/, ''),
      label: shard.label || shard.platform || shard.id,
      url: shard.sourceUrl,
      count: shard.rows,
    }));
    const modern: Platform[] = MODERN_GAME_PLATFORMS.map(platform => ({ id: platform.id, label: platform.label, modern: true }));
    const groups = [...classic, ...modern].reduce((result, platform) => {
      const family = familyOf(platform);
      (result[family] ||= []).push(platform);
      return result;
    }, {} as Record<string, Platform[]>);
    return FAMILY_ORDER.flatMap(family => groups[family]?.length ? [{ family, platforms: groups[family] }] : []);
  }, [manifest]);

  const gameShards = (manifest?.shards || []).filter(shard => shard.kind === 'games');
  const recordCount = gameShards.reduce((total, shard) => total + shard.rows, 0);
  const sourceGroups = useMemo(() => [...new Set((data?.catalogs || []).map(source => source.group))], [data]);
  const sourcesByGroup = (group: string) => (data?.catalogs || []).filter(source => source.group === group);
  const platformLabel = (id: string) => id === 'classic' ? 'Classic systems' : id === 'modern' ? 'Modern systems' : MODERN_GAME_PLATFORMS.find(platform => platform.id === id)?.label || gameShards.find(shard => shard.platform === id)?.label || id.toUpperCase();
  const titleEntries = data?.entries || [];

  return <section className="content-width search-content game-source-page" aria-labelledby="game-source-title">
    <button type="button" className="back-to-collections" onClick={() => onOpenGames()}><ArrowLeft size={15}/> Game archive</button>
    <header className="game-source-heading">
      <div>
        <span className="tiny-kicker">GAME INDEX / SOURCE MAP</span>
        <h1 id="game-source-title">Games, by<br/><em>source.</em></h1>
        <p>See which console families, title indexes, and image catalogs feed the game archive. Choose a platform to search its records; every image keeps a link to its host.</p>
      </div>
      <form className="game-source-search" onSubmit={event => { event.preventDefault(); onOpenGames(undefined, query.trim()); }}>
        <label htmlFor="game-source-query">SEARCH THE GAME INDEX</label>
        <div><Search size={18}/><input id="game-source-query" value={query} onChange={event => setQuery(event.target.value)} placeholder="Game title or product code"/><Button type="submit" disabled={query.trim().length < 2}>Search <ArrowRight size={15}/></Button></div>
      </form>
    </header>

    {error && <div className="search-warning" role="status"><Database size={16}/><span>{error}</span><button type="button" onClick={() => setAttempt(value => value + 1)}>Reload index</button></div>}
    {!manifest && !error ? <div className="game-source-loading" role="status"><LoaderCircle size={18} className="game-finder-spinner"/> Loading platform and source indexes…</div> : <>
      <div className="game-source-stats" aria-label="Indexed game coverage">
        <div><strong>{gameShards.length}</strong><span>classic console feeds</span></div>
        <div><strong>{recordCount.toLocaleString()}</strong><span>console title records</span></div>
        <div><strong>{MODERN_GAME_PLATFORMS.length}</strong><span>modern platform searches</span></div>
        <div><strong>{steamCount || '—'}</strong><span>Steam artwork records</span></div>
      </div>

      <section className="game-source-platforms" aria-labelledby="game-platforms-title">
        <div className="game-source-section-head"><div><span className="tiny-kicker">BROWSE THE INDEX</span><h2 id="game-platforms-title">Console families</h2></div><p>Classic feeds are browsable by system. Modern systems query title and image metadata when you search.</p></div>
        <div className="game-source-family-grid">
          {platformGroups.map(({ family, platforms }) => <article className="game-source-family" key={family}>
            <div className="game-source-family-heading"><Gamepad2 size={17}/><h3>{family}</h3><span>{platforms.length} systems</span></div>
            <ul>{platforms.map(platform => <li key={platform.id}>
              <button type="button" onClick={() => onOpenGames(platform.id)}><span>{platform.label}</span><small>{platform.count ? `${platform.count.toLocaleString()} title records` : 'Live title search'}</small><ArrowRight size={14}/></button>
              {platform.url && <a href={platform.url} target="_blank" rel="noreferrer" aria-label={`${platform.label} source repository`} title="Open source index"><ArrowUpRight size={13}/></a>}
            </li>)}</ul>
          </article>)}
        </div>
      </section>

      <section className="game-source-catalogs" aria-labelledby="game-source-catalogs-title">
        <div className="game-source-section-head"><div><span className="tiny-kicker">IMAGE SOURCES</span><h2 id="game-source-catalogs-title">Catalogs behind the search</h2></div><p>Indexed feeds, live metadata, publisher pages, and community catalogs have different coverage. Their role is shown here.</p></div>
        {sourceGroups.map(group => <div className="game-source-group" key={group}>
          <h3>{group}</h3>
          <div className="game-source-card-grid">{sourcesByGroup(group).map(source => <article className="game-source-card" key={source.id}>
            <span className="tiny-kicker">{source.mode}</span><h4>{source.name}</h4><p>{source.description}</p>
            <div className="game-source-assets">{source.assets.map(asset => <span key={asset}>{asset}</span>)}</div>
            <div className="game-source-platform-tags" aria-label="Platform coverage">{source.platforms.map(platform => <span key={platform}>{platformLabel(platform)}</span>)}</div>
            {source.urlTemplate ? <a href={urlFor(source, query.trim() || 'game title')} target="_blank" rel="noreferrer">Open {query.trim() ? 'this title' : 'a sample search'} <ArrowUpRight size={13}/></a> : <a href={source.url} target="_blank" rel="noreferrer">Open source <ArrowUpRight size={13}/></a>}
          </article>)}</div>
        </div>)}
      </section>

      <section className="game-source-title-feeds" aria-labelledby="game-title-feeds-title">
        <div className="game-source-section-head"><div><span className="tiny-kicker">PUBLISHER FEEDS</span><h2 id="game-title-feeds-title">Title-specific additions</h2></div><p>Publisher pages are added as compatible feeds are found. Shared search and platform indexes still cover the wider catalog.</p></div>
        {titleEntries.length ? titleEntries.map(entry => <article className="game-source-title-row" key={entry.matches.join('|')}><strong>{entry.matches.join(' · ')}</strong><div>{entry.sources.map(source => <a href={source.url} key={source.url} target="_blank" rel="noreferrer">{source.label}<small>{source.kind || 'Image source'}</small><ArrowUpRight size={13}/></a>)}</div></article>) : <p className="muted">No title-specific publisher feeds are configured yet.</p>}
      </section>
    </>}
  </section>;
}
