import type { AppleCategory, AppleStorefront, Artwork, Category, MotionArtwork, ProviderResult } from './types';
import { APPLE_STOREFRONTS } from './appleStorefronts';

type PartialResult = (result: ProviderResult) => void;
type AppleRow = Record<string, unknown>;

const APPLE_CONFIG: Partial<Record<AppleCategory, { media: string; entity: string; host: string[]; path: RegExp }>> = {
  music: { media: 'music', entity: 'album', host: ['music.apple.com', 'itunes.apple.com'], path: /\/(?:album|artist)\//i },
  musicvideos: { media: 'musicVideo', entity: 'musicVideo', host: ['music.apple.com', 'itunes.apple.com'], path: /\/music-video\//i },
  books: { media: 'ebook', entity: 'ebook', host: ['books.apple.com', 'itunes.apple.com'], path: /\/book\//i },
  audiobooks: { media: 'audiobook', entity: 'audiobook', host: ['books.apple.com', 'itunes.apple.com'], path: /\/audiobook\//i },
  podcasts: { media: 'podcast', entity: 'podcast', host: ['podcasts.apple.com', 'itunes.apple.com'], path: /\/podcast\//i },
  podcastepisodes: { media: 'podcast', entity: 'podcastEpisode', host: ['podcasts.apple.com', 'itunes.apple.com'], path: /\/podcast\//i },
  apps: { media: 'software', entity: 'software', host: ['apps.apple.com', 'itunes.apple.com'], path: /\/app\//i },
  appscreenshots: { media: 'software', entity: 'software', host: ['apps.apple.com', 'itunes.apple.com'], path: /\/app\//i },
  movies: { media: 'movie', entity: 'movie', host: ['itunes.apple.com', 'tv.apple.com'], path: /\/(?:movie|film)\//i },
  tv: { media: 'tvShow', entity: 'tvSeason', host: ['itunes.apple.com', 'tv.apple.com'], path: /\/(?:tv-season|show)\//i },
};

const APPLE_CATEGORY_NAMES: Partial<Record<AppleCategory, string>> = {
  music: 'Apple Music', musicvideos: 'Apple Music', books: 'Apple Books', audiobooks: 'Apple Books',
  podcasts: 'Apple Podcasts', podcastepisodes: 'Apple Podcasts', apps: 'App Store', appscreenshots: 'App Store', movies: 'Apple TV', tv: 'Apple TV',
};

function timeoutSignal(signal?: AbortSignal, timeout = 12_000): AbortSignal {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
}

async function fetchJson<T>(url: string, signal?: AbortSignal, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...init, signal: timeoutSignal(signal), headers: { Accept: 'application/json', ...(init.headers || {}) } });
  if (!response.ok) throw new Error(`Catalog returned HTTP ${response.status}.`);
  return response.json() as Promise<T>;
}

function appleJsonp(url: string, signal?: AbortSignal): Promise<{ results?: AppleRow[] }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const callback = `__rupaApple${Math.random().toString(36).slice(2)}`;
    const callbacks = window as unknown as Record<string, (value: { results?: AppleRow[] }) => void>;
    const script = document.createElement('script'); let settled = false; let timer = 0;
    const cleanup = () => { window.clearTimeout(timer); signal?.removeEventListener('abort', onAbort); delete callbacks[callback]; script.remove(); };
    const fail = (error: Error) => { if (settled) return; settled = true; cleanup(); reject(error); };
    const onAbort = () => fail(new DOMException('Search cancelled.', 'AbortError'));
    callbacks[callback] = value => { if (settled) return; settled = true; cleanup(); resolve(value || {}); };
    script.onerror = () => fail(new Error('Apple catalog could not be reached from this browser.'));
    timer = window.setTimeout(() => fail(new Error('Apple catalog search timed out.')), 10_000);
    signal?.addEventListener('abort', onAbort, { once: true });
    const request = new URL(url); request.searchParams.set('callback', callback); script.src = request.toString(); document.head.appendChild(script);
  });
}

async function appleData(url: string, signal?: AbortSignal): Promise<{ results?: AppleRow[] }> {
  if (typeof document === 'undefined') return fetchJson(url, signal);
  return appleJsonp(url, signal);
}

function appleSizedUrl(value: string, size: number): string {
  try {
    const url = new URL(value); const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || !(host === 'mzstatic.com' || host.endsWith('.mzstatic.com'))) return value;
    url.pathname = url.pathname.replace(/\/\d{1,5}x\d{1,5}(?:bb(?:-\d{1,3})?|[-_]\d{1,3})?\.(jpe?g|png|webp|avif)$/i, `/${size}x${size}bb.$1`);
    return url.toString();
  } catch { return value; }
}

function safeId(row: AppleRow): string { return String(row.trackId || row.collectionId || row.artistId || ''); }
function appleItems(rows: AppleRow[], category: AppleCategory): Artwork[] {
  const output: Artwork[] = []; const seen = new Set<string>();
  for (const row of rows) {
    const id = safeId(row); if (!id || seen.has(id)) continue; seen.add(id);
    const name = String(row.collectionName || row.trackName || row.artistName || 'Untitled');
    const raw = String(row.artworkUrl100 || row.artworkUrl600 || row.artworkUrl512 || '');
    const image = raw ? appleSizedUrl(raw, 1200) : '';
    const preview = raw ? appleSizedUrl(raw, 600) : '';
    if (!image) continue;
    const subtitle = String(row.artistName || row.primaryGenreName || APPLE_CATEGORY_NAMES[category] || 'Apple');
    const sourceUrl = String(row.collectionViewUrl || row.trackViewUrl || row.artistViewUrl || '');
    const video = category === 'musicvideos' ? String(row.previewUrl || '') : '';
    const kind = category === 'musicvideos' ? 'thumbnail' : category === 'movies' || category === 'tv' ? 'poster' : 'cover';
    const item: Artwork = {
      id: `${category}:apple:${id}`, category, title: name, subtitle, source: APPLE_CATEGORY_NAMES[category] || 'Apple', provider: category === 'music' ? 'Apple Music' : APPLE_CATEGORY_NAMES[category],
      sourceUrl, imageUrl: image, previewUrl: preview, sdDownloadUrl: preview, downloadUrl: image,
      hdDownloadUrls: [...new Set([appleSizedUrl(raw, 10000), image, preview])],
      year: String(row.releaseDate || '').slice(0, 4), artist: category === 'music' ? subtitle : undefined,
      artistUrl: String(row.artistViewUrl || ''), mediaPreviewUrl: /^https:\/\//i.test(video) ? video : undefined,
      mediaId: id, kind, rights: 'source-only',
    };
    if (category === 'apps') item.screenshots = [
      ...(Array.isArray(row.screenshotUrls) ? row.screenshotUrls.map(url => ({ url: String(url), device: 'iPhone' })) : []),
      ...(Array.isArray(row.ipadScreenshotUrls) ? row.ipadScreenshotUrls.map(url => ({ url: String(url), device: 'iPad' })) : []),
      ...(Array.isArray(row.appletvScreenshotUrls) ? row.appletvScreenshotUrls.map(url => ({ url: String(url), device: 'Apple TV' })) : []),
    ].filter(shot => /^https:\/\//i.test(shot.url)).slice(0, 8);
    output.push(item);
  }
  return output;
}

function applePodcastEpisodes(rows: AppleRow[]): Artwork[] {
  return rows.filter(row => row.kind === 'podcast-episode' || row.wrapperType === 'podcastEpisode').flatMap(row => {
    const id = String(row.trackId || ''); const raw = String(row.artworkUrl600 || row.artworkUrl100 || ''); if (!id || !raw) return [];
    const image = appleSizedUrl(raw, 1200); const preview = appleSizedUrl(raw, 600);
    return [{ id: `podcastepisodes:apple:${id}`, category: 'podcastepisodes', title: String(row.trackName || 'Untitled episode'), subtitle: String(row.collectionName || 'Apple Podcasts'), source: 'Apple Podcasts', provider: 'Apple Podcasts', sourceUrl: String(row.trackViewUrl || row.collectionViewUrl || ''), imageUrl: image, previewUrl: preview, downloadUrl: image, hdDownloadUrls: [image, preview], mediaId: id, year: String(row.releaseDate || '').slice(0, 4), kind: 'cover', rights: 'source-only' as const }];
  });
}

function searchParams(term: string, category: AppleCategory, country: AppleStorefront): URLSearchParams {
  const config = APPLE_CONFIG[category]!;
  return new URLSearchParams({ term, media: config.media, entity: config.entity, limit: category === 'music' ? '30' : '20', country });
}

function appleUrlId(value: string, category: AppleCategory): string | undefined {
  try {
    const url = new URL(value); const config = APPLE_CONFIG[category];
    if (!config || url.protocol !== 'https:' || !config.host.includes(url.hostname.toLowerCase()) || !config.path.test(url.pathname)) return undefined;
    return url.pathname.match(/\/(\d+)\/?$/)?.[1];
  } catch { return undefined; }
}

async function searchApple(term: string, category: AppleCategory, country: AppleStorefront, signal?: AbortSignal): Promise<Artwork[]> {
  const config = APPLE_CONFIG[category]!; const trimmed = term.trim();
  if (/^https:\/\//i.test(trimmed)) {
    const id = appleUrlId(trimmed, category);
    if (!id) throw new Error(`Paste a valid ${APPLE_CATEGORY_NAMES[category]} link or search by name.`);
    const params = new URLSearchParams({ id, country, entity: config.entity, limit: '30' });
    const data = await appleData(`https://itunes.apple.com/lookup?${params}`, signal);
    return category === 'podcastepisodes' ? applePodcastEpisodes(data.results || []) : appleItems(data.results || [], category);
  }
  if (category === 'movies' || category === 'tv') {
    const params = searchParams(trimmed, category, country); const data = await appleData(`https://itunes.apple.com/search?${params}`, signal);
    return appleItems(data.results || [], category);
  }
  if (category === 'apps' || category === 'appscreenshots') {
    const entities = ['software', 'iPadSoftware', 'desktopSoftware'];
    const responses = await Promise.allSettled(entities.map(async entity => {
      const params = new URLSearchParams({ term: trimmed, media: 'software', entity, limit: '16', country });
      return appleData(`https://itunes.apple.com/search?${params}`, signal);
    }));
    const rows = responses.flatMap(response => response.status === 'fulfilled' ? response.value.results || [] : []);
    if (!rows.length && responses.every(response => response.status === 'rejected')) throw new Error('App Store search could not be reached.');
    const apps = appleItems(rows, 'apps');
    if (category === 'apps') return apps;
    return apps.flatMap(app => (app.screenshots || []).map((shot, index) => ({ ...app, id: `${app.id}:${shot.device}:${index}`, category: 'appscreenshots' as const, title: `${app.title} · ${shot.device} ${index + 1}`, subtitle: shot.device, imageUrl: shot.url, previewUrl: shot.url, downloadUrl: shot.url, hdDownloadUrls: [shot.url], kind: 'screenshot' as const })));
  }
  const data = await appleData(`https://itunes.apple.com/search?${searchParams(trimmed, category, country)}`, signal);
  return category === 'podcastepisodes' ? applePodcastEpisodes(data.results || []) : appleItems(data.results || [], category);
}

function normalize(value: string): string { return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }

function mapAnimeRows(rows: unknown[], category: 'anime' | 'manga', provider: string): Artwork[] {
  return rows.flatMap(rowValue => {
    if (!rowValue || typeof rowValue !== 'object') return [];
    const row = rowValue as Record<string, any>; let title = ''; let image = ''; let sourceUrl = ''; let year: string | undefined;
    if (provider === 'AniList') {
      title = String(row.title?.userPreferred || row.title?.english || row.title?.romaji || '').trim();
      image = String(row.coverImage?.extraLarge || row.coverImage?.large || ''); sourceUrl = String(row.siteUrl || ''); year = String(row.startDate?.year || row.seasonYear || '') || undefined;
    } else {
      title = String(row.title_english || row.title || row.title_japanese || '').trim();
      image = String(row.images?.webp?.large_image_url || row.images?.jpg?.large_image_url || row.images?.webp?.image_url || row.images?.jpg?.image_url || '');
      sourceUrl = `https://myanimelist.net/${category}/${row.mal_id}`; year = String(row.year || String(row.aired?.from || row.published?.from || '').slice(0, 4)) || undefined;
    }
    if (!title || !image) return [];
    return [{ id: `${category}:${provider}:${row.id || row.mal_id || normalize(title)}`, category, title, subtitle: provider, source: provider, provider, sourceUrl, imageUrl: image, previewUrl: image, downloadUrl: image, kind: category === 'anime' ? 'poster' as const : 'cover' as const, year, rights: 'source-only' as const }];
  });
}

async function searchAnimeManga(query: string, category: 'anime' | 'manga', signal?: AbortSignal, partial?: PartialResult): Promise<ProviderResult> {
  const gql = 'query ($search:String,$type:MediaType){Page(page:1,perPage:16){media(search:$search,type:$type,isAdult:false){id title{userPreferred english romaji} coverImage{large extraLarge} startDate{year} seasonYear siteUrl}}}';
  const tasks = [
    fetchJson<{ data?: { Page?: { media?: unknown[] } } }>('https://graphql.anilist.co', signal, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: gql, variables: { search: query, type: category === 'anime' ? 'ANIME' : 'MANGA' } }) }).then(data => mapAnimeRows(data.data?.Page?.media || [], category, 'AniList')),
    fetchJson<{ data?: unknown[] }>(`https://api.jikan.moe/v4/${category}?${new URLSearchParams({ q: query, limit: '12', sfw: 'true' })}`, signal).then(data => mapAnimeRows(data.data || [], category, 'Jikan')),
  ];
  const settled = await Promise.allSettled(tasks); const results = settled.flatMap(task => task.status === 'fulfilled' ? task.value : []);
  const unique = [...new Map(results.map(item => [normalize(item.title), item])).values()];
  const warnings = settled.flatMap((task, index) => task.status === 'rejected' ? [`${index === 0 ? 'AniList' : 'Jikan'}: ${task.reason instanceof Error ? task.reason.message : 'unavailable'}`] : []);
  const result = { results: unique, warnings, unavailable: unique.length ? [] : [category] }; partial?.(result); return result;
}

export function youtubeVideoId(value: string): string | null {
  const text = value.trim(); if (/^[A-Za-z0-9_-]{11}$/.test(text)) return text;
  try {
    const url = new URL(text); const host = url.hostname.toLowerCase();
    if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host)) return null;
    const id = host.endsWith('youtu.be') ? url.pathname.split('/').filter(Boolean)[0] : url.searchParams.get('v') || url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/i)?.[1];
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}

async function youtubeThumbnail(query: string, signal?: AbortSignal): Promise<ProviderResult> {
  const id = youtubeVideoId(query); if (!id) return { results: [], warnings: ['Paste a YouTube video link or video ID to fetch its thumbnail.'], unavailable: [] };
  let title = `YouTube video ${id}`; let creator = 'YouTube';
  try {
    const meta = await fetchJson<{ title?: string; author_name?: string }>(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, signal);
    title = meta.title || title; creator = meta.author_name || creator;
  } catch (error) { if (signal?.aborted) throw error; }
  const image = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
  return { results: [{ id: `videos:youtube:${id}`, category: 'videos', title, subtitle: creator, source: 'YouTube thumbnails', provider: 'YouTube', sourceUrl: `https://www.youtube.com/watch?v=${id}`, previewUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, imageUrl: image, downloadUrl: image, hdDownloadUrls: [image, `https://i.ytimg.com/vi/${id}/sddefault.jpg`, `https://i.ytimg.com/vi/${id}/hqdefault.jpg`], kind: 'thumbnail', rights: 'source-only' }], warnings: [], unavailable: [] };
}

const SEARCH_CACHE = new Map<string, { at: number; value: ProviderResult }>();
export async function searchArtwork(query: string, category: Category, signal?: AbortSignal, onPartial?: PartialResult, country: AppleStorefront = 'id', _source = 'all'): Promise<ProviderResult> {
  const q = query.trim().slice(0, 180); const cacheKey = `${category}:${country}:${q.toLowerCase()}`; const cached = SEARCH_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.at < 60_000) { onPartial?.(cached.value); return cached.value; }
  let result: ProviderResult;
  if (category === 'videos') result = await youtubeThumbnail(q, signal);
  else if (category === 'anime' || category === 'manga') result = await searchAnimeManga(q, category, signal, onPartial);
  else if (category in APPLE_CONFIG) {
    const items = await searchApple(q, category as AppleCategory, country, signal);
    result = { results: items, warnings: [], unavailable: [] };
  } else result = { results: [], warnings: [`${category} needs a connected catalog source.`], unavailable: [category] };
  onPartial?.(result);
  if (!signal?.aborted && !result.warnings.length) { SEARCH_CACHE.set(cacheKey, { at: Date.now(), value: result }); if (SEARCH_CACHE.size > 80) SEARCH_CACHE.delete(SEARCH_CACHE.keys().next().value as string); }
  return result;
}

export function downloadLink(item: Artwork): string { return item.downloadUrl || item.imageUrl || item.previewUrl; }

const motionCache = new Map<string, { at: number; value: MotionArtwork | null }>();
const motionRequests = new Map<string, Promise<MotionArtwork | null>>();
function isAppleMotionUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'mvod.itunes.apple.com' && url.pathname.endsWith('.m3u8'); }
  catch { return false; }
}

export async function getAppleMotionArtwork(item: Artwork): Promise<MotionArtwork | null> {
  if (item.category !== 'music' || !item.sourceUrl) return null;
  try { const source = new URL(item.sourceUrl); if (source.protocol !== 'https:' || source.hostname !== 'music.apple.com' || !source.pathname.includes('/album/')) return null; }
  catch { return null; }
  const key = item.sourceUrl.split('?')[0]; const cached = motionCache.get(key);
  if (cached && Date.now() - cached.at < 6 * 60 * 60 * 1000) return cached.value;
  const pending = motionRequests.get(key); if (pending) return pending;
  const request = (async () => {
    const endpoint = new URL('https://artwork.m8tec.top/api/v1/artwork/url'); endpoint.searchParams.set('url', item.sourceUrl);
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' } });
    if (response.status === 404) { motionCache.set(key, { at: Date.now(), value: null }); return null; }
    if (!response.ok) throw new Error(`Motion lookup returned HTTP ${response.status}.`);
    const data = await response.json() as { url?: unknown; url_tall?: unknown };
    if (!isAppleMotionUrl(data.url)) { motionCache.set(key, { at: Date.now(), value: null }); return null; }
    const value: MotionArtwork = { url: data.url, ...(isAppleMotionUrl(data.url_tall) ? { tallUrl: data.url_tall } : {}) };
    motionCache.set(key, { at: Date.now(), value }); return value;
  })();
  motionRequests.set(key, request);
  try { return await request; } finally { motionRequests.delete(key); }
}

export function storefronts(): readonly { id: AppleStorefront; label: string }[] { return APPLE_STOREFRONTS; }
