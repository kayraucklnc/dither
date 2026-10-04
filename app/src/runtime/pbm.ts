// Framebuffers as PBM (P4) — the golden fixtures' format — and back.

import { Framebuffer } from "./framebuffer";

export function toPbm(fb: Framebuffer): Uint8Array {
  const head = new TextEncoder().encode(`P4\n${fb.width} ${fb.height}\n`);
  const out = new Uint8Array(head.length + fb.bits.length);
  out.set(head);
  out.set(fb.bits, head.length);
  return out;
}

export function fromPbm(bytes: Uint8Array): Framebuffer {
  const text = new TextDecoder("latin1").decode(bytes.subarray(0, 64));
  const m = /^P4\s+(\d+)\s+(\d+)\s/.exec(text);
  if (!m) throw new Error("Not a P4 PBM");
  const fb = new Framebuffer(Number(m[1]), Number(m[2]));
  fb.bits.set(bytes.subarray(m[0].length, m[0].length + fb.bits.length));
  return fb;
}
