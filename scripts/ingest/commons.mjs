// Mirror a few Wikimedia Commons poster files whose own licence template is Public domain or CC0 (no BY / SA duties).
// Every file is judged from its extmetadata, never from the category name. Files with a Restrictions note are skipped.
// Usage: node scripts/ingest/commons.mjs [--dry]
import { getJson } from '../lib/net.mjs';
import { downloadPair, LIMITS, readManifest, slug, today, writeManifest } from '../lib/mirror.mjs';

const API = 'https://commons.wikimedia.org/w/api.php';
const PACK = 'commons-pd-01', PACK_DIR = `offline/packs/${PACK}`, CAP = 8;
const CATEGORIES = { 'Art_Nouveau_posters': ['art nouveau', 'poster'], 'Posters_by_Henri_de_Toulouse-Lautrec': ['toulouse-lautrec', 'poster'] };
const OK_LICENSE = /^(public domain|pd[- ]|cc0|cc-zero)/i;
const text = html => String(html || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const dry = process.argv.includes('--dry');
const manifest = await readManifest();
const kept = manifest.assets.filter(asset => asset.packId !== PACK);
const taken = new Set(kept.map(asset => asset.id));
const assets = [];
for (const [category, tags] of Object.entries(CATEGORIES)) {
  const params = new URLSearchParams({
    action: 'query', generator: 'categorymembers', gcmtitle: `Category:${category}`, gcmtype: 'file', gcmlimit: '50', prop: 'imageinfo', format: 'json',
    iiprop: 'url|size|mime|extmetadata', iiurlwidth: '900', iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist|Credit|ObjectName|DateTimeOriginal|Restrictions|ImageDescription',
  });
  const data = await getJson(`${API}?${params}`);
  for (const page of Object.values(data.query?.pages || {})) {
    if (assets.length >= CAP) break;
    const info = page.imageinfo?.[0], meta = info?.extmetadata || {}, id = `art:commons:${page.pageid}`;
    if (!info || taken.has(id) || info.mime !== 'image/jpeg' || Math.max(info.width, info.height) < LIMITS.minLongEdge || info.size > LIMITS.maxPrintBytes) continue;
    const license = text(meta.LicenseShortName?.value);
    if (!OK_LICENSE.test(license) || text(meta.Restrictions?.value)) continue;
    const title = text(meta.ObjectName?.value) || page.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '');
    const artist = text(meta.Artist?.value).slice(0, 120) || undefined;
    if (dry) { console.log('would take', page.pageid, license, `${info.width}x${info.height}`, (info.size / 1e6).toFixed(2) + 'MB', title); taken.add(id); assets.push({}); continue; }
    const pair = await downloadPair({ printUrl: info.url.split('?')[0], previewUrl: info.thumburl, packDir: PACK_DIR, base: `${slug(title) || 'file'}-${page.pageid}` });
    if (!pair) continue;
    taken.add(id);
    const page_url = info.descriptionurl;
    assets.push({
      id, category: 'art', title, subtitle: `Poster · ${text(meta.DateTimeOriginal?.value) || 'Wikimedia Commons'}`.replace(/ · $/, ''), artist, year: text(meta.DateTimeOriginal?.value) || undefined, kind: 'poster',
      source: 'Wikimedia Commons', sourceUrl: page_url, ...pair.fields,
      rights: 'open-license', rightsStatus: /^cc0|^cc-zero/i.test(license) ? 'cc0' : 'public-domain', licenseLabel: license, licenseUrl: text(meta.LicenseUrl?.value) || 'https://commons.wikimedia.org/wiki/Commons:Licensing',
      rightsEvidenceUrl: page_url, attribution: `${artist ? artist + ', ' : ''}via Wikimedia Commons (${license})`,
      tags, packId: PACK, sourceId: 'commons', mirrored: true, upstreamRevision: today(), checkedAt: today(),
    });
    console.log('ok', page.pageid, license, `${pair.fields.originalWidth}x${pair.fields.originalHeight}`, (pair.fields.fileBytes / 1e6).toFixed(2) + 'MB', title);
  }
}
if (!dry) { await writeManifest(manifest, [...kept, ...assets]); console.log('manifest updated:', kept.length, 'kept +', assets.length, 'new'); }
else console.log('candidates', assets.length);
