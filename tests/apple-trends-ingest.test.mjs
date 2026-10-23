import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { refreshAppleTrendSnapshot } from '../scripts/ingest/apple-trends.mjs';

test('Apple trend refresh writes a complete first snapshot and avoids unchanged diffs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rupa-apple-trends-'));
  const outputPath = join(directory, 'data', 'apple-trends.json');
  const calls = [];
  const fetchImpl = async url => {
    calls.push(String(url));
    return Response.json({ feed: { entry: [{ id: { attributes: { 'im:id': '123' } }, 'im:name': { label: 'Fixture' } }] } });
  };
  const logger = { info() {}, warn() {} };

  try {
    const first = await refreshAppleTrendSnapshot({ outputPath, fetchImpl, logger });
    assert.equal(first.succeeded, 96);
    assert.equal(first.failed, 0);
    assert.equal(first.changed, true);
    assert.equal(calls.length, 96);
    assert.ok(calls.includes('https://itunes.apple.com/id/rss/topalbums/limit=10/json'));
    assert.ok(calls.includes('https://itunes.apple.com/us/rss/topmovies/limit=10/json'));
    assert.ok(first.snapshot.feeds['us/tv/tv-episodes'].entries[0]);

    const before = await readFile(outputPath, 'utf8');
    const second = await refreshAppleTrendSnapshot({ outputPath, fetchImpl, logger });
    assert.equal(second.changed, false);
    assert.equal(await readFile(outputPath, 'utf8'), before);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Apple trend refresh preserves its previous snapshot when every feed fails', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rupa-apple-trends-'));
  const outputPath = join(directory, 'apple-trends.json');
  const original = JSON.stringify({ schemaVersion: 1, generatedAt: '2026-01-01T00:00:00Z', feeds: { 'id/music/albums': { entries: [] } } });
  await writeFile(outputPath, original);
  try {
    await assert.rejects(
      refreshAppleTrendSnapshot({ outputPath, fetchImpl: async () => { throw new Error('offline'); }, logger: { warn() {}, info() {} } }),
      /no successful feeds/,
    );
    assert.equal(await readFile(outputPath, 'utf8'), original);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
