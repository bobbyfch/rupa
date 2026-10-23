// Mirror posters and prints from the Wellcome Collection that are CC0 or Public Domain Mark (no key; IIIF originals).
// Each image is judged from its own `locations[].license.id`: only `cc-0` and `pdm`. CC BY and others are never taken.
// Usage: node scripts/ingest/wellcome.mjs [--dry]
import { getJson } from '../lib/net.mjs';
import { assetRecord, dropPack, fetchBuffer, mirrorProcessed, readManifest, slug, writeManifest } from '../lib/mirror.mjs';

const API = 'https://api.wellcomecollection.org/catalogue/v2/images';
const PACK = 'wellcome-open-01', PACK_DIR = `offline/packs/${PACK}`;
const QUERIES = [['poster', 'poster', 14], ['advertisement', 'advertisement', 8], ['woodcut', 'woodcut', 5], ['lithograph', 'lithograph', 5], ['broadside', 'broadside', 3]];
const LICENSES = { 'cc-0': 'cc0', pdm: 'public-domain' };
// Keyword hits such as "four-poster bed" are furniture, not posters.
const NOT_A_POSTER = /four[- ]poster|poster bed|bedstead/i;
const dry = process.argv.includes('--dry');
const manifest = await readManifest();
const kept = manifest.assets.filter(asset => asset.packId !== PACK);
const taken = new Set(kept.map(asset => asset.id));
if (!dry) await dropPack(PACK_DIR);
const assets = [];
for (const [label, query, cap] of QUERIES) {
  const data = await getJson(`${API}?${new URLSearchParams({ query, 'locations.license': 'cc-0,pdm', pageSize: '60', include: 'source.contributors' })}`);
  let count = 0;
  for (const result of data.results || []) {
    if (count >= cap) break;
    const location = (result.locations || []).find(loc => loc.locationType?.id === 'iiif-image' && LICENSES[loc.license?.id]);
    const imageId = location?.url.match(/\/image\/([^/]+)\/info\.json$/)?.[1], title = result.source?.title?.trim();
    const id = `art:wellcome:${result.id}`;
    if (!location || !imageId || !title || taken.has(id) || NOT_A_POSTER.test(title)) continue;
    const info = await getJson(location.url, { retries: 2 }).catch(() => null);
    if (!info || Math.max(info.width, info.height) < 1400) continue;
    const workId = result.source?.id, page = workId ? `https://wellcomecollection.org/works/${workId}/images?id=${result.id}` : 'https://wellcomecollection.org/collections';
    if (dry) { console.log('would take', LICENSES[location.license.id], `${info.width}x${info.height}`, title.slice(0, 70)); taken.add(id); count++; continue; }
    const input = await fetchBuffer(`https://iiif.wellcomecollection.org/image/${imageId}/full/!3000,3000/0/default.jpg`).catch(() => null);
    const pair = input && await mirrorProcessed({ input, packDir: PACK_DIR, base: `${slug(title) || 'work'}-${result.id}`, sourceSize: { width: info.width, height: info.height } });
    if (!pair) continue;
    taken.add(id); count++;
    const contributors = (result.source?.contributors || []).map(c => c.agent?.label).filter(Boolean).slice(0, 2).join(', ') || undefined;
    assets.push(assetRecord({
      id, category: 'art', title: title.replace(/\s+/g, ' ').slice(0, 140), subtitle: `${/poster/i.test(title) ? 'Poster' : 'Print'} · Wellcome Collection`, artist: contributors, kind: /poster/i.test(title) ? 'poster' : 'artwork',
      source: 'Wellcome Collection', sourceUrl: page, sourceId: 'wellcome', packId: PACK, tags: [label],
      rights: { status: LICENSES[location.license.id], label: location.license.label, url: location.license.url, evidence: page, attribution: `Wellcome Collection, ${location.license.label}`, note: 'Licence read from the Wellcome catalogue record of this image.' },
      pair,
    }));
    console.log('ok', LICENSES[location.license.id], `${pair.fields.upstreamWidth}x${pair.fields.upstreamHeight} -> ${pair.fields.originalWidth}x${pair.fields.originalHeight}`, (pair.fields.fileBytes / 1e3).toFixed(0) + 'KB', title.slice(0, 60));
  }
  console.log(label, 'taken', count);
}
if (!dry) { await writeManifest(manifest, [...kept, ...assets]); console.log('manifest updated:', kept.length, 'kept +', assets.length, 'new'); }
