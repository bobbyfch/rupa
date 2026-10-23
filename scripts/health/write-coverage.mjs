// Generates docs/COVERAGE.md: what each collection can show offline, from the real manifest and mirrored files.
// Usage: node scripts/health/write-coverage.mjs   (run after npm run ingest:catalog)
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const read = async file => JSON.parse(await readFile(path.join(ROOT, file), 'utf8'));
const manifest = await read('public/offline/index/manifest.json'), art = await read('public/offline/artworks.json');
const COLLECTIONS = [
  ['music', 'Music', 'wd-music', 'Apple, Deezer, MusicBrainz + CAA', 'Album covers are publisher artwork; Commons holds a few, some wrongly labelled, so none are mirrored.'],
  ['musicvideos', 'Music videos', 'wd-musicvideos', 'Apple Music', 'Only 20 items have 3 or more Wikidata sitelinks.'],
  ['books', 'Books', 'wd-books', 'Apple Books, Open Library', 'Mirrored: Standard Ebooks covers (US public domain / CC0).'],
  ['audiobooks', 'Audiobooks', 'audiobooks', 'Apple Books', 'LibriVox recordings are public domain, but cover art licences vary, so titles only.'],
  ['podcasts', 'Podcasts', 'wd-podcasts', 'Apple Podcasts', 'Small set: few podcasts have 3 or more sitelinks.'],
  ['podcastepisodes', 'Podcast episodes', null, 'Apple Podcasts', 'No open episode corpus exists; live only.'],
  ['apps', 'App icons', 'wd-apps', 'App Store', 'Wikidata mobile apps; logos are trademarks, so images stay index-only.'],
  ['appscreenshots', 'App screenshots', null, 'App Store', 'Screenshots are the publisher\'s; live only.'],
  ['art', 'Art & archives', null, 'Met, Cleveland, Commons, Openverse', 'Fully mirrored: CC0 or public-domain files from Cleveland, Met, Commons, Wellcome, Smithsonian and NASA.'],
  ['movies', 'Movies', 'wd-movies', 'Apple TV / iTunes', 'Mirrored: public-domain posters whose Commons file name says poster.'],
  ['tv', 'TV / Series', 'wd-tv', 'Apple TV seasons', 'Posters are studio artwork; index plus Commons images only.'],
  ['videos', 'YouTube', null, 'YouTube thumbnails by link or ID', 'Works with no Worker and no key.'],
  ['anime', 'Anime', 'anime', 'Jikan, AniList', 'Posters belong to rights holders; index plus MAL image links.'],
  ['manga', 'Manga', 'wd-manga', 'MangaDex, Jikan, AniList', 'Few free images exist; titles from Wikidata.'],
  ['webtoons', 'Webtoons', 'wd-webtoons', 'MangaDex (web comics)', 'Titles from Wikidata.'],
  ['comics', 'Comics', 'wd-comics', null, 'Mirrored: public-domain US covers whose Commons file name says cover.'],
  ['games', 'Games', 'games', 'Libretro, xlenore, VitaHEX (via Worker)', 'Box art is publisher artwork and under 1,000 px; index-only.'],
  ['boardgames', 'Board games', 'wd-boardgames', null, 'Titles from Wikidata with Commons photos where free.'],
  ['magazines', 'Magazines', 'wd-magazines', null, 'Titles from Wikidata with Commons images where free.'],
  ['physicalmedia', 'Blu-ray & physical', 'wd-physicalmedia', null, 'Films released by The Criterion Collection; mirrored: public-domain posters.'],
];
const rowsOf = id => {
  if (!id) return 0;
  const shards = manifest.shards.filter(s => (id === 'games' ? s.kind === 'games' : id === 'anime' ? s.kind === 'anime' : s.id === id));
  return shards.reduce((n, s) => n + s.rows, 0);
};
const mirrored = category => art.assets.filter(a => a.category === category).length;
const lines = [
  '# Collection coverage', '',
  `Generated ${new Date().toISOString().slice(0, 10)} from \`public/offline/index/manifest.json\` and \`public/offline/artworks.json\`. Run \`node scripts/health/write-coverage.mjs\` to refresh.`, '',
  '**Mirrored** = the image file ships inside RUPA (open licence, works offline). **Indexed** = title rows searchable offline; images stay at their host. A mirror is never made from a licence label alone.', '',
  '| Collection | Indexed titles | Mirrored images | Live sources | Note |', '|---|---:|---:|---|---|',
  ...COLLECTIONS.map(([id, label, shard, live, note]) => `| ${label} | ${rowsOf(shard).toLocaleString('en-US') || '0'} | ${mirrored(id)} | ${live || 'none (offline only)'} | ${note} |`),
  '', `Totals: ${manifest.shards.filter(s => s.kind !== 'works').reduce((n, s) => n + s.rows, 0).toLocaleString('en-US')} indexed titles, ${art.assets.length} mirrored images.`, '',
];
await writeFile(path.join(ROOT, 'docs/COVERAGE.md'), lines.join('\n'));
console.log(lines.slice(6, 6 + COLLECTIONS.length + 2).join('\n'));
