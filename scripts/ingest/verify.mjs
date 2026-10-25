// Offline data gates used by CI and tests: asset integrity, rights ledger, no ingest keys, budgets.
// Usage: node scripts/ingest/verify.mjs      (exit 1 on any error)
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { imageInfo } from '../lib/imageinfo.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const read = async file => JSON.parse(await readFile(path.join(ROOT, file), 'utf8'));
export const LIMITS = { maxFileBytes: 10_000_000, maxOfflineBytes: 230_000_000, minMirrorLongEdge: 1200 };
// Provider credentials are not allowed in offline ingest or public config.
const KEY_PATTERN = /\b(TMDB_[A-Z_]*|IGDB_[A-Z_]*|TWITCH_CLIENT_[A-Z]+|YOUTUBE_API_KEY|FANART_[A-Z_]*|TVDB_[A-Z_]*|DISCOGS_[A-Z_]*|LASTFM_[A-Z_]*|COMICVINE_[A-Z_]*|RAWG_[A-Z_]*|SCREENSCRAPER_[A-Z_]*|GOOGLE_BOOKS_API_KEY|APPLE_MUSIC_DEVELOPER_TOKEN|STEAMGRIDDB_[A-Z_]*)\b/;

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full)); else out.push(full);
  }
  return out;
}

export async function verifyAssets() {
  const errors = [];
  const art = await read('public/offline/artworks.json'), ledger = await read('data/provenance/rights-ledger.json');
  const byPath = new Map(ledger.entries.map(entry => [entry.path, entry]));
  for (const asset of art.assets) {
    for (const [role, rel, wKey, hKey, bytesKey] of [['print', asset.downloadUrl, 'originalWidth', 'originalHeight', 'fileBytes'], ['web', asset.previewUrl, 'previewWidth', 'previewHeight', 'previewBytes']]) {
      const file = path.join(ROOT, 'public', rel), entry = byPath.get(`public/${rel}`);
      let buffer;
      try { buffer = await readFile(file); } catch { errors.push(`${asset.id}: missing file ${rel}`); continue; }
      const info = imageInfo(buffer);
      if (!info) { errors.push(`${asset.id}: ${rel} is not a decodable image`); continue; }
      if (info.width !== asset[wKey] || info.height !== asset[hKey]) errors.push(`${asset.id}: ${rel} is ${info.width}x${info.height}, manifest says ${asset[wKey]}x${asset[hKey]}`);
      if (buffer.length !== asset[bytesKey]) errors.push(`${asset.id}: ${rel} is ${buffer.length} bytes, manifest says ${asset[bytesKey]}`);
      if (buffer.length > LIMITS.maxFileBytes) errors.push(`${asset.id}: ${rel} exceeds ${LIMITS.maxFileBytes} bytes`);
      if (role === 'print' && Math.max(info.width, info.height) < LIMITS.minMirrorLongEdge) errors.push(`${asset.id}: print file below ${LIMITS.minMirrorLongEdge}px long edge`);
      if (!entry) errors.push(`${asset.id}: ${rel} has no rights-ledger entry`);
      else if (entry.sha256 !== createHash('sha256').update(buffer).digest('hex')) errors.push(`${asset.id}: ${rel} sha256 differs from the ledger`);
    }
  }
  const files = await walk(path.join(ROOT, 'public/offline'));
  let total = 0;
  for (const file of files) {
    const size = (await stat(file)).size; total += size;
    if (size > LIMITS.maxFileBytes) errors.push(`${path.relative(ROOT, file)} is ${size} bytes (limit ${LIMITS.maxFileBytes})`);
  }
  if (total > LIMITS.maxOfflineBytes) errors.push(`public/offline is ${total} bytes (budget ${LIMITS.maxOfflineBytes})`);
  const referenced = new Set(art.assets.flatMap(asset => [asset.downloadUrl, asset.previewUrl, ...(asset.hdDownloadUrls || [])]));
  for (const file of files) {
    const rel = path.relative(path.join(ROOT, 'public'), file).replace(/\\/g, '/');
    if (/\.(jpe?g|png|webp|tiff?)$/i.test(rel) && !referenced.has(rel)) errors.push(`orphan image not listed in artworks.json: ${rel}`);
  }
  return { errors, totalBytes: total, assets: art.assets.length };
}

export async function verifyRights() {
  const errors = [];
  const registry = await read('data/registry/sources.json'), ledger = await read('data/provenance/rights-ledger.json');
  for (const source of registry.sources) {
    if (source.role !== 'rejected' && source.requiresProviderApiKey !== false) errors.push(`registry: ${source.id} is active but requiresProviderApiKey != false`);
    if (source.role === 'rejected' && source.requiresProviderApiKey !== true) errors.push(`registry: rejected ${source.id} should record why (requiresProviderApiKey)`);
    if (source.implemented === true && source.status === 'candidate') errors.push(`registry: ${source.id} is implemented but still marked candidate`);
  }
  for (const entry of ledger.entries) {
    if (entry.mirrored) {
      if (!registry.mirrorableRights.includes(entry.rightsStatus)) errors.push(`${entry.path}: ${entry.rightsStatus} may not be mirrored`);
      for (const key of ['sha256', 'sourceUrl', 'licenseUrl', 'rightsEvidenceUrl', 'checkedAt', 'ingestedAt', 'upstreamRevision']) if (!entry[key]) errors.push(`${entry.path}: ledger entry lacks ${key}`);
      if (/^cc-by/.test(entry.rightsStatus) && !entry.attribution) errors.push(`${entry.path}: attribution is required for ${entry.rightsStatus}`);
    } else if (entry.rightsStatus !== 'reference-only') errors.push(`${entry.path}: non-mirrored entry must be reference-only`);
  }
  const art = await read('public/offline/artworks.json');
  for (const asset of art.assets) {
    if (asset.rights !== 'open-license' || !asset.licenseUrl || !asset.attribution) errors.push(`${asset.id}: mirrored asset needs open-license, licenseUrl and attribution`);
  }
  // Index shards must stay reference-only and point at https hosts only.
  for (const file of (await readdir(path.join(ROOT, 'public/offline/index'))).filter(name => /^(games-|anime|wd-|audiobooks)/.test(name))) {
    const shard = await read(`public/offline/index/${file}`);
    if (shard.rights !== 'reference-only') errors.push(`${file}: shard rights must be reference-only`);
    for (const url of [shard.imageBase, shard.serials?.imageBase].filter(Boolean)) {
      let parsed; try { parsed = new URL(url); } catch { errors.push(`${file}: bad imageBase ${url}`); continue; }
      if (parsed.protocol !== 'https:' || /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(parsed.hostname)) errors.push(`${file}: unsafe imageBase ${url}`);
    }
  }
  // Keep provider keys out of offline/config/browser files and Worker source.
  for (const rel of ['worker/src', 'worker/wrangler.toml', '.env.example', 'src', '.github/workflows']) {
    const target = path.join(ROOT, rel);
    const files = (await stat(target)).isDirectory() ? (await walk(target)).filter(file => /\.(js|ts|tsx|toml|yml|yaml|json|d\.ts)$/.test(file)) : [target];
    for (const file of files) {
      const text = await readFile(file, 'utf8');
      const relativePath = path.relative(ROOT, file).replace(/\\/g, '/');
      const hit = text.match(KEY_PATTERN);
      if (hit) errors.push(relativePath+': references provider credential '+hit[0]);
    }
  }
  return { errors, entries: ledger.entries.length };
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('verify.mjs')) {
  const [assets, rights] = await Promise.all([verifyAssets(), verifyRights()]);
  const errors = [...assets.errors, ...rights.errors];
  console.log(`assets: ${assets.assets} checked, offline bytes ${assets.totalBytes}; ledger entries ${rights.entries}`);
  if (errors.length) { console.error(errors.map(error => `  ✖ ${error}`).join('\n')); process.exit(1); }
  console.log('verify: ok');
}
