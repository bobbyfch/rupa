export type AppleStorefront = 'id' | 'us' | 'gb' | 'au' | 'ca' | 'jp' | 'de' | 'fr';

export type AppleArtwork = {
  id: string;
  title: string;
  artist: string;
  sourceUrl: string;
  artworkUrl: string;
  thumbnailUrl: string;
  downloadUrls: string[];
};

type AppleRow = {
  collectionId?: number | string;
  trackId?: number | string;
  collectionName?: string;
  trackName?: string;
  artistName?: string;
  collectionViewUrl?: string;
  trackViewUrl?: string;
  artworkUrl100?: string;
  artworkUrl600?: string;
  artworkUrl512?: string;
};

type AppleResponse = { results?: AppleRow[] };

const APPLE_IMAGE_HOST = /(^|\.)mzstatic\.com$/i;
const IMAGE_SIZE = /\/\d{1,6}x\d{1,6}(?:bb(?:-\d{1,3})?|-\d{1,3})?\.(jpe?g|png|webp|avif)$/i;

function appleJsonp(url: URL, signal: AbortSignal): Promise<AppleResponse> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason || new DOMException('The request was cancelled.', 'AbortError'));
      return;
    }

    const callback = `__rupaApple${Math.random().toString(36).slice(2)}`;
    const globals = window as unknown as Record<string, ((value: AppleResponse) => void) | undefined>;
    const script = document.createElement('script');
    let settled = false;
    const finish = (error?: Error, payload?: AppleResponse) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      delete globals[callback];
      script.remove();
      if (error) reject(error);
      else resolve(payload || {});
    };
    const onAbort = () => finish(new DOMException('The request was cancelled.', 'AbortError'));
    const timer = window.setTimeout(() => finish(new Error('Apple did not return catalog results in time.')), 12_000);

    globals[callback] = payload => finish(undefined, payload);
    script.async = true;
    script.referrerPolicy = 'no-referrer';
    script.onerror = () => finish(new Error('Apple’s catalog could not be reached.'));
    signal.addEventListener('abort', onAbort, { once: true });
    url.searchParams.set('callback', callback);
    script.src = url.toString();
    document.head.append(script);
  });
}

function isAppleArtworkUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && APPLE_IMAGE_HOST.test(url.hostname) && IMAGE_SIZE.test(url.pathname);
  } catch {
    return false;
  }
}

function appleImageAtSize(value: string, size: number): string | undefined {
  if (!isAppleArtworkUrl(value)) return undefined;
  const url = new URL(value);
  url.pathname = url.pathname.replace(IMAGE_SIZE, `/${size}x${size}bb.$1`);
  return url.toString();
}

function originalAppleArtwork(value: string): string | undefined {
  if (!isAppleArtworkUrl(value)) return undefined;
  const url = new URL(value);
  const prefix = '/image/thumb/';
  if (!url.pathname.startsWith(prefix)) return undefined;
  const parts = url.pathname.slice(prefix.length).split('/').filter(Boolean);
  if (!parts.length) return undefined;
  const tail = parts.at(-1) || '';
  if (/^\d{1,6}x\d{1,6}(?:bb(?:-\d{1,3})?|-\d{1,3})?\.(?:jpe?g|png|webp|avif)$/i.test(tail)) parts.pop();
  else parts[parts.length - 1] = tail.replace(/\.\d{1,6}x\d{1,6}(?:bb(?:-\d{1,3})?|-\d{1,3})?\.(jpe?g|png|webp|avif)$/i, '.$1');
  if (!parts.length || !/\.(?:jpe?g|png|webp|avif)$/i.test(parts.at(-1) || '')) return undefined;
  url.hostname = 'a5.mzstatic.com';
  url.pathname = `/us/r1000/0/${parts.join('/')}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function fromAppleRow(row: AppleRow): AppleArtwork | undefined {
  const raw = row.artworkUrl100 || row.artworkUrl600 || row.artworkUrl512 || '';
  if (!isAppleArtworkUrl(raw)) return undefined;
  const title = row.collectionName || row.trackName || 'Untitled album';
  const artist = row.artistName || 'Unknown artist';
  const artworkUrl = appleImageAtSize(raw, 3000) || appleImageAtSize(raw, 1200) || raw;
  const thumbnailUrl = appleImageAtSize(raw, 600) || raw;
  const sourceUrl = row.collectionViewUrl || row.trackViewUrl || '';
  const downloadUrls = [...new Set([originalAppleArtwork(raw), artworkUrl, appleImageAtSize(raw, 1200), raw].filter((value): value is string => Boolean(value)))];
  const id = row.collectionId || row.trackId || `${artist}:${title}`;
  return { id: String(id), title, artist, sourceUrl, artworkUrl, thumbnailUrl, downloadUrls };
}

function appleLink(value: string): { id: string; artist: boolean; storefront?: AppleStorefront } | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'music.apple.com') return undefined;
    const region = url.pathname.match(/^\/([a-z]{2})(?:\/|$)/i)?.[1]?.toLowerCase();
    const storefront = ['id', 'us', 'gb', 'au', 'ca', 'jp', 'de', 'fr'].includes(region || '') ? region as AppleStorefront : undefined;
    const artist = url.pathname.match(/\/artist\/[^/]+\/(\d+)\/?$/i);
    const album = url.pathname.match(/\/album\/[^/]+\/(\d+)(?:\/|$)/i);
    const match = artist || album;
    return match ? { id: match[1], artist: Boolean(artist), storefront } : undefined;
  } catch {
    return undefined;
  }
}

export async function lookupAppleArtwork(query: string, storefront: AppleStorefront, signal: AbortSignal): Promise<AppleArtwork[]> {
  const value = query.trim();
  if (!value) return [];

  const link = appleLink(value);
  const request = new URL(link ? 'https://itunes.apple.com/lookup' : 'https://itunes.apple.com/search');
  request.searchParams.set('country', link?.storefront || storefront);
  if (link) {
    request.searchParams.set('id', link.id);
    if (link.artist) {
      request.searchParams.set('entity', 'album');
      request.searchParams.set('limit', '200');
    }
  } else {
    request.searchParams.set('term', value.slice(0, 180));
    request.searchParams.set('media', 'music');
    request.searchParams.set('entity', 'album');
    request.searchParams.set('limit', '24');
  }

  const response = await appleJsonp(request, signal);
  const seen = new Set<string>();
  return (response.results || []).flatMap(row => {
    const item = fromAppleRow(row);
    if (!item || seen.has(item.id)) return [];
    seen.add(item.id);
    return [item];
  }).slice(0, 24);
}

export function appleArtworkFromDirectUrl(value: string): AppleArtwork | undefined {
  if (!isAppleArtworkUrl(value)) return undefined;
  const url = new URL(value);
  const filename = decodeURIComponent(url.pathname.split('/').at(-1) || '').replace(/\.\d+x\d+.*$/i, '').replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
  return {
    id: value,
    title: filename || 'Apple artwork',
    artist: 'Apple Music artwork',
    sourceUrl: '',
    artworkUrl: appleImageAtSize(value, 3000) || value,
    thumbnailUrl: appleImageAtSize(value, 600) || value,
    downloadUrls: [...new Set([originalAppleArtwork(value), appleImageAtSize(value, 3000), value].filter((candidate): candidate is string => Boolean(candidate)))],
  };
}
