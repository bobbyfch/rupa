// Copies measured probe results from data/checks/source-health.json into data/registry/sources.json.
// A failing probe downgrades 'confirmed-working' to blocked-here (HTTP 401/403/429) or unreachable-here (no response). Applies to confirmed-working and candidate sources. Never upgrades.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const registryPath = path.join(ROOT, 'data/registry/sources.json');
const registry = JSON.parse(await readFile(registryPath, 'utf8'));
const health = JSON.parse(await readFile(path.join(ROOT, 'data/checks/source-health.json'), 'utf8'));
const day = health.checkedAt.slice(0, 10);
for (const probe of health.probes) {
  const source = registry.sources.find(entry => entry.id === probe.id);
  if (!source) continue;
  source.lastChecked = day;
  source.lastProbe = { status: probe.status, ok: probe.ok, ms: probe.ms };
  if (!probe.ok && ['confirmed-working', 'candidate'].includes(source.status)) source.status = [401, 403, 429].includes(probe.status) ? 'blocked-here' : 'unreachable-here';
  if (!probe.ok && !source.notes?.includes('probe failed')) source.notes = `${source.notes ? source.notes + ' ' : ''}Probe failed on ${day} (${probe.status || probe.error || 'no response'}) from the ingest machine; may differ elsewhere.`;
}
await writeFile(registryPath, JSON.stringify(registry, null, 2) + '\n');
console.log('registry updated from health report', day);
