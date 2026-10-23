import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const STOREFRONTS = ['id', 'us', 'gb', 'au', 'ca', 'jp', 'de', 'fr'];
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUTPUT = resolve(ROOT, 'public/data/apple-trends.json');
export const CHART_FEEDS = JSON.parse(readFileSync(resolve(ROOT, 'src/lib/appleChartFeeds.json'), 'utf8'));
const CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 7000;

function snapshotKey(country, category, kind) {
  return `${country}/${category}/${kind}`;
}

async function readPreviousSnapshot(path) {
  try {
    const snapshot = JSON.parse(await readFile(path, 'utf8'));
    if (snapshot?.schemaVersion === 1 && snapshot.feeds && typeof snapshot.feeds === 'object') return snapshot;
  } catch {}
  return { schemaVersion: 1, generatedAt: null, feeds: {} };
}

async function fetchChart(country, category, kind, feed, fetchImpl) {
  const url = `https://itunes.apple.com/${country}/rss/${feed}/limit=10/json`;
  const response = await fetchImpl(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (!data?.feed || !Array.isArray(data.feed.entry || [])) throw new Error('Unexpected Apple RSS response');
  return {
    key: snapshotKey(country, category, kind),
    record: { entries: (data.feed.entry || []).slice(0, 10), updatedAt: new Date().toISOString() },
  };
}

export async function refreshAppleTrendSnapshot({ outputPath = OUTPUT, fetchImpl = fetch, logger = console } = {}) {
  const previous = await readPreviousSnapshot(outputPath);
  const jobs = Object.entries(CHART_FEEDS).flatMap(([category, charts]) =>
    Object.entries(charts).flatMap(([kind, feed]) => STOREFRONTS.map(country => ({ country, category, kind, feed }))),
  );
  const feeds = { ...previous.feeds };
  let next = 0;
  let succeeded = 0;
  let failed = 0;
  let changed = !previous.generatedAt;

  async function worker() {
    while (next < jobs.length) {
      const job = jobs[next++];
      try {
        const result = await fetchChart(job.country, job.category, job.kind, job.feed, fetchImpl);
        const old = previous.feeds[result.key];
        if (JSON.stringify(old?.entries || []) !== JSON.stringify(result.record.entries)) {
          feeds[result.key] = result.record;
          changed = true;
        }
        succeeded++;
      } catch (error) {
        failed++;
        logger.warn?.(`Apple chart ${job.country}/${job.category}/${job.kind} kept its previous snapshot: ${error.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
  if (!succeeded) throw new Error('Apple chart refresh returned no successful feeds; the previous snapshot was preserved.');

  if (!changed) {
    logger.info?.(`Apple chart snapshot is current: ${succeeded} feeds checked, ${failed} kept from the previous snapshot.`);
    return { snapshot: previous, succeeded, failed, changed: false };
  }
  const snapshot = { schemaVersion: 1, generatedAt: new Date().toISOString(), feeds };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot)}\n`);
  logger.info?.(`Apple chart snapshot refreshed: ${succeeded} feeds updated, ${failed} kept from the previous snapshot.`);
  return { snapshot, succeeded, failed, changed: true };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  refreshAppleTrendSnapshot().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
