// RSASSA-PKCS1-v1_5 with SHA-256 (RS256) signature verification in plain TypeScript, for
// runtimes without WebCrypto's subtle (React Native/Hermes). Only verification, only with
// public keys, so there are no secrets to keep from timing: a BigInt modular exponentiation
// and a byte comparison (RFC 8017, 8.2.2).

import { fromBase64url } from "./encoding.js";

// DER of DigestInfo for SHA-256, followed by the 32-byte hash
const SHA256_PREFIX = [0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05, 0x00, 0x04, 0x20];

const toBigInt = (bytes: Uint8Array) => {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n;
};

export function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let b = base % modulus;
  let e = exponent;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % modulus;
    e >>= 1n;
    b = (b * b) % modulus;
  }
  return result;
}

export interface RsaPublicJwk {
  n: string;
  e: string;
}

// signature: the raw signature bytes; hash: SHA-256 of the signed data (32 bytes)
export function verifyRs256(key: RsaPublicJwk, signature: Uint8Array, hash: Uint8Array): boolean {
  if (hash.length !== 32) return false;
  const modulusBytes = fromBase64url(key.n);
  let start = 0;
  while (start < modulusBytes.length && modulusBytes[start] === 0) start++;
  const k = modulusBytes.length - start;
  // At least 2048-bit keys, and the signature exactly as long as the modulus
  if (k < 256 || signature.length !== k) return false;
  const n = toBigInt(modulusBytes);
  const e = toBigInt(fromBase64url(key.e));
  const s = toBigInt(signature);
  if (s >= n || e < 3n) return false;
  let m = modPow(s, e, n);
  // The encoded message, k bytes: 00 01 FF..FF 00 DigestInfo hash
  const em = new Uint8Array(k);
  for (let i = k - 1; i >= 0; i--) {
    em[i] = Number(m & 255n);
    m >>= 8n;
  }
  const tail = [...SHA256_PREFIX, ...hash];
  const padEnd = k - tail.length - 1;
  let ok = em[0] === 0 && em[1] === 1 && em[padEnd] === 0 && padEnd >= 10;
  for (let i = 2; i < padEnd; i++) ok = ok && em[i] === 0xff;
  for (let i = 0; i < tail.length; i++) ok = ok && em[padEnd + 1 + i] === tail[i];
  return ok;
}
