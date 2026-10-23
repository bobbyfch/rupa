import type { Artwork, MangaSeriesDetail } from './types';

type OpenLibraryRow = {
  title?: unknown;
  cover_i?: unknown;
  key?: unknown;
  first_publish_year?: unknown;
  author_name?: unknown;
};

type OpenLibraryResponse = { docs?: OpenLibraryRow[] };

const OPEN_LIBRARY_TIMEOUT_MS = 9_000;
const OPEN_LIBRARY_CACHE_MS = 10 * 60_000;
const detailCache = new Map<string, { expiresAt: number; detail: MangaSeriesDetail }>();

function clean(value: unknown, max = 180): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function normalizeTitle(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^\p{L}\p{N}-]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

type VolumeLabel = { key: string; label: string; rank: number };

function numberedVolume(series: string, candidate: string): VolumeLabel | null {
  const base = normalizeTitle(series);
  const title = normalizeTitle(candidate);
  if (!base || !title.startsWith(`${base} `)) return null;

  const suffix = title.slice(base.length).trim();
  const match = suffix.match(/^(?:(?:deluxe|omnibus|collectors?|box set|complete collection)\s+)*(?:(?:volume|vol|book)\s*)?(\d{1,4}(?:\.\d+)?)(?:\s*(?:-|to|through)\s*(\d{1,4}(?:\.\d+)?))?$/);
  if (!match) return null;

  const start = Number(match[1]).toString();
  const end = match[2] ? Number(match[2]).toString() : undefined;
  const editionTerms = suffix.match(/^(?:(?:deluxe|omnibus|collectors?|box set|complete collection)\s+)+/);
  const edition = editionTerms?.[0].trim().replace(/\s+/g, ' ').replace(/\b\p{L}/gu, letter => letter.toUpperCase());
  const label = end ? `Volumes ${start}–${end}` : `Volume ${start}`;
  return { key: end ? `${start}-${end}` : start, label: edition ? `${label} · ${edition}` : label, rank: edition ? 1 : 0 };
}

/** Maps Open Library's numbered manga work records to cover-only editions. */
export function mapOpenLibraryMangaSeries(title: string, data: OpenLibraryResponse): MangaSeriesDetail {
  const safeTitle = clean(title);
  const candidates = Array.isArray(data?.docs) ? data.docs : [];
  const byVolume = new Map<string, { rank: number; item: Artwork }>();
  const matchedAuthors = new Set<string>();

  for (const row of candidates) {
    const recordTitle = clean(row.title, 240);
    const volume = numberedVolume(safeTitle, recordTitle);
    const coverId = Number(row.cover_i);
    const workKey = clean(row.key, 100);
    if (!volume || !Number.isSafeInteger(coverId) || coverId < 1 || !/^\/works\/OL\d+W$/.test(workKey)) continue;

    const current = byVolume.get(volume.key);
    if (current && current.rank <= volume.rank) continue;

    const coverBase = `https://covers.openlibrary.org/b/id/${coverId}`;
    const year = Number(row.first_publish_year);
    for (const author of Array.isArray(row.author_name) ? row.author_name : []) {
      const name = clean(author, 120);
      if (name) matchedAuthors.add(name);
    }
    const item: Artwork = {
      id: `manga:openlibrary:${workKey.slice('/works/'.length)}`,
      category: 'manga',
      title: `${safeTitle} · ${volume.label}`,
      subtitle: `${volume.label} · Open Library`,
      year: Number.isInteger(year) && year >= 1800 && year <= 2200 ? String(year) : undefined,
      source: 'Open Library',
      provider: 'Open Library',
      sourceUrl: `https://openlibrary.org${workKey}`,
      previewUrl: `${coverBase}-M.jpg`,
      imageUrl: `${coverBase}-L.jpg`,
      downloadUrl: `${coverBase}-L.jpg`,
      kind: 'cover',
      rights: 'source-only',
      availability: 'link-only',
    };
    byVolume.set(volume.key, { rank: volume.rank, item });
  }

  const volumes = [...byVolume.values()].map(({ item }) => item).sort((left, right) => {
    const a = left.subtitle.match(/Volumes? (\d+(?:\.\d+)?)/)?.[1] || '';
    const b = right.subtitle.match(/Volumes? (\d+(?:\.\d+)?)/)?.[1] || '';
    return Number(a) - Number(b) || left.subtitle.localeCompare(right.subtitle, undefined, { numeric: true });
  });
  const authors = [...matchedAuthors].slice(0, 8);
  const years = volumes.map(item => Number(item.year)).filter(year => year >= 1800 && year <= 2200);

  return {
    id: `openlibrary:${normalizeTitle(safeTitle).replaceAll(' ', '-')}`,
    title: safeTitle,
    description: '',
    year: years.length ? String(Math.min(...years)) : undefined,
    status: '',
    lastVolume: '',
    authors,
    source: 'Open Library',
    sourceUrl: `https://openlibrary.org/search?q=${encodeURIComponent(safeTitle)}`,
    volumes,
    galleryLabel: 'Volume covers',
    volumesNumbered: true,
    detailNote: volumes.length
      ? 'Numbered cover records from Open Library. Coverage and edition numbering vary by title and language.'
      : 'Open Library has no numbered cover records for this series yet. The selected series cover remains available above.',
  };
}

function volumeEditionKey(item: Artwork): string {
  const ignored = new Set(['MangaDex', 'Open Library', 'Jikan / MyAnimeList']);
  const label = item.subtitle.split(' · ').map(part => part.trim())
    .filter(part => part && !ignored.has(part) && !/^[A-Z]{2,3}$/.test(part)).join(' · ');
  return /^volumes?\s+\d/i.test(label) ? normalizeTitle(label) : `${normalizeTitle(label)}:${item.id}`;
}

/** Combines catalogs while keeping one primary cover per numbered edition. */
export function mergeMangaSeriesDetails(primary: MangaSeriesDetail, additional: MangaSeriesDetail): MangaSeriesDetail {
  const byEdition = new Map<string, Artwork>();
  for (const item of [...primary.volumes, ...additional.volumes]) {
    const key = volumeEditionKey(item);
    if (key && !byEdition.has(key)) byEdition.set(key, item);
  }
  const volumes = [...byEdition.values()].sort((left, right) => {
    const a = left.subtitle.match(/Volumes? (\d+(?:\.\d+)?)/)?.[1] || '';
    const b = right.subtitle.match(/Volumes? (\d+(?:\.\d+)?)/)?.[1] || '';
    return Number(a) - Number(b) || left.subtitle.localeCompare(right.subtitle, undefined, { numeric: true });
  });
  const sources = [...new Set(volumes.map(item => clean(item.source)).filter(Boolean))];
  return {
    ...primary,
    title: primary.title || additional.title,
    year: primary.year || additional.year,
    authors: primary.authors.length ? primary.authors : additional.authors,
    volumes,
    galleryLabel: 'Volume covers',
    detailNote: sources.length > 1
      ? `Cover records combine ${sources.join(' and ')}. Edition and language coverage vary by title.`
      : primary.detailNote || additional.detailNote,
    volumesNumbered: primary.volumesNumbered ?? additional.volumesNumbered,
  };
}

export async function fetchOpenLibraryMangaSeries(title: string, signal: AbortSignal): Promise<MangaSeriesDetail> {
  const safeTitle = clean(title);
  const key = normalizeTitle(safeTitle);
  if (key.length < 2) throw new Error('Enter a manga title to load its volume covers.');

  const cached = detailCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.detail;

  const params = new URLSearchParams({
    q: safeTitle,
    limit: '100',
    fields: 'title,cover_i,key,first_publish_year,author_name',
  });
  const timeout = AbortSignal.timeout(OPEN_LIBRARY_TIMEOUT_MS);
  const requestSignal = AbortSignal.any([signal, timeout]);
  let response: Response;
  try {
    response = await fetch(`https://openlibrary.org/search.json?${params}`, {
      signal: requestSignal,
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    if (signal.aborted) throw error;
    if (timeout.aborted) throw new Error('Open Library took too long to load manga covers. Try again.');
    throw new Error('Open Library is temporarily unavailable. Try again in a moment.');
  }
  if (!response.ok) throw new Error(`Open Library returned HTTP ${response.status}.`);

  const data = await response.json() as OpenLibraryResponse;
  const detail = mapOpenLibraryMangaSeries(safeTitle, data);
  if (detailCache.size > 80) {
    for (const [cachedKey, value] of detailCache) if (value.expiresAt <= Date.now()) detailCache.delete(cachedKey);
  }
  detailCache.set(key, { expiresAt: Date.now() + OPEN_LIBRARY_CACHE_MS, detail });
  return detail;
}
