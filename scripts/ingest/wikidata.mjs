// Offline title indexes from Wikidata (CC0 data, no key) for categories that have no open image archive of their own.
// Each shard lists the most widely documented items of a class with labels in en/ja/zh/ko/id, a year and, when Wikidata
// links one, the Commons file name (Commons only hosts freely licensed files; each file keeps its own licence page).
// Usage: node scripts/ingest/wikidata.mjs [category ...]
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getJson } from '../lib/net.mjs';

const OUT = path.resolve(import.meta.dirname, '../../public/offline/index');
const ENDPOINT = 'https://query.wikidata.org/sparql';
// category -> [Wikidata classes (instance of), image property order, row limit, optional extra triple pattern]
const CATEGORIES = {
  movies: { classes: ['Q11424', 'Q202866', 'Q29168811', 'Q20650540'], images: ['P3383', 'P18'], limit: 2500 },
  tv: { classes: ['Q5398426', 'Q63952888'], images: ['P154', 'P18'], limit: 1500 },
  music: { classes: ['Q482994', 'Q208569', 'Q169930'], images: ['P18'], limit: 2200 },
  musicvideos: { classes: ['Q193977'], images: ['P18'], limit: 700 },
  books: { classes: ['Q8261', 'Q7725634'], images: ['P18'], limit: 1800 },
  manga: { classes: ['Q21198342'], images: ['P18'], limit: 1400 },
  webtoons: { classes: ['Q7978994', 'Q213369'], images: ['P154', 'P18'], limit: 800 },
  comics: { classes: ['Q14406742'], images: ['P18'], limit: 1000, minus: 'wd:Q21198342' },
  boardgames: { classes: ['Q131436', 'Q3244175'], images: ['P18'], limit: 1200 },
  magazines: { classes: ['Q41298'], images: ['P18', 'P154'], limit: 1400 },
  podcasts: { classes: ['Q24634210'], images: ['P154', 'P18'], limit: 700 },
  apps: { classes: ['Q620615'], images: ['P154', 'P18'], limit: 800 },
  // Films released by The Criterion Collection (Q1204187): the physical-edition collector world.
  physicalmedia: { classes: ['Q11424'], images: ['P3383', 'P18'], limit: 1200, extra: '?i wdt:P750 wd:Q1204187 .' },
};
const wanted = process.argv.slice(2).filter(arg => CATEGORIES[arg]);
const names = wanted.length ? wanted : Object.keys(CATEGORIES);

// Stage 1 is a cheap ranked list; stage 2 adds labels, dates and images for a batch of ids (one big OPTIONAL query times out).
// One query per class: a VALUES list over several classes made the ranked query time out (HTTP 504).
function rankQuery(spec, cls) {
  return 'SELECT ?i ?sl ?en WHERE { ?i wdt:P31 wd:' + cls + ' ; wikibase:sitelinks ?sl . ' + (spec.extra || '') + ' ' + (spec.minus ? 'MINUS { ?i wdt:P31 ' + spec.minus + ' }' : '') + ' ?i rdfs:label ?en FILTER(LANG(?en) = "en") } ORDER BY DESC(?sl) LIMIT ' + spec.limit;
}
function detailQuery(spec, ids) {
  const img = spec.images.map(p => 'wdt:' + p).join('|');
  return 'SELECT ?i ?kind ?v WHERE { VALUES ?i { ' + ids.map(id => 'wd:' + id).join(' ') + ' } { ?i rdfs:label ?v FILTER(LANG(?v) IN ("ja","zh","ko","id","zh-hans","zh-hant")) BIND("alt" AS ?kind) } UNION { ?i wdt:P577 ?v BIND("date" AS ?kind) } UNION { ?i wdt:P571 ?v BIND("date" AS ?kind) } UNION { ?i ' + img + ' ?v BIND("img" AS ?kind) } }';
}
async function sparql(text) {
  return getJson(ENDPOINT + '?format=json&query=' + encodeURIComponent(text), { timeoutMs: 120_000, retries: 3, headers: { Accept: 'application/sparql-results+json' } });
}
// Commons' Special:FilePath host sets third-party cookies, so the app links upload.wikimedia.org directly.
// That path needs the md5 prefix of the file name and the original width (a thumbnail may not be larger than the file).
const SUPPORTED = /[.](jpe?g|png|gif|webp|svg|tiff?)$/i;
const md5Prefix = file => createHash('md5').update(file.replace(/ /g, '_')).digest('hex').slice(0, 2);
async function commonsWidths(files) {
  const widths = new Map();
  for (let start = 0; start < files.length; start += 50) {
    const titles = files.slice(start, start + 50).map(file => 'File:' + file);
    const data = await getJson('https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({ action: 'query', titles: titles.join('|'), prop: 'imageinfo', iiprop: 'size', format: 'json' }), { retries: 3 });
    const fromNormalized = new Map((data.query?.normalized || []).map(entry => [entry.to, entry.from]));
    for (const page of Object.values(data.query?.pages || {})) {
      const info = page.imageinfo?.[0];
      if (info) widths.set((fromNormalized.get(page.title) || page.title).replace(/^File:/, ''), info.width);
    }
  }
  return widths;
}
const fileName = url => decodeURIComponent(url.split('/Special:FilePath/')[1] || '').replace(/_/g, ' ');

await mkdir(OUT, { recursive: true });
const day = new Date().toISOString().slice(0, 10);
for (const name of names) {
  const spec = CATEGORIES[name];
  const byId = new Map();
  for (const cls of spec.classes) {
    const ranked = await sparql(rankQuery(spec, cls));
    for (const row of ranked.results.bindings) {
      const qid = row.i.value.split('/').pop();
      if (!byId.has(qid) && Number(row.sl.value) > 2) byId.set(qid, { qid, sl: Number(row.sl.value), en: row.en.value, alts: new Set(), year: 0, img: '' });
    }
  }
  for (const qid of [...byId.keys()].sort((x, y) => byId.get(y).sl - byId.get(x).sl).slice(spec.limit)) byId.delete(qid);
  const ids = [...byId.keys()];
  for (let start = 0; start < ids.length; start += 150) {
    const data = await sparql(detailQuery(spec, ids.slice(start, start + 150)));
    for (const row of data.results.bindings) {
      const entry = byId.get(row.i.value.split('/').pop());
      if (!entry) continue;
      const value = row.v.value;
      if (row.kind.value === 'alt') { if (value !== entry.en) entry.alts.add(value); }
      else if (row.kind.value === 'date') { const year = Number(value.match(/^-?[0-9]{4}/)?.[0]); if (year && (!entry.year || year < entry.year)) entry.year = year; }
      else if (!entry.img && value.includes('/Special:FilePath/')) entry.img = fileName(value);
    }
  }
  const imaged = [...byId.values()].filter(e => e.img && SUPPORTED.test(e.img));
  const widths = await commonsWidths(imaged.map(e => e.img));
  for (const entry of byId.values()) { const width = widths.get(entry.img); if (!entry.img || !SUPPORTED.test(entry.img) || !width) { entry.img = ''; entry.w = 0; } else entry.w = width; }
  const rows = [...byId.values()].filter(e => !/^Q\d+$/.test(e.en)).sort((a, b) => b.sl - a.sl).map(e => [e.qid, e.en, e.year || 0, e.img, [...e.alts].slice(0, 4), e.w, e.img ? md5Prefix(e.img) : '']);
  await writeFile(path.join(OUT, `wd-${name}.json`), JSON.stringify({
    schemaVersion: 1, kind: 'wikidata', category: name, generatedAt: day,
    source: { id: 'wikidata', url: 'https://www.wikidata.org/', classes: spec.classes, license: 'CC0 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/' },
    rights: 'reference-only', rightsNote: 'Wikidata statements are CC0. Image names point to Wikimedia Commons files, each with its own licence page; RUPA loads them from upload.wikimedia.org (no cookies) and does not copy them here.',
    entityBase: 'https://www.wikidata.org/wiki/', imageBase: 'https://upload.wikimedia.org/wikipedia/commons/',
    columns: ['qid', 'title', 'year', 'commonsFile', 'aliases', 'imageWidth', 'md5Prefix'], rows,
  }));
  console.log(name.padEnd(14), 'rows', String(rows.length).padStart(5), 'with image', String(rows.filter(r => r[3]).length).padStart(4), 'with ja/zh/ko/id alias', rows.filter(r => r[4].length).length);
}
