// Build a compact anime title + cross-ID index from manami-project/anime-offline-database (ODbL 1.0 + DbCL 1.0).
// The derived shard stays under ODbL; see docs/RIGHTS_AND_ATTRIBUTION.md. Posters are NOT mirrored, only MAL CDN path stubs.
// Usage: node scripts/ingest/anime.mjs [release-tag]    (default: latest, resolved through github.com redirect, no API quota)
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { getBuffer, request } from '../lib/net.mjs';

const OUT = path.resolve(import.meta.dirname, '../../public/offline/index/anime.json');
const REPO = 'manami-project/anime-offline-database';
let tag = process.argv[2];
if (!tag) {
  const response = await request(`https://github.com/${REPO}/releases/latest`, { method: 'HEAD' });
  tag = new URL(response.url).pathname.split('/').pop();
}
const { buffer } = await getBuffer(`https://github.com/${REPO}/releases/download/${tag}/anime-offline-database-minified.json.zst`, { timeoutMs: 240_000 });
const db = JSON.parse(zlib.zstdDecompressSync(buffer));
const MAL_IMAGE = /^https:\/\/cdn\.myanimelist\.net\/images\/anime\/(\d+\/\d+)\.jpg$/;
const idOf = (sources, host) => { const url = sources.find(s => s.includes(host)); return url ? Number(url.split('/').pop()) || 0 : 0; };
const script = value => /[぀-ヿ]/.test(value) ? 'ja' : /[가-힯]/.test(value) ? 'ko' : /[一-鿿]/.test(value) ? 'zh' : /^[\x20-\x7e]+$/.test(value) ? 'ascii' : 'other';
// Alphabetical truncation drops the English title, so keep short ASCII names (no CamelCase abbreviations) plus one name per CJK script.
const abbreviation = value => !/\s/.test(value) && (value.slice(1).match(/[A-Z]/g) || []).length >= 2;
function pickSynonyms(title, all) {
  const unique = [...new Set(all)].filter(s => s.toLowerCase() !== title.toLowerCase());
  const ascii = unique.filter(s => script(s) === 'ascii' && s.length >= 4 && s.length <= 45 && !abbreviation(s)).sort((a, b) => a.length - b.length || a.localeCompare(b)).slice(0, 8);
  return [...ascii, ...['ja', 'zh', 'ko'].flatMap(code => unique.filter(s => script(s) === code).slice(0, 1))];
}
const rows = [];
for (const entry of db.data) {
  if (entry.type === 'UNKNOWN' || entry.type === 'SPECIAL') continue; // specials are mostly bonus clips; keep the index small
  const image = entry.picture?.match(MAL_IMAGE)?.[1], mal = idOf(entry.sources, 'myanimelist.net/anime');
  if (!image || !mal) continue;
  rows.push([entry.title, entry.type, entry.animeSeason?.year || 0, mal, idOf(entry.sources, 'anilist.co/anime'), image, pickSynonyms(entry.title, entry.synonyms)]);
}
rows.sort((a, b) => a[0].localeCompare(b[0]));
await writeFile(OUT, JSON.stringify({
  schemaVersion: 1, kind: 'anime', generatedAt: new Date().toISOString().slice(0, 10),
  source: { id: 'anime-offline-database', repo: REPO, revision: tag, revisionDate: db.lastUpdate, url: `https://github.com/${REPO}`, license: db.license },
  rights: 'reference-only', rightsNote: 'Metadata under ODbL 1.0 + DbCL 1.0 (share-alike, attribution). Poster images belong to their rights holders and are not mirrored.',
  imageBase: 'https://cdn.myanimelist.net/images/anime/', imageSuffix: '.jpg',
  columns: ['title', 'type', 'year', 'malId', 'anilistId', 'imagePath', 'synonyms'], rows,
}));
console.log(tag, db.lastUpdate, 'rows', rows.length);
