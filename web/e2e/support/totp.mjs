import { createHmac } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(text) {
  let bits = "";
  for (const char of text.replace(/=+$/, "")) bits += ALPHABET.indexOf(char).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** The 6 digit code an authenticator app shows for this secret at this time (RFC 6238, SHA1, 30 seconds). Used by the fake API and the tests. */
export function totp(secret, atMs = Date.now(), stepOffset = 0) {
  const counter = Math.floor(atMs / 1000 / 30) + stepOffset;
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Decode(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const number = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(number).padStart(6, "0");
}

/** Whether this code is right for the secret now, allowing the step before and after like the real API does. */
export function totpMatches(secret, code) {
  return [-1, 0, 1].some((offset) => totp(secret, Date.now(), offset) === code);
}
