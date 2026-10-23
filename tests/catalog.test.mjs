import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { animeArtworks, artworkMatches, audiobookWorks, gameArtworks, groupGameArtworks, parseQuery, resetCatalogCache, searchWorks, wikidataArtworks, wikidataWorks } from '../src/lib/catalog.ts';
import { resolutionGrade, resolutionLabel } from '../src/lib/quality.ts';
import { searchArtwork, youtubeVideoId } from '../src/lib/providers.ts';
import { appleMusicVideoEmbedUrl } from '../src/lib/appleEmbeds.ts';
import { imageMimeForExport } from '../src/lib/musicDownloads.ts';

const read = file => JSON.parse(readFileSync(new URL(`../public/offline/${file}`, import.meta.url), 'utf8'));
const works = read('index/works.json'), ps1 = read('index/games-ps1.json'), ps2 = read('index/games-ps2.json'), dreamcast = read('index/games-dreamcast.json'), n64 = read('index/games-n64.json'), gc = read('index/games-gc.json'), wii = read('index/games-wii.json'), gb = read('index/games-gb.json'), gbc = read('index/games-gbc.json'), snes = read('index/games-snes.json'), nds = read('index/games-nds.json'), n3ds = read('index/games-3ds.json'), psvita = read('index/games-psvita.json'), anime = read('index/anime.json'), offlineArt = read('artworks.json');

test('parseQuery separates regions, platforms, years and type words from content tokens', () => {
  const q = parseQuery('Spirited Away 2019 China poster');
  assert.deepEqual(q.tokens, ['spirited', 'away', '2019']);
  assert.deepEqual([...q.regions], ['CN']);
  assert.equal(q.wantsPoster, true);
  assert.deepEqual([...parseQuery('Final Fantasy X PS2').platforms], ['ps2']);
});

test('Spirited Away 2019 China returns the China edition, kept apart from JP and US', () => {
  const [hit] = searchWorks(works, 'Spirited Away 2019 China');
  assert.equal(hit.work.title, 'Spirited Away');
  assert.deepEqual([...hit.matchedEditions], ['ed:spirited-away:cn:2019']);
  assert.deepEqual(hit.editions.map(e => e.region).sort(), ['CN', 'JP', 'US']);
});

test('Princess Mononoke Japanese poster matches the Japanese edition only', () => {
  const [hit] = searchWorks(works, 'Princess Mononoke Japanese poster');
  assert.equal(hit.work.title, 'Princess Mononoke');
  assert.deepEqual([...hit.matchedEditions], ['ed:princess-mononoke:jp:1997']);
});

test('Anime browse includes the dedicated Japan film collections', () => {
  const results = searchWorks(works, 'Makoto Shinkai', { category: 'anime' });
  assert.ok(results.some(hit => hit.work.collection === 'shinkai'));
  assert.ok(searchWorks(works, 'Studio Ghibli', { category: 'anime' }).some(hit => hit.work.collection === 'ghibli'));
});

test('every title in the Makoto Shinkai collection is searchable from Anime / Japan', () => {
  const titles = ['She and Her Cat', 'The Voices of a Distant Star', 'The Place Promised in Our Early Days', '5 Centimeters per Second', 'Children Who Chase Lost Voices', 'The Garden of Words', 'Your Name', 'Weathering With You', 'Suzume'];
  for (const title of titles) {
    assert.ok(searchWorks(works, title, { category: 'anime' }).some(hit => hit.work.collection === 'shinkai'), `${title} should be found in Anime / Japan`);
  }
});

test('works are found by Japanese, Korean and Chinese aliases', () => {
  assert.equal(searchWorks(works, '千と千尋')[0].work.title, 'Spirited Away');
  assert.equal(searchWorks(works, '센과 치히로')[0].work.title, 'Spirited Away');
  assert.equal(searchWorks(works, '방탄소년단')[0].work.title, 'BTS');
  assert.equal(searchWorks(works, '龙猫')[0].work.title, 'My Neighbor Totoro');
});

test('an edition region with no such edition excludes the work instead of inventing one', () => {
  assert.deepEqual(searchWorks(works, 'Spirited Away Indonesia'), []);
});

test('PS2 title search keeps every regional edition as its own artwork', () => {
  const results = gameArtworks(ps2, 'Final Fantasy X PS2');
  const ids = results.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(results.length >= 3, 'expected several regional boxarts');
  assert.ok(results.every(item => !/Final Fantasy X-2/.test(item.title)), 'an X-2 sequel is not an edition of X');
  assert.ok(results.every(item => item.rights === 'source-only' && item.availability === 'index-only'));
  assert.ok(results.some(item => /Japan/.test(item.subtitle)) && results.some(item => /USA/.test(item.subtitle)));
});

test('FFX-2 remains a separate searchable game family', () => {
  const results = gameArtworks(ps2, 'Final Fantasy X-2 PS2');
  assert.ok(results.some(item => item.title === 'Final Fantasy X-2'));
  assert.ok(results.every(item => !/^Final Fantasy X$/.test(item.title)));
  const [group] = groupGameArtworks(results);
  assert.equal(group.title, 'Final Fantasy X-2');
  assert.ok(gameArtworks(ps2, 'FFX PS2').every(item => !/^Final Fantasy X-2/.test(item.title)));
});

test('PS2 serial search returns default and 3D art as separate variants', () => {
  const results = gameArtworks(ps2, 'SLUS-20312');
  assert.deepEqual(results.map(item => item.kind).sort(), ['alternate', 'cover']);
  assert.ok(results.every(item => item.title === 'Final Fantasy X'));
  assert.ok(results.every(item => item.imageUrl.startsWith('https://raw.githubusercontent.com/xlenore/ps2-covers/main/covers/')));
});

test('platform hint skips other platforms and URLs encode the exact upstream filename', () => {
  assert.deepEqual(gameArtworks(snes, 'Final Fantasy X PS2'), []);
  const [mario] = gameArtworks(snes, 'Super Mario World SNES');
  assert.equal(mario.imageUrl, 'https://thumbnails.libretro.com/Nintendo%20-%20Super%20Nintendo%20Entertainment%20System/Named_Boxarts/Super%20Mario%20World%20(USA).png');
});

test('PS Vita titles and App IDs resolve to the VitaHEX cover path', () => {
  const [byTitle] = gameArtworks(psvita, 'Call Of Duty Declassified');
  assert.equal(byTitle.title, 'Call Of Duty Declassified');
  assert.match(byTitle.imageUrl, /hexflow-covers\/main\/Covers\/PSVita\/PCSB00213\.png$/);
  const [byAppId] = gameArtworks(psvita, 'PCSB00213');
  assert.equal(byAppId.mediaId, 'PCSB00213');
  assert.equal(byAppId.title, 'Call Of Duty Declassified');
});

test('FFX/X-2 HD Remaster is searchable on PS Vita by title, alias, and App ID', () => {
  const byTitle = gameArtworks(psvita, 'Final Fantasy X/X-2 HD Remaster PS Vita');
  const byAlias = gameArtworks(psvita, 'FFX PS Vita');
  const byAppId = gameArtworks(psvita, 'PCSE00293');
  assert.ok(byTitle.some(item => item.mediaId === 'PCSE00293'));
  assert.ok(byAlias.some(item => item.mediaId === 'PCSE00293'));
  assert.equal(byAppId[0]?.mediaId, 'PCSE00293');
});

test('game artwork filters expose Libretro logos, gameplay screenshots, and title screens', () => {
  const all = gameArtworks(ps2, 'Final Fantasy X PS2', 48, {}, 'all');
  const screenshots = gameArtworks(ps2, 'Final Fantasy X PS2', 48, {}, 'screenshots');
  assert.ok(all.some(item => item.kind === 'logo'));
  assert.ok(all.some(item => item.kind === 'screenshot'));
  assert.ok(all.some(item => item.kind === 'title-screen'));
  assert.ok(screenshots.length > 0 && screenshots.every(item => item.kind === 'screenshot'));
  assert.ok(screenshots.every(item => item.previewUrl.includes('/Named_Snaps/')));
});

test('Final Fantasy X remaster editions group with the original game across platforms', () => {
  const ps2Edition = gameArtworks(ps2, 'Final Fantasy X PS2')[0];
  const vitaEdition = gameArtworks(psvita, 'Final Fantasy X/X-2 HD Remaster PS Vita')[0];
  const [group] = groupGameArtworks([ps2Edition, vitaEdition]);
  assert.equal(group.title, 'Final Fantasy X');
  assert.equal(group.editions.length, 2);
  assert.ok(group.platforms.includes('Sony PlayStation Vita'));
});

test('remake and portable-era editions stay grouped without merging unrelated sequels', () => {
  const ps2Edition = gameArtworks(ps2, 'Resident Evil 4 PS2')[0];
  const gameCubeEdition = gameArtworks(gc, 'Biohazard 4 GameCube')[0];
  const grouped = groupGameArtworks([ps2Edition, gameCubeEdition]);
  assert.equal(grouped[0].title, 'Resident Evil 4');
  assert.deepEqual(new Set(grouped[0].platforms), new Set(['Sony PlayStation 2', 'Nintendo GameCube']));

  const gbEdition = gameArtworks(gb, 'Link Awakening GB')[0];
  const gbcEdition = gameArtworks(gbc, 'Link Awakening GBC')[0];
  const zelda = groupGameArtworks([gbEdition, gbcEdition])[0];
  assert.equal(zelda.title, "The Legend of Zelda: Link's Awakening");
  assert.equal(zelda.editions.length, 2);
});

test('audited ports and re-releases resolve across the console indexes', () => {
  const chrono = groupGameArtworks([
    ...gameArtworks(snes, 'Chrono Trigger SNES'),
    ...gameArtworks(ps1, 'Chrono Trigger PS1'),
    ...gameArtworks(nds, 'Chrono Trigger DS'),
  ]).find(group => group.title === 'Chrono Trigger');
  assert.ok(chrono);
  assert.ok(['Super Nintendo', 'Sony PlayStation', 'Nintendo DS'].every(platform => chrono.platforms.includes(platform)));

  const dq8 = groupGameArtworks([
    ...gameArtworks(ps2, 'Dragon Quest 8 PS2'),
    ...gameArtworks(n3ds, 'DQ8 3DS'),
  ]).find(group => group.title === 'Dragon Quest VIII');
  assert.ok(dq8);
  assert.ok(dq8.platforms.some(platform => /PlayStation 2/.test(platform)));
  assert.ok(dq8.platforms.some(platform => /3DS/.test(platform)));

  const ocarina = groupGameArtworks([
    ...gameArtworks(n64, 'Ocarina of Time N64'),
    ...gameArtworks(n3ds, 'Ocarina of Time 3D'),
  ]).find(group => group.title === 'The Legend of Zelda: Ocarina of Time');
  assert.ok(ocarina);
  assert.ok(ocarina.platforms.some(platform => /Nintendo 64/.test(platform)));
  assert.ok(ocarina.platforms.some(platform => /3DS/.test(platform)));

  const twilight = groupGameArtworks([
    ...gameArtworks(gc, 'Zelda Twilight Princess GameCube'),
    ...gameArtworks(wii, 'Zelda Twilight Princess Wii'),
  ]).find(group => group.title === 'The Legend of Zelda: Twilight Princess');
  assert.ok(twilight);
  assert.ok(twilight.platforms.some(platform => /GameCube/.test(platform)));
  assert.ok(twilight.platforms.some(platform => /Wii/.test(platform)));

  const residentEvil = groupGameArtworks([
    ...gameArtworks(gc, 'Resident Evil 4 GameCube'),
    ...gameArtworks(wii, 'Biohazard 4 Wii Edition Wii'),
  ]).find(group => group.title === 'Resident Evil 4');
  assert.ok(residentEvil);
  assert.ok(residentEvil.platforms.some(platform => /GameCube/.test(platform)));
  assert.ok(residentEvil.platforms.some(platform => /Wii/.test(platform)));

  const snakeEater = groupGameArtworks(gameArtworks(ps2, 'MGS3 PS2'))
    .find(group => group.title === 'Metal Gear Solid 3');
  assert.ok(snakeEater);
  assert.ok(snakeEater.editions.some(item => item.title.includes('Subsistence')));
});

test('game results group by title while retaining separate console and regional covers', () => {
  const ps2Editions = gameArtworks(ps2, 'Final Fantasy X PS2');
  const vitaEdition = { ...ps2Editions[0], id: 'games:test:psvita:Final Fantasy X', subtitle: 'Sony PlayStation Vita · HD Remaster' };
  const editions = [...ps2Editions, vitaEdition];
  const groups = groupGameArtworks(editions);
  const finalFantasy = groups.find(group => group.title === 'Final Fantasy X');
  assert.ok(finalFantasy);
  assert.ok(finalFantasy.editions.length >= 3);
  assert.ok(finalFantasy.platforms.includes('Sony PlayStation 2'));
  assert.ok(finalFantasy.platforms.includes('Sony PlayStation Vita'));
  assert.equal(new Set(finalFantasy.editions.map(item => item.id)).size, finalFantasy.editions.length);
});

test('anime index finds titles by synonyms and stays reference-only', () => {
  const [hit] = animeArtworks(anime, 'Sen to Chihiro');
  assert.match(hit.title, /Spirited Away|Sen to Chihiro/);
  assert.equal(hit.rights, 'source-only');
  assert.match(hit.imageUrl, /^https:\/\/cdn\.myanimelist\.net\/images\/anime\//);
});

test('mirrored offline art matches poster queries by token, not by exact phrase', () => {
  const matches = offlineArt.assets.filter(item => artworkMatches(item, 'Toulouse-Lautrec poster 1895'));
  assert.ok(matches.some(item => item.title === 'May Milton'));
  assert.ok(matches.every(item => item.kind === 'poster'));
  assert.equal(offlineArt.assets.filter(item => artworkMatches(item, 'Hokusai')).length > 0, true);
});

test('every mirrored asset has a hash, real HD pixels and an open license', () => {
  for (const item of offlineArt.assets) {
    assert.equal(item.rights, 'open-license', item.id);
    assert.ok(['cc0', 'public-domain'].includes(item.rightsStatus || 'cc0'), item.id);
    assert.ok(item.licenseUrl && item.attribution && item.rightsEvidenceUrl || item.sourceUrl, item.id);
    assert.ok(Math.max(item.originalWidth, item.originalHeight) >= 1200, item.id);
  }
});

test('mirror covers museums, Commons and Standard Ebooks, and books stay out of the art search', () => {
  const sources = new Set(offlineArt.assets.map(item => item.sourceId || 'cleveland-cc0'));
  assert.deepEqual([...sources].sort(), ['cleveland-cc0', 'commons', 'met', 'nasa-posters', 'smithsonian', 'standardebooks', 'wellcome']);
  const books = offlineArt.assets.filter(item => item.category === 'books');
  assert.ok(books.length >= 100 && books.every(item => item.rightsNote && /Standard Ebooks/.test(item.attribution)));
  assert.ok(offlineArt.assets.filter(item => item.category === 'art').length >= 90);
});

test('resolution grading never rounds up unknown or small images', () => {
  assert.equal(resolutionGrade(undefined, undefined), 'unknown');
  assert.equal(resolutionGrade(250, 320), 'low');
  assert.equal(resolutionGrade(900, 600), 'standard');
  assert.equal(resolutionGrade(1853, 3400), 'hd');
  assert.equal(resolutionLabel(250, 320), '250 × 320 px · low resolution');
});

test('games search works offline through the static index without any Worker', async () => {
  const original = globalThis.fetch, requested = [];
  resetCatalogCache();
  globalThis.fetch = async input => {
    const url = new URL(typeof input === 'string' ? input : input.url || input, 'http://x.test');
    requested.push(url.pathname);
    const file = url.pathname.replace(/^.*\/offline\//, '');
    return new Response(readFileSync(new URL(`../public/offline/${file}`, import.meta.url)), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await searchArtwork('final fantasy x ps2', 'games', undefined, undefined, 'us', 'all');
    assert.deepEqual(result.warnings, []);
    assert.ok(result.results.length >= 3);
    const staticRequests = requested.filter(path => !path.includes('__rupa-local')); // the optional personal-covers probe is allowed to 404
    assert.ok(staticRequests.every(path => path.includes('/offline/index/')), requested.join());
    assert.ok(requested.some(path => path.endsWith('games-ps2.json')));
    assert.ok(!requested.some(path => path.endsWith('games-snes.json')), 'platform hint must not load other shards');
    const anime = await searchArtwork('Spirited Away', 'anime', undefined, undefined, 'us', 'local-index');
    assert.ok(anime.results.length > 0);
  } finally { globalThis.fetch = original; resetCatalogCache(); }
});

test('an offline index that cannot load yields a warning, not an empty silent result', async () => {
  const original = globalThis.fetch;
  resetCatalogCache();
  globalThis.fetch = async () => new Response('nope', { status: 503 });
  try {
    const result = await searchArtwork('zelda unique offline failure', 'games', undefined, undefined, 'us', 'local-index');
    assert.deepEqual(result.results, []);
    assert.match(result.warnings.join(' '), /Offline index/);
  } finally { globalThis.fetch = original; resetCatalogCache(); }
});

test('choosing a collection without a query browses its works; Everything stays empty until searched', () => {
  const games = searchWorks(works, '', { category: 'games' }, 100);
  assert.ok(games.length >= 20 && games.every(hit => hit.work.category === 'games'));
  const musicKpop = searchWorks(works, '', { category: 'music', collection: 'kpop' }, 100);
  assert.ok(musicKpop.length >= 10 && musicKpop.every(hit => hit.work.collection === 'kpop'));
});

test('public sources file mirrors the registry and counts mirrored works per source', () => {
  const sources = read('index/sources.json');
  const mirrored = Object.fromEntries(sources.sources.filter(s => s.mirrored).map(s => [s.id, s.mirrored]));
  assert.deepEqual({ 'cleveland-cc0': mirrored['cleveland-cc0'], met: mirrored.met }, { 'cleveland-cc0': 16, met: 10 });
  assert.ok(mirrored.standardebooks >= 100 && mirrored.wellcome >= 30 && mirrored.smithsonian >= 20 && mirrored['nasa-posters'] >= 3);
  assert.ok(mirrored.commons >= 16, 'Commons pack plus Wikidata-linked posters');
  assert.ok(sources.sources.some(s => s.role === 'rejected') && sources.sources.every(s => !('probe' in s)));
});

const wd = category => read('index/wd-' + category + '.json');
test('every collection has an offline title index; Wikidata rows are CC0 reference data', () => {
  for (const category of ['movies', 'tv', 'music', 'musicvideos', 'books', 'manga', 'webtoons', 'comics', 'boardgames', 'magazines', 'podcasts', 'apps', 'physicalmedia']) {
    const shard = wd(category);
    assert.ok(shard.rows.length >= 20, category + ' has ' + shard.rows.length + ' rows');
    assert.equal(shard.rights, 'reference-only');
    assert.equal(shard.source.license, 'CC0 1.0');
    assert.ok(shard.rows.every(row => row[0].startsWith('Q') && !Number.isNaN(Number(row[0].slice(1))) && row[1]), category + ' rows carry a Q-id and a title');
  }
  const audiobooks = read('index/audiobooks.json');
  assert.ok(audiobooks.rows.length > 10000 && audiobooks.rows.every(row => row[5] && !row[5].startsWith('http')));
});

test('title index finds works by Japanese alias and keeps the Commons image as a thumbnail request', () => {
  const [hit] = wikidataWorks(wd('movies'), 'Spirited Away');
  assert.equal(hit.work.title, 'Spirited Away');
  assert.ok(hit.work.aliases.some(alias => alias.script === 'ja'));
  assert.ok(hit.work.url.startsWith('https://www.wikidata.org/wiki/Q'));
  const art = wikidataArtworks(wd('boardgames'), 'chess');
  assert.ok(art.items.length > 0 && art.items.every(item => item.rights === 'source-only' && item.availability === 'index-only' && item.previewUrl.startsWith('https://upload.wikimedia.org/wikipedia/commons/')));
});

test('audiobook index searches by title, author and language', () => {
  const books = audiobookWorks(read('index/audiobooks.json'), 'Dumas Monte Cristo');
  assert.ok(books.length > 0 && books[0].work.creators.includes('Dumas'));
  assert.ok(books[0].work.url.startsWith('https://librivox.org/'));
});

test('collections without live providers remain offline and manga can explicitly use its offline index', async () => {
  const original = globalThis.fetch, requested = [];
  resetCatalogCache();
  globalThis.fetch = async input => {
    const url = new URL(typeof input === 'string' ? input : input.url || input, 'http://x.test');
    requested.push(url.pathname);
    return new Response(readFileSync(new URL('../public/offline/' + url.pathname.split('/offline/').pop(), import.meta.url)), { status: 200 });
  };
  try {
    for (const [category, query] of [['boardgames', 'chess'], ['magazines', 'time'], ['comics', 'garfield']]) {
      const result = await searchArtwork(query, category, undefined, undefined, 'us', 'all');
      assert.ok(result.results.length + result.warnings.length > 0, category);
      assert.ok(result.results.every(item => item.category === category), category);
    }
    const manga = await searchArtwork('one piece', 'manga', undefined, undefined, 'us', 'local-index');
    assert.ok(manga.results.length + manga.warnings.length > 0, 'manga offline index');
    assert.ok(manga.results.every(item => item.category === 'manga'));
    assert.ok(requested.every(path => path.includes('/offline/')), requested.join());
  } finally { globalThis.fetch = original; resetCatalogCache(); }
});

test('YouTube thumbnails work without a Worker: id parsing, no key, fallback chain from maxres to hq', async () => {
  assert.equal(youtubeVideoId('https://youtu.be/dQw4w9WgXcQ?t=5'), 'dQw4w9WgXcQ');
  assert.equal(youtubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youtubeVideoId('https://evil.example/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(youtubeVideoId('not a video'), null);
  const original = globalThis.fetch; const hosts = [];
  globalThis.fetch = async input => { hosts.push(new URL(String(input), 'http://x.test').hostname); throw new Error('offline'); };
  try {
    const ok = await searchArtwork('dQw4w9WgXcQ', 'videos', undefined, undefined, 'us', 'all');
    assert.equal(ok.results.length, 1);
    assert.deepEqual(ok.results[0].hdDownloadUrls, ['https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg', 'https://i.ytimg.com/vi/dQw4w9WgXcQ/sddefault.jpg', 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg']);
    assert.deepEqual([...new Set(hosts)], ['www.youtube.com'], 'only the oEmbed title lookup touches the network');
    const bad = await searchArtwork('just words', 'videos', undefined, undefined, 'us', 'all');
    assert.deepEqual(bad.results, []);
    assert.match(bad.warnings[0], /Paste a YouTube video URL/);
  } finally { globalThis.fetch = original; }
});

test('Apple Music video links become safe hosted player embeds, while other hosts are rejected', () => {
  assert.equal(appleMusicVideoEmbedUrl('https://music.apple.com/us/music-video/shot-in-the-dark/1496051106'), 'https://embed.music.apple.com/us/music-video/shot-in-the-dark/1496051106');
  assert.equal(appleMusicVideoEmbedUrl('https://evil.example/us/music-video/title/123'), null);
  assert.equal(appleMusicVideoEmbedUrl('https://music.apple.com/us/album/title/123'), null);
});

test('single and batch image exports share explicit source and converted format mapping', () => {
  assert.equal(imageMimeForExport('original','image/png'),'image/png');
  assert.equal(imageMimeForExport('png'),'image/png');
  assert.equal(imageMimeForExport('jpeg'),'image/jpeg');
  assert.equal(imageMimeForExport('webp'),'image/webp');
});

test('personal local covers replace the remote URL, are marked local-copy and are never in the deployed index', () => {
  const name = 'Final Fantasy X (Japan)';
  const local = { ps2: { boxart: [encodeURIComponent(name) + '.png'], serial: { default: ['SLPS-20000.jpg'], '3d': [] } } };
  const withLocal = gameArtworks(ps2, 'Final Fantasy X PS2', 48, local).find(item => item.mediaId === name);
  assert.equal(withLocal.availability, 'local-copy');
  assert.equal(withLocal.imageUrl, '/__rupa-local/covers/ps2/boxart/' + encodeURIComponent(name) + '.png');
  const without = gameArtworks(ps2, 'Final Fantasy X PS2', 48, {}).find(item => item.mediaId === name);
  assert.equal(without.availability, 'index-only');
  assert.ok(without.imageUrl.startsWith('https://thumbnails.libretro.com/'));
  assert.ok(!JSON.stringify(read('index/manifest.json')).includes('__rupa-local'));
});
