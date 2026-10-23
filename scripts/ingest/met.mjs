// Mirror a small set of The Met Open Access works (per-object isPublicDomain == true) into public/offline/packs/met-pd-01.
// Originals above the per-file budget are skipped on purpose (many Met originals exceed 8 MB).
// Usage: node scripts/ingest/met.mjs [--dry]
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { getJson } from '../lib/net.mjs';
import { LIMITS, ROOT, contentLength, downloadPair, readManifest, slug, today, writeManifest } from '../lib/mirror.mjs';

const API = 'https://collectionapi.metmuseum.org/public/collection/v1';
const PACK = 'met-pd-01', PACK_DIR = `offline/packs/${PACK}`, BYTE_BUDGET = 30_000_000, SCAN_PER_QUERY = 70;
// [label, query, cap, title filter]. Keyword hits such as "four poster bed" are dropped by the title filter.
const POSTER = /poster|advertis|placard|affiche|playbill/i, NOT_A_POSTER = /four[- ]poster|poster bed|bedstead/i;
const QUERIES = [['poster', 'poster', 4, POSTER], ['advertisement', 'advertisement', 3, POSTER], ['toulouse-lautrec', 'Toulouse-Lautrec', 2], ['mucha', 'Mucha', 1], ['art-nouveau', 'art nouveau', 2], ['hokusai', 'Hokusai', 1], ['travel', 'travel poster', 2, POSTER]];
const TAGS = { 'art-nouveau': ['art nouveau'], mucha: ['art nouveau', 'mucha'], 'toulouse-lautrec': ['toulouse-lautrec', 'lithograph'], hokusai: ['ukiyo-e', 'japanese woodblock', 'hokusai'], travel: ['travel poster'] };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// The Met sits behind bot protection: pace requests and wait once on a 403 instead of hammering.
async function met(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleep(150);
    try { return await getJson(url, { retries: 1 }); }
    catch (error) { if (!/HTTP 403/.test(error.message) || attempt === 2) throw error; await sleep(8000 * (attempt + 1)); }
  }
}
const dry = process.argv.includes('--dry');
const manifest = await readManifest();
const kept = manifest.assets.filter(asset => asset.packId !== PACK);
const taken = new Set(kept.map(asset => asset.id));
const assets = [];
let bytes = 0;
if (!dry) await rm(path.join(ROOT, 'public', PACK_DIR), { recursive: true, force: true }); // reruns replace the whole pack, never leave orphans
for (const [label, q, cap, titleFilter] of QUERIES) {
  const search = await met(`${API.replace('/v1', '/v1.1')}/search?hasImages=true&isPublicDomain=true&q=${encodeURIComponent(q)}&limit=${SCAN_PER_QUERY}`);
  let count = 0;
  for (const id of (search.objectIDs || []).slice(0, SCAN_PER_QUERY)) {
    if (count >= cap || bytes > BYTE_BUDGET) break;
    const assetId = `art:met:${id}`;
    if (taken.has(assetId)) continue;
    let object; try { object = await met(`${API}/objects/${id}`); } catch { continue; }
    if (titleFilter && (!titleFilter.test(`${object.title} ${object.objectName}`) || NOT_A_POSTER.test(object.title))) continue;
    if (object.isPublicDomain !== true || !/\.jpe?g$/i.test(object.primaryImage || '') || !/\.jpe?g$/i.test(object.primaryImageSmall || '')) continue;
    const size = await contentLength(object.primaryImage).catch(() => 0);
    if (!size || size > LIMITS.maxPrintBytes) continue;
    if (dry) { console.log('would take', id, (size / 1e6).toFixed(2) + 'MB', object.title); taken.add(assetId); count++; bytes += size; continue; }
    const pair = await downloadPair({ printUrl: object.primaryImage, previewUrl: object.primaryImageSmall, packDir: PACK_DIR, base: `${slug(object.title) || 'work'}-${id}` });
    if (!pair) continue;
    taken.add(assetId); count++; bytes += size;
    const artist = object.artistDisplayName || undefined;
    assets.push({
      id: assetId, category: 'art', title: object.title, subtitle: `${object.classification || object.objectName || 'Artwork'} · ${object.objectDate || ''}`.replace(/ · $/, ''),
      artist, year: object.objectDate || undefined, kind: /poster|advert/i.test(`${object.title} ${object.objectName} ${object.classification}`) ? 'poster' : 'artwork',
      source: 'The Metropolitan Museum of Art', sourceUrl: object.objectURL, ...pair.fields,
      rights: 'open-license', rightsStatus: 'cc0', licenseLabel: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      rightsEvidenceUrl: `${API}/objects/${id}`, attribution: 'The Metropolitan Museum of Art, Open Access, CC0',
      tags: TAGS[label] || [label], packId: PACK, sourceId: 'met', mirrored: true, upstreamRevision: object.metadataDate || today(), checkedAt: today(),
    });
    console.log('ok', id, `${pair.fields.originalWidth}x${pair.fields.originalHeight}`, (pair.fields.fileBytes / 1e6).toFixed(2) + 'MB', object.title);
  }
  console.log(label, 'taken', count);
}
if (!dry) { await writeManifest(manifest, [...kept, ...assets]); console.log('manifest updated:', kept.length, 'kept +', assets.length, 'new'); }
