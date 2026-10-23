// Local-first catalog: curated works/editions plus game and anime title indexes shipped as static JSON shards.
// Everything here works with no Worker and no network beyond the static files. Index rows are references, not mirrored images.
import type { Artwork } from './types';

export type RightsStatus = 'cc0' | 'public-domain' | 'cc-by' | 'cc-by-sa' | 'permission-granted' | 'reference-only' | 'unknown' | 'blocked';
export type Availability = 'mirrored' | 'index-only' | 'link-only';
export interface Alias { value: string; script: 'latin' | 'ja' | 'ko' | 'zh' }
export interface Work {
  id: string; category: string; collection: string; kind: 'work' | 'franchise' | 'artist';
  title: string; year?: number; creators?: string; aliases: Alias[];
  /** Index rows only: reference page, optional free thumbnail and a short note (language, length). */
  url?: string; image?: string; note?: string;
}
export interface Edition {
  id: string; workId: string; region: string; country: string; language: string; year: number; version: string; type: string;
}
export interface WorksFile {
  schemaVersion: number; generatedAt: string; works: Work[]; editions: Edition[];
  themes: { id: string; label: string; query: string }[]; facets: { packaging: string[]; artwork: string[] };
  collections: { id: string; label: string; category: string }[];
}
export interface GameShard {
  platform: string; label: string; imageBase: string; rights: string; rows: [string, number | string][];
  source: { id: string; repo: string; revision: string; url: string };
  serials?: { imageBase: string; rows: [string, string | null, number][]; source: { id: string; repo: string; revision: string; url: string } };
}
export interface GameArtworkGroup {
  id: string;
  title: string;
  editions: Artwork[];
  platforms: string[];
}
export interface AnimeShard {
  imageBase: string; imageSuffix: string; rights: string;
  rows: [string, string, number, number, number, string, string[]][];
  source: { id: string; repo: string; revision: string; url: string };
}
export interface WikidataShard {
  category: string; entityBase: string; imageBase: string; rows: [string, string, number, string, string[], number, string][];
  source: { id: string; url: string; license: string };
}
export interface AudiobookShard { urlBase: string; rows: [number, string, string, string, number, string][] }
export interface IndexManifest {
  schemaVersion: number; generatedAt: string;
  shards: { id: string; kind: 'works' | 'games' | 'anime' | 'wikidata' | 'audiobooks'; category?: string; platform?: string; label?: string; file: string; rows: number; bytes: number; sourceId?: string; sourceRepo?: string; sourceUrl?: string; revision?: string; rights?: string }[];
}

// ---------- text matching ----------
export function normalizeText(value: string): string {
  return value.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
const NON_LATIN = /[^\u0000-ɏḀ-ỿ]/;
export const scriptOf = (value: string): Alias['script'] =>
  /[぀-ヿ]/.test(value) ? 'ja' : /[가-힯]/.test(value) ? 'ko' : /[一-鿿]/.test(value) ? 'zh' : 'latin';

const TYPE_WORDS = new Set(['poster', 'posters', 'cover', 'covers', 'boxart', 'box', 'art', 'artwork', 'key', 'visual', 'edition', 'editions']);
const REGION_WORDS: Record<string, string> = {
  japan: 'JP', japanese: 'JP', jp: 'JP', jpn: 'JP', china: 'CN', chinese: 'CN', cn: 'CN', korea: 'KR', korean: 'KR', kr: 'KR',
  us: 'US', usa: 'US', american: 'US', america: 'US', uk: 'GB', taiwan: 'TW', taiwanese: 'TW', tw: 'TW', indonesia: 'ID', indonesian: 'ID',
};
export const PLATFORM_ALIASES: Record<string, string> = {
  nes: 'nes', famicom: 'nes', snes: 'snes', sfc: 'snes', n64: 'n64', gb: 'gb', gameboy: 'gb', gbc: 'gbc', gba: 'gba', nds: 'nds', ds: 'nds', '3ds': '3ds',
  gc: 'gc', gamecube: 'gc', ngc: 'gc', wii: 'wii', genesis: 'genesis', megadrive: 'genesis', saturn: 'saturn', dreamcast: 'dreamcast', dc: 'dreamcast',
  ps1: 'ps1', psx: 'ps1', playstation: 'ps1', ps2: 'ps2', psp: 'psp', vita: 'psvita', psvita: 'psvita',
};

/** Splits a query into content tokens, region hints, platform hints and years. */
export function parseQuery(query: string) {
  const regions = new Set<string>(), platforms = new Set<string>(), years: number[] = [], tokens: string[] = [];
  let wantsPoster = false;
  const words = normalizeText(query).split(' ').filter(Boolean);
  for (let index = 0; index < words.length; index++) {
    const raw = words[index];
    if ((raw === 'ps' || raw === 'playstation') && words[index + 1] === 'vita') { platforms.add('psvita'); index++; continue; }
    if (TYPE_WORDS.has(raw)) { wantsPoster ||= raw === 'poster' || raw === 'posters'; continue; }
    if (REGION_WORDS[raw]) { regions.add(REGION_WORDS[raw]); continue; }
    if (PLATFORM_ALIASES[raw]) { platforms.add(PLATFORM_ALIASES[raw]); continue; }
    if (/^(?:19|20)\d{2}$/.test(raw)) years.push(Number(raw));
    tokens.push(raw);
  }
  return { tokens, regions, platforms, years, wantsPoster };
}
function matchesToken(normalized: string, words: string[], token: string): boolean {
  if (NON_LATIN.test(token)) return normalized.includes(token);
  return words.some(word => word === token || (token.length >= 3 && word.startsWith(token)));
}
const matchesAll = (haystack: string, tokens: string[]) => {
  const words = haystack.split(' ');
  return tokens.every(token => matchesToken(haystack, words, token));
};
function rank(title: string, tokens: string[]): number {
  const normalized = normalizeText(title), joined = tokens.join(' ');
  if (normalized === joined) return 0;
  if (normalized.startsWith(joined)) return 1;
  return normalized.includes(joined) ? 2 : 3;
}

/** Token match for flat artwork lists (the mirrored offline set). The word "poster" also requires kind === 'poster'. */
export function artworkMatches(item: Pick<Artwork, 'title' | 'subtitle' | 'artist' | 'year' | 'kind' | 'tags'>, query: string): boolean {
  const { tokens, wantsPoster } = parseQuery(query);
  if (wantsPoster && item.kind !== 'poster') return false;
  return matchesAll(normalizeText([item.title, item.subtitle, item.artist, item.year, ...(item.tags || [])].filter(Boolean).join(' ')), tokens);
}

// ---------- loading ----------
const base = () => {
  const root = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL || '/';
  return typeof window === 'undefined' ? root : new URL(root, window.location.origin).toString();
};
export const indexUrl = (file: string) => `${base()}offline/index/${file}`;
const cache = new Map<string, Promise<unknown>>();
function loadJson<T>(file: string, signal?: AbortSignal): Promise<T> {
  let promise = cache.get(file) as Promise<T> | undefined;
  if (!promise) {
    promise = fetch(indexUrl(file), { headers: { Accept: 'application/json' }, cache: file === 'games-steam.json' ? 'no-cache' : 'force-cache' })
      .then(response => { if (!response.ok) throw new Error(`Offline index ${file}: HTTP ${response.status}`); return response.json() as Promise<T>; });
    promise.catch(() => cache.delete(file));
    cache.set(file, promise);
  }
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    promise!.then(resolve, reject);
  });
}
export const loadManifest = (signal?: AbortSignal) => loadJson<IndexManifest>('manifest.json', signal);
export const loadWorks = (signal?: AbortSignal) => loadJson<WorksFile>('works.json', signal);
export interface SourceInfo { id: string; name: string; role: string; status: string; rightsMode?: string; imageMode?: string; upstream?: string; lastChecked?: string; notes?: string; mirrored: number }
export interface SourcesFile { generatedAt: string; sources: SourceInfo[]; linkOnly?: { name: string; url: string; categories: string[]; about: string }[] }
export const loadSources = (signal?: AbortSignal) => loadJson<SourcesFile>('sources.json', signal);
export const resetCatalogCache = () => cache.clear();

// ---------- works & editions ----------
export interface WorkHit { work: Work; editions: Edition[]; matchedEditions: Set<string>; score: number }
export function searchWorks(file: WorksFile, query: string, filter: { category?: string; collection?: string } = {}, limit = 60): WorkHit[] {
  const { tokens, regions, years } = parseQuery(query);
  const byWork = new Map<string, Edition[]>();
  for (const edition of file.editions) byWork.set(edition.workId, [...(byWork.get(edition.workId) || []), edition]);
  const hits: WorkHit[] = [];
  for (const work of file.works) {
    // Curated Japanese animation features are stored as films, but belong in the Anime/Japan browse facet too.
    const animeCollection = filter.category === 'anime' && work.category === 'movies' && ['ghibli', 'shinkai', 'anime-film', 'anime-theatrical'].includes(work.collection);
    if (filter.category && work.category !== filter.category && !animeCollection) continue;
    if (filter.collection && work.collection !== filter.collection) continue;
    const editions = byWork.get(work.id) || [];
    const collectionAlias = work.collection === 'ghibli' ? 'Studio Ghibli' : work.collection === 'shinkai' ? 'Makoto Shinkai' : '';
    const workText = normalizeText([work.title, work.creators, collectionAlias, ...work.aliases.map(a => a.value), work.year].filter(Boolean).join(' '));
    const contentTokens = tokens.filter(token => !(/^(?:19|20)\d{2}$/.test(token) && years.includes(Number(token))));
    if (!matchesAll(workText, contentTokens)) continue;
    const matched = new Set(editions.filter(edition =>
      (!regions.size || regions.has(edition.region)) && (!years.length || years.includes(edition.year))).map(edition => edition.id));
    const wantsEdition = regions.size > 0 || years.length > 0;
    const yearOk = !years.length || years.includes(work.year ?? -1) || matched.size > 0;
    if (wantsEdition && (!yearOk || (regions.size > 0 && matched.size === 0))) continue;
    hits.push({ work, editions, matchedEditions: wantsEdition ? matched : new Set(), score: tokens.length ? rank(work.title, contentTokens) : 3 });
  }
  hits.sort((a, b) => a.score - b.score || a.work.title.length - b.work.title.length || a.work.title.localeCompare(b.work.title));
  return hits.slice(0, limit);
}

// ---------- Wikidata and LibriVox title indexes (every collection without an open image archive) ----------
export const WIKIDATA_CATEGORIES = ['movies', 'tv', 'music', 'musicvideos', 'books', 'manga', 'webtoons', 'comics', 'boardgames', 'magazines', 'podcasts', 'apps', 'physicalmedia'] as const;
export const hasTitleIndex = (category: string) => category === 'audiobooks' || (WIKIDATA_CATEGORIES as readonly string[]).includes(category);
/** upload.wikimedia.org path for a Commons file at a given width (Wikimedia only serves the step sizes 20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840): a scaled thumbnail when the original is larger (or a vector/TIFF), otherwise the original. */
export function commonsImageUrl(base: string, file: string, hash: string, originalWidth: number, width: number): string {
  const name = file.replace(/ /g, '_'), encoded = encodeURIComponent(name), dir = hash[0] + '/' + hash;
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (ext !== 'svg' && ext !== 'tif' && ext !== 'tiff' && originalWidth <= width) return base + dir + '/' + encoded;
  const suffix = ext === 'svg' ? '.png' : ext === 'tif' || ext === 'tiff' ? '.jpg' : '';
  return base + 'thumb/' + dir + '/' + encoded + '/' + width + 'px-' + encoded + suffix;
}
const commonsFile = (shard: WikidataShard, row: WikidataShard['rows'][number], width: number) => commonsImageUrl(shard.imageBase, row[3], row[6], row[5], width);
export function wikidataWorks(shard: WikidataShard, query: string, limit = 40): WorkHit[] {
  const { tokens } = parseQuery(query);
  if (!tokens.length) return [];
  const hits: WorkHit[] = [];
  shard.rows.forEach((row, index) => {
    const [qid, title, year, file, alts] = row;
    if (!matchesAll(normalizeText([title, ...alts, year || ''].join(' ')), tokens)) return;
    hits.push({
      score: rank(title, tokens) * 100000 + index, editions: [], matchedEditions: new Set(),
      work: { id: `wd:${qid}`, category: shard.category, collection: 'wikidata', kind: 'work', title, year: year || undefined, aliases: alts.map(value => ({ value, script: scriptOf(value) })), url: shard.entityBase + qid, image: file ? commonsFile(shard, row, 250) : undefined },
    });
  });
  return hits.sort((a, b) => a.score - b.score).slice(0, limit);
}
/** Same rows as artwork cards, only those with a Commons image. Licence is not verified per file here: rights stay source-only. */
export function wikidataArtworks(shard: WikidataShard, query: string, limit = 24): { items: Artwork[]; withoutImage: number } {
  const hits = wikidataWorks(shard, query, 400);
  const withImage = hits.filter(hit => hit.work.image), poster = shard.category === 'movies' || shard.category === 'physicalmedia';
  const rowById = new Map(shard.rows.map(row => [`wd:${row[0]}`, row]));
  return {
    withoutImage: hits.length - withImage.length,
    items: withImage.slice(0, limit).map(({ work }) => {
      const row = rowById.get(work.id)!, file = row[3], preview = commonsFile(shard, row, 500), full = commonsFile(shard, row, 1920);
      return {
        id: `${shard.category}:wikidata:${work.id.slice(3)}`, category: shard.category as Artwork['category'], title: work.title, subtitle: work.year ? `${work.year} · Wikimedia Commons image` : 'Wikimedia Commons image', year: work.year ? String(work.year) : undefined,
        source: 'Wikidata + Commons', provider: 'Offline index · Wikidata', sourceUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, '_'))}`,
        previewUrl: preview, imageUrl: full, sdDownloadUrl: preview, downloadUrl: full, hdDownloadUrls: [full, preview], kind: poster ? 'poster' : 'artwork', rights: 'source-only', mediaId: work.id.slice(3), availability: 'index-only',
      } as Artwork;
    }),
  };
}
export function audiobookWorks(shard: AudiobookShard, query: string, limit = 40): WorkHit[] {
  const { tokens } = parseQuery(query);
  if (!tokens.length) return [];
  const hits: WorkHit[] = [];
  shard.rows.forEach(([id, title, author, language, minutes, path], index) => {
    if (!matchesAll(normalizeText(`${title} ${author} ${language}`), tokens)) return;
    hits.push({
      score: rank(title, tokens) * 100000 + index, editions: [], matchedEditions: new Set(),
      work: { id: `librivox:${id}`, category: 'audiobooks', collection: 'librivox', kind: 'work', title, creators: author || undefined, aliases: [], url: shard.urlBase + path, note: [language, minutes ? `${Math.round(minutes / 60 * 10) / 10} h` : ''].filter(Boolean).join(' · ') },
    });
  });
  return hits.sort((a, b) => a.score - b.score).slice(0, limit);
}
export async function searchTitleIndex(category: string, query: string, signal?: AbortSignal, limit = 40): Promise<WorkHit[]> {
  if (category === 'audiobooks') return audiobookWorks(await loadJson<AudiobookShard>('audiobooks.json', signal), query, limit);
  if (!(WIKIDATA_CATEGORIES as readonly string[]).includes(category)) return [];
  return wikidataWorks(await loadJson<WikidataShard>(`wd-${category}.json`, signal), query, limit);
}
export async function searchTitleArtworks(category: string, query: string, signal?: AbortSignal, limit = 24) {
  if (!(WIKIDATA_CATEGORIES as readonly string[]).includes(category)) return { items: [] as Artwork[], withoutImage: category === 'audiobooks' ? (await searchTitleIndex(category, query, signal, 400)).length : 0 };
  return wikidataArtworks(await loadJson<WikidataShard>(`wd-${category}.json`, signal), query, limit);
}

// ---------- game index ----------
const groups = (name: string) => [...name.matchAll(/\(([^)]*)\)/g)].map(match => match[1]);
const baseTitle = (name: string) => name.replace(/\s*\(.*$/, '').trim() || name;
/** Files the user fetched with scripts/local/fetch-covers.mjs. The dev and preview servers list them; the deployed site has none. */
export type LocalCovers = Record<string, { boxart: string[]; serial: { default: string[]; '3d': string[] } }>;
const LOCAL_COVER_ROOT = '/__rupa-local/covers/';
let localCovers: Promise<LocalCovers> | null = null;
export function loadLocalCovers(): Promise<LocalCovers> {
  // Only a machine running the app itself can have local covers; the deployed site never probes for them.
  if (typeof window !== 'undefined' && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname)) return Promise.resolve({});
  localCovers ||= fetch(LOCAL_COVER_ROOT + 'index.json', { cache: 'no-store' }).then(response => response.ok && (response.headers.get('content-type') || '').includes('json') ? response.json() as Promise<LocalCovers> : {}).catch(() => ({}));
  return localCovers;
}
export const resetLocalCovers = () => { localCovers = null; };
export type GameAssetFilter = 'covers' | 'screenshots' | 'wallpapers' | 'artworks' | 'logos' | 'icons' | 'title-screens' | 'all';
export function gameArtworks(shard: GameShard, query: string, limit = 48, local: LocalCovers = {}, assetFilter: GameAssetFilter = 'covers'): Artwork[] {
  const { tokens, platforms } = parseQuery(query);
  if (platforms.size && !platforms.has(shard.platform)) return [];
  const out: { art: Artwork; score: number }[] = [];
  const compactQuery = query.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const normalizedQuery = normalizeText(tokens.join(' '));
  const familyQuery = canonicalGameTitle(normalizedQuery);
  const queryTokens = normalizeText(familyQuery) === normalizedQuery ? [tokens] : [[...normalizeText(familyQuery).split(' ').filter(Boolean)], tokens];
  const wantsFinalFantasyX2 = /(?:^| )(?:final fantasy x (?:x )?2|final fantasy 10 2|ffx 2)(?: |$)/.test(normalizedQuery);
  const wantsFinalFantasyX = !wantsFinalFantasyX2 && /(?:^| )(?:final fantasy x|final fantasy 10|ffx)(?: |$)/.test(normalizedQuery);
  const matchesGame = (text: string, sourceTitle = '') => {
    const normalized = normalizeText(text);
    const sourceName = normalizeText(baseTitle(sourceTitle));
    const standaloneX = /^final fantasy x(?: international)?$/.test(sourceName);
    const standaloneX2 = /^final fantasy x 2(?: international(?: last mission)?)?$/.test(sourceName);
    if (wantsFinalFantasyX2 && standaloneX) return false;
    if (wantsFinalFantasyX && standaloneX2) return false;
    return queryTokens.some(candidate => matchesAll(normalized, candidate));
  };
  if (shard.serials && /^[A-Z]{4}\d{5}$/.test(compactQuery)) {
    for (const [serial, title, flags] of shard.serials.rows) {
      if (serial.replace(/[^A-Z0-9]/g, '') !== compactQuery) continue;
      out.push(...serialArtworks(shard, serial, title, flags, local).map(art => ({ art, score: 0 })));
    }
  }
  if (shard.platform === 'psvita') {
    const directAppId = /^[A-Z]{4}\d{5}$/.test(compactQuery) ? compactQuery : '';
    for (const [name, appIdValue] of shard.rows) {
      const appId = String(appIdValue);
      const isExactCode = Boolean(directAppId && appId.toUpperCase() === directAppId);
      if (!isExactCode && (!tokens.length || !matchesGame(`${name} ${appId} ${gameAliases(name, appId)}`, name))) continue;
      const url = `${shard.imageBase}${encodeURIComponent(appId)}.png`;
      out.push({
        score: isExactCode ? 0 : rank(baseTitle(name), tokens) * 1000 + name.length,
        art: {
          id: `games:vitahex:psvita:${appId}`, category: 'games', title: baseTitle(name),
          subtitle: `${shard.label} · ${appId}`, source: 'VitaHEX-Games', provider: 'Offline index · VitaHEX-Games',
          sourceUrl: `${shard.source.url}/blob/main/Covers/PSVita/${encodeURIComponent(appId)}.png`,
          previewUrl: url, imageUrl: url, downloadUrl: url, sdDownloadUrl: url, hdDownloadUrls: [url],
          kind: 'cover', rights: 'source-only', mediaId: appId, editionId: `psvita:${appId}`, availability: 'index-only',
        },
      });
    }
    const seen = new Set<string>();
    return out.sort((a, b) => a.score - b.score || a.art.title.localeCompare(b.art.title)).filter(entry => !seen.has(entry.art.id) && seen.add(entry.art.id)).slice(0, limit).map(entry => entry.art);
  }
  if (tokens.length) {
    for (const [name, rawFlags] of shard.rows) {
      const flags = Number(rawFlags);
      if (!flags) continue;
      const normalized = normalizeText(name);
      if (!matchesGame(`${normalized} ${gameAliases(name)}`, name)) continue;
      const title = baseTitle(name), tags = groups(name), file = `${encodeURIComponent(name)}.png`;
      const assets: { flag: number; folder: string; kind: Artwork['kind']; label: string }[] = [
        { flag: 1, folder: 'Named_Boxarts', kind: 'cover', label: 'box art' },
        { flag: 2, folder: 'Named_Logos', kind: 'logo', label: 'logo' },
        { flag: 4, folder: 'Named_Snaps', kind: 'screenshot', label: 'gameplay screenshot' },
        { flag: 8, folder: 'Named_Titles', kind: 'title-screen', label: 'title screen' },
      ];
      for (const asset of assets) {
        if (!(flags & asset.flag)) continue;
        const filterByFlag: Record<GameAssetFilter, number[]> = { covers: [1], screenshots: [4], logos: [2], icons: [], 'title-screens': [8], wallpapers: [], artworks: [], all: [1, 2, 4, 8] };
        if (!filterByFlag[assetFilter].includes(asset.flag)) continue;
        const isLocal = asset.flag === 1 && Boolean(local[shard.platform]?.boxart.includes(file));
        const url = isLocal ? `${LOCAL_COVER_ROOT}${shard.platform}/boxart/${file}` : `${shard.imageBase}${asset.folder}/${file}`;
        out.push({
          score: rank(title, tokens) * 1000 + (asset.flag === 1 ? 0 : asset.flag) + name.length,
          art: {
            id: `games:libretro:${shard.platform}:${name}:${asset.kind}`, category: 'games', title, subtitle: [shard.label, ...tags, asset.label].join(' · '),
            source: 'Libretro thumbnails', provider: 'Offline index · Libretro', sourceUrl: `${shard.source.url}/blob/master/${asset.folder}/${encodeURIComponent(name)}.png`,
            previewUrl: url, imageUrl: url, downloadUrl: url, sdDownloadUrl: url, hdDownloadUrls: [url], kind: asset.kind,
            rights: 'source-only', mediaId: name, region: regionOf(tags), editionId: `${shard.platform}:${name}`, availability: isLocal ? 'local-copy' : 'index-only',
          },
        });
      }
    }
    if (shard.serials && (assetFilter === 'covers' || assetFilter === 'all')) {
      for (const [serial, title, flags] of shard.serials.rows) {
        const text = normalizeText(`${serial} ${title || ''}`);
        if (!matchesGame(text, title || '')) continue;
        out.push(...serialArtworks(shard, serial, title, flags, local).map(art => ({ art, score: rank(title || serial, tokens) * 1000 + 500 })));
      }
    }
  }
  const seen = new Set<string>();
  const unique = out.sort((a, b) => a.score - b.score || a.art.title.localeCompare(b.art.title)).filter(entry => !seen.has(entry.art.id) && seen.add(entry.art.id));
  return unique.slice(0, assetFilter === 'all' ? limit * 4 : limit).map(entry => entry.art);
}

/** Groups matching covers by normalized game title while preserving platform editions. */
export function groupGameArtworks(items: Artwork[]): GameArtworkGroup[] {
  const groups = new Map<string, GameArtworkGroup>();
  for (const item of items) {
    const id = normalizeText(canonicalGameTitle(item.title)) || item.id;
    let group = groups.get(id);
    if (!group) {
      group = { id, title: canonicalGameTitle(item.title), editions: [], platforms: [] };
      groups.set(id, group);
    }
    group.editions.push(item);
    const platform = item.subtitle.split(' · ')[0]?.trim();
    if (platform && !group.platforms.includes(platform)) group.platforms.push(platform);
  }
  return [...groups.values()];
}

// Explicit, conservative equivalences: connect editions of the same game without merging sequels or franchises.
const GAME_FAMILIES: { canonical: string; variants: string[]; aliases: string[] }[] = [
  { canonical: 'Final Fantasy X', variants: ['Final Fantasy X International', 'Final Fantasy X/X-2 HD Remaster', 'Final Fantasy X HD Remaster'], aliases: ['FFX', 'FFX HD', 'Final Fantasy 10', 'Final Fantasy X/X-2 HD Remaster'] },
  { canonical: 'Final Fantasy X-2', variants: ['Final Fantasy X-2 International + Last Mission', 'Final Fantasy X-2 International'], aliases: ['FFX-2', 'Final Fantasy 10-2'] },
  { canonical: 'Final Fantasy VII', variants: ['Final Fantasy VII International'], aliases: ['FF7', 'Final Fantasy 7'] },
  { canonical: 'Chrono Trigger', variants: ['Final Fantasy Chronicles - Chrono Trigger'], aliases: ['CT', 'Chrono Trigger DS', 'Chrono Trigger SNES'] },
  { canonical: 'Dragon Quest VIII', variants: ['Dragon Quest VIII - Journey of the Cursed King', 'Dragon Quest VIII - Sora to Umi to Daichi to Norowareshi Himegimi'], aliases: ['Dragon Quest 8', 'DQ8'] },
  { canonical: 'The Legend of Zelda: Ocarina of Time', variants: ['Legend of Zelda, The - Ocarina of Time', 'Legend of Zelda, The - Ocarina of Time 3D', 'Legend of Zelda, The - Ocarina of Time - Master Quest', 'Legend of Zelda, The - Ocarina of Time - Redux'], aliases: ['Zelda Ocarina of Time', 'Ocarina of Time 3D', 'Ocarina of Time Master Quest'] },
  { canonical: 'The Legend of Zelda: Twilight Princess', variants: ['Legend of Zelda, The - Twilight Princess', 'Zelda no Densetsu - Twilight Princess', 'Zelda no Densetsu_ Twilight Princess', 'The Legend of Zelda_ Twilight Princess'], aliases: ['Zelda Twilight Princess'] },
  { canonical: 'The Elder Scrolls V Skyrim', variants: ['Skyrim Special Edition', 'Skyrim Anniversary Edition'], aliases: ['TES V Skyrim'] },
  { canonical: 'The Last of Us', variants: ['The Last of Us Remastered', 'The Last of Us Part I'], aliases: ['TLOU'] },
  { canonical: 'Resident Evil 2', variants: ['Resident Evil 2 - Dual Shock Ver.'], aliases: ['RE2', 'Resident Evil 2 Dual Shock'] },
  { canonical: 'Resident Evil 4', variants: ['Resident Evil 4 Remake', 'Resident Evil 4 (2023)', 'Resident Evil 4 Wii Edition', 'Resident Evil 4 - Wii Edition', 'Resident Evil 4_ Wii Edition', 'Biohazard 4 - Wii Edition', 'Biohazard 4 Wii Edition'], aliases: ['Biohazard 4', 'Biohazard 4 Remake'] },
  { canonical: 'Shadow of the Colossus', variants: ['Shadow of the Colossus Remake', 'Shadow of the Colossus (2018)'], aliases: [] },
  { canonical: 'Okami', variants: ['Ookami'], aliases: ['Ōkami'] },
  { canonical: 'Metal Gear Solid 3', variants: ['Metal Gear Solid 3 - Snake Eater', 'Metal Gear Solid 3 - Subsistence', 'Metal Gear Solid 3D - Snake Eater'], aliases: ['MGS3', 'MGS3 Subsistence', 'Snake Eater'] },
  { canonical: 'Persona 5', variants: ['Persona 5 Royal'], aliases: ['P5R'] },
  { canonical: 'Super Mario RPG', variants: ['Super Mario RPG - Legend of the Seven Stars'], aliases: ['Super Mario RPG Legend of the Seven Stars'] },
  { canonical: "The Legend of Zelda: Link's Awakening", variants: ["Legend of Zelda, The - Link's Awakening", "Legend of Zelda, The - Link's Awakening DX", "Legend of Zelda, The - Link's Awakening DX - Redux"], aliases: ['Zelda Link Awakening', "Link's Awakening DX"] },
];
function canonicalGameTitle(title: string): string {
  const normalized = normalizeText(title);
  for (const family of GAME_FAMILIES) if ([family.canonical, ...family.variants, ...family.aliases].some(value => normalizeText(value) === normalized)) return family.canonical;
  return title;
}
function gameAliases(title: string, appId = ''): string {
  const normalized = normalizeText(baseTitle(title));
  const family = GAME_FAMILIES.find(candidate => [candidate.canonical, ...candidate.variants, ...candidate.aliases].some(value => normalizeText(value) === normalized));
  return family ? [...family.aliases, family.canonical, ...family.variants].join(' ') : appId;
}

function regionOf(tags: string[]): string | undefined {
  const text = tags.join(',');
  return /Japan/.test(text) ? 'JP' : /USA/.test(text) ? 'US' : /Europe/.test(text) ? 'EU' : /Korea/.test(text) ? 'KR' : /China/.test(text) ? 'CN' : /World/.test(text) ? 'WORLD' : undefined;
}
function serialArtworks(shard: GameShard, serial: string, title: string | null, flags: number, local: LocalCovers = {}): Artwork[] {
  const serials = shard.serials!;
  const list: { variant: 'default' | '3d'; ext: string; kind: 'cover' | 'alternate'; label: string }[] = [];
  if (flags & 1) list.push({ variant: 'default', ext: 'jpg', kind: 'cover', label: 'box cover' });
  if (flags & 2) list.push({ variant: '3d', ext: 'png', kind: 'alternate', label: '3D box art' });
  return list.map(({ variant, ext, kind, label }) => {
    const isLocal = Boolean(local[shard.platform]?.serial[variant].includes(`${serial}.${ext}`));
    const url = isLocal ? `${LOCAL_COVER_ROOT}${shard.platform}/serial/${variant}/${serial}.${ext}` : `${serials.imageBase}${variant}/${serial}.${ext}`;
    return {
      id: `games:xlenore:${shard.platform}:${variant}:${serial}`, category: 'games', title: title ? baseTitle(title) : serial,
      subtitle: `${shard.label} · ${label} · ${serial}`, source: serials.source.repo, provider: 'Offline index · xlenore', sourceUrl: `${serials.source.url}/blob/main/covers/${variant}/${serial}.${ext}`,
      previewUrl: url, imageUrl: url, downloadUrl: url, sdDownloadUrl: url, hdDownloadUrls: [url], kind, rights: 'source-only',
      mediaId: serial, editionId: `${shard.platform}:${serial}`, availability: isLocal ? 'local-copy' : 'index-only',
    } as Artwork;
  });
}

export async function searchGameIndex(query: string, opts: { platform?: string; signal?: AbortSignal; onPartial?: (items: Artwork[]) => void; onWarning?: (message: string) => void; assetFilter?: GameAssetFilter } = {}): Promise<Artwork[]> {
  const manifest = await loadManifest(opts.signal);
  const parsed = parseQuery(query);
  const wanted = new Set([...(opts.platform ? [opts.platform] : []), ...parsed.platforms]);
  const shards = manifest.shards.filter(shard => shard.kind === 'games' && (!wanted.size || wanted.has(shard.platform!))).sort((a, b) => a.bytes - b.bytes);
  const results: Artwork[] = [], local = await loadLocalCovers();
  await Promise.all(shards.map(async shard => {
    try {
      const data = await loadJson<GameShard>(shard.file, opts.signal);
      results.push(...gameArtworks(data, query, 48, local, opts.assetFilter || 'covers'));
      opts.onPartial?.([...results]);
    } catch (error) {
      if (opts.signal?.aborted) throw error;
      opts.onWarning?.(`${shard.label || shard.platform} index could not be loaded.`);
    }
  }));
  if (opts.signal?.aborted) throw opts.signal.reason;
  return results;
}

export const MODERN_GAME_PLATFORMS = [
  { id: 'ps4', label: 'PlayStation 4', qid: 'Q5014725' },
  { id: 'ps5', label: 'PlayStation 5', qid: 'Q63184502' },
  { id: 'switch', label: 'Nintendo Switch', qid: 'Q19610114' },
  { id: 'xbox-one', label: 'Xbox One', qid: 'Q13361286' },
  { id: 'xbox-series', label: 'Xbox Series X/S', qid: 'Q98987204' },
  { id: 'pc', label: 'PC', qid: 'Q388' },
] as const;
type WikidataGameEntity = { id: string; labels?: { en?: { value?: string } }; descriptions?: { en?: { value?: string } }; claims?: Record<string, { mainsnak?: { datavalue?: { value?: { id?: string; language?: string; text?: string } | string } } }[]> };
function claimFile(entity: WikidataGameEntity, property: string): string {
  const value = entity.claims?.[property]?.[0]?.mainsnak?.datavalue?.value;
  return typeof value === 'string' ? value : value && typeof value === 'object' ? (value as { text?: string }).text || '' : '';
}
function wikimediaFile(file: string, width: number): string {
  return 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(file).replace(/%2F/gi, '/') + '?width=' + width;
}
export async function searchModernGameIndex(query: string, platform = 'all', assetFilter: GameAssetFilter = 'covers', signal?: AbortSignal): Promise<Artwork[]> {
  const term = query.trim();
  if (term.length < 2) return [];
  const platformIds: string[] = platform === 'all' ? MODERN_GAME_PLATFORMS.map(item => item.qid) : MODERN_GAME_PLATFORMS.filter(item => item.id === platform).map(item => item.qid);
  const out: Artwork[] = [];
  type SteamIndex = { games?: { appId: number; title: string; sourceUrl: string; assets: { id: string; kind: Artwork['kind']; label: string; image: string; preview?: string; sourceUrl?: string; source?: string; provider?: string; platform?: string }[] }[] };
  const steamIndex = await loadJson<SteamIndex>('games-steam.json', signal).catch(error => { if (signal?.aborted) throw error; return null; });
  const normalizedTerm = normalizeText(term);
  if (steamIndex?.games) {
    const platformAliases: Record<string, string[]> = {
      pc: ['PC', 'All platforms'],
      ps4: ['PlayStation 4', 'All platforms'],
      ps5: ['PlayStation 5', 'All platforms'],
      switch: ['Nintendo Switch', 'Nintendo Switch 2', 'All platforms'],
      'xbox-one': ['Xbox One', 'Xbox', 'All platforms'],
      'xbox-series': ['Xbox Series X/S', 'Xbox', 'All platforms'],
    };
    const acceptedKinds: Record<GameAssetFilter, string[] | null> = {
      covers: ['cover'], screenshots: ['screenshot'], wallpapers: ['wallpaper'], artworks: ['promo-art', 'key-art'], logos: ['logo'], icons: ['icon'], 'title-screens': ['title-screen'], all: null,
    };
    for (const game of steamIndex.games) {
      const normalizedTitle = normalizeText(game.title);
      if (!normalizedTitle.includes(normalizedTerm) && !normalizedTerm.includes(normalizedTitle)) continue;
      for (const asset of game.assets || []) {
        if (acceptedKinds[assetFilter] && !acceptedKinds[assetFilter]!.includes(asset.kind || '')) continue;
        if (platform !== 'all' && !(platformAliases[platform] || []).includes(asset.platform || 'PC')) continue;
        out.push({
          id: asset.id, category: 'games', title: game.title, subtitle: `${asset.platform || 'PC'} · ${asset.label}`, source: asset.source || 'Steam Store', provider: asset.provider || 'Steam Store API', sourceUrl: asset.sourceUrl || game.sourceUrl,
          previewUrl: asset.preview || asset.image, imageUrl: asset.image, downloadUrl: asset.image, hdDownloadUrls: [asset.image], kind: asset.kind,
          rights: 'source-only', mediaId: String(game.appId), editionId: `steam:${game.appId}`, availability: 'index-only',
        });
      }
    }
  }
  if (out.length) return out;
  try {
    const searchParams = new URLSearchParams({ action: 'wbsearchentities', search: term, language: 'en', uselang: 'en', limit: '20', format: 'json', origin: '*' });
    const response = await fetch('https://www.wikidata.org/w/api.php?' + searchParams, { signal, headers: { Accept: 'application/json' } });
    if (response.ok) {
      const matches = (await response.json()).search as { id: string; label: string }[];
      const ids = matches.slice(0, 12).map(item => item.id).filter(id => /^Q\d+$/.test(id));
      if (ids.length) {
        const entityParams = new URLSearchParams({ action: 'wbgetentities', ids: ids.join('|'), props: 'labels|descriptions|claims', languages: 'en', format: 'json', origin: '*' });
        const entityResponse = await fetch('https://www.wikidata.org/w/api.php?' + entityParams, { signal, headers: { Accept: 'application/json' } });
        if (entityResponse.ok) {
          const data = await entityResponse.json();
          const entities = Object.values(data.entities || {}) as WikidataGameEntity[];
          const lowerTerm = term.toLocaleLowerCase();
          for (const entity of entities) {
            const title = entity.labels?.en?.value;
            if (!title || !title.toLocaleLowerCase().includes(lowerTerm) && !lowerTerm.includes(title.toLocaleLowerCase())) continue;
            const supportedPlatforms = (entity.claims?.P400 || []).map(claim => claim.mainsnak?.datavalue?.value).map(value => value && typeof value === 'object' ? (value as { id?: string }).id : '').filter((value): value is string => Boolean(value));
            if (!supportedPlatforms.some(id => platformIds.includes(id))) continue;
            const image = claimFile(entity, 'P18'), logo = claimFile(entity, 'P154');
            const assetTypes: { file: string; kind: Artwork['kind']; label: string }[] = [];
            if (assetFilter === 'covers' || assetFilter === 'all') {
              if (image) assetTypes.push({ file: image, kind: 'cover', label: 'Wikidata image' });
              if (logo) assetTypes.push({ file: logo, kind: 'logo', label: 'Wikidata logo' });
            }
            for (const asset of assetTypes) {
              const url = wikimediaFile(asset.file, 960);
              out.push({ id: 'games:wikidata:' + entity.id + ':' + asset.kind, category: 'games', title, subtitle: [MODERN_GAME_PLATFORMS.filter(item => supportedPlatforms.includes(item.qid)).map(item => item.label).join(', '), asset.label].join(' · '), source: 'Wikidata / Wikimedia Commons', provider: 'Wikidata', sourceUrl: 'https://www.wikidata.org/wiki/' + entity.id, previewUrl: url, imageUrl: url, downloadUrl: url, hdDownloadUrls: [wikimediaFile(asset.file, 1920)], kind: asset.kind, rights: 'source-only', mediaId: entity.id, editionId: entity.id, availability: 'index-only' });
            }
          }
        }
      }
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    // Commons search below is an independent fallback when Wikidata is unavailable.
  }
  const commonsTypes: { filter: GameAssetFilter; suffix: string; kind: Artwork['kind']; label: string }[] = [
    { filter: 'covers', suffix: ' video game box art cover', kind: 'cover', label: 'Commons image' },
    { filter: 'screenshots', suffix: ' video game screenshot gameplay', kind: 'screenshot', label: 'Gameplay screenshot' },
    { filter: 'logos', suffix: ' video game logo', kind: 'logo', label: 'Game logo' },
    { filter: 'icons', suffix: ' video game icon', kind: 'icon', label: 'Game icon' },
    { filter: 'title-screens', suffix: ' video game title screen', kind: 'title-screen', label: 'Title screen' },
    { filter: 'wallpapers', suffix: ' video game wallpaper', kind: 'wallpaper', label: 'Wallpaper' },
  ];
  const commonsWanted = assetFilter === 'all' ? commonsTypes : commonsTypes.filter(item => item.filter === assetFilter);
  const commonsResults = await Promise.all(commonsWanted.map(async asset => {
    const params = new URLSearchParams({ action: 'query', generator: 'search', gsrsearch: term + asset.suffix, gsrnamespace: '6', gsrlimit: '8', prop: 'imageinfo', iiprop: 'url', iiurlwidth: '960', format: 'json', origin: '*' });
    try {
      const response = await fetch('https://commons.wikimedia.org/w/api.php?' + params, { signal, headers: { Accept: 'application/json' } });
      if (!response.ok) return [];
      const data = await response.json();
      const pages = Object.values(data.query?.pages || {}) as { title: string; imageinfo?: { thumburl?: string; url?: string }[] }[];
      return pages.flatMap(page => {
        const url = page.imageinfo?.[0]?.thumburl || page.imageinfo?.[0]?.url;
        if (!url) return [];
        return [{ id: 'games:commons:' + encodeURIComponent(page.title), category: 'games' as const, title: term, subtitle: ['Platform unverified', asset.label, page.title.replace(/^File:/, '')].join(' · '), source: 'Wikimedia Commons', provider: 'Wikimedia Commons', sourceUrl: 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(page.title.replaceAll(' ', '_')), previewUrl: url, imageUrl: url, downloadUrl: url, kind: asset.kind, rights: 'source-only' as const, mediaId: page.title, editionId: 'commons:' + term, availability: 'index-only' as const }];
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      return [];
    }
  }));
  out.push(...commonsResults.flat());
  return out;
}
// ---------- anime index ----------
export function animeArtworks(shard: AnimeShard, query: string, limit = 36): Artwork[] {
  const { tokens, years } = parseQuery(query);
  if (!tokens.length) return [];
  const out: { art: Artwork; score: number }[] = [];
  for (const [title, type, year, malId, , image, synonyms] of shard.rows) {
    const text = normalizeText([title, ...synonyms, year || ''].join(' '));
    if (!matchesAll(text, tokens)) continue;
    if (years.length && !years.includes(year)) continue;
    const url = `${shard.imageBase}${image}${shard.imageSuffix}`;
    out.push({
      score: rank(title, tokens) * 1000 + title.length,
      art: {
        id: `anime:aod:${malId}`, category: 'anime', title, subtitle: [type, year || ''].filter(Boolean).join(' · '), year: year ? String(year) : undefined,
        source: 'anime-offline-database', provider: 'Offline index · anime-offline-database', sourceUrl: `https://myanimelist.net/anime/${malId}`,
        previewUrl: url, imageUrl: url, kind: 'poster', rights: 'source-only', mediaId: String(malId), availability: 'index-only',
      },
    });
  }
  return out.sort((a, b) => a.score - b.score || a.art.title.localeCompare(b.art.title)).slice(0, limit).map(entry => entry.art);
}
export async function searchAnimeIndex(query: string, signal?: AbortSignal): Promise<Artwork[]> {
  return animeArtworks(await loadJson<AnimeShard>('anime.json', signal), query);
}
