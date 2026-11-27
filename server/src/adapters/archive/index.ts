/**
 * archive adapter — in-memory zip reader for skill import (M2).
 *
 * Uses fflate (pure JS). Nothing is written to disk and nothing is executed:
 * the caller gets the entry list and the bytes of the entries it picked. The
 * `pick` filter runs on the central directory BEFORE decompression, so
 * unpicked entries (scripts, binaries, large files) are never inflated.
 */
import { unzipSync } from 'fflate';

export interface ArchiveEntry {
  path: string;
  size: number;
}

export interface ArchiveReader {
  read(
    bytes: Uint8Array,
    pick: (entry: ArchiveEntry) => boolean,
  ): { entries: ArchiveEntry[]; files: Record<string, Uint8Array> };
}

export class FflateArchiveReader implements ArchiveReader {
  read(bytes: Uint8Array, pick: (entry: ArchiveEntry) => boolean) {
    const entries: ArchiveEntry[] = [];
    const files = unzipSync(bytes, {
      filter: (f) => {
        const entry = { path: f.name, size: f.originalSize };
        entries.push(entry);
        return pick(entry);
      },
    });
    return { entries, files };
  }
}
