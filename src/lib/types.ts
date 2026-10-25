export const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'music', label: 'Music' },
  { id: 'musicvideos', label: 'Music Videos' },
  { id: 'books', label: 'Books' },
  { id: 'audiobooks', label: 'Audiobooks' },
  { id: 'podcasts', label: 'Podcasts' },
  { id: 'podcastepisodes', label: 'Podcast Episodes' },
  { id: 'apps', label: 'Apps' },
  { id: 'appscreenshots', label: 'App Screenshots' },
  { id: 'art', label: 'Art & Archives' },
  { id: 'movies', label: 'Movies' },
  { id: 'tv', label: 'TV / Series' },
  { id: 'videos', label: 'YouTube thumbnails' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'anime', label: 'Anime' },
  { id: 'manga', label: 'Manga' },
  { id: 'webtoons', label: 'Webtoons' },
  { id: 'comics', label: 'Comics' },
  { id: 'games', label: 'Games' },
  { id: 'boardgames', label: 'Board Games' },
  { id: 'magazines', label: 'Magazines' },
  { id: 'physicalmedia', label: 'Blu-ray & Physical' },
] as const;

export type Category = (typeof CATEGORIES)[number]['id'] | 'appscreenshots';
export type AppleCategory = Extract<Category, 'music' | 'musicvideos' | 'books' | 'audiobooks' | 'podcasts' | 'podcastepisodes' | 'apps' | 'appscreenshots' | 'movies' | 'tv'>;
export type AppleStorefront = 'id' | 'us' | 'gb' | 'au' | 'ca' | 'jp' | 'de' | 'fr';
export type ArtKind = 'cover' | 'poster' | 'backdrop' | 'logo' | 'key-art' | 'alternate' | 'artwork' | 'thumbnail' | 'artist-image' | 'screenshot' | 'icon';

export interface Artwork {
  id: string;
  category: Exclude<Category, 'all'>;
  title: string;
  subtitle: string;
  year?: string;
  source: string;
  sourceUrl: string;
  imageUrl: string;
  previewUrl: string;
  downloadUrl?: string;
  hdDownloadUrls?: string[];
  sdDownloadUrl?: string;
  screenshots?: { url: string; device: string }[];
  mediaPreviewUrl?: string;
  mediaId?: string;
  kind?: ArtKind;
  artist?: string;
  artistUrl?: string;
  provider?: string;
  rights?: 'source-only';
}

export interface MotionArtwork { url: string; tallUrl?: string; }
export interface MotionLookupState { status: 'checking' | 'available' | 'none' | 'error'; artwork?: MotionArtwork; }
export interface ProviderResult { results: Artwork[]; warnings: string[]; unavailable: string[]; }
