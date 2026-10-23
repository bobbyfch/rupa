// Personal, local-only cover download for game platforms (PS1, PS2, SNES, ...).
// These covers are publisher artwork, so they are NOT mirrored in the public repository (docs/RIGHTS_AND_ATTRIBUTION.md).
// This script keeps a private copy on YOUR machine under .local-only/ (git-ignored). `npm run dev` and `npm run preview` serve it
// at /__rupa-local/covers/, and the game search then shows the local file instead of the remote one, offline.
//
// Usage:
//   node scripts/local/fetch-covers.mjs ps2 --match "final fantasy"      (titles containing the words)
//   node scripts/local/fetch-covers.mjs ps2 --limit 300                  (first 300 titles)
//   node scripts/local/fetch-covers.mjs ps2 --serial --variant both      (xlenore serial covers, default and 3D)
//   node scripts/local/fetch-covers.mjs snes --all                       (every boxart on that platform)
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getBuffer } from '../lib/net.mjs';
import { imageInfo } from '../lib/imageinfo.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2), platform = args.find(arg => !arg.startsWith('--'));
const flag = name => args.includes(`--${name}`), value = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
if (!platform) { console.error('Usage: node scripts/local/fetch-covers.mjs <platform> [--match "words"] [--limit N] [--all] [--serial] [--variant default|3d|both]'); process.exit(2); }
const shard = JSON.parse(await readFile(path.join(ROOT, `public/offline/index/games-${platform}.json`), 'utf8').catch(() => { console.error(`No index for "${platform}". Known: see public/offline/index/games-*.json`); process.exit(2); }));
const words = (value('match') || '').toLowerCase().split(/\s+/).filter(Boolean), limit = flag('all') ? Infinity : Number(value('limit')) || (words.length ? 200 : 50);
const jobs = [];
if (flag('serial')) {
  if (!shard.serials) { console.error(`${platform} has no serial covers (only ps1 and ps2 do).`); process.exit(2); }
  const variants = (value('variant') || 'default') === 'both' ? ['default', '3d'] : [value('variant') || 'default'];
  for (const [serial, title, flags] of shard.serials.rows) {
    if (words.length && !words.every(word => `${serial} ${title || ''}`.toLowerCase().includes(word))) continue;
    for (const variant of variants) {
      if (!(flags & (variant === '3d' ? 2 : 1))) continue;
      const ext = variant === '3d' ? 'png' : 'jpg';
      jobs.push({ url: `${shard.serials.imageBase}${variant}/${serial}.${ext}`, rel: `${platform}/serial/${variant}/${serial}.${ext}` });
    }
  }
} else {
  for (const [name, flags] of shard.rows) {
    if (!(flags & 1) || (words.length && !words.every(word => name.toLowerCase().includes(word)))) continue;
    jobs.push({ url: `${shard.imageBase}Named_Boxarts/${encodeURIComponent(name)}.png`, rel: `${platform}/boxart/${encodeURIComponent(name)}.png` });
  }
}
const todo = jobs.slice(0, limit);
console.log(`${platform}: ${jobs.length} matching covers, downloading ${todo.length} into .local-only/covers/`);
let done = 0, skipped = 0, failed = 0, bytes = 0, next = 0;
const exists = file => access(file).then(() => true, () => false);
await Promise.all(Array.from({ length: 5 }, async () => {
  while (next < todo.length) {
    const job = todo[next++], file = path.join(ROOT, '.local-only/covers', job.rel);
    if (await exists(file)) { skipped++; continue; }
    try {
      const { buffer } = await getBuffer(job.url, { retries: 2, timeoutMs: 40_000 });
      if (!imageInfo(buffer)) throw new Error('not an image');
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, buffer); done++; bytes += buffer.length;
    } catch (error) { failed++; if (failed <= 5) console.warn('  failed', job.rel, String(error.message).slice(0, 60)); }
    if ((done + skipped + failed) % 25 === 0) process.stdout.write(`  ${done + skipped + failed}/${todo.length}\r`);
  }
}));
console.log(`\ndone: ${done} downloaded (${(bytes / 1e6).toFixed(1)} MB), ${skipped} already present, ${failed} failed.`);
console.log('Start the app with npm run dev; game search now prefers these local files.');
