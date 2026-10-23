// Mirror Standard Ebooks covers (1400x2100 JPEG). The book list comes from the standardebooks GitHub organisation
// (14 anonymous API calls); a curated author list picks which books. Each book is reviewed from its own repository:
// content.opf must carry the standard rights statement (US public domain artwork, contributions dedicated to CC0).
// Usage: node scripts/ingest/standardebooks.mjs [--dry]
import { getJson, getText } from '../lib/net.mjs';
import { assetRecord, dropPack, fetchBuffer, mirrorProcessed, readManifest, today, writeManifest } from '../lib/mirror.mjs';

const PACK = 'standardebooks-covers-01', PACK_DIR = `offline/packs/${PACK}`, PER_AUTHOR = 2;
// Author repo prefixes, in the order books are preferred.
const AUTHORS = [
  'charles-dickens', 'arthur-conan-doyle', 'mark-twain', 'h-g-wells', 'jules-verne', 'edgar-allan-poe', 'oscar-wilde', 'jane-austen', 'charlotte-bronte', 'emily-bronte', 'mary-shelley', 'bram-stoker',
  'robert-louis-stevenson', 'herman-melville', 'lewis-carroll', 'joseph-conrad', 'leo-tolstoy', 'fyodor-dostoevsky', 'franz-kafka', 'h-p-lovecraft', 'jack-london', 'louisa-may-alcott', 'l-m-montgomery',
  'kenneth-grahame', 'rudyard-kipling', 'daniel-defoe', 'jonathan-swift', 'thomas-hardy', 'george-eliot', 'wilkie-collins', 'nathaniel-hawthorne', 'henry-james', 'edith-wharton', 'willa-cather',
  'f-scott-fitzgerald', 'virginia-woolf', 'e-m-forster', 'g-k-chesterton', 'baroness-orczy', 'alexandre-dumas', 'victor-hugo', 'gustave-flaubert', 'homer', 'sophocles', 'plato', 'sun-tzu',
  'niccolo-machiavelli', 'j-m-barrie', 'frances-hodgson-burnett', 'edgar-rice-burroughs', 'h-rider-haggard', 'anton-chekhov', 'ivan-turgenev', 'miguel-de-cervantes-saavedra', 'dante-alighieri', 'william-shakespeare',
  'emily-dickinson', 'walt-whitman', 'henry-david-thoreau', 'ralph-waldo-emerson', 'jerome-k-jerome', 'george-orwell', 'thomas-more', 'machado-de-assis', 'lucy-maud-montgomery',
];
const STANDARD_RIGHTS = /believed to be in the United States public domain[\s\S]*dedicate their contributions to the worldwide public domain/;
const decode = value => value.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/<[^>]+>/g, '').trim();
const tag = (xml, name) => decode((xml.match(new RegExp(`<${name}[^>]*>([^]*?)</${name}>`)) || [])[1] || '');
const dry = process.argv.includes('--dry');
const manifest = await readManifest();
const kept = manifest.assets.filter(asset => asset.packId !== PACK);

const repos = [];
for (let page = 1; page <= 20; page++) {
  const batch = await getJson(`https://api.github.com/orgs/standardebooks/repos?per_page=100&page=${page}`, { headers: process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {} });
  repos.push(...batch.map(repo => repo.name));
  if (batch.length < 100) break;
}
const books = [];
for (const author of AUTHORS) books.push(...repos.filter(name => name.startsWith(author + '_')).sort().slice(0, PER_AUTHOR));
console.log('repos listed', repos.length, '| selected', books.length);

if (!dry) await dropPack(PACK_DIR);
const assets = [];
for (const book of books) {
  const raw = `https://raw.githubusercontent.com/standardebooks/${book}/master`;
  let opf;
  try { opf = await getText(`${raw}/src/epub/content.opf`, { retries: 1 }); } catch (error) { console.log('skip (no opf)', book); continue; }
  if (!STANDARD_RIGHTS.test(tag(opf, 'dc:rights'))) { console.log('skip (non-standard rights statement, review by hand)', book); continue; }
  const title = tag(opf, 'dc:title'), author = tag(opf, 'dc:creator'), language = tag(opf, 'dc:language');
  const artist = tag(opf.match(/<dc:contributor id="artist"[^>]*>[\s\S]*?<\/dc:contributor>/)?.[0] || '', 'dc:contributor') || undefined;
  if (dry) { console.log('would take', book, '|', title); continue; }
  const input = await fetchBuffer(`${raw}/images/cover.jpg`).catch(() => null);
  const pair = input && await mirrorProcessed({ input, packDir: PACK_DIR, base: book.slice(0, 70), minEdge: 1400, maxEdge: 2100 });
  if (!pair) { console.log('skip (cover missing or small)', book); continue; }
  assets.push(assetRecord({
    id: `books:standardebooks:${book}`, category: 'books', title, subtitle: `Cover · ${author}`, artist: artist ? `Cover art: ${artist}` : author, kind: 'cover',
    source: 'Standard Ebooks', sourceUrl: `https://standardebooks.org/ebooks/${book.replace('_', '/')}`, sourceId: 'standardebooks', packId: PACK, tags: [author.toLowerCase()],
    rights: {
      status: 'public-domain', label: 'Public domain (US) / CC0 contributions', url: 'https://creativecommons.org/publicdomain/zero/1.0/', evidence: `https://github.com/standardebooks/${book}/blob/master/LICENSE.md`,
      attribution: `Standard Ebooks, ${title} cover${artist ? `, artwork by ${artist}` : ''}; US public domain / CC0`,
      note: 'Source text and artwork believed to be in the US public domain; Standard Ebooks contributions dedicated to CC0. Check local law outside the US.',
    },
    pair, extra: { language },
  }));
  console.log('ok', book.slice(0, 60), `${pair.fields.originalWidth}x${pair.fields.originalHeight}`, (pair.fields.fileBytes / 1e3).toFixed(0) + 'KB');
}
if (!dry) { await writeManifest(manifest, [...kept, ...assets]); console.log('manifest updated:', kept.length, 'kept +', assets.length, 'new', today()); }
