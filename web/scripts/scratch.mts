/**
 * A screen and a device the checks may scribble on.
 *
 * Interactive checks drive the real editor, which means they save. Pointing
 * them at whatever happened to be seeded has already scrambled a real screen
 * three times, so they get their own - created on demand, reused after, and
 * obviously named.
 */
const base = process.env.DITHER_URL ?? "http://localhost:3000";

export interface Scratch {
  screenId: number;
  deviceId: number;
}

export async function scratch(): Promise<Scratch> {
  const screens = await fetch(`${base}/api/scratch`).then((response) => response.json());
  return screens as Scratch;
}
