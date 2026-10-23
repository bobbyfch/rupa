import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchCdprPressCenterAssets } from './cdpr-press-center.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUTPUT = resolve(ROOT, 'public/data/games-trending.json');
const ARTWORK_OUTPUT = resolve(ROOT, 'public/offline/index/games-steam.json');
const SEEDS = resolve(ROOT, 'scripts/data/game-artwork-seeds.json');
const ENDPOINT = 'https://store.steampowered.com/search/results/?query=&start=0&count=25&filter=topsellers&json=1';

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

export async function refreshSteamTrends({ fetchImpl = fetch, outputPath = OUTPUT, artworkPath = ARTWORK_OUTPUT, logger = console } = {}) {
  const prior = await readJson(outputPath, { items: [] });
  const priorArtwork = await readJson(artworkPath, { games: [] });
  try {
    const response = await fetchImpl(ENDPOINT, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error(`Steam store returned HTTP ${response.status}.`);
    const data = await response.json();
    const rows = Array.isArray(data?.items) ? data.items : [];
    const trendingCandidates = rows.flatMap(item => {
      const match = String(item.logo || '').match(/\/apps\/(\d+)\//);
      return match && Number(match[1]) > 0 && typeof item.name === 'string' ? [{ appId: Number(match[1]), title: item.name.trim() }] : [];
    });
    const seeds = await readJson(SEEDS, []);
    const candidates = [...new Map([...trendingCandidates, ...(Array.isArray(seeds) ? seeds : [])].map(candidate => [candidate.appId, candidate])).values()];
    const verified = [];
    const indexedGames = [];
    let next = 0;
    async function worker() {
      while (next < candidates.length) {
        const candidate = candidates[next++];
        try {
          const detailResponse = await fetchImpl(`https://store.steampowered.com/api/appdetails?appids=${candidate.appId}&cc=us&l=en`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(7_000) });
          if (!detailResponse.ok) continue;
          const detail = await detailResponse.json();
          const game = detail?.[candidate.appId]?.data;
          if (!detail?.[candidate.appId]?.success || game?.type !== 'game' || !game.name || !game.header_image) continue;
          const sourceUrl = `https://store.steampowered.com/app/${candidate.appId}/`;
          const steamAssets = [
            { id: `steam:${candidate.appId}:header`, kind: 'cover', label: 'Steam header artwork', image: game.header_image },
            ...(game.background_raw ? [{ id: `steam:${candidate.appId}:background`, kind: 'wallpaper', label: 'Store background', image: game.background_raw }] : []),
            ...(Array.isArray(game.screenshots) ? game.screenshots.slice(0, 40).map((screenshot, index) => ({ id: `steam:${candidate.appId}:screenshot:${index + 1}`, kind: 'screenshot', label: `Gameplay screenshot ${index + 1}`, image: screenshot.path_full })) : []),
          ].filter(asset => typeof asset.image === 'string' && /^https:\/\//.test(asset.image));
          let publisherAssets = [];
          if (typeof candidate.pressCenterUrl === 'string') {
            try {
              publisherAssets = await fetchCdprPressCenterAssets(candidate.pressCenterUrl, { fetchImpl });
              logger.info?.(`Publisher artwork refreshed: ${publisherAssets.length} images from ${candidate.title}.`);
            } catch (error) {
              const previous = (priorArtwork.games || []).find(item => item.appId === candidate.appId);
              publisherAssets = (previous?.assets || []).filter(asset => asset.provider === 'CD PROJEKT RED Press Center');
              logger.warn?.(`Press Center refresh failed for ${candidate.title}; preserving ${publisherAssets.length} saved images: ${error.message}`);
            }
          }
          const assets = [...steamAssets, ...publisherAssets];
          const platforms = ['pc'];
          const row = { appId: candidate.appId, title: game.name, image: game.header_image, sourceUrl, platforms, assets };
          indexedGames.push(row);
          if (trendingCandidates.some(item => item.appId === candidate.appId)) verified.push({ appId: candidate.appId, title: game.name, image: game.header_image, sourceUrl, source: 'Steam top sellers' });
        } catch {}
      }
    }
    await Promise.all(Array.from({ length: Math.min(5, candidates.length) }, worker));
    const rankById = new Map(candidates.map((candidate, index) => [candidate.appId, index + 1]));
    const items = verified.sort((a, b) => (rankById.get(a.appId) || 0) - (rankById.get(b.appId) || 0)).slice(0, 20)
      .map((item, index) => ({ rank: index + 1, ...item }));
    if (!items.length) throw new Error('Steam top sellers response contained no game artwork.');
    const snapshot = {
      generatedAt: JSON.stringify(prior.items) === JSON.stringify(items) ? prior.generatedAt || new Date().toISOString() : new Date().toISOString(),
      source: ENDPOINT,
      sourceUrl: 'https://store.steampowered.com/charts/topselling/',
      items,
    };
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(snapshot)}\n`);
    const mergedGames = new Map(indexedGames.map(game => [game.appId, game]));
    for (const game of priorArtwork.games || []) if (!mergedGames.has(game.appId)) mergedGames.set(game.appId, game);
    const orderedGames = [...mergedGames.values()].sort((a, b) => a.title.localeCompare(b.title));
    const artworkSnapshot = {
      schemaVersion: 1,
      rights: 'reference-only',
      generatedAt: JSON.stringify(priorArtwork.games) === JSON.stringify(orderedGames) ? priorArtwork.generatedAt || snapshot.generatedAt : snapshot.generatedAt,
      source: 'Steam Store and configured publisher press pages; image URLs remain hosted by their original providers.',
      sourceUrl: 'https://store.steampowered.com/api/appdetails?appids={appId}&cc=us&l=en',
      games: orderedGames,
    };
    await mkdir(dirname(artworkPath), { recursive: true });
    await writeFile(artworkPath, `${JSON.stringify(artworkSnapshot)}\n`);
    logger.info?.(`Steam top-seller artwork refreshed: ${items.length} games.`);
    logger.info?.(`Steam artwork index refreshed: ${artworkSnapshot.games.length} titles, image URLs only.`);
    return { ...snapshot, artworkSnapshot };
  } catch (error) {
    if (Array.isArray(prior.items) && prior.items.length) {
      logger.warn?.(`Steam trend refresh failed; preserving ${prior.items.length} saved games and ${priorArtwork.games?.length || 0} artwork records: ${error.message}`);
      return { ...prior, changed: false };
    }
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  refreshSteamTrends().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
