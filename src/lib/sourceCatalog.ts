import { hasTitleIndex } from './catalog.ts';
import type { Category } from './types';

export interface SourceOption {
  id: string;
  label: string;
  note?: string;
}

const sourceOptions: Partial<Record<Category, SourceOption[]>> = {
  music: [
    { id: 'all', label: 'All sources' },
    { id: 'apple', label: 'Apple Music' },
    { id: 'deezer', label: 'Deezer' },
    { id: 'musicbrainz-caa', label: 'MusicBrainz + CAA' },
  ],
  books: [
    { id: 'all', label: 'All sources' },
    { id: 'apple', label: 'Apple Books' },
    { id: 'openlibrary', label: 'Open Library' },
    { id: 'local', label: 'Offline covers (Standard Ebooks)', note: 'Public domain, works offline' },
  ],
  movies: [
    { id: 'all', label: 'All sources' },
    { id: 'apple', label: 'Apple TV / iTunes' },
    { id: 'cinemeta', label: 'Cinemeta posters' },
  ],
  tv: [
    { id: 'all', label: 'All sources' },
    { id: 'apple', label: 'Apple TV seasons' },
    { id: 'cinemeta', label: 'Cinemeta posters' },
    { id: 'tvmaze', label: 'TVmaze' },
  ],
  art: [
    { id: 'all', label: 'All sources' },
    { id: 'local', label: 'Offline collection' },
    { id: 'met', label: 'The Met' },
    { id: 'cleveland', label: 'Cleveland Museum of Art' },
    { id: 'commons', label: 'Wikimedia Commons' },
    { id: 'openverse', label: 'Openverse' },
  ],
  anime: [
    { id: 'all', label: 'Best available' },
    { id: 'local-index', label: 'Offline title index', note: 'Works without the Worker' },
    { id: 'jikan', label: 'Jikan / MyAnimeList' },
    { id: 'anilist', label: 'AniList' },
  ],
  manga: [
    { id: 'all', label: 'Best available' },
    { id: 'mangadex', label: 'MangaDex' },
    { id: 'jikan', label: 'Jikan / MyAnimeList' },
    { id: 'anilist', label: 'AniList' },
  ],
  webtoons: [
    { id: 'all', label: 'All sources' },
    { id: 'mangadex', label: 'MangaDex · web comics' },
  ],
  games: [
    { id: 'all', label: 'All sources' },
    { id: 'local-index', label: 'Offline title index', note: '17 platforms, no Worker' },
    { id: 'retro', label: 'PS1 / PS2 / Libretro' },
    { id: 'vitahex', label: 'HexFlow · PS Vita', note: 'Exact title index / App ID' },
    { id: 'steamgriddb', label: 'SteamGridDB · PC artwork', note: 'Live public-page scrape through the Worker' },
  ],
  videos: [
    { id: 'all', label: 'YouTube thumbnails' },
    { id: 'youtube', label: 'YouTube link / ID' },
  ],
  musicvideos: [{ id: 'all', label: 'All sources' }, { id: 'apple', label: 'Apple Music' }],
  audiobooks: [{ id: 'all', label: 'All sources' }, { id: 'apple', label: 'Apple Books' }, { id: 'librivox', label: 'LibriVox' }],
  podcasts: [{ id: 'all', label: 'All sources' }, { id: 'apple', label: 'Apple Podcasts' }],
  podcastepisodes: [{ id: 'all', label: 'All sources' }, { id: 'apple', label: 'Apple Podcasts' }],
  apps: [{ id: 'all', label: 'All sources' }, { id: 'apple', label: 'App Store' }, { id: 'fdroid', label: 'F-Droid' }],
};

export const SEARCHABLE_COLLECTIONS: Category[] = [
  'music', 'musicvideos', 'books', 'audiobooks', 'podcasts', 'podcastepisodes',
  'apps', 'movies', 'tv', 'art', 'anime', 'manga', 'webtoons', 'comics', 'games', 'boardgames', 'magazines', 'physicalmedia', 'videos',
];

export function isSearchableCollection(category: Category): boolean {
  return SEARCHABLE_COLLECTIONS.includes(category);
}

const OFFLINE_CATALOG: SourceOption = { id: 'local-index', label: 'Offline catalog' };

export function getSourceOptions(category: Category): SourceOption[] {
  const list = sourceOptions[category] || [];
  if (!hasTitleIndex(category) || list.some(option => option.id === 'local-index')) return list;
  // Collections with no live provider list only the offline catalog; the others add it as one more source.
  return list.length ? [...list, OFFLINE_CATALOG] : [{ id: 'all', label: 'Offline catalog' }];
}
