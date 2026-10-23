import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUTPUT = resolve(ROOT, 'public/data/games-trending.json');
const ENDPOINT = 'https://store.steampowered.com/search/results/?query=&start=0&count=25&filter=topsellers&json=1';

async function previousItems() {
  try {
    const data = JSON.parse(await readFile(OUTPUT, 'utf8'));
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return [];
  }
}

export async function refreshSteamTrends({ fetchImpl = fetch, outputPath = OUTPUT, logger = console } = {}) {
  const prior = await previousItems();
  try {
    const response = await fetchImpl(ENDPOINT, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error(`Steam store returned HTTP ${response.status}.`);
    const data = await response.json();
    const rows = Array.isArray(data?.items) ? data.items : [];
    const candidates = [...new Map(rows.flatMap(item => {
      const match = String(item.logo || '').match(/\/apps\/(\d+)\//);
      return match && Number(match[1]) > 0 && typeof item.name === 'string' ? [[Number(match[1]), { appId: Number(match[1]), title: item.name.trim() }]] : [];
    })).values()];
    const verified = [];
    let next = 0;
    async function worker() {
      while (next < candidates.length) {
        const candidate = candidates[next++];
        try {
          const detailResponse = await fetchImpl(`https://store.steampowered.com/api/appdetails?appids=${candidate.appId}&cc=us&l=en`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(7_000) });
          if (!detailResponse.ok) continue;
          const detail = await detailResponse.json();
          const game = detail?.[candidate.appId]?.data;
          if (detail?.[candidate.appId]?.success && game?.type === 'game' && game.name && game.header_image) verified.push({ appId: candidate.appId, title: game.name, image: game.header_image });
        } catch {}
      }
    }
    await Promise.all(Array.from({ length: Math.min(5, candidates.length) }, worker));
    const rankById = new Map(candidates.map((candidate, index) => [candidate.appId, index + 1]));
    const items = verified.sort((a, b) => (rankById.get(a.appId) || 0) - (rankById.get(b.appId) || 0)).slice(0, 20)
      .map((item, index) => ({ rank: index + 1, ...item, sourceUrl: `https://store.steampowered.com/app/${item.appId}/`, source: 'Steam top sellers' }));
    if (!items.length) throw new Error('Steam top sellers response contained no game artwork.');
    const snapshot = { generatedAt: new Date().toISOString(), source: ENDPOINT, sourceUrl: 'https://store.steampowered.com/charts/topselling/', items };
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(snapshot)}\n`);
    logger.info?.(`Steam top-seller artwork refreshed: ${items.length} games.`);
    return snapshot;
  } catch (error) {
    if (prior.length) {
      logger.warn?.(`Steam trend refresh failed; preserving ${prior.length} saved games: ${error.message}`);
      return { items: prior, changed: false };
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
