import { createCipheriv, createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { decrypt, RotatedPassphrase } from "./cipher";

/** Encrypt the way Trenord does, so the decryption is tested against its shape. */
function asTrenordWould(value: unknown, passphrase: string): Buffer {
  const key = createHash("sha256").update(passphrase).digest();
  const cipher = createCipheriv("aes-256-ecb", key, null);

  return Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
}

const PASSPHRASE = "8hI&WK=1NQ55*f^yyZkdEGWYyN{S";

describe("decrypting Trenord", () => {
  it("reads a body encrypted under the shipped passphrase", () => {
    const payload = { solutions: [{ dep_time: "08:15:00" }], hafas_alerts: [] };

    expect(decrypt(asTrenordWould(payload, PASSPHRASE))).toEqual(payload);
  });

  it("says the passphrase has rotated rather than failing obscurely", () => {
    // A wrong key usually decrypts into rubbish rather than throwing, so both
    // paths have to land on the same explanation.
    expect(() => decrypt(asTrenordWould({ a: 1 }, "the old one"))).toThrow(RotatedPassphrase);
    expect(() => decrypt(Buffer.from("not even ciphertext"))).toThrow(RotatedPassphrase);
  });
});
