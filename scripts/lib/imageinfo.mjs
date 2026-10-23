// Decode-free image header parser (JPEG, PNG, WebP, GIF). Returns real pixel size from the file itself.
export function imageInfo(buffer) {
  if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47) return { format: 'PNG', mime: 'image/png', width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  if (buffer.length > 10 && buffer.toString('ascii', 0, 3) === 'GIF') return { format: 'GIF', mime: 'image/gif', width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  if (buffer.length > 30 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buffer.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return { format: 'WebP', mime: 'image/webp', width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
    if (chunk === 'VP8 ') return { format: 'WebP', mime: 'image/webp', width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L') { const bits = buffer.readUInt32LE(21); return { format: 'WebP', mime: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }; }
  }
  if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2, orientation;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset++; continue; }
      const marker = buffer[offset + 1];
      if (marker === 0xff) { offset++; continue; }
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { offset += 2; continue; }
      const length = buffer.readUInt16BE(offset + 2);
      if (marker === 0xe1 && buffer.toString('ascii', offset + 4, offset + 8) === 'Exif') orientation = exifOrientation(buffer, offset + 10, offset + 2 + length);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        const height = buffer.readUInt16BE(offset + 5), width = buffer.readUInt16BE(offset + 7);
        return { format: 'JPEG', mime: 'image/jpeg', width, height, ...(orientation && orientation > 4 ? { width: height, height: width } : {}), ...(orientation ? { exifOrientation: orientation } : {}) };
      }
      offset += 2 + length;
    }
  }
  return null;
}
function exifOrientation(buffer, start, end) {
  const little = buffer.toString('ascii', start, start + 2) === 'II', u16 = o => little ? buffer.readUInt16LE(o) : buffer.readUInt16BE(o), u32 = o => little ? buffer.readUInt32LE(o) : buffer.readUInt32BE(o);
  try {
    const ifd = start + u32(start + 4), count = u16(ifd);
    for (let i = 0; i < count; i++) { const entry = ifd + 2 + i * 12; if (entry + 12 > end) break; if (u16(entry) === 0x0112) return u16(entry + 8); }
  } catch {}
  return undefined;
}
