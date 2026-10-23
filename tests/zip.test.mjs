import test from 'node:test';
import assert from 'node:assert/strict';
import { createZip } from '../src/lib/zip.ts';

test('ZIP writer stores UTF-8 filenames and file bytes in a valid single-file archive', () => {
  const source = new TextEncoder().encode('Rupa archive');
  const archive = createZip([{ name: '作品/cover.txt', data: source }]);
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint16(6, true) & 0x0800, 0x0800);
  assert.equal(view.getUint32(archive.length - 22, true), 0x06054b50);
  assert.equal(view.getUint16(archive.length - 14, true), 1);
  assert.ok(new TextDecoder().decode(archive).includes('作品/cover.txt'));
  assert.ok(new TextDecoder().decode(archive).includes('Rupa archive'));
});

test('ZIP writer rejects duplicate and unsafe entry names', () => {
  const data = new Uint8Array([1]);
  assert.throws(() => createZip([{ name: '../outside.png', data }]), /safe relative/);
  assert.throws(() => createZip([{ name: 'same.png', data }, { name: 'same.png', data }]), /duplicate/);
});
