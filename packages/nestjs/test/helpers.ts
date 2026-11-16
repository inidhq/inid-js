import { createHmac, createSign, generateKeyPairSync } from "node:crypto";

// A test InID: its keys, ID tokens it signs, and fetch answering its JWKS and token endpoint
export const issuer = "https://id.inid.example";
export const config = { publishableKey: "pk_test_x", secretKey: "sk_test_x", issuer };

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

export function idToken(claims: Record<string, unknown> = {}, ttl = 600) {
  const now = Math.floor(Date.now() / 1000);
  const head = `${b64({ alg: "RS256", kid: "k1" })}.${b64({ iss: issuer, aud: config.publishableKey, sub: "u1", exp: now + ttl, given_name: "Ana", email: "ana@example.com", ...claims })}`;
  return `${head}.${createSign("RSA-SHA256").update(head).sign(privateKey).toString("base64url")}`;
}

// What the token endpoint renews a session with
export const renewed = { id_token: "", refresh_token: "r2" };

export function stubFetch() {
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL) => {
    if (String(url) === `${issuer}/.well-known/jwks.json`) return new Response(JSON.stringify({ keys: [jwk] }));
    if (String(url) === `${issuer}/oauth/token`) return new Response(JSON.stringify({ ...renewed, access_token: "a", expires_in: 600 }), { headers: { "content-type": "application/json" } });
    return new Response("", { status: 404 });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = real;
  };
}

// An InID webhook's signature header, as @inid/node checks it
export const signWebhook = (secret: string, body: string, at = Math.floor(Date.now() / 1000)) => `t=${at},v1=${createHmac("sha256", secret).update(`${at}.${body}`).digest("hex")}`;
