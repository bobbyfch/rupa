export const CATEGORIES = [
  { id: 'all', label: 'Choose a collection' }, { id: 'music', label: 'Music' }, { id: 'musicvideos', label: 'Music videos' },
  { id: 'books', label: 'Books' }, { id: 'audiobooks', label: 'Audiobooks' }, { id: 'podcasts', label: 'Podcasts' },
  { id: 'podcastepisodes', label: 'Podcast episodes' }, { id: 'apps', label: 'Apps' }, { id: 'appscreenshots', label: 'App screenshots' },
  { id: 'art', label: 'Art & archives' },
  { id: 'movies', label: 'Movies' }, { id: 'tv', label: 'TV / Series' }, { id: 'videos', label: 'YouTube' },
  { id: 'anime', label: 'Anime' }, { id: 'manga', label: 'Manga' }, { id: 'webtoons', label: 'Webtoons' },
  { id: 'comics', label: 'Comics' }, { id: 'games', label: 'Games' }, { id: 'boardgames', label: 'Board games' },
  { id: 'magazines', label: 'Magazines' }, { id: 'physicalmedia', label: 'Blu-ray & physical' }, { id: 'ghibli', label: 'Studio Ghibli stills' }
] as const;
export type Category = (typeof CATEGORIES)[number]['id'];
export type AppleCategory = Extract<Category, 'music' | 'musicvideos' | 'books' | 'audiobooks' | 'podcasts' | 'podcastepisodes' | 'apps' | 'appscreenshots' | 'movies' | 'tv'>;
export type AppleStorefront = 'id' | 'us' | 'gb' | 'au' | 'ca' | 'jp' | 'de' | 'fr';
export type ArtKind = 'cover' | 'poster' | 'backdrop' | 'logo' | 'key-art' | 'alternate' | 'artwork' | 'thumbnail' | 'artist-image' | 'screenshot' | 'title-screen' | 'promo-art' | 'disc-art' | 'character-art' | 'icon' | 'wallpaper';
export interface Artwork {
  id: string; category: Exclude<Category, 'all'>; title: string; subtitle: string;
  year?: string; source: string; sourceUrl: string; imageUrl: string; previewUrl: string; downloadUrl?: string; hdDownloadUrls?: string[]; sdDownloadUrl?: string;
  mediaId?: string; kind?: ArtKind; language?: string | null; artist?: string; artistUrl?: string; provider?: string;
  releaseDate?: string;
  licenseUrl?: string; licenseLabel?: string; attribution?: string; originalWidth?: number; originalHeight?: number;
  rights?: 'unverified' | 'source-only' | 'open-license';
  rightsStatus?: 'cc0' | 'public-domain' | 'cc-by' | 'cc-by-sa' | 'permission-granted' | 'reference-only' | 'unknown' | 'blocked';
  /** Work and edition are separate from the artwork: one work has many regional/format editions, each with its own artwork. */
  workId?: string; editionId?: string; region?: string;
  /** mirrored = file ships with Rupa; index-only = title indexed locally, image stays upstream; link-only = source link only. */
  availability?: 'mirrored' | 'index-only' | 'link-only' | 'local-copy';
  /** Search keywords from the query or category that selected this mirrored file (movement, medium, theme). */
  tags?: string[];
  /** Mirrored files only: where the licence was verified and any caveat the reader must see. */
  rightsNote?: string; rightsEvidenceUrl?: string; sourceId?: string;
  sha256?: string; fileBytes?: number; mirrored?: boolean; packId?: string;
}
export interface MotionArtwork { url: string; tallUrl?: string; }
export interface MotionLookupState { status: 'checking' | 'available' | 'none' | 'error'; artwork?: MotionArtwork; }
export interface ProviderResult { results: Artwork[]; warnings: string[]; unavailable: string[] }
export interface Favorite { id: string; profileId: string; artwork: Artwork; updatedAt: number; deleted?: boolean; folderId?: string }
export interface FavoriteFolder { id: string; profileId: string; name: string; createdAt: number; updatedAt: number; deleted?: boolean }
export interface Hunt { id: string; profileId: string; title: string; note: string; createdAt: number; updatedAt: number; deleted?: boolean }
export interface Preferences {
  theme: 'light' | 'dark'; gallery: 'grid' | 'masonry'; language: string; uiLocale?: 'id' | 'en' | 'ja';
  printSize: 'A4' | 'A3' | 'A2'; minPpi: 150 | 200 | 300;
  accent?: 'vermilion' | 'cobalt' | 'citron' | 'forest' | 'coral'; oled?: boolean;
}
export interface LocalProfile { id: string; name: string; createdAt: number; updatedAt: number; preferences: Preferences; syncCode?: string }
export const DEFAULT_PREFERENCES: Preferences = { theme: 'light', gallery: 'masonry', language: 'all', uiLocale: 'id', printSize: 'A3', minPpi: 200, accent: 'vermilion', oled: false };
/** Artwork the user supplied themselves. Stored only in this browser (IndexedDB); never committed, mirrored or synced. */
export interface UserArtwork { id: string; profileId: string; title: string; region?: string; edition?: string; notes?: string; blob: Blob; mime: string; width: number; height: number; bytes: number; createdAt: number }
