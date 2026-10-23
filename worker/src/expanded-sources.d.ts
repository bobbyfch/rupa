import type { Artwork } from '../../src/lib/types';

export function parseSonySerial(query: string): string | null;
export const RETRO_SYSTEMS: Readonly<Record<string, string>>;
export function sonySerialCovers(query: string, signal?: AbortSignal): Promise<Artwork[]>;
export function vitaHexCovers(query: string, limit?: number, signal?: AbortSignal): Promise<Artwork[]>;
export function libretroExactCover(query: string, signal?: AbortSignal): Promise<Artwork[]>;
export function deezerAlbums(query: string, limit?: number, signal?: AbortSignal): Promise<Artwork[]>;
export function musicBrainzCaa(query: string, limit?: number, signal?: AbortSignal): Promise<Artwork[]>;
export function mangaDexCovers(query: string, limit?: number, signal?: AbortSignal, category?: 'manga' | 'webtoons'): Promise<Artwork[]>;
export function additionalGames(query: string, signal?: AbortSignal): Promise<{ results: Artwork[]; warnings: string[] }>;
