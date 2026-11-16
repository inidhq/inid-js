import { createHash, createSign, generateKeyPairSync, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createInIDClient, has, type InIDDeps, STORAGE_KEYS, userOf, verifyIdToken } from "../src/client.js";
import { base64url, fromBase64url, queryOf } from "../src/encoding.js";
import { verifyRs256 } from "../src/rsa.js";

const issuer = "https://id.inid.example";
const pk = "pk_test_app";
const redirectUri = "nube://callback";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const nowSec = () => Math.floor(Date.now() / 1000);
function sign(claims: Record<string, unknown>, { key = privateKey, kid = "k1" } = {}) {
  const input = `${b64({ alg: "RS256", kid, typ: "JWT" })}.${b64(claims)}`;
  return `${input}.${createSign("RSA-SHA256").update(input).sign(key).toString("base64url")}`;
}
const claims = (extra: Record<string, unknown> = {}) => ({
  iss: issuer,
  aud: pk,
  sub: "usr_1",
  exp: nowSec() + 600,
  iat: nowSec(),
  given_name: "José",
  family_name: "Pérez",
  email: "jose@example.com",
  email_verified: true,
  roles: ["admin"],
  permissions: ["invoices:read"],
  ...extra,
});

const sha256 = async (text: string) => new Uint8Array(createHash("sha256").update(text).digest());

// A fake InID: JWKS, token endpoint (code and refresh), revoke
function fakeInID() {
  const calls: Array<{ url: string; headers: Record<string, string>; body: Record<string, string> }> = [];
  const state = { nonce: "", refreshStatus: 200, refreshThrows: false, nextExp: nowSec() + 600 };
  const fakeFetch = (async (input: string, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? queryOf(`?${init.body}`) : {};
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string>, body });
    if (url.endsWith("/.well-known/jwks.json")) return Response.json({ keys: [jwk] });
    if (url.endsWith("/oauth/token")) {
      if (body.grant_type === "authorization_code") return Response.json({ id_token: sign(claims({ nonce: state.nonce })), refresh_token: "rt_1", token_type: "Bearer" });
      if (state.refreshThrows) throw new TypeError("Network request failed");
      if (state.refreshStatus !== 200) return Response.json({ error: "invalid_grant" }, { status: state.refreshStatus });
      return Response.json({ id_token: sign(claims({ exp: state.nextExp })), refresh_token: "rt_2" });
    }
    if (url.endsWith("/oauth/revoke")) return new Response(null, { status: 200 });
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { fetch: fakeFetch, calls, state };
}

function setup(stored: Record<string, string> = {}) {
  const inid = fakeInID();
  const storage = new Map(Object.entries(stored));
  const opened: string[] = [];
  const deps: InIDDeps = {
    storage: {
      getItem: async (k) => storage.get(k) ?? null,
      setItem: async (k, v) => void storage.set(k, v),
      deleteItem: async (k) => void storage.delete(k),
    },
    sha256,
    randomBytes: (n) => new Uint8Array(randomBytes(n)),
    // InID's page: signs in and sends the person back with the code and the same state
    openAuthSession: async (url) => {
      opened.push(url);
      const q = queryOf(url);
      inid.state.nonce = q.nonce;
      return { type: "success", url: `${redirectUri}?code=c_1&state=${q.state}` };
    },
    fetch: inid.fetch,
  };
  const client = createInIDClient({ publishableKey: pk, issuer, redirectUri, locale: "en" }, deps);
  return { client, inid, storage, opened, deps };
}

describe("authorize URL", () => {
  it("has PKCE S256, state, nonce, client_id and redirect_uri; entrance and login_hint when asked", async () => {
    const { client } = setup();
    const { url, flow } = await client.authorizeUrl({ entrance: "team", loginHint: "+56911112222" });
    expect(url.startsWith(`${issuer}/oauth/authorize?`)).toBe(true);
    const q = queryOf(url);
    expect(q).toMatchObject({
      client_id: pk,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid profile email phone",
      state: flow.state,
      nonce: flow.nonce,
      code_challenge_method: "S256",
      ui_locales: "en",
      entrance: "team",
      login_hint: "+56911112222",
    });
    expect(q.code_challenge).toBe(base64url(await sha256(flow.verifier)));
    expect(flow.verifier.length).toBeGreaterThanOrEqual(43);
    expect(q.prompt).toBeUndefined();
  });

  it("asks again (prompt=login) after a sign-out, and not after the next sign-in", async () => {
    const { client, opened } = setup();
    await client.signIn();
    await client.signOut();
    expect(queryOf((await client.authorizeUrl()).url).prompt).toBe("login");
    await client.signIn();
    expect(queryOf(opened[1]).prompt).toBe("login");
    expect(queryOf((await client.authorizeUrl()).url).prompt).toBeUndefined();
  });
});

describe("sign-in", () => {
  it("trades the code with client_id and no Authorization header, verifies the token and stores it", async () => {
    const { client, inid, storage } = setup();
    const user = await client.signIn();
    expect(user).toMatchObject({ id: "usr_1", name: "José Pérez", roles: ["admin"] });
    const exchange = inid.calls.find((c) => c.url === `${issuer}/oauth/token`)!;
    expect(exchange.body).toMatchObject({ grant_type: "authorization_code", code: "c_1", redirect_uri: redirectUri, client_id: pk });
    expect(exchange.body.code_verifier).toMatch(/^[\w-]{43,}$/);
    expect(Object.keys(exchange.headers).map((k) => k.toLowerCase())).not.toContain("authorization");
    expect(storage.get(STORAGE_KEYS.refreshToken)).toBe("rt_1");
    expect(storage.get(STORAGE_KEYS.idToken)).toBeTruthy();
    expect(client.getState().user?.email).toBe("jose@example.com");
  });

  it("rejects a mismatched state and returns null when the person closes the page", async () => {
    const { client, deps } = setup();
    deps.openAuthSession = async () => ({ type: "success", url: `${redirectUri}?code=c_1&state=forged` });
    await expect(client.signIn()).rejects.toThrow("state_mismatch");
    deps.openAuthSession = async () => ({ type: "cancel" });
    expect(await client.signIn()).toBeNull();
  });
});

describe("ID token verification", () => {
  const keyFor = async (kid: string) => (kid === "k1" ? (jwk as { n: string; e: string }) : null);
  const check = (token: string, nonce?: string) => verifyIdToken(token, { issuer, audience: pk, nonce, keyFor, sha256 });

  it("accepts a good token and its nonce", async () => {
    expect((await check(sign(claims({ nonce: "n1" })), "n1"))?.claims.sub).toBe("usr_1");
  });
  it("refuses a wrong aud, iss or nonce", async () => {
    expect(await check(sign(claims({ aud: "pk_test_other" })))).toBeNull();
    expect(await check(sign(claims({ iss: "https://evil.example" })))).toBeNull();
    expect(await check(sign(claims({ nonce: "n1" })), "n2")).toBeNull();
  });
  it("refuses a bad signature, another key, an unknown kid and alg none", async () => {
    const good = sign(claims());
    const [header, payload] = good.split(".");
    const forged = `${header}.${b64(claims({ sub: "usr_2" }))}.${good.split(".")[2]}`;
    expect(await check(forged)).toBeNull();
    expect(await check(sign(claims(), { key: other.privateKey }))).toBeNull();
    expect(await check(sign(claims(), { kid: "nope" }))).toBeNull();
    expect(await check(`${b64({ alg: "none", kid: "k1" })}.${payload}.`)).toBeNull();
  });
  it("marks an ended token expired", async () => {
    expect((await check(sign(claims({ exp: nowSec() - 5 }))))?.expired).toBe(true);
  });
  it("the RSA verifier matches node:crypto", async () => {
    const sig = createSign("RSA-SHA256").update("hello").sign(privateKey);
    expect(verifyRs256(jwk as { n: string; e: string }, new Uint8Array(sig), await sha256("hello"))).toBe(true);
    expect(verifyRs256(jwk as { n: string; e: string }, new Uint8Array(sig), await sha256("hellp"))).toBe(false);
    expect(fromBase64url(base64url(new Uint8Array([1, 2, 3, 250])))).toEqual(new Uint8Array([1, 2, 3, 250]));
  });
});

describe("renewal", () => {
  it("restores from storage and renews near expiry with the refresh token and client_id", async () => {
    const { client, inid, storage } = setup({ [STORAGE_KEYS.idToken]: sign(claims({ exp: nowSec() + 30 })), [STORAGE_KEYS.refreshToken]: "rt_1" });
    await client.load();
    const refresh = inid.calls.find((c) => c.body.grant_type === "refresh_token")!;
    expect(refresh.body).toMatchObject({ refresh_token: "rt_1", client_id: pk });
    expect(Object.keys(refresh.headers).map((k) => k.toLowerCase())).not.toContain("authorization");
    expect(client.getState()).toMatchObject({ isLoaded: true, user: { id: "usr_1" } });
    expect(storage.get(STORAGE_KEYS.refreshToken)).toBe("rt_2");
    expect(client.getState().expiresAt).toBe(inid.state.nextExp);
  });

  it("uses a stored token that is still good without asking InID", async () => {
    const { client, inid } = setup({ [STORAGE_KEYS.idToken]: sign(claims()), [STORAGE_KEYS.refreshToken]: "rt_1" });
    await client.load();
    expect(inid.calls).toHaveLength(0);
    expect(await client.getToken()).toBeTruthy();
  });

  it("a 4xx ends the session and clears storage", async () => {
    const { client, inid, storage } = setup({ [STORAGE_KEYS.idToken]: sign(claims({ exp: nowSec() + 30 })), [STORAGE_KEYS.refreshToken]: "rt_1" });
    inid.state.refreshStatus = 400;
    await client.load();
    expect(client.getState().user).toBeNull();
    expect(storage.has(STORAGE_KEYS.refreshToken)).toBe(false);
  });

  it("a network error keeps a still-valid session; an expired one doesn't count", async () => {
    const { client, inid } = setup({ [STORAGE_KEYS.idToken]: sign(claims({ exp: nowSec() + 30 })), [STORAGE_KEYS.refreshToken]: "rt_1" });
    inid.state.refreshThrows = true;
    await client.load();
    expect(client.getState().user?.id).toBe("usr_1");
    expect(await client.getToken()).toBeTruthy();
    const ended = setup({ [STORAGE_KEYS.idToken]: sign(claims({ exp: nowSec() - 5 })), [STORAGE_KEYS.refreshToken]: "rt_1" });
    ended.inid.state.refreshThrows = true;
    await ended.client.load();
    expect(ended.client.getState().user).toBeNull();
    expect(await ended.client.getToken()).toBeNull();
  });
});

describe("sign-out", () => {
  it("revokes the refresh token with client_id only and clears storage", async () => {
    const { client, inid, storage } = setup();
    await client.signIn();
    await client.signOut();
    const revoke = inid.calls.find((c) => c.url === `${issuer}/oauth/revoke`)!;
    expect(revoke.body).toEqual({ token: "rt_1", token_type_hint: "refresh_token", client_id: pk });
    expect(Object.keys(revoke.headers).map((k) => k.toLowerCase())).not.toContain("authorization");
    expect([storage.has(STORAGE_KEYS.idToken), storage.has(STORAGE_KEYS.refreshToken), storage.get(STORAGE_KEYS.signedOut)]).toEqual([false, false, "1"]);
    expect(client.getState().user).toBeNull();
    expect(await client.getToken()).toBeNull();
  });
});

describe("has() and the user", () => {
  it("checks roles and permissions like the server SDKs", () => {
    const user = userOf(claims());
    expect(has(user, { role: "admin" })).toBe(true);
    expect(has(user, { permission: "invoices:read" })).toBe(true);
    expect(has(user, { role: "admin", permission: "invoices:write" })).toBe(false);
    expect(has(user, {})).toBe(true); // nothing asked: anyone signed in
    expect(has(null, {})).toBe(false);
    expect(has(null, { role: "admin" })).toBe(false);
    expect(userOf({ sub: "u", name: "Ana" })).toMatchObject({ name: "Ana", roles: [], publicMetadata: {}, emailVerified: false });
  });
});
