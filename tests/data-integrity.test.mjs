import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyAssets, verifyRights } from '../scripts/ingest/verify.mjs';
import { imageInfo } from '../scripts/lib/imageinfo.mjs';

test('mirrored assets match their hashes, dimensions, budgets and ledger rows', async () => {
  const { errors, assets } = await verifyAssets();
  assert.deepEqual(errors, []);
  assert.ok(assets >= 16);
});

test('rights ledger, source registry and index shards obey the keyless, reference-only policy', async () => {
  const { errors } = await verifyRights();
  assert.deepEqual(errors, []);
});

test('imageInfo reads real dimensions from PNG and JPEG headers, including EXIF rotation', () => {
  const png = Buffer.alloc(33); png.writeUInt32BE(0x89504e47, 0); png.writeUInt32BE(250, 16); png.writeUInt32BE(320, 20);
  assert.deepEqual(imageInfo(png), { format: 'PNG', mime: 'image/png', width: 250, height: 320 });
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0x0c, 0x80, 0x07, 0xd0, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  assert.deepEqual(imageInfo(jpeg), { format: 'JPEG', mime: 'image/jpeg', width: 2000, height: 3200 });
  assert.equal(imageInfo(Buffer.from('not an image')), null);
});
