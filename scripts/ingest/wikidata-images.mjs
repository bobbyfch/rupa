// Mirror a few freely licensed Commons images that Wikidata links for each collection (posters, covers, boxes).
// Every file is judged on its own Commons record: Public domain or CC0 only (no BY / SA duties), no Restrictions note.
// Reads public/offline/index/wd-*.json, so run scripts/ingest/wikidata.mjs first.
// Usage: node scripts/ingest/wikidata-images.mjs [--dry]
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { getJson } from '../lib/net.mjs';
import { ROOT, downloadPair, readManifest, slug, today, writeManifest } from '../lib/mirror.mjs';

const API = 'https://commons.wikimedia.org/w/api.php';
const PACK = 'wikidata-commons-01', PACK_DIR = `offline/packs/${PACK}`, MIN_EDGE = 1200, MAX_BYTES = 3_300_000, BUDGET = 24_000_000, SCAN = 120;
// Only files that are the work's own poster or cover are mirrored. A dry run showed why: Commons also tags album covers such as Abbey Road,
// logos and unrelated photos (a DeLorean standing in for a film) as public domain, so a licence label alone is not evidence the image is the work.
const CAPS = { movies: 6, comics: 2, physicalmedia: 2 };
const OWN_ARTWORK = { movies: /poster/i, physicalmedia: /poster/i, comics: /cover/i };
const OK_LICENSE = /^(public domain|pd[- ]|cc0|cc-zero)/i;
const text = html => String(html || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const dry = process.argv.includes('--dry');
const manifest = await readManifest();
const kept = manifest.assets.filter(asset => asset.packId !== PACK);
const taken = new Set(kept.map(asset => asset.id));
if (!dry) await rm(path.join(ROOT, 'public', PACK_DIR), { recursive: true, force: true }); // reruns replace the whole pack
const assets = [];
let bytes = 0;
for (const [category, cap] of Object.entries(CAPS)) {
  if (!cap) continue;
  const shard = JSON.parse(await readFile(path.join(ROOT, 'public/offline/index', `wd-${category}.json`), 'utf8'));
  const rows = shard.rows.filter(row => row[3]).slice(0, SCAN), byTitle = new Map(rows.map(row => ['File:' + row[3], row]));
  let count = 0;
  for (let start = 0; start < rows.length && count < cap; start += 40) {
    const titles = rows.slice(start, start + 40).map(row => 'File:' + row[3]);
    const params = new URLSearchParams({ action: 'query', titles: titles.join('|'), prop: 'imageinfo', format: 'json', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '900', iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist|Restrictions' });
    const data = await getJson(`${API}?${params}`);
    const pages = Object.values(data.query?.pages || {}).filter(page => page.imageinfo);
    const normalized = new Map((data.query?.normalized || []).map(entry => [entry.to, entry.from]));
    for (const page of pages) {
      if (count >= cap || bytes > BUDGET) break;
      const info = page.imageinfo[0], meta = info.extmetadata || {}, license = text(meta.LicenseShortName?.value);
      const row = byTitle.get(normalized.get(page.title) || page.title) || byTitle.get(page.title);
      const id = `${category}:commons:${page.pageid}`;
      if (!row || !OWN_ARTWORK[category].test(row[3]) || taken.has(id) || info.mime !== 'image/jpeg' || Math.max(info.width, info.height) < MIN_EDGE || info.size > MAX_BYTES) continue;
      if (!OK_LICENSE.test(license) || text(meta.Restrictions?.value)) continue;
      const poster = category === 'movies' || category === 'physicalmedia';
      const base = { id, category, title: row[1], subtitle: `${[row[2] || '', poster ? 'Poster' : 'Commons image'].filter(Boolean).join(' · ')}`, year: row[2] ? String(row[2]) : undefined, kind: poster ? 'poster' : 'artwork', source: 'Wikimedia Commons', sourceUrl: info.descriptionurl };
      if (dry) { console.log('would take', category, license, `${info.width}x${info.height}`, (info.size / 1e6).toFixed(2) + 'MB', row[1], '<-', row[3]); taken.add(id); count++; bytes += info.size; continue; }
      const pair = await downloadPair({ printUrl: info.url.split('?')[0], previewUrl: info.thumburl, packDir: PACK_DIR, base: `${slug(row[1]) || 'file'}-${page.pageid}`, minLongEdge: MIN_EDGE });
      if (!pair) continue;
      taken.add(id); count++; bytes += info.size;
      const artist = text(meta.Artist?.value).slice(0, 120) || undefined;
      assets.push({
        ...base, artist, ...pair.fields, rights: 'open-license', rightsStatus: /^cc0|^cc-zero/i.test(license) ? 'cc0' : 'public-domain', licenseLabel: license,
        licenseUrl: text(meta.LicenseUrl?.value) || 'https://commons.wikimedia.org/wiki/Commons:Licensing', rightsEvidenceUrl: info.descriptionurl,
        attribution: `${artist ? artist + ', ' : ''}via Wikimedia Commons (${license})`,
        rightsNote: 'Commons records this file as public domain (a US poster or cover published without notice or not renewed). Check the file page, and local law outside the US.', tags: [category], externalId: `wikidata:${row[0]}`,
        packId: PACK, sourceId: 'commons', mirrored: true, upstreamRevision: today(), checkedAt: today(),
      });
      console.log('ok', category, license, `${pair.fields.originalWidth}x${pair.fields.originalHeight}`, (pair.fields.fileBytes / 1e6).toFixed(2) + 'MB', row[1]);
    }
  }
  console.log(category.padEnd(14), 'taken', count, '/', cap);
}
if (!dry) { await writeManifest(manifest, [...kept, ...assets]); console.log('manifest updated:', kept.length, 'kept +', assets.length, 'new'); }
