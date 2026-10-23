// Shared pieces for ingest scripts that mirror open-licensed images into public/offline.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getBuffer, request, sha256 } from './net.mjs';
import { imageInfo } from './imageinfo.mjs';
import sharp from 'sharp';

export const ROOT = path.resolve(import.meta.dirname, '../..');
export const MANIFEST = path.join(ROOT, 'public/offline/artworks.json');
export const LIMITS = { minLongEdge: 1600, maxPrintBytes: 3_300_000, minPreviewLongEdge: 400, maxPreviewBytes: 700_000 };
export const today = () => new Date().toISOString().slice(0, 10);
export const slug = value => value.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
export const readManifest = async () => JSON.parse(await readFile(MANIFEST, 'utf8'));
export async function writeManifest(manifest, assets) {
  await writeFile(MANIFEST, JSON.stringify({ ...manifest, schemaVersion: 2, generatedAt: today(), assets }, null, 2) + '\n');
}
export async function contentLength(url) {
  const response = await request(url, { method: 'HEAD', retries: 2 });
  return response.ok ? Number(response.headers.get('content-length')) || 0 : 0;
}
/** Downloads a print + preview pair, rejecting anything that is not a decodable image of the required real size. Returns null on rejection. */
export async function downloadPair({ printUrl, previewUrl, packDir, base, previewIsPrint = false, minLongEdge = LIMITS.minLongEdge }) {
  const print = await getBuffer(printUrl), printInfo = imageInfo(print.buffer);
  if (!printInfo || printInfo.format !== 'JPEG' || Math.max(printInfo.width, printInfo.height) < minLongEdge || print.buffer.length > LIMITS.maxPrintBytes) return null;
  const preview = previewIsPrint ? print : await getBuffer(previewUrl), previewInfo = imageInfo(preview.buffer);
  if (!previewInfo || previewInfo.format !== 'JPEG' || Math.max(previewInfo.width, previewInfo.height) < LIMITS.minPreviewLongEdge || preview.buffer.length > LIMITS.maxPreviewBytes + (previewIsPrint ? LIMITS.maxPrintBytes : 0)) return null;
  const dir = path.join(ROOT, 'public', packDir);
  await mkdir(dir, { recursive: true });
  const printRel = `${packDir}/${base}-print.jpg`, previewRel = previewIsPrint ? printRel : `${packDir}/${base}-web.jpg`;
  await writeFile(path.join(ROOT, 'public', printRel), print.buffer);
  if (!previewIsPrint) await writeFile(path.join(ROOT, 'public', previewRel), preview.buffer);
  return {
    printRel, previewRel,
    fields: {
      previewUrl: previewRel, imageUrl: printRel, sdDownloadUrl: previewRel, downloadUrl: printRel, hdDownloadUrls: [printRel, previewRel].filter((v, i, a) => a.indexOf(v) === i),
      originalWidth: printInfo.width, originalHeight: printInfo.height, fileBytes: print.buffer.length, fileFormat: 'JPEG', sha256: sha256(print.buffer),
      previewWidth: previewInfo.width, previewHeight: previewInfo.height, previewBytes: preview.buffer.length, previewSha256: sha256(preview.buffer),
    },
  };
}

// ---------- processed mirrors (sharp): cap the long edge, keep the file small, never upscale ----------
export const PROCESSED = { maxEdge: 2400, minEdge: 1200, previewEdge: 640, jpegQuality: 76, maxPrintBytes: 2_600_000 };

/** Decodes any raster input, then writes a print JPEG (long edge capped, never enlarged) and a WebP preview. Returns null if the source is too small. */
// sourceSize: the true upstream dimensions when the input was already scaled by the server (IIIF), so records never overstate or understate the original.
export async function mirrorProcessed({ input, packDir, base, minEdge = PROCESSED.minEdge, maxEdge = PROCESSED.maxEdge, sourceSize }) {
  const meta = await sharp(input, { limitInputPixels: 400_000_000 }).metadata();
  const sourceWidth = sourceSize?.width || meta.width || 0, sourceHeight = sourceSize?.height || meta.height || 0;
  if (Math.max(meta.width || 0, meta.height || 0) < minEdge) return null;
  const pipeline = () => sharp(input, { limitInputPixels: 400_000_000 }).rotate().flatten({ background: '#ffffff' });
  let print;
  for (const quality of [PROCESSED.jpegQuality, 72, 64]) {
    print = await pipeline().resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true }).jpeg({ quality, mozjpeg: true }).toBuffer();
    if (print.length <= PROCESSED.maxPrintBytes) break;
  }
  if (print.length > PROCESSED.maxPrintBytes) return null;
  const preview = await pipeline().resize({ width: PROCESSED.previewEdge, height: PROCESSED.previewEdge, fit: 'inside', withoutEnlargement: true }).webp({ quality: 76 }).toBuffer();
  const printInfo = imageInfo(print), previewInfo = imageInfo(preview);
  if (!printInfo || !previewInfo) return null;
  const dir = path.join(ROOT, 'public', packDir);
  await mkdir(dir, { recursive: true });
  const printRel = `${packDir}/${base}-print.jpg`, previewRel = `${packDir}/${base}-web.webp`;
  await writeFile(path.join(ROOT, 'public', printRel), print);
  await writeFile(path.join(ROOT, 'public', previewRel), preview);
  return {
    printRel, previewRel,
    fields: {
      previewUrl: previewRel, imageUrl: printRel, sdDownloadUrl: previewRel, downloadUrl: printRel, hdDownloadUrls: [printRel, previewRel],
      originalWidth: printInfo.width, originalHeight: printInfo.height, fileBytes: print.length, fileFormat: 'JPEG', sha256: sha256(print),
      previewWidth: previewInfo.width, previewHeight: previewInfo.height, previewBytes: preview.length, previewSha256: sha256(preview),
      upstreamWidth: sourceWidth, upstreamHeight: sourceHeight,
      ...(Math.max(sourceWidth, sourceHeight) > Math.max(printInfo.width, printInfo.height) ? { processing: `Downscaled from ${sourceWidth}x${sourceHeight} to ${printInfo.width}x${printInfo.height} (long edge capped at ${maxEdge} px), JPEG q${PROCESSED.jpegQuality}. Never enlarged.` } : {}),
    },
  };
}

/** Common asset record for an open-licensed mirror. `rights` = { status, label, url, evidence, attribution, note? }. */
export function assetRecord({ id, category, title, subtitle, artist, year, kind, source, sourceUrl, sourceId, packId, rights, pair, tags, extra = {} }) {
  const now = today();
  return {
    id, category, title, subtitle, artist, year, kind, source, sourceUrl, ...pair.fields,
    rights: 'open-license', rightsStatus: rights.status, licenseLabel: rights.label, licenseUrl: rights.url, rightsEvidenceUrl: rights.evidence, attribution: rights.attribution,
    ...(rights.note ? { rightsNote: rights.note } : {}), ...(tags?.length ? { tags } : {}), ...extra,
    packId, sourceId, mirrored: true, upstreamRevision: now, checkedAt: now, ingestedAt: now,
  };
}
export async function fetchBuffer(url, options) { return (await getBuffer(url, { timeoutMs: 120_000, ...options })).buffer; }
export async function dropPack(packDir) { await rm(path.join(ROOT, 'public', packDir), { recursive: true, force: true }); }
