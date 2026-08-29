/**
 * Minimal header sniffing for the client-side 16 px minimum-dimension check
 * (fer.client.ts) — cheap enough to run before any HTTP call. This is NOT a
 * decoder and does not touch pixel data; it only reads the fixed-offset
 * dimension fields each format's header always carries.
 *
 * Returns null when the format cannot be determined or the format is one
 * this sniffer does not cover (currently: WEBP lossless/extended chunk
 * layouts beyond simple VP8X). A null result means "skip the client-side
 * dimension check" — the FER service still enforces MIN_SOURCE_DIMENSION
 * server-side regardless, so this is an optimisation, not a safety net.
 */

export interface ImageDimensions {
  width: number;
  height: number;
}

export function sniffImageDimensions(buf: Buffer): ImageDimensions | null {
  if (isPng(buf)) return readPngDimensions(buf);
  if (isJpeg(buf)) return readJpegDimensions(buf);
  if (isBmp(buf)) return readBmpDimensions(buf);
  if (isWebp(buf)) return readWebpDimensions(buf);
  return null;
}

function isPng(buf: Buffer): boolean {
  return (
    buf.length >= 24 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  );
}

function readPngDimensions(buf: Buffer): ImageDimensions | null {
  if (buf.length < 24) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function isJpeg(buf: Buffer): boolean {
  return buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8;
}

const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function readJpegDimensions(buf: Buffer): ImageDimensions | null {
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buf[offset + 1];
    if (marker === undefined) break;
    if (SOF_MARKERS.has(marker)) {
      const height = buf.readUInt16BE(offset + 5);
      const width = buf.readUInt16BE(offset + 7);
      return { width, height };
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const segmentLength = buf.readUInt16BE(offset + 2);
    offset += 2 + segmentLength;
  }
  return null;
}

function isBmp(buf: Buffer): boolean {
  return buf.length >= 26 && buf[0] === 0x42 && buf[1] === 0x4d;
}

function readBmpDimensions(buf: Buffer): ImageDimensions | null {
  if (buf.length < 26) return null;
  const width = buf.readInt32LE(18);
  const height = Math.abs(buf.readInt32LE(22));
  return { width, height };
}

function isWebp(buf: Buffer): boolean {
  return (
    buf.length >= 30 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  );
}

function readWebpDimensions(buf: Buffer): ImageDimensions | null {
  const chunkId = buf.toString('ascii', 12, 16);
  if (chunkId === 'VP8X' && buf.length >= 30) {
    const width = 1 + (buf[24]! | (buf[25]! << 8) | (buf[26]! << 16));
    const height = 1 + (buf[27]! | (buf[28]! << 8) | (buf[29]! << 16));
    return { width, height };
  }
  if (chunkId === 'VP8 ' && buf.length >= 30) {
    // Lossy simple stream: dimensions sit 6 bytes into the VP8 frame tag,
    // each a 14-bit value packed little-endian with 2 flag bits above it.
    const width = (buf.readUInt16LE(26) & 0x3fff);
    const height = (buf.readUInt16LE(28) & 0x3fff);
    return { width, height };
  }
  // VP8L and any other chunk layout: not covered, caller falls back to
  // server-side enforcement only.
  return null;
}
