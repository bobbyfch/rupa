// Offline title index of LibriVox public-domain audiobooks (no key; the catalog API is public).
// Metadata only: LibriVox cover art has no uniform licence, so no image is stored or linked.
// Usage: node scripts/ingest/librivox.mjs
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getJson } from '../lib/net.mjs';

const OUT = path.resolve(import.meta.dirname, '../../public/offline/index/audiobooks.json');
const API = 'https://librivox.org/api/feed/audiobooks?format=json&limit=500&fields=%7Bid,title,authors,language,totaltime,url_librivox%7D';
const minutes = value => { const [h = 0, m = 0] = String(value || '').split(':').map(Number); return Math.round(h * 60 + m) || 0; };
const rows = [];
for (let offset = 0; offset < 40_000; offset += 500) {
  const data = await getJson(`${API}&offset=${offset}`, { timeoutMs: 90_000, retries: 3 });
  const books = data.books || [];
  for (const book of books) {
    const url = String(book.url_librivox || '');
    if (!url.startsWith('https://librivox.org/') || !book.title) continue;
    const author = (book.authors || []).map(a => `${a.first_name || ''} ${a.last_name || ''}`.trim()).filter(Boolean).slice(0, 2).join(' & ');
    rows.push([Number(book.id), String(book.title).trim(), author, String(book.language || ''), minutes(book.totaltime), url.slice('https://librivox.org/'.length)]);
  }
  if (books.length < 500) break;
}
rows.sort((a, b) => a[1].localeCompare(b[1]));
await writeFile(OUT, JSON.stringify({
  schemaVersion: 1, kind: 'audiobooks', category: 'audiobooks', generatedAt: new Date().toISOString().slice(0, 10),
  source: { id: 'librivox', url: 'https://librivox.org/', api: 'https://librivox.org/api/info' },
  rights: 'reference-only', rightsNote: 'LibriVox recordings are public domain. Cover art is not indexed because its licence varies per release.',
  urlBase: 'https://librivox.org/', columns: ['id', 'title', 'author', 'language', 'minutes', 'path'], rows,
}));
console.log('audiobooks', rows.length, 'languages', new Set(rows.map(r => r[3])).size);
