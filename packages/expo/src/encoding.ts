// Small encoders that don't rely on what React Native may lack (atob/btoa, TextDecoder,
// URL.searchParams): base64url, UTF-8 and query strings in plain TypeScript.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const LOOKUP = new Map([...ALPHABET].map((c, i) => [c, i]));

export function base64url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += ALPHABET[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += ALPHABET[n & 63];
  }
  return out;
}

// Accepts base64url and plain base64 (with or without padding); throws on anything else
export function fromBase64url(text: string): Uint8Array {
  const clean = text.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  if (clean.length % 4 === 1) throw new Error("bad base64");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let value = 0;
  let at = 0;
  for (const c of clean) {
    const v = LOOKUP.get(c);
    if (v === undefined) throw new Error("bad base64");
    value = (value << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[at++] = (value >> bits) & 255;
    }
  }
  return out;
}

export function utf8Decode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i++];
    let code: number;
    if (b < 0x80) code = b;
    else if (b >= 0xf0) code = ((b & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
    else if (b >= 0xe0) code = ((b & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
    else code = ((b & 31) << 6) | (bytes[i++] & 63);
    out += String.fromCodePoint(code);
  }
  return out;
}

export const hexToBytes = (hex: string) => {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
};

export const toQuery = (params: Record<string, string | undefined>) =>
  Object.entries(params)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

// The parameters of a URL's query and fragment (a redirect may carry either)
export function queryOf(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const hash = url.indexOf("#");
  const query = url.indexOf("?");
  const parts = [query >= 0 ? url.slice(query + 1, hash > query ? hash : undefined) : "", hash >= 0 ? url.slice(hash + 1) : ""];
  for (const part of parts) {
    for (const pair of part.split("&")) {
      if (!pair) continue;
      const eq = pair.indexOf("=");
      const decode = (s: string) => decodeURIComponent(s.replace(/\+/g, " "));
      const key = decode(eq >= 0 ? pair.slice(0, eq) : pair);
      if (!(key in out)) out[key] = eq >= 0 ? decode(pair.slice(eq + 1)) : "";
    }
  }
  return out;
}
