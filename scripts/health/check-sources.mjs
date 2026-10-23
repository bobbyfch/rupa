// Live, measured source health (no keys): registry probes, mirrored-asset license recheck and image-size samples per index shard.
// Writes data/checks/source-health.json. Run: node scripts/health/check-sources.mjs [--samples 10]
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { request } from '../lib/net.mjs';
import { imageInfo } from '../lib/imageinfo.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const read = async file => JSON.parse(await readFile(path.join(ROOT, file), 'utf8'));
const samples = Number(process.argv[process.argv.indexOf('--samples') + 1]) || 10;
const median = values => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null; };
const pool = async (items, size, worker) => { const out = []; let next = 0; await Promise.all(Array.from({ length: size }, async () => { while (next < items.length) { const i = next++; out[i] = await worker(items[i], i); } })); return out; };

async function probe(source) {
  const started = Date.now();
  try {
    const response = await request(source.probe.url, { retries: 1, timeoutMs: 25_000, headers: { Accept: source.probe.expect === 'json' ? 'application/json' : '*/*' } });
    const type = (response.headers.get('content-type') || '').split(';')[0];
    let valid = response.ok;
    if (response.ok && source.probe.expect === 'json') { try { JSON.parse(await response.text()); } catch { valid = false; } }
    if (response.ok && source.probe.expect === 'image') valid = type.startsWith('image/');
    return { id: source.id, url: source.probe.url, status: response.status, ok: valid, contentType: type, ms: Date.now() - started };
  } catch (error) { return { id: source.id, url: source.probe.url, status: 0, ok: false, error: String(error.message || error).slice(0, 120), ms: Date.now() - started }; }
}

async function imageSample(url) {
  try {
    const response = await request(url, { retries: 1, timeoutMs: 25_000, headers: { Range: 'bytes=0-98303' } });
    if (!response.ok && response.status !== 206) return { url, status: response.status, ok: false };
    const buffer = Buffer.from(await response.arrayBuffer()), info = imageInfo(buffer);
    const total = Number((response.headers.get('content-range') || '').split('/')[1]) || Number(response.headers.get('content-length')) || buffer.length;
    return { url, status: response.status, ok: Boolean(info), width: info?.width, height: info?.height, bytes: total, format: info?.format };
  } catch (error) { return { url, status: 0, ok: false, error: String(error.message || error).slice(0, 100) }; }
}
const pick = (rows, count) => rows.length <= count ? rows : Array.from({ length: count }, (_, i) => rows[Math.floor((i + 0.5) * rows.length / count)]);
const summarize = list => {
  const good = list.filter(sample => sample.ok && sample.width);
  return {
    sampled: list.length, ok: good.length, failed: list.length - good.length, failedStatuses: [...new Set(list.filter(s => !s.ok).map(s => s.status))],
    medianLongEdgePx: median(good.map(s => Math.max(s.width, s.height))), minLongEdgePx: good.length ? Math.min(...good.map(s => Math.max(s.width, s.height))) : null,
    maxLongEdgePx: good.length ? Math.max(...good.map(s => Math.max(s.width, s.height))) : null, medianBytes: median(good.map(s => s.bytes)),
    shareAtOrAbove1600px: good.length ? Number((good.filter(s => Math.max(s.width, s.height) >= 1600).length / list.length).toFixed(2)) : 0,
  };
};

const registry = await read('data/registry/sources.json');
const probes = await pool(registry.sources.filter(source => source.probe), 4, probe);

// Re-verify every mirrored Cleveland work (other sources have their own record format) against the live record: CC0 flag and print dimensions.
const art = await read('public/offline/artworks.json'), recheck = [];
await pool(art.assets.filter(asset => !asset.sourceId || asset.sourceId === 'cleveland-cc0'), 3, async asset => {
  const id = asset.id.split(':').pop();
  try {
    const response = await request(`https://openaccess-api.clevelandart.org/api/artworks/${id}`, { retries: 2 });
    const record = (await response.json()).data;
    recheck.push({ id: asset.id, license: record.share_license_status, printWidth: Number(record.images?.print?.width), printHeight: Number(record.images?.print?.height), matchesManifest: record.share_license_status === 'CC0' && Number(record.images?.print?.width) === asset.originalWidth && Number(record.images?.print?.height) === asset.originalHeight });
  } catch (error) { recheck.push({ id: asset.id, error: String(error.message).slice(0, 100), matchesManifest: false }); }
});

const shards = [];
const indexManifest = await read('public/offline/index/manifest.json');
const shardFiles = (Array.isArray(indexManifest.shards) ? indexManifest.shards : [])
  .filter(shard => shard && (shard.kind === 'games' || shard.kind === 'anime') && typeof shard.id === 'string')
  .map(shard => `${shard.id}.json`)
  .sort();
for (const file of shardFiles) {
  const shard = await read(`public/offline/index/${file}`);
  let urls;
  if (shard.kind === 'anime') urls = pick(shard.rows, samples).map(row => `${shard.imageBase}${row[5]}${shard.imageSuffix}`);
  else if (shard.platform === 'psvita') urls = pick(shard.rows, samples).map(row => `${shard.imageBase}${row[1]}.png`);
  else urls = pick(shard.rows.filter(row => row[1] & 1), samples).map(row => `${shard.imageBase}Named_Boxarts/${encodeURIComponent(row[0])}.png`);
  const list = await pool(urls, 5, imageSample);
  shards.push({ shard: file, platform: shard.platform || 'anime', indexedRows: shard.rows.length, ...summarize(list), ...(shard.serials ? { serials: summarize(await pool(pick(shard.serials.rows.filter(row => row[2] & 1), samples).map(row => `${shard.serials.imageBase}default/${row[0]}.jpg`), 5, imageSample)) } : {}) });
  console.log('sampled', file);
}

const report = { schemaVersion: 1, checkedAt: new Date().toISOString(), sampleSizePerShard: samples, note: 'Measured from the ingest machine. Ranged GET of the first 96 KiB; dimensions come from the file header. 403/429 are reported, never bypassed.', probes, mirroredAssetRecheck: recheck, shards };
await writeFile(path.join(ROOT, 'data/checks/source-health.json'), JSON.stringify(report, null, 1) + '\n');
console.log('probes ok', probes.filter(p => p.ok).length, '/', probes.length, '| mirrored recheck ok', recheck.filter(r => r.matchesManifest).length, '/', recheck.length);
for (const probeResult of probes.filter(p => !p.ok)) console.log('  not ok:', probeResult.id, probeResult.status, probeResult.error || '');
