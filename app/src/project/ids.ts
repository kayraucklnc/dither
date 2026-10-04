export function newId(prefix = ""): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return prefix + Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 8);
}
