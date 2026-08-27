import { createDecipheriv, createHash } from "node:crypto";

/**
 * Decrypts Trenord's journey planner responses.
 *
 * The body is AES-256-ECB under a key that is the raw SHA-256 digest of a
 * passphrase shipped in Trenord's own JavaScript bundle. It is obfuscation
 * rather than security, but it is the only thing between us and the JSON.
 *
 * The passphrase is an environment variable rather than a constant, because it
 * is the one fragile part: a new bundle with a new passphrase breaks
 * decryption silently, and swapping a variable beats a release.
 */
const FALLBACK = "8hI&WK=1NQ55*f^yyZkdEGWYyN{S";

export class RotatedPassphrase extends Error {}

export function decrypt(body: Buffer): unknown {
  const passphrase = process.env.TRENORD_PASSPHRASE || FALLBACK;
  const key = createHash("sha256").update(passphrase).digest();

  let plain: string;

  try {
    const decipher = createDecipheriv("aes-256-ecb", key, null);
    plain = Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } catch {
    throw new RotatedPassphrase(
      "Could not decrypt Trenord's reply. Its passphrase has probably rotated; " +
        "set TRENORD_PASSPHRASE to the new one.",
    );
  }

  try {
    return JSON.parse(plain);
  } catch {
    // Decryption "succeeding" into rubbish is what a wrong key looks like, so
    // this is the same failure wearing a different hat.
    throw new RotatedPassphrase(
      "Trenord's reply decrypted into something that is not JSON. Its passphrase " +
        "has probably rotated; set TRENORD_PASSPHRASE to the new one.",
    );
  }
}
