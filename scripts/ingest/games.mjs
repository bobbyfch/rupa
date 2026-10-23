// Build metadata-only game artwork indexes (no image binaries): Libretro boxart names, xlenore PS1/PS2 serials, VitaHEX app IDs.
// Output: public/offline/index/games-<platform>.json  (rights: reference-only, images stay at the upstream host)
// Usage: node scripts/ingest/games.mjs [platform ...]
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getText } from '../lib/net.mjs';
import { repoCommit, repoDirTrees, repoTree } from '../lib/github.mjs';

const OUT = path.resolve(import.meta.dirname, '../../public/offline/index');
const DAT_ROOT = 'https://raw.githubusercontent.com/libretro/libretro-database/master/metadat/';
const THUMB_ROOT = 'https://thumbnails.libretro.com/';
// id, display label, libretro system name, optional redump DAT + xlenore repo for serial join
const PLATFORMS = [
  ['nes', 'Nintendo Entertainment System', 'Nintendo - Nintendo Entertainment System'],
  ['snes', 'Super Nintendo', 'Nintendo - Super Nintendo Entertainment System'],
  ['n64', 'Nintendo 64', 'Nintendo - Nintendo 64'],
  ['gb', 'Game Boy', 'Nintendo - Game Boy'],
  ['gbc', 'Game Boy Color', 'Nintendo - Game Boy Color'],
  ['gba', 'Game Boy Advance', 'Nintendo - Game Boy Advance'],
  ['nds', 'Nintendo DS', 'Nintendo - Nintendo DS'],
  ['3ds', 'Nintendo 3DS', 'Nintendo - Nintendo 3DS'],
  ['gc', 'Nintendo GameCube', 'Nintendo - GameCube'],
  ['wii', 'Nintendo Wii', 'Nintendo - Wii'],
  ['genesis', 'Sega Mega Drive / Genesis', 'Sega - Mega Drive - Genesis'],
  ['saturn', 'Sega Saturn', 'Sega - Saturn'],
  ['dreamcast', 'Sega Dreamcast', 'Sega - Dreamcast'],
  ['ps1', 'Sony PlayStation', 'Sony - PlayStation', { dat: 'redump/Sony - PlayStation.dat', xlenore: 'xlenore/psx-covers' }],
  ['ps2', 'Sony PlayStation 2', 'Sony - PlayStation 2', { dat: 'redump/Sony - PlayStation 2.dat', xlenore: 'xlenore/ps2-covers' }],
  ['psp', 'Sony PlayStation Portable', 'Sony - PlayStation Portable'],
];
const FLAG = { Named_Boxarts: 1, Named_Logos: 2, Named_Snaps: 4, Named_Titles: 8 };
const wanted = process.argv.slice(2);
const generatedAt = new Date().toISOString().slice(0, 10);
await mkdir(OUT, { recursive: true });
const summary = [];

function parseDat(text) {
  const games = [];
  for (const block of text.split(/\ngame \(\n/).slice(1)) {
    const name = block.match(/^\s*name "([^"]+)"/m)?.[1], serial = block.match(/^\s*serial "([^"]+)"/m)?.[1], region = block.match(/^\s*region "([^"]+)"/m)?.[1];
    if (name && serial) games.push({ name, serial, region });
  }
  return games;
}
const baseSerial = serial => serial.split(/[,\s]+/)[0].replace(/-\d$/, '');

async function libretroPlatform([id, label, system, extra]) {
  const repo = `libretro-thumbnails/${system.replace(/ /g, '_')}`;
  const commit = await repoCommit(repo);
  const tree = await repoTree(repo).catch(() => repoDirTrees(repo, Object.keys(FLAG)));
  const names = new Map();
  for (const entry of tree.tree) {
    if (entry.type !== 'blob' || !entry.path.endsWith('.png')) continue;
    const [dir, file] = entry.path.split('/');
    if (!FLAG[dir] || !file) continue;
    const name = file.slice(0, -4);
    names.set(name, (names.get(name) || 0) | FLAG[dir]);
  }
  const rows = [...names].filter(([, flags]) => flags).sort((a, b) => a[0].localeCompare(b[0])).map(([name, flags]) => [name, flags]);
  const shard = {
    schemaVersion: 1, kind: 'games', platform: id, label, generatedAt,
    source: { id: 'libretro-thumbnails', repo, revision: commit.sha, revisionDate: commit.date, url: `https://github.com/${repo}` },
    rights: 'reference-only', rightsNote: 'Publisher box art. Index lists names that exist upstream; images are not mirrored.',
    imageBase: `${THUMB_ROOT}${encodeURIComponent(system).replace(/%20/g, '%20')}/`, flagLegend: { 1: 'Named_Boxarts', 2: 'Named_Logos', 4: 'Named_Snaps', 8: 'Named_Titles' },
    rows,
  };
  if (extra) {
    const [datText, xtree, xcommit] = await Promise.all([getText(DAT_ROOT + encodeURI(extra.dat), { timeoutMs: 120_000 }), repoTree(extra.xlenore), repoCommit(extra.xlenore)]);
    const covers = new Map();
    for (const entry of xtree.tree) {
      const match = entry.path.match(/^covers\/(default|3d)\/([A-Z0-9-]+)\.(jpg|png)$/i);
      if (match) covers.set(match[2].toUpperCase(), (covers.get(match[2].toUpperCase()) || 0) | (match[1] === 'default' ? 1 : 2));
    }
    const titles = new Map();
    for (const game of parseDat(datText)) {
      const serial = baseSerial(game.serial).toUpperCase();
      if (covers.has(serial) && !titles.has(serial)) titles.set(serial, game.name);
    }
    shard.serials = {
      source: { id: extra.xlenore.split('/')[1], repo: extra.xlenore, revision: xcommit.sha, revisionDate: xcommit.date, url: `https://github.com/${extra.xlenore}`, titleSource: `libretro-database metadat/${extra.dat}` },
      imageBase: `https://raw.githubusercontent.com/${extra.xlenore}/main/covers/`, flagLegend: { 1: 'default/<serial>.jpg', 2: '3d/<serial>.png' },
      rows: [...covers].sort((a, b) => a[0].localeCompare(b[0])).map(([serial, flags]) => [serial, titles.get(serial) || null, flags]),
    };
  }
  await writeFile(path.join(OUT, `games-${id}.json`), JSON.stringify(shard));
  return { id, label, boxarts: rows.length, serials: shard.serials?.rows.length, titled: shard.serials?.rows.filter(r => r[1]).length };
}

async function vita() {
  const repo = 'VitaHEX-Games/hexflow-covers';
  const [text, commit] = await Promise.all([getText(`https://raw.githubusercontent.com/${repo}/main/HEXFlow-Coverlisting.txt`), repoCommit(repo)]);
  const rows = text.split(/\r?\n/).flatMap(line => { const m = line.trim().match(/^([A-Z]{4}\d{5})\s+(.{2,140})$/i); return m ? [[m[2].trim(), m[1].toUpperCase()]] : []; });
  // The upstream cover list is incomplete. Keep this verified missing Vita release searchable across refreshes.
  if (!rows.some(([, appId]) => appId === 'PCSE00293')) rows.push(['Final Fantasy X/X-2 HD Remaster', 'PCSE00293']);
  rows.sort((a, b) => a[0].localeCompare(b[0]));
  if (!rows.length) throw new Error('empty Vita list');
  await writeFile(path.join(OUT, 'games-psvita.json'), JSON.stringify({
    schemaVersion: 1, kind: 'games', platform: 'psvita', label: 'Sony PlayStation Vita', generatedAt,
    source: { id: 'vitahex', repo, revision: commit.sha, revisionDate: commit.date, url: `https://github.com/${repo}` },
    rights: 'reference-only', rightsNote: 'LiveArea covers (~250×320). Index only; images stay upstream.',
    imageBase: `https://raw.githubusercontent.com/${repo}/main/Covers/PSVita/`, rows,
  }));
  return { id: 'psvita', label: 'Sony PlayStation Vita', boxarts: rows.length };
}

for (const platform of PLATFORMS) {
  if (wanted.length && !wanted.includes(platform[0])) continue;
  try { const s = await libretroPlatform(platform); summary.push(s); console.log(s); }
  catch (error) { console.error('FAILED', platform[0], error.message); summary.push({ id: platform[0], error: error.message }); }
}
if (!wanted.length || wanted.includes('psvita')) { const s = await vita(); summary.push(s); console.log(s); }
if (summary.some(s => s.error)) process.exitCode = 1;
