// Mirror a small, curated set of Cleveland Museum of Art Open Access works (per-row CC0 only) into public/offline.
// Usage: node scripts/ingest/cleveland.mjs [--dry]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getBuffer, getJson, sha256 } from '../lib/net.mjs';
import { imageInfo } from '../lib/imageinfo.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const PACK_DIR = 'offline/packs/museum-cc0-01';
const MANIFEST = path.join(ROOT, 'public/offline/artworks.json');
const API = 'https://openaccess-api.clevelandart.org/api/artworks/';
const MIN_LONG_EDGE = 1600, MAX_PRINT_BYTES = 3_300_000, BYTE_BUDGET = 40_000_000;
// Each query: [label, params, cap]. Only rows with share_license_status === 'CC0' and a print JPEG pass.
const QUERIES = [
  ['poster', { q: 'poster', type: 'Print' }, 4],
  ['art-nouveau', { q: 'art nouveau', department: 'Prints' }, 2],
  ['mucha', { q: 'Mucha' }, 1],
  ['toulouse-lautrec', { q: 'Toulouse-Lautrec', department: 'Prints' }, 3],
  ['hokusai', { q: 'Hokusai' }, 2],
  ['hiroshige', { q: 'Hiroshige' }, 2],
  ['advertisement', { q: 'advertisement' }, 1],
  ['travel', { q: 'travel poster' }, 1],
];
const TAGS = { mucha: ['art nouveau', 'mucha'], 'toulouse-lautrec': ['toulouse-lautrec', 'lithograph'], hokusai: ['ukiyo-e', 'japanese woodblock', 'hokusai'], hiroshige: ['ukiyo-e', 'japanese woodblock', 'hiroshige'] };
const dry = process.argv.includes('--dry');
const slug = value => value.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
const existing = JSON.parse(await readFile(MANIFEST, 'utf8'));
const kept = existing.assets.filter(asset => asset.packId !== 'museum-cc0-01'); // other packs and the 3 original works stay untouched
const taken = new Set(kept.map(asset => asset.id));
let bytes = 0;
const picked = [];
for (const [label, params, cap] of QUERIES) {
  const url = new URL(API);
  Object.entries({ cc0: 1, has_image: 1, limit: 60, skip: 0, ...params }).forEach(([key, value]) => url.searchParams.set(key, value));
  const data = await getJson(url);
  let count = 0;
  for (const row of data.data) {
    if (count >= cap) break;
    const id = `art:cleveland:${row.id}`, print = row.images?.print, web = row.images?.web;
    if (taken.has(id) || row.share_license_status !== 'CC0' || !print?.url || !web?.url) continue;
    const w = Number(print.width), h = Number(print.height), size = Number(print.filesize);
    if (Math.max(w, h) < MIN_LONG_EDGE || size > MAX_PRINT_BYTES || bytes + size > BYTE_BUDGET) continue;
    if (!/\.jpe?g$/i.test(print.url) || !/\.jpe?g$/i.test(web.url)) continue;
    taken.add(id); bytes += size + Number(web.filesize || 0); count++;
    picked.push({ label, row, print, web });
  }
  console.log(label, 'picked', count);
}
console.log('selected', picked.length, 'works, ~', (bytes / 1e6).toFixed(1), 'MB');
if (dry) process.exit(0);

await mkdir(path.join(ROOT, 'public', PACK_DIR), { recursive: true });
const revision = new Date().toISOString().slice(0, 10);
const assets = [];
for (const { label, row, print, web } of picked) {
  const base = `${slug(row.title) || 'work'}-${row.id}`;
  const [printFile, webFile] = await Promise.all([getBuffer(print.url), getBuffer(web.url)]);
  const printInfo = imageInfo(printFile.buffer), webInfo = imageInfo(webFile.buffer);
  if (!printInfo || printInfo.format !== 'JPEG' || Math.max(printInfo.width, printInfo.height) < MIN_LONG_EDGE) { console.warn('skip (decode/size)', row.id); continue; }
  if (!webInfo) { console.warn('skip (web decode)', row.id); continue; }
  await writeFile(path.join(ROOT, 'public', PACK_DIR, `${base}-print.jpg`), printFile.buffer);
  await writeFile(path.join(ROOT, 'public', PACK_DIR, `${base}-web.jpg`), webFile.buffer);
  const artist = row.creators?.[0]?.description?.replace(/\s*\(.*$/, '') || undefined;
  const kind = label === 'poster' || label === 'travel' || label === 'advertisement' || /poster/i.test(row.title) ? 'poster' : 'artwork';
  const typeLabel = kind === 'poster' ? 'Poster' : (row.type || 'Artwork');
  const printUrl = `${PACK_DIR}/${base}-print.jpg`, webUrl = `${PACK_DIR}/${base}-web.jpg`;
  assets.push({
    id: `art:cleveland:${row.id}`, category: 'art', title: row.title, subtitle: `${typeLabel} · ${row.creation_date || ''}`.replace(/ · $/, ''),
    artist, year: row.creation_date || undefined, kind, source: 'Cleveland Museum of Art', sourceUrl: row.url,
    previewUrl: webUrl, imageUrl: printUrl, sdDownloadUrl: webUrl, downloadUrl: printUrl, hdDownloadUrls: [printUrl, webUrl],
    originalWidth: printInfo.width, originalHeight: printInfo.height, fileBytes: printFile.buffer.length, fileFormat: 'JPEG', sha256: sha256(printFile.buffer),
    previewWidth: webInfo.width, previewHeight: webInfo.height, previewBytes: webFile.buffer.length, previewSha256: sha256(webFile.buffer),
    rights: 'open-license', licenseLabel: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    rightsEvidenceUrl: `https://openaccess-api.clevelandart.org/api/artworks/${row.id}`, attribution: 'Cleveland Museum of Art, Open Access, CC0',
    tags: TAGS[label] || [label], packId: 'museum-cc0-01', sourceId: 'cleveland-cc0', rightsStatus: 'cc0', mirrored: true, upstreamRevision: row.updated_at || revision, checkedAt: revision,
  });
  console.log('ok', row.id, `${printInfo.width}x${printInfo.height}`, (printFile.buffer.length / 1e6).toFixed(2) + 'MB', row.title);
}
await writeFile(MANIFEST, JSON.stringify({ ...existing, schemaVersion: 2, generatedAt: revision, assets: [...kept, ...assets] }, null, 2) + '\n');
console.log('manifest updated:', kept.length, 'kept +', assets.length, 'new');
