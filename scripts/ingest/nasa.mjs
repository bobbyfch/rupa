// Mirror NASA posters from the NASA Image and Video Library (no key). NASA content is generally not subject to copyright in the US
// (https://www.nasa.gov/nasa-brand-center/images-and-media/); credit NASA, never imply endorsement. Only items whose own title says poster are taken.
// Usage: node scripts/ingest/nasa.mjs [--dry]
import { getJson } from '../lib/net.mjs';
import { assetRecord, contentLength, dropPack, fetchBuffer, mirrorProcessed, readManifest, slug, writeManifest } from '../lib/mirror.mjs';

const PACK = 'nasa-posters-01', PACK_DIR = `offline/packs/${PACK}`, MAX_ORIGINAL_BYTES = 30_000_000;
const QUERIES = [['visions of the future', 'visions of the future poster', 4], ['exoplanet travel', 'exoplanet travel poster', 3], ['mission posters', 'mission art poster', 4], ['earth day', 'earth day poster', 2], ['apollo', 'apollo poster', 3], ['mars', 'mars poster', 3], ['hubble', 'hubble poster', 2], ['space travel', 'space exploration poster', 3]];
// Photos of a food-drive can sculpture contest are not posters or artwork, even when their title says poster competition.
const NOT_A_POSTER = /feed families|competition|exhibit|display/i;
const dry = process.argv.includes('--dry');
const manifest = await readManifest();
const kept = manifest.assets.filter(asset => asset.packId !== PACK);
const taken = new Set(kept.map(asset => asset.id));
if (!dry) await dropPack(PACK_DIR);
const assets = [];
for (const [label, query, cap] of QUERIES) {
  const data = await getJson(`https://images-api.nasa.gov/search?${new URLSearchParams({ q: query, media_type: 'image', page_size: '60' })}`);
  let count = 0;
  for (const item of data.collection?.items || []) {
    if (count >= cap) break;
    const meta = item.data?.[0];
    if (!meta || !/poster/i.test(meta.title || '') || NOT_A_POSTER.test(meta.title) || taken.has(`art:nasa:${meta.nasa_id}`)) continue;
    const assetList = await getJson(`https://images-api.nasa.gov/asset/${encodeURIComponent(meta.nasa_id)}`).catch(() => null);
    const hrefs = (assetList?.collection?.items || []).map(entry => entry.href.replace(/^http:/, 'https:'));
    const original = hrefs.find(href => /~orig\.jpg$/i.test(href)), large = hrefs.find(href => /~large\.jpg$/i.test(href));
    let url = original; const size = original ? await contentLength(original).catch(() => 0) : 0;
    if (!original || !size || size > MAX_ORIGINAL_BYTES) url = large;
    if (!url) continue;
    const id = `art:nasa:${meta.nasa_id}`, page = `https://images.nasa.gov/details/${encodeURIComponent(meta.nasa_id)}`;
    if (dry) { console.log('would take', meta.center, (size / 1e6).toFixed(1) + 'MB', meta.title.slice(0, 70)); taken.add(id); count++; continue; }
    const input = await fetchBuffer(url).catch(() => null);
    const pair = input && await mirrorProcessed({ input, packDir: PACK_DIR, base: `${slug(meta.title).slice(0, 30) || "poster"}-${slug(meta.nasa_id)}` });
    if (!pair) continue;
    taken.add(id); count++;
    const creator = meta.secondary_creator || meta.photographer || undefined;
    assets.push(assetRecord({
      id, category: 'art', title: meta.title.replace(/\s+/g, ' ').slice(0, 140), subtitle: `Poster · NASA ${meta.center || ''}`.trim(), artist: creator, year: (meta.date_created || '').slice(0, 4) || undefined, kind: 'poster',
      source: 'NASA Image and Video Library', sourceUrl: page, sourceId: 'nasa-posters', packId: PACK, tags: [label, 'nasa', 'space'],
      rights: { status: 'public-domain', label: 'NASA media usage guidelines (generally not copyrighted in the US)', url: 'https://www.nasa.gov/nasa-brand-center/images-and-media/', evidence: page, attribution: `NASA${creator ? ' / ' + creator : ''}`, note: 'NASA content is generally not subject to copyright in the US. Credit NASA, do not imply endorsement; logos and likenesses carry extra rules.' },
      pair,
    }));
    console.log('ok', `${pair.fields.upstreamWidth}x${pair.fields.upstreamHeight} -> ${pair.fields.originalWidth}x${pair.fields.originalHeight}`, (pair.fields.fileBytes / 1e3).toFixed(0) + 'KB', meta.title.slice(0, 60));
  }
  console.log(label, 'taken', count);
}
if (!dry) { await writeManifest(manifest, [...kept, ...assets]); console.log('manifest updated:', kept.length, 'kept +', assets.length, 'new'); }
