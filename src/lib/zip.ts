export interface ZipEntry { name: string; data: Uint8Array }
const U32_MAX = 0xffffffff;
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  return crc >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let crc = U32_MAX;
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ U32_MAX) >>> 0;
}
function safeName(value: string): string {
  const normalized = value.normalize('NFC').replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || /^[a-z]:/i.test(normalized) || normalized.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('ZIP names must be safe relative paths.');
  return normalized;
}
function header(size: number): { bytes: Uint8Array; view: DataView } {
  const bytes = new Uint8Array(size);
  return { bytes, view: new DataView(bytes.buffer) };
}
function join(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, item) => sum + item.byteLength, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.byteLength; }
  return output;
}

/** Writes an uncompressed ZIP archive (store method) without dependencies or a compression worker. */
export function createZip(input: ZipEntry[]): Uint8Array {
  if (!input.length) throw new Error('Choose at least one file to export.');
  if (input.length > 65_535) throw new Error('This archive has too many files.');
  const encoder = new TextEncoder(), names = new Set<string>(), locals: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0, centralSize = 0;
  for (const entry of input) {
    const name = safeName(entry.name), key = name.toLocaleLowerCase();
    if (names.has(key)) throw new Error('ZIP archive contains a duplicate file name.');
    names.add(key);
    const filename = encoder.encode(name), data = entry.data;
    if (filename.byteLength > 65_535 || data.byteLength > U32_MAX || offset > U32_MAX) throw new Error('This archive exceeds the ZIP format limits.');
    const crc = crc32(data), local = header(30 + filename.byteLength), lv = local.view;
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true); lv.setUint16(12, 0x21, true); lv.setUint32(14, crc, true); lv.setUint32(18, data.byteLength, true); lv.setUint32(22, data.byteLength, true);
    lv.setUint16(26, filename.byteLength, true); lv.setUint16(28, 0, true); local.bytes.set(filename, 30);
    locals.push(local.bytes, data);
    const record = header(46 + filename.byteLength), cv = record.view;
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true); cv.setUint16(14, 0x21, true); cv.setUint32(16, crc, true); cv.setUint32(20, data.byteLength, true); cv.setUint32(24, data.byteLength, true);
    cv.setUint16(28, filename.byteLength, true); cv.setUint16(30, 0, true); cv.setUint16(32, 0, true); cv.setUint16(34, 0, true); cv.setUint16(36, 0, true); cv.setUint32(38, 0, true); cv.setUint32(42, offset, true); record.bytes.set(filename, 46);
    central.push(record.bytes); centralSize += record.bytes.byteLength; offset += 30 + filename.byteLength + data.byteLength;
  }
  if (centralSize > U32_MAX || offset > U32_MAX) throw new Error('This archive exceeds the ZIP format limits.');
  const end = header(22), view = end.view;
  view.setUint32(0, 0x06054b50, true); view.setUint16(4, 0, true); view.setUint16(6, 0, true); view.setUint16(8, input.length, true); view.setUint16(10, input.length, true);
  view.setUint32(12, centralSize, true); view.setUint32(16, offset, true); view.setUint16(20, 0, true);
  return join([...locals, ...central, end.bytes]);
}
