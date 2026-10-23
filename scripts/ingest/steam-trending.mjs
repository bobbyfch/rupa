import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchCdprPressCenterAssets } from './cdpr-press-center.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUTPUT = resolve(ROOT, 'public/data/games-trending.json');
const ARTWORK_OUTPUT = resolve(ROOT, 'public/offline/index/games-steam.json');
const SEEDS = resolve(ROOT, 'scripts/data/game-artwork-seeds.json');
const TOP_SELLERS_ENDPOINT = 'https://store.steampowered.com/search/results/?query=&start=0&count=25&filter=topsellers&json=1';
const FEATURED_ENDPOINT = 'https://store.steampowered.com/api/featuredcategories/?cc=us&l=en';
const MOST_PLAYED_ENDPOINT = 'https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/';
const CHARTS = {
  top_sellers: { label: 'Steam / US Top Sellers', sourceUrl: 'https://store.steampowered.com/charts/topselling/' },
  most_played: { label: 'Steam / Most Played', sourceUrl: 'https://store.steampowered.com/charts/mostplayed?language=english' },
  new_releases: { label: 'Steam / New Releases', sourceUrl: 'https://store.steampowered.com/explore/new/' },
  coming_soon: { label: 'Steam / Coming Soon', sourceUrl: 'https://store.steampowered.com/search/?filter=comingsoon' },
  specials: { label: 'Steam / On Sale', sourceUrl: 'https://store.steampowered.com/search/?specials=1' },
};

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

async function optionalJson(fetchImpl, url, logger, label) {
  try {
    const response = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    logger.warn?.(`${label} could not be refreshed: ${error.message}`);
    return null;
  }
}

function featuredItems(featured, key, source) {
  const rows = featured?.[key]?.items;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((item, index) => {
    const appId = Number(item?.id);
    const title = typeof item?.name === 'string' ? item.name.trim() : '';
    const image = item?.header_image || item?.large_capsule_image || item?.small_capsule_image;
    if (!Number.isSafeInteger(appId) || appId <= 0 || !title || typeof image !== 'string' || !/^https:\/\//.test(image)) return [];
    if (item.type !== undefined && Number(item.type) !== 0) return [];
    return [{ rank: index + 1, appId, title, image, sourceUrl: `https://store.steampowered.com/app/${appId}/`, source }];
  });
}

export async function refreshSteamTrends({ fetchImpl = fetch, outputPath = OUTPUT, artworkPath = ARTWORK_OUTPUT, logger = console } = {}) {
  const prior = await readJson(outputPath, { items: [], charts: {} });
  const priorArtwork = await readJson(artworkPath, { games: [] });
  try {
    const [topResponse, featuredData, mostPlayedData] = await Promise.all([
      fetchImpl(TOP_SELLERS_ENDPOINT, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12_000) }),
      optionalJson(fetchImpl, FEATURED_ENDPOINT, logger, 'Steam featured charts'),
      optionalJson(fetchImpl, MOST_PLAYED_ENDPOINT, logger, 'Steam most-played chart'),
    ]);
    if (!topResponse.ok) throw new Error(`Steam store returned HTTP ${topResponse.status}.`);
    const topData = await topResponse.json();
    const topRows = Array.isArray(topData?.items) ? topData.items : [];
    const topCandidates = topRows.flatMap(item => {
      const match = String(item.logo || '').match(/\/apps\/(\d+)\//);
      return match && Number(match[1]) > 0 && typeof item.name === 'string' ? [{ appId: Number(match[1]), title: item.name.trim() }] : [];
    });

    const newest = featuredItems(featuredData, 'new_releases', 'Steam new releases');
    const comingSoon = featuredItems(featuredData, 'coming_soon', 'Steam coming soon');
    const specials = featuredItems(featuredData, 'specials', 'Steam specials');
    const mostPlayedRanks = Array.isArray(mostPlayedData?.response?.ranks) ? mostPlayedData.response.ranks : [];
    const mostPlayedCandidates = mostPlayedRanks.slice(0, 20).flatMap(row => {
      const appId = Number(row?.appid);
      return Number.isSafeInteger(appId) && appId > 0 ? [{ appId, title: '' }] : [];
    });
    const seeds = await readJson(SEEDS, []);
    const indexCandidates = [
      ...topCandidates,
      ...mostPlayedCandidates,
      ...newest.slice(0, 12),
      ...(Array.isArray(seeds) ? seeds : []),
    ];
    const candidates = [...new Map(indexCandidates.map(candidate => [candidate.appId, candidate])).values()];
    const indexedById = new Map();
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
          const row = { appId: candidate.appId, title: game.name, image: game.header_image, sourceUrl, platforms: ['pc'], assets: [...steamAssets, ...publisherAssets] };
          indexedGames.push(row);
          indexedById.set(candidate.appId, row);
        } catch {}
      }
    }

    await Promise.all(Array.from({ length: Math.min(5, candidates.length) }, worker));
    const topSellers = topCandidates.flatMap(candidate => {
      const game = indexedById.get(candidate.appId);
      return game ? [{ appId: game.appId, title: game.title, image: game.image, sourceUrl: game.sourceUrl, source: 'Steam top sellers' }] : [];
    }).slice(0, 20).map((item, index) => ({ rank: index + 1, ...item }));
    if (!topSellers.length) throw new Error('Steam top sellers response contained no game artwork.');

    const charts = { ...(prior.charts || {}) };
    charts.top_sellers = { ...CHARTS.top_sellers, items: topSellers };
    const played = mostPlayedCandidates.flatMap(candidate => {
      const game = indexedById.get(candidate.appId);
      return game ? [{ appId: game.appId, title: game.title, image: game.image, sourceUrl: game.sourceUrl, source: 'Steam most played' }] : [];
    }).map((item, index) => ({ rank: index + 1, ...item }));
    if (played.length) charts.most_played = { ...CHARTS.most_played, items: played };
    else if (charts.most_played?.items?.length) logger.warn?.('Steam most-played chart is empty; preserving its prior snapshot.');

    for (const [id, items] of [['new_releases', newest], ['coming_soon', comingSoon], ['specials', specials]]) {
      if (items.length) charts[id] = { ...CHARTS[id], items: items.slice(0, 20) };
      else if (charts[id]?.items?.length) logger.warn?.(`Steam ${id} chart is empty; preserving its prior snapshot.`);
    }

    const snapshot = {
      generatedAt: new Date().toISOString(),
      source: TOP_SELLERS_ENDPOINT,
      sourceUrl: CHARTS.top_sellers.sourceUrl,
      items: topSellers,
      charts,
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
    logger.info?.(`Steam charts refreshed: ${Object.entries(charts).map(([id, chart]) => `${id} ${chart.items.length}`).join(', ')}.`);
    logger.info?.(`Steam artwork index refreshed: ${artworkSnapshot.games.length} titles, image URLs only.`);
    return { ...snapshot, artworkSnapshot };
  } catch (error) {
    if (Array.isArray(prior.items) && prior.items.length) {
      logger.warn?.(`Steam chart refresh failed; preserving ${prior.items.length} saved top sellers and ${priorArtwork.games?.length || 0} artwork records: ${error.message}`);
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
