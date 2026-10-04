// Assets a compile uses, each once, in first-use order. Indices are handed out
// while drawing; bytes are only fetched at the end.

export class AssetTable {
  private keys = new Map<string, number>();
  private loaders: (() => Promise<Uint8Array>)[] = [];

  add(key: string, load: () => Promise<Uint8Array>): number {
    const hit = this.keys.get(key);
    if (hit !== undefined) return hit;
    const index = this.loaders.length;
    this.keys.set(key, index);
    this.loaders.push(load);
    return index;
  }

  get size(): number {
    return this.loaders.length;
  }

  resolve(): Promise<Uint8Array[]> {
    return Promise.all(this.loaders.map((load) => load()));
  }
}
