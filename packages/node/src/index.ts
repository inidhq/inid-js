import { createHash, createHmac, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, timingSafeEqual, type JsonWebKey } from "node:crypto";

// InID for an organization's server. No dependencies: it only uses fetch and node:crypto.
//
//   const inid = createInID({ secretKey: process.env.INID_SECRET_KEY, webhookSecret: process.env.INID_WEBHOOK_SECRET });
//   const customer = await inid.exchange(token);                 // a token from the pixel or a webhook
//   const event = inid.verifyWebhook(rawBody, req.headers["inid-signature"]);  // throws if forged
//
// A secret key that works only from your server: make a key once (generateServerKey), keep
// it where you keep secrets, pass it as serverKey and call inid.tieServerKey() one time.
// From then on InID refuses your secret key unless the request is signed by that key, so
// a secret key that leaks (a log, a backup, a proxy) is no use to anyone else.

export interface Customer {
  sub: string; // stable id of this buyer at this organization (different at every organization)
  given_name?: string;
  family_name?: string;
  phone_number?: string; // E.164: "+573001234567"
  // The same number as people write it in your organization's country ("300 1234567"), only when
  // the phone is from that country
  phone_local?: string;
  phone_number_verified?: boolean; // proven with a code
  email?: string;
  email_verified?: boolean;
  // type is the document's kind in its country ("CC" in Colombia, "CURP" in Mexico, "PA" for a passport)
  national_id?: { type: string; number: string; verification: "declared" | "verified" };
  // country: ISO 3166-1 ("CO", "MX"); region: the state, department or province as the buyer names it
  address?: { line: string; details?: string; neighborhood?: string; city: string; region: string; country: string; postalCode?: string; notes?: string };
}

export type WebhookEvent =
  | { type: "customer.registered"; token: string; created_at: string }
  | { type: "checkout.abandoned"; token: string; created_at: string }
  // The buyer closed their InID everywhere: close this customer's sessions (by sub)
  | { type: "customer.logged_out"; sub: string; created_at: string }
  // An app's users (sign-in with InID): new, changed, gone; a session started or ended.
  // Only the app's id for them (and the session's): ask for the data with GET /v1/users/:sub
  | { type: "user.created" | "user.updated"; sub: string; created_at: string }
  // Gone from the app. token (unless they deleted their InID): trade it once, within a day,
  // for their data as they were then (POST /v1/tokens/exchange), the app's last copy
  | { type: "user.deleted"; sub: string; token?: string; created_at: string }
  // Asked in Mi InID to cancel a subscription the app reported (subscription: the app's id)
  | { type: "subscription.cancel_requested"; sub: string; subscription: string; created_at: string }
  | { type: "session.created" | "session.ended"; sub: string; sid: string; created_at: string };

export interface InIDOptions {
  secretKey: string;
  webhookSecret?: string;
  apiUrl?: string; // default https://id.inid.co
  // The private key of this server (from generateServerKey), to sign every request
  serverKey?: JsonWebKey;
  // Where an organization's own settings live in InID (tying its server key)
  accountUrl?: string; // default https://panel.inid.co
  fetch?: typeof fetch;
}

export class InIDError extends Error {
  constructor(public code: string, public status?: number) {
    super(code);
  }
}

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

// A new key for this server (ES256), as a private JWK: organization it like the secret key
export function generateServerKey(): JsonWebKey {
  return generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({ format: "jwk" });
}

// Signs each request with the server's key (a DPoP proof, RFC 9449): it names the request
// and the secret key, and is good once
function prover(serverKey: JsonWebKey, secretKey: string) {
  const privateKey = createPrivateKey({ key: serverKey, format: "jwk" });
  const { kty, crv, x, y } = createPublicKey(privateKey).export({ format: "jwk" });
  const jwk = { kty, crv, x, y };
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const ath = createHash("sha256").update(secretKey).digest("base64url");
  return {
    jwk,
    proof(method: string, url: string) {
      const address = new URL(url);
      const data = `${b64({ typ: "dpop+jwt", alg: "ES256", jwk })}.${b64({ jti: randomBytes(16).toString("base64url"), htm: method, htu: `${address.origin}${address.pathname}`, iat: Math.floor(Date.now() / 1000), ath })}`;
      return `${data}.${sign("sha256", Buffer.from(data), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
    },
  };
}

export function createInID({ secretKey, webhookSecret, apiUrl = "https://id.inid.co", serverKey, accountUrl = "https://panel.inid.co", fetch: fetcher = fetch }: InIDOptions) {
  if (!secretKey?.startsWith("sk_")) throw new InIDError("invalid_secret_key");
  const signer = serverKey ? prover(serverKey, secretKey) : null;
  // The secret key and, with a server key, the proof for this one request
  const auth = (method: string, url: string) => ({ authorization: `Bearer ${secretKey}`, ...(signer && { dpop: signer.proof(method, url) }) });

  return {
    // A one-time token (from the page or a webhook) for the buyer's data. Each token works once.
    async exchange(token: string): Promise<Customer> {
      const res = await fetcher(`${apiUrl}/v1/tokens/exchange`, {
        method: "POST",
        headers: { ...auth("POST", `${apiUrl}/v1/tokens/exchange`), "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new InIDError(body.error || "exchange_failed", res.status);
      return body as Customer;
    },

    // Invite a customer the organization already has (logged in) to save their data in InID.
    // Put the returned token in the pixel: <script ... data-invite="enr_...">
    async invite(customer: { phone: string; profile?: Record<string, unknown> }): Promise<{ token: string; url: string; expiresAt: string }> {
      const res = await fetcher(`${apiUrl}/v1/enrollments`, {
        method: "POST",
        headers: { ...auth("POST", `${apiUrl}/v1/enrollments`), "content-type": "application/json" },
        body: JSON.stringify(customer),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new InIDError(body.error || "invite_failed", res.status);
      return { ...body, token: String(body.url).split("/e/")[1] };
    },

    // The headers for any other request to InID with the secret key (the funnel, the
    // account): the key and, with a server key, its proof for that request
    headers: auth,

    // Once: ties the secret key to this server's key. Afterwards InID refuses the secret
    // key without a proof from it. To change the key later, pass the new public key.
    async tieServerKey(next?: JsonWebKey): Promise<{ jkt: string }> {
      if (!signer) throw new InIDError("server_key_missing");
      const url = `${accountUrl}/v1/server-key`;
      const res = await fetcher(url, { method: "PUT", headers: { ...auth("PUT", url), "content-type": "application/json" }, body: JSON.stringify(next ? { jwk: { kty: next.kty, crv: next.crv, x: next.x, y: next.y } } : {}) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new InIDError(body.error || "server_key_failed", res.status);
      return body.serverKey;
    },

    // The webhook body as received (raw bytes, before any JSON parsing) and its header
    verifyWebhook(rawBody: string | Buffer, signature: string | undefined, now = Math.floor(Date.now() / 1000)): WebhookEvent {
      if (!webhookSecret) throw new InIDError("webhook_secret_missing");
      const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
      const parts = Object.fromEntries(String(signature || "").split(",").map((p) => p.split("=") as [string, string]));
      const at = Number(parts.t);
      if (!at || !parts.v1 || Math.abs(now - at) > SIGNATURE_TOLERANCE_SECONDS) throw new InIDError("invalid_signature");
      const expected = createHmac("sha256", webhookSecret).update(`${at}.${body}`).digest();
      const given = Buffer.from(parts.v1, "hex");
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new InIDError("invalid_signature");
      return JSON.parse(body) as WebhookEvent;
    },
  };
}

export type InID = ReturnType<typeof createInID>;
