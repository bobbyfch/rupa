import type { Artwork, AppleCategory } from './types';

export type ChartCategory = AppleCategory | 'anime' | 'manga';
export type PublicChartProvider = 'listenbrainz' | 'openlibrary' | 'anilist' | 'fdroid' | 'tvmaze' | 'librivox';
export type ChartProvider = 'apple' | PublicChartProvider;
export type ChartOption = { id: string; label: string };

export const PUBLIC_PROVIDERS: Partial<Record<ChartCategory, { id: PublicChartProvider; label: string }[]>> = {
  music: [{ id: 'listenbrainz', label: 'ListenBrainz' }],
  books: [{ id: 'openlibrary', label: 'Open Library' }],
  audiobooks: [{ id: 'librivox', label: 'LibriVox' }],
  apps: [{ id: 'fdroid', label: 'F-Droid search' }],
  tv: [{ id: 'tvmaze', label: 'TVmaze' }],
  anime: [{ id: 'anilist', label: 'AniList' }],
  manga: [{ id: 'anilist', label: 'AniList' }],
};

export const PUBLIC_CHARTS: Record<PublicChartProvider, ChartOption[]> = {
  listenbrainz: [
    { id: 'week', label: 'Most listened albums · week' },
    { id: 'month', label: 'Most listened albums · month' },
    { id: 'year', label: 'Most listened albums · year' },
  ],
  openlibrary: [
    { id: 'daily', label: 'Trending today' },
    { id: 'weekly', label: 'Trending this week' },
    { id: 'monthly', label: 'Trending this month' },
  ],
  anilist: [
    { id: 'trending', label: 'Trending now' },
    { id: 'popular', label: 'Most popular' },
    { id: 'upcoming', label: 'Upcoming' },
  ],
  fdroid: [],
  tvmaze: [
    { id: 'today', label: 'US TV · today' },
    { id: 'tomorrow', label: 'US TV · tomorrow' },
    { id: 'streaming-today', label: 'New on streaming today' },
    { id: 'streaming-tomorrow', label: 'New on streaming tomorrow' },
  ],
  librivox: [{ id: 'recent', label: 'Recently catalogued' }],
};

export function getPublicCharts(_category: ChartCategory, provider: PublicChartProvider): ChartOption[] {
  return PUBLIC_CHARTS[provider];
}

export const PUBLIC_SOURCE_URL: Record<PublicChartProvider, string> = {
  listenbrainz: 'https://listenbrainz.org/stats/sitewide/releases',
  openlibrary: 'https://openlibrary.org/trending',
  anilist: 'https://anilist.co/search/anime',
  fdroid: 'https://search.f-droid.org/',
  tvmaze: 'https://www.tvmaze.com/schedule',
  librivox: 'https://librivox.org/api/info',
};

type JsonRecord = Record<string, unknown>;
const OPEN_LIBRARY_CACHE = new Map<string, { expiresAt: number; data: JsonRecord }>();
const LIBRIVOX_CACHE = new Map<string, { expiresAt: number; data: JsonRecord }>();
async function requestJson<T>(url: string, signal: AbortSignal, init?: RequestInit): Promise<T> {
  const timeoutSignal = AbortSignal.timeout(12_000);
  const requestSignal = AbortSignal.any([signal, timeoutSignal]);
  try {
    const response = await fetch(url, { ...init, signal: requestSignal, headers: { Accept: 'application/json', ...init?.headers } });
    if (!response.ok) throw new Error(`Source returned HTTP ${response.status}.`);
    return await response.json() as T;
  } catch (error) {
    if (!signal.aborted && timeoutSignal.aborted) throw new Error('This source took too long to respond. Try again in a moment.');
    throw error;
  }
}

function artwork(input: Omit<Artwork, 'rights' | 'rightsStatus' | 'availability'>): Artwork {
  return { ...input, rights: 'source-only', rightsStatus: 'reference-only', availability: 'link-only' };
}

function openLibraryItems(data: JsonRecord, category: 'books'): Artwork[] {
  const works = Array.isArray(data.works) ? data.works as JsonRecord[] : [];
  return works.flatMap(work => {
    const title = typeof work.title === 'string' ? work.title : '';
    const coverId = Number(work.cover_i);
    if (!title) return [];
    const key = typeof work.key === 'string' ? work.key : '';
    const image = Number.isFinite(coverId) && coverId > 0 ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : '';
    const firstPublishYear = Number(work.first_publish_year);
    const year = Number.isInteger(firstPublishYear) && firstPublishYear > 0 ? String(firstPublishYear) : undefined;
    return [artwork({
      id: `openlibrary:${key || title}`, category, title,
      subtitle: Array.isArray(work.author_name) ? work.author_name.filter(Boolean).join(', ') : 'Open Library',
      year,
      releaseDate: year,
      source: 'Open Library', provider: 'Open Library', sourceUrl: key ? `https://openlibrary.org${key}` : PUBLIC_SOURCE_URL.openlibrary,
      imageUrl: image, previewUrl: image, downloadUrl: image || undefined, kind: 'cover',
      originalWidth: Number(work.cover_width) || undefined, originalHeight: Number(work.cover_height) || undefined,
    })];
  });
}

function libriVoxItems(data: JsonRecord): Artwork[] {
  if (Array.isArray(data.results)) return (data.results as Artwork[]).filter(item => item.category === 'audiobooks' && Boolean(item.imageUrl || item.previewUrl));
  const books = Array.isArray(data.books) ? data.books as JsonRecord[] : [];
  return books.flatMap(book => {
    const title = typeof book.title === 'string' ? book.title : '';
    const image = typeof book.coverart_jpg === 'string' ? book.coverart_jpg : '';
    if (!title || !image) return [];
    const authors = Array.isArray(book.authors) ? (book.authors as JsonRecord[]).map(author => [author.first_name, author.last_name].filter(value => typeof value === 'string' && value).join(' ')).filter(Boolean) : [];
    const thumbnail = typeof book.coverart_thumbnail === 'string' ? book.coverart_thumbnail : image;
    const id = String(book.id || title);
    const sourceUrl = typeof book.url_librivox === 'string' && book.url_librivox ? book.url_librivox : typeof book.url_rss === 'string' && book.url_rss ? book.url_rss : PUBLIC_SOURCE_URL.librivox;
    return [artwork({
      id: `librivox:${id}`, category: 'audiobooks', title,
      subtitle: authors.join(', ') || 'LibriVox volunteer recording',
      source: 'LibriVox', provider: 'LibriVox', sourceUrl,
      imageUrl: image, previewUrl: thumbnail, downloadUrl: image, kind: 'cover', mediaId: id,
    })];
  });
}

function listenBrainzItems(data: JsonRecord): Artwork[] {
  const payload = data.payload && typeof data.payload === 'object' ? data.payload as JsonRecord : {};
  const groups = Array.isArray(payload.release_groups) ? payload.release_groups as JsonRecord[] : [];
  const items = groups.flatMap(group => {
    const title = typeof group.release_group_name === 'string' ? group.release_group_name : '';
    if (!title) return [];
    const mbid = typeof group.release_group_mbid === 'string' ? group.release_group_mbid : '';
    const releaseMbid = typeof group.caa_release_mbid === 'string' ? group.caa_release_mbid : '';
    const image = releaseMbid
      ? `https://coverartarchive.org/release/${encodeURIComponent(releaseMbid)}/front-500`
      : mbid ? `https://coverartarchive.org/release-group/${encodeURIComponent(mbid)}/front-500` : '';
    const artist = typeof group.artist_name === 'string' ? group.artist_name : '';
    const id = mbid || `${artist}:${title}`;
    return [artwork({
      id: `listenbrainz:${id}`, category: 'music', title, subtitle: artist || 'ListenBrainz community chart', artist: artist || undefined,
      source: 'ListenBrainz', provider: 'ListenBrainz', sourceUrl: mbid ? `https://musicbrainz.org/release-group/${encodeURIComponent(mbid)}` : PUBLIC_SOURCE_URL.listenbrainz,
      imageUrl: image, previewUrl: image, downloadUrl: image || undefined, mediaId: mbid || undefined, kind: 'cover',
    })];
  });
  const unique: Artwork[] = [];
  for (const item of items) {
    const title = item.title.normalize('NFKD').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const artists = new Set((item.artist || '').normalize('NFKD').toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));
    const duplicateIndex = unique.findIndex(existing => {
      if (existing.title.normalize('NFKD').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() !== title) return false;
      const existingArtists = (existing.artist || '').normalize('NFKD').toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
      return artists.size === 0 || existingArtists.some(artist => artists.has(artist));
    });
    if (duplicateIndex < 0) unique.push(item);
    else if (!unique[duplicateIndex].imageUrl && item.imageUrl) unique[duplicateIndex] = item;
  }
  return unique;
}

function animeItems(data: JsonRecord, category: 'anime' | 'manga'): Artwork[] {
  const root = data.data && typeof data.data === 'object' ? data.data as JsonRecord : {};
  const page = root.Page && typeof root.Page === 'object' ? root.Page as JsonRecord : {};
  const media = Array.isArray(page.media) ? page.media as JsonRecord[] : [];
  return media.flatMap(entry => {
    const titleObject = entry.title && typeof entry.title === 'object' ? entry.title as JsonRecord : {};
    const coverObject = entry.coverImage && typeof entry.coverImage === 'object' ? entry.coverImage as JsonRecord : {};
    const dates = entry.startDate && typeof entry.startDate === 'object' ? entry.startDate as JsonRecord : {};
    const title = typeof titleObject.userPreferred === 'string' ? titleObject.userPreferred : '';
    const image = typeof coverObject.extraLarge === 'string' ? coverObject.extraLarge : typeof coverObject.large === 'string' ? coverObject.large : '';
    const preview = typeof coverObject.large === 'string' ? coverObject.large : image;
    if (!title || !image) return [];
    const startYear = Number(dates.year);
    const startMonth = Number(dates.month);
    const startDay = Number(dates.day);
    const year = Number.isInteger(startYear) && startYear > 0 ? String(startYear) : undefined;
    const releaseDate = year
      ? [year, Number.isInteger(startMonth) && startMonth > 0 ? String(startMonth).padStart(2, '0') : '', Number.isInteger(startDay) && startDay > 0 ? String(startDay).padStart(2, '0') : ''].filter(Boolean).join('-')
      : undefined;
    return [artwork({
      // Keep the chart id identical to the AniList search adapter and Worker.
      id: `${category}:anilist:${entry.id}`, category, title, subtitle: `AniList ${category} catalogue`,
      year, releaseDate,
      source: 'AniList', provider: 'AniList', sourceUrl: typeof entry.siteUrl === 'string' ? entry.siteUrl : PUBLIC_SOURCE_URL.anilist,
      imageUrl: image, previewUrl: preview, downloadUrl: image, mediaId: String(entry.id), kind: 'poster',
    })];
  });
}

function fdroidItems(data: JsonRecord): Artwork[] {
  if (Array.isArray(data.results)) return (data.results as Artwork[]).filter(item => item.category === 'apps' && Boolean(item.imageUrl || item.previewUrl));
  const apps = Array.isArray(data.apps) ? data.apps as JsonRecord[] : [];
  return apps.flatMap((entry, index) => {
    const title = typeof entry.name === 'string' ? entry.name : '';
    const image = typeof entry.icon === 'string' ? entry.icon : '';
    if (!title || !image) return [];
    return [artwork({
      id: `fdroid:${String(entry.packageName || entry.url || title)}`, category: 'apps', title,
      subtitle: typeof entry.summary === 'string' ? entry.summary : 'Open-source Android app',
      source: 'F-Droid', provider: 'F-Droid', sourceUrl: typeof entry.url === 'string' ? entry.url : PUBLIC_SOURCE_URL.fdroid,
      imageUrl: image, previewUrl: image, downloadUrl: image, kind: 'icon', mediaId: String(entry.packageName || index),
    })];
  });
}

function localDate(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function tvMazeItems(data: JsonRecord[]): Artwork[] {
  return data.flatMap((entry, index) => {
    const episode = entry && typeof entry === 'object' ? entry : {};
    const show = episode.show && typeof episode.show === 'object' ? episode.show as JsonRecord : {};
    const imageObject = episode.image && typeof episode.image === 'object' ? episode.image as JsonRecord : show.image && typeof show.image === 'object' ? show.image as JsonRecord : {};
    const title = typeof show.name === 'string' ? show.name : '';
    const image = typeof imageObject.original === 'string' ? imageObject.original : typeof imageObject.medium === 'string' ? imageObject.medium : '';
    if (!title || !image) return [];
    const episodeName = typeof episode.name === 'string' ? episode.name : '';
    const number = [episode.season, episode.number].filter(value => Number.isFinite(Number(value))).join(' · ');
    const airdate = typeof episode.airdate === 'string' ? episode.airdate : undefined;
    const year = airdate?.slice(0, 4);
    return [artwork({
      id: `tvmaze:${String(episode.id || `${show.id}:${index}`)}`, category: 'tv', title,
      subtitle: [episodeName, number].filter(Boolean).join(' · ') || 'TVMaze schedule', year, releaseDate: airdate,
      source: 'TVmaze', provider: 'TVmaze', sourceUrl: typeof show.url === 'string' ? show.url : PUBLIC_SOURCE_URL.tvmaze,
      imageUrl: image, previewUrl: typeof imageObject.medium === 'string' ? imageObject.medium : image, downloadUrl: image,
      mediaId: String(show.id || ''), kind: 'poster',
    })];
  });
}

export async function fetchPublicChart(category: ChartCategory, provider: PublicChartProvider, chart: string, signal: AbortSignal, query = ''): Promise<Artwork[]> {
  if (provider === 'openlibrary' && category === 'books') {
    const url = `https://openlibrary.org/trending/${encodeURIComponent(chart)}.json?limit=24`;
    const cached = OPEN_LIBRARY_CACHE.get(url);
    if (cached && cached.expiresAt > Date.now()) return openLibraryItems(cached.data, category);
    const data = await requestJson<JsonRecord>(url, signal);
    if (!signal.aborted) {
      OPEN_LIBRARY_CACHE.set(url, { expiresAt: Date.now() + 5 * 60_000, data });
      if (OPEN_LIBRARY_CACHE.size > 12) OPEN_LIBRARY_CACHE.delete(OPEN_LIBRARY_CACHE.keys().next().value as string);
    }
    return openLibraryItems(data, category);
  }
  if (provider === 'listenbrainz' && category === 'music') {
    const data = await requestJson<JsonRecord>(`https://api.listenbrainz.org/1/stats/sitewide/release-groups?range=${encodeURIComponent(chart)}&count=24`, signal);
    return listenBrainzItems(data);
  }
  if (provider === 'librivox' && category === 'audiobooks') {
    const configuredBackend = (import.meta.env?.VITE_API_URL || '').replace(/\/$/, '');
    const searchBase = import.meta.env?.DEV ? '' : configuredBackend;
    if (!import.meta.env?.DEV && !searchBase) throw new Error('LibriVox charts need the RUPA Worker to avoid browser cross-origin blocking.');
    const params = new URLSearchParams({ q: query.trim(), category: 'audiobooks', country: 'id', source: 'librivox' });
    if (!query.trim()) params.set('mode', 'recent');
    const url = `${searchBase}/api/search?${params.toString()}`;
    const cached = LIBRIVOX_CACHE.get(url);
    if (cached && cached.expiresAt > Date.now()) return libriVoxItems(cached.data);
    const data = await requestJson<JsonRecord>(url, signal);
    if (!signal.aborted) {
      LIBRIVOX_CACHE.set(url, { expiresAt: Date.now() + 15 * 60_000, data });
      if (LIBRIVOX_CACHE.size > 12) LIBRIVOX_CACHE.delete(LIBRIVOX_CACHE.keys().next().value as string);
    }
    return libriVoxItems(data);
  }
  if (provider === 'anilist' && (category === 'anime' || category === 'manga')) {
    const sort = chart === 'popular' ? ['POPULARITY_DESC'] : chart === 'upcoming' ? ['START_DATE'] : ['TRENDING_DESC'];
    const status = chart === 'upcoming' ? 'NOT_YET_RELEASED' : undefined;
    const mediaQuery = status
      ? 'media(type: $type, sort: $sort, status: $status, isAdult: false)'
      : 'media(type: $type, sort: $sort, isAdult: false)';
    const body = JSON.stringify({
      query: `query ($page: Int!, $perPage: Int!, $type: MediaType!, $sort: [MediaSort!]${status ? ', $status: MediaStatus' : ''}) { Page(page: $page, perPage: $perPage) { ${mediaQuery} { id title { userPreferred } coverImage { extraLarge large } startDate { year month day } siteUrl } } }`,
      variables: { page: 1, perPage: 24, type: category === 'anime' ? 'ANIME' : 'MANGA', sort, ...(status ? { status } : {}) },
    });
    const data = await requestJson<JsonRecord>('https://graphql.anilist.co', signal, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    if (Array.isArray(data.errors) && data.errors.length) throw new Error('AniList did not return the selected chart.');
    return animeItems(data, category);
  }
  if (provider === 'fdroid' && category === 'apps') {
    if (query.trim().length < 2) return [];
    const configuredBackend = (import.meta.env?.VITE_API_URL || '').replace(/\/$/, '');
    const searchBase = import.meta.env?.DEV ? '' : configuredBackend;
    if (!import.meta.env?.DEV && !searchBase) throw new Error('F-Droid search needs the RUPA Worker to avoid browser cross-origin blocking.');
    const params = new URLSearchParams({ q: query.trim(), category: 'apps', country: 'id', source: 'fdroid' });
    const data = await requestJson<JsonRecord>(`${searchBase}/api/search?${params.toString()}`, signal);
    return fdroidItems(data);
  }
  if (provider === 'tvmaze' && category === 'tv') {
    const streaming = chart.startsWith('streaming-');
    const date = localDate(chart.endsWith('tomorrow') ? 1 : 0);
    const endpoint = streaming ? 'schedule/web' : 'schedule';
    const params = new URLSearchParams({ date });
    if (!streaming) params.set('country', 'US');
    const data = await requestJson<JsonRecord[]>(`https://api.tvmaze.com/${endpoint}?${params}`, signal);
    return tvMazeItems(data);
  }
  throw new Error('This source is not available for the selected category.');
}
