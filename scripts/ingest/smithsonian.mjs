// Mirror selected Smithsonian Open Access images. The public S3 bucket needs no key; every record carries its own
// `metadata_usage.access`, and so does every media item. Only records AND images flagged CC0 are taken.
// A fixed sample of shards per unit keeps the download bounded (each shard is about 1 MB of JSON lines).
// Usage: node scripts/ingest/smithsonian.mjs [--dry]
import { getJson, getText } from '../lib/net.mjs';
import { assetRecord, dropPack, fetchBuffer, mirrorProcessed, readManifest, slug, writeManifest } from '../lib/mirror.mjs';

const BUCKET = 'https://smithsonian-open-access.s3-us-west-2.amazonaws.com/metadata/edan';
const PACK = 'smithsonian-cc0-01', PACK_DIR = `offline/packs/${PACK}`, SHARDS_PER_UNIT = 14;
const UNITS = {
  chndm: { name: 'Cooper Hewitt, Smithsonian Design Museum', types: /poster|advertis|graphic design|wallcovering/i, cap: 8, shards: 28 },
  nmah: { name: 'National Museum of American History', types: /poster|lithograph|broadside|trade card|advertis/i, cap: 6, shards: 24 },
  saam: { name: 'Smithsonian American Art Museum', types: /painting|print|poster/i, cap: 6 },
  fsg: { name: 'Freer Gallery of Art and Arthur M. Sackler Gallery', types: /print|painting|woodblock|album|scroll/i, cap: 6 },
};
// Generic titles say nothing to a reader, and these object kinds are records of things rather than pictures.
const GENERIC_TITLE = /^(print|bound print|untitled|drawing|textile|label|photograph|plate).?$/i, NOT_A_PICTURE = /patent|prescription|model|specimen|instrument/i;
const text = value => String(value || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const dry = process.argv.includes('--dry');
const manifest = await readManifest();
const kept = manifest.assets.filter(asset => asset.packId !== PACK);
const taken = new Set(kept.map(asset => asset.id));
if (!dry) await dropPack(PACK_DIR);
const assets = [];
for (const [unit, spec] of Object.entries(UNITS)) {
  const files = (await getText(`${BUCKET}/${unit}/index.txt`)).split(/\r?\n/).filter(Boolean);
  const wanted = spec.shards || SHARDS_PER_UNIT, step = Math.max(1, Math.floor(files.length / wanted)), sample = files.filter((_, i) => i % step === 0).slice(0, wanted);
  let count = 0;
  for (const file of sample) {
    if (count >= spec.cap) break;
    const lines = (await getText(file, { timeoutMs: 90_000 })).split('\n').filter(Boolean);
    for (const line of lines) {
      if (count >= spec.cap) break;
      let record; try { record = JSON.parse(line); } catch { continue; }
      const d = record.content?.descriptiveNonRepeating || {}, structured = record.content?.indexedStructured || {}, free = record.content?.freetext || {};
      const media = (d.online_media?.media || []).find(m => m.type === 'Images' && m.usage?.access === 'CC0' && m.idsId);
      if (d.metadata_usage?.access !== 'CC0' || !media) continue;
      const types = [...(structured.object_type || []), ...(free.objectType || []).map(o => o.content)].join(' ');
      if (!spec.types.test(types) && !/poster/i.test(record.title || '')) continue;
      const jpeg = (media.resources || []).find(r => /high-resolution jpeg/i.test(r.label));
      if (!jpeg || Math.max(jpeg.width || 0, jpeg.height || 0) < 1400) continue;
      const id = `art:si:${unit}:${slug(media.idsId)}`;
      if (taken.has(id) || !(d.record_link || d.guid || record.url)) continue;
      const title = text(record.title).slice(0, 140) || 'Untitled';
      if (GENERIC_TITLE.test(title) || NOT_A_PICTURE.test(`${title} ${types}`)) continue;
      if (dry) { console.log('would take', unit, `${jpeg.width}x${jpeg.height}`, types.slice(0, 30), '|', title.slice(0, 60)); taken.add(id); count++; continue; }
      const input = await fetchBuffer(`${media.content}&max=3000`).catch(() => null);
      const pair = input && await mirrorProcessed({ input, packDir: PACK_DIR, base: `${unit}-${slug(title) || 'work'}-${slug(media.idsId).slice(-18)}`, sourceSize: { width: jpeg.width, height: jpeg.height } });
      if (!pair) continue;
      taken.add(id); count++;
      const page = d.record_link || d.guid || (record.url ? 'https://collections.si.edu/search/detail/' + record.url : ''); // some units (nmah) have no record_link; the ark guid resolves to the object page
      const poster = /poster/i.test(`${title} ${types}`), artist = text((free.name || [])[0]?.content).slice(0, 120) || undefined, date = text((free.date || [])[0]?.content) || undefined;
      assets.push(assetRecord({
        id, category: 'art', title, subtitle: `${poster ? 'Poster' : text(types.split(' ')[0]) || 'Artwork'}${date ? ' · ' + date : ''}`, artist, year: date, kind: poster ? 'poster' : 'artwork',
        source: spec.name, sourceUrl: page, sourceId: 'smithsonian', packId: PACK, tags: [unit],
        rights: { status: 'cc0', label: 'CC0', url: 'https://creativecommons.org/publicdomain/zero/1.0/', evidence: page, attribution: `${spec.name}, Smithsonian Open Access, CC0` },
        pair,
      }));
      console.log('ok', unit, `${pair.fields.upstreamWidth}x${pair.fields.upstreamHeight} -> ${pair.fields.originalWidth}x${pair.fields.originalHeight}`, (pair.fields.fileBytes / 1e3).toFixed(0) + 'KB', title.slice(0, 55));
    }
  }
  console.log(unit.padEnd(6), 'taken', count, '/', spec.cap);
}
if (!dry) { await writeManifest(manifest, [...kept, ...assets]); console.log('manifest updated:', kept.length, 'kept +', assets.length, 'new'); }
