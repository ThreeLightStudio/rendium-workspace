/**
 * Utility to pack PNG blobs into ICO and ICNS binary containers.
 */

/**
 * Packs multiple PNG blobs into a single ICO file.
 * @param pngBlobs Map of size -> blob
 */
export async function packICO(pngBlobs: Map<number, Blob>): Promise<Blob> {
  const entries: {
    width: number;
    height: number;
    size: number;
    data: Uint8Array;
  }[] = [];
  let totalSize = 6 + 16 * pngBlobs.size; // Header(6) + Entries(16 * count)

  // Sort sizes ascending
  const sizes = Array.from(pngBlobs.keys()).sort((a, b) => a - b);

  for (const size of sizes) {
    const blob = pngBlobs.get(size);
    if (!blob) continue;
    const buffer = await blob.arrayBuffer();
    const data = new Uint8Array(buffer);
    entries.push({
      width: size >= 256 ? 0 : size,
      height: size >= 256 ? 0 : size,
      size: data.length,
      data,
    });
    totalSize += data.length;
  }

  const finalBuffer = new Uint8Array(totalSize);
  const view = new DataView(finalBuffer.buffer);

  // Header
  view.setUint16(0, 0, true); // Reserved
  view.setUint16(2, 1, true); // Type: 1 = ICO
  view.setUint16(4, entries.length, true); // Count

  let offset = 6 + 16 * entries.length;
  let entryOffset = 6;

  for (const entry of entries) {
    // Entry
    finalBuffer[entryOffset + 0] = entry.width;
    finalBuffer[entryOffset + 1] = entry.height;
    finalBuffer[entryOffset + 2] = 0; // Colors
    finalBuffer[entryOffset + 3] = 0; // Reserved
    view.setUint16(entryOffset + 4, 1, true); // Planes
    view.setUint16(entryOffset + 6, 32, true); // BPP
    view.setUint32(entryOffset + 8, entry.size, true); // Size
    view.setUint32(entryOffset + 12, offset, true); // Offset

    // Data
    finalBuffer.set(entry.data, offset);

    entryOffset += 16;
    offset += entry.size;
  }

  return new Blob([finalBuffer], { type: 'image/x-icon' });
}

/**
 * Packs multiple PNG blobs into a single ICNS file.
 * @param pngBlobs Map of size -> blob
 */
export async function packICNS(pngBlobs: Map<number, Blob>): Promise<Blob> {
  const ICNS_TAGS: Record<number, string> = {
    16: 'icp4',
    32: 'icp5',
    64: 'icp6',
    128: 'ic07',
    256: 'ic08',
    512: 'ic09',
    1024: 'ic10',
  };

  const blocks: { tag: string; data: Uint8Array }[] = [];
  let totalSize = 8; // Header(8)

  const sizes = Array.from(pngBlobs.keys()).filter((s) => ICNS_TAGS[s]);

  for (const size of sizes) {
    const tag = ICNS_TAGS[size];
    const blob = pngBlobs.get(size);
    if (!blob) continue;
    const buffer = await blob.arrayBuffer();
    const data = new Uint8Array(buffer);
    blocks.push({ tag, data });
    totalSize += 8 + data.length; // Tag(4) + Size(4) + Data
  }

  const finalBuffer = new Uint8Array(totalSize);
  const view = new DataView(finalBuffer.buffer);

  // Header: 'icns' + Full Length (Big Endian)
  finalBuffer.set(new TextEncoder().encode('icns'), 0);
  view.setUint32(4, totalSize, false);

  let offset = 8;
  for (const block of blocks) {
    finalBuffer.set(new TextEncoder().encode(block.tag), offset);
    view.setUint32(offset + 4, 8 + block.data.length, false);
    finalBuffer.set(block.data, offset + 8);
    offset += 8 + block.data.length;
  }

  return new Blob([finalBuffer], { type: 'image/x-icns' });
}
