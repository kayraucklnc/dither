import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Where rendered images live.
 *
 * Behind an interface because the default is a disk volume next to the server,
 * but the same app should be able to run against object storage without the
 * render pipeline knowing. Nothing above this module names a filesystem.
 */
export interface Store {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | undefined>;
  has(key: string): Promise<boolean>;
}

class DiskStore implements Store {
  constructor(private readonly root: string) {}

  private pathFor(key: string) {
    // Keys are hex fingerprints, but never trust one into a path.
    return path.join(this.root, key.replace(/[^a-z0-9._-]/gi, "_"));
  }

  async put(key: string, bytes: Buffer) {
    await mkdir(this.root, { recursive: true });
    await writeFile(this.pathFor(key), bytes);
  }

  async get(key: string) {
    try {
      return await readFile(this.pathFor(key));
    } catch {
      return undefined;
    }
  }

  async has(key: string) {
    return (await this.get(key)) !== undefined;
  }
}

const globalForStore = globalThis as unknown as { store?: Store };

export function store(): Store {
  globalForStore.store ??= new DiskStore(
    process.env.DITHER_STORAGE_DIR ?? path.join(process.cwd(), ".storage"),
  );

  return globalForStore.store;
}
