// Sign-in with InID for a native app, without React or Expo: the app is a public client
// (RFC 8252). It opens InID in the system's secure browser with PKCE, trades the code for
// tokens with its client id only (no secret, no Authorization header), checks the ID token
// with InID's public keys, keeps the tokens in secure storage and renews the ID token with
// the refresh token before it ends. The platform (storage, hashing, random bytes, the
// browser) comes in as `deps`, so this runs and is tested anywhere.

import { base64url, fromBase64url, queryOf, toQuery, utf8Decode } from "./encoding.js";
import { type RsaPublicJwk, verifyRs256 } from "./rsa.js";

export interface InIDUser {
  // The person's id at this app (InID gives each app its own)
  id: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  email: string | null;
  emailVerified: boolean;
  phone: string | null;
  // The app's roles for this person and what they allow (empty when the app has none)
  roles: string[];
  permissions: string[];
  // What the app keeps public about this person (its metadata)
  publicMetadata: Record<string, unknown>;
}

export type AccessCheck = { role?: string; permission?: string };

// Whether someone has a role or a permission (both, if both are asked; neither: false)
export function has(user: Pick<InIDUser, "roles" | "permissions"> | null | undefined, check: AccessCheck): boolean {
  // Signed out: never. Nothing asked: anyone signed in (as @inid/server's hasAccess)
  if (!user) return false;
  if (check.role && !user.roles.includes(check.role)) return false;
  if (check.permission && !user.permissions.includes(check.permission)) return false;
  return true;
}

export function userOf(claims: Record<string, unknown>): InIDUser {
  const text = (v: unknown) => (typeof v === "string" && v ? v : null);
  const firstName = text(claims.given_name);
  const lastName = text(claims.family_name);
  return {
    id: String(claims.sub),
    firstName,
    lastName,
    name: [firstName, lastName].filter(Boolean).join(" ") || text(claims.name),
    email: text(claims.email),
    emailVerified: claims.email_verified === true,
    phone: text(claims.phone_number),
    roles: Array.isArray(claims.roles) ? claims.roles.filter((r): r is string => typeof r === "string") : [],
    permissions: Array.isArray(claims.permissions) ? claims.permissions.filter((p): p is string => typeof p === "string") : [],
    publicMetadata: claims.public_metadata && typeof claims.public_metadata === "object" && !Array.isArray(claims.public_metadata) ? (claims.public_metadata as Record<string, unknown>) : {},
  };
}

export class InIDError extends Error {
  constructor(
    public code: string,
    public status?: number
  ) {
    super(`InID: ${code}`);
  }
}

// What the platform provides
export interface InIDDeps {
  // Secure storage (Keychain / Keystore)
  storage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    deleteItem(key: string): Promise<void>;
  };
  // SHA-256 of a string's UTF-8 bytes
  sha256(text: string): Promise<Uint8Array>;
  randomBytes(length: number): Uint8Array;
  // Opens the URL in the system's secure browser until it comes back to redirectUri
  openAuthSession(url: string, redirectUri: string): Promise<{ type: "success"; url: string } | { type: string }>;
  fetch?: typeof fetch;
  // Seconds since 1970
  now?: () => number;
}

export interface InIDClientOptions {
  publishableKey: string;
  // InID itself; a local one while developing InID
  issuer?: string;
  // The app's custom scheme (nube://callback), registered in InID's panel as nube://
  redirectUri: string;
  scope?: string;
  locale?: "es" | "en" | "pt";
}

export interface InIDClientState {
  isLoaded: boolean;
  user: InIDUser | null;
  // When the current ID token ends (seconds since 1970), or null
  expiresAt: number | null;
}

export interface SignInOptions {
  // A door of the app with its own rules ("team"), made in the InID panel
  entrance?: string;
  // The phone or email to start with
  loginHint?: string;
}

export const STORAGE_KEYS = { idToken: "inid.id_token", refreshToken: "inid.refresh_token", signedOut: "inid.signed_out" } as const;

// Renew this long before the ID token ends
const LEEWAY = 60;

// ---------- the ID token ----------
const decodeJson = (part: string) => JSON.parse(utf8Decode(fromBase64url(part))) as Record<string, unknown>;

type Jwk = RsaPublicJwk & { kid: string; kty: string };

// Checks the claims InID's ID tokens must have for this app. An ended one still comes back
// (expired: true), so the session can be renewed from it; it never counts as signed in.
function checkClaims(claims: Record<string, unknown>, { issuer, audience, nonce, now }: { issuer: string; audience: string; nonce?: string; now: number }) {
  if (claims.iss !== issuer || claims.aud !== audience || typeof claims.sub !== "string" || typeof claims.exp !== "number") return null;
  if (nonce !== undefined && claims.nonce !== nonce) return null;
  return { claims, exp: claims.exp, expired: claims.exp <= now };
}

export interface VerifyOptions {
  issuer: string;
  audience: string;
  nonce?: string;
  now?: number;
  // The key with that id, or null (see jwksCache)
  keyFor: (kid: string) => Promise<RsaPublicJwk | null>;
  sha256: (text: string) => Promise<Uint8Array>;
}

// RS256 only; kid known; signature valid; iss, aud, sub, exp; the nonce when given
export async function verifyIdToken(token: string, { issuer, audience, nonce, now = Math.floor(Date.now() / 1000), keyFor, sha256 }: VerifyOptions) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = decodeJson(parts[0]);
    if (header.alg !== "RS256" || typeof header.kid !== "string") return null;
    const key = await keyFor(header.kid);
    if (!key) return null;
    if (!verifyRs256(key, fromBase64url(parts[2]), await sha256(`${parts[0]}.${parts[1]}`))) return null;
    return checkClaims(decodeJson(parts[1]), { issuer, audience, nonce, now });
  } catch (err) {
    if (err instanceof InIDError) throw err;
    return null;
  }
}

// InID's public keys, kept an hour. An unknown key id is looked for at once, but once per
// key and at most once a second, so made-up key ids can't make the app ask InID again and again.
export function jwksCache(issuer: string, fetcher: typeof fetch, nowMs: () => number = Date.now) {
  let known: { at: number; keys: Map<string, Jwk>; askedAt: number } | null = null;
  const missed = new Set<string>();
  return async (kid: string): Promise<RsaPublicJwk | null> => {
    const now = nowMs();
    if (known && now - known.at < 3_600_000) {
      if (known.keys.has(kid)) return known.keys.get(kid)!;
      if (missed.has(kid) || now - known.askedAt < 1000) return null;
      missed.add(kid);
      if (missed.size > 100) missed.clear();
    }
    const askedAt = known ? now : 0;
    const res = await fetcher(`${issuer}/.well-known/jwks.json`);
    if (!res.ok) throw new InIDError("jwks_unavailable", res.status);
    const keys = new Map<string, Jwk>();
    for (const jwk of ((await res.json()) as { keys: Jwk[] }).keys) if (jwk.kty === "RSA" && typeof jwk.kid === "string") keys.set(jwk.kid, jwk);
    known = { at: now, keys, askedAt };
    return keys.get(kid) ?? null;
  };
}

// ---------- the client ----------
export function createInIDClient(options: InIDClientOptions, deps: InIDDeps) {
  const issuer = (options.issuer ?? "https://id.inid.co").replace(/\/+$/, "");
  const { publishableKey, redirectUri } = options;
  if (!publishableKey?.startsWith("pk_")) throw new Error("InID: publishableKey must start with pk_ (from InID's panel)");
  const scope = options.scope ?? "openid profile email phone";
  const doFetch = deps.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const now = deps.now ?? (() => Math.floor(Date.now() / 1000));
  const keyFor = jwksCache(issuer, doFetch, () => now() * 1000);
  const { storage } = deps;
  const random = (n: number) => base64url(deps.randomBytes(n));

  let state: InIDClientState = { isLoaded: false, user: null, expiresAt: null };
  let idToken: string | null = null;
  let refreshToken: string | null = null;
  const listeners = new Set<() => void>();
  const set = (next: Partial<InIDClientState>) => {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  };

  const verify = (token: string, nonce?: string) => verifyIdToken(token, { issuer, audience: publishableKey, nonce, now: now(), keyFor, sha256: deps.sha256 });

  // Secure storage may refuse a large value (iOS warns past 2 KB): the session then lives in
  // memory and the refresh token restores it on the next start.
  const store = async (key: string, value: string | null) => {
    try {
      if (value === null) await storage.deleteItem(key);
      else await storage.setItem(key, value);
    } catch {}
  };

  const adopt = async (token: string, claims: Record<string, unknown>, exp: number, refresh: string | null) => {
    idToken = token;
    if (refresh) refreshToken = refresh;
    await Promise.all([store(STORAGE_KEYS.idToken, token), refresh ? store(STORAGE_KEYS.refreshToken, refresh) : null]);
    set({ user: userOf(claims), expiresAt: exp });
  };

  const forget = async () => {
    idToken = null;
    refreshToken = null;
    await Promise.all([store(STORAGE_KEYS.idToken, null), store(STORAGE_KEYS.refreshToken, null)]);
    set({ user: null, expiresAt: null });
  };

  const post = (path: string, body: Record<string, string | undefined>) =>
    doFetch(`${issuer}${path}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: toQuery(body),
    });

  // ---------- renewing ----------
  let renewing: Promise<void> | null = null;
  const renew = () => {
    renewing ??= (async () => {
      const refresh = refreshToken;
      if (!refresh) return;
      let res: Response;
      try {
        res = await post("/oauth/token", { grant_type: "refresh_token", refresh_token: refresh, client_id: publishableKey });
      } catch {
        return; // InID can't be reached: keep what is still valid
      }
      if (res.status >= 400 && res.status < 500) return void (await forget()); // the session is over
      if (!res.ok) return;
      const body = (await res.json()) as { id_token?: string; refresh_token?: string };
      const checked = body.id_token ? await verify(body.id_token).catch(() => null) : null;
      if (!checked || checked.expired) return;
      await adopt(body.id_token!, checked.claims, checked.exp, body.refresh_token ?? null);
    })().finally(() => {
      renewing = null;
    });
    return renewing;
  };

  // A fresh ID token for the app's backend (Authorization: Bearer), renewed when within 60 s
  // of its end; null when nobody is signed in.
  const getToken = async (): Promise<string | null> => {
    if (idToken && state.expiresAt !== null && state.expiresAt - now() > LEEWAY) return idToken;
    if (refreshToken) await renew();
    if (idToken && state.expiresAt !== null && state.expiresAt > now()) return idToken;
    // Ended and not renewed: never signed in that way (the refresh token stays for a retry)
    if (state.user) set({ user: null });
    return null;
  };

  // ---------- starting ----------
  // The tokens from secure storage. The stored ID token's signature was checked when it
  // arrived; here its claims are checked again (iss, aud, exp), with no call to InID.
  let loading: Promise<void> | null = null;
  const load = () => {
    loading ??= (async () => {
      const [token, refresh] = await Promise.all([storage.getItem(STORAGE_KEYS.idToken).catch(() => null), storage.getItem(STORAGE_KEYS.refreshToken).catch(() => null)]);
      refreshToken = refresh;
      if (token) {
        try {
          const checked = checkClaims(decodeJson(token.split(".")[1] ?? ""), { issuer, audience: publishableKey, now: now() });
          if (checked) {
            idToken = token;
            state = { ...state, expiresAt: checked.exp, user: checked.expired ? null : userOf(checked.claims) };
          }
        } catch {}
      }
      await getToken();
      set({ isLoaded: true });
    })();
    return loading;
  };

  // ---------- signing in ----------
  const authorizeUrl = async ({ entrance, loginHint }: SignInOptions = {}) => {
    const flow = { state: random(16), nonce: random(16), verifier: random(32) };
    const challenge = base64url(await deps.sha256(flow.verifier));
    const signedOut = (await storage.getItem(STORAGE_KEYS.signedOut).catch(() => null)) === "1";
    const query = toQuery({
      client_id: publishableKey,
      redirect_uri: redirectUri,
      response_type: "code",
      scope,
      state: flow.state,
      nonce: flow.nonce,
      code_challenge: challenge,
      code_challenge_method: "S256",
      ui_locales: options.locale,
      login_hint: loginHint,
      entrance,
      // After signing out, InID asks again instead of signing the same person back in
      prompt: signedOut ? "login" : undefined,
    });
    return { url: `${issuer}/oauth/authorize?${query}`, flow };
  };

  // To InID's page in the system's browser and back. The user, or null when the person
  // closed the page; throws InIDError when InID answers an error or the answer doesn't check.
  const signIn = async (signInOptions: SignInOptions = {}): Promise<InIDUser | null> => {
    const { url, flow } = await authorizeUrl(signInOptions);
    const result = await deps.openAuthSession(url, redirectUri);
    if (result.type !== "success" || !("url" in result)) return null;
    const back = queryOf(result.url);
    if (back.state !== flow.state) throw new InIDError("state_mismatch");
    if (back.error) throw new InIDError(back.error);
    if (!back.code) throw new InIDError("missing_code");
    const res = await post("/oauth/token", {
      grant_type: "authorization_code",
      code: back.code,
      redirect_uri: redirectUri,
      code_verifier: flow.verifier,
      client_id: publishableKey,
    });
    const body = (await res.json().catch(() => ({}))) as { id_token?: string; refresh_token?: string; error?: string };
    if (!res.ok || !body.id_token) throw new InIDError(body.error ?? "token_exchange_failed", res.status);
    const checked = await verify(body.id_token, flow.nonce);
    if (!checked || checked.expired) throw new InIDError("invalid_id_token");
    await store(STORAGE_KEYS.signedOut, null);
    await adopt(body.id_token, checked.claims, checked.exp, body.refresh_token ?? null);
    return state.user;
  };

  // ---------- signing out ----------
  // Revokes the refresh token at InID, deletes the stored tokens, and has the next sign-in ask again
  const signOut = async () => {
    const refresh = refreshToken;
    await store(STORAGE_KEYS.signedOut, "1");
    await forget();
    if (refresh) await post("/oauth/revoke", { token: refresh, token_type_hint: "refresh_token", client_id: publishableKey }).catch(() => {});
  };

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    load,
    authorizeUrl,
    signIn,
    signOut,
    getToken,
    renew,
    issuer,
    redirectUri,
  };
}

export type InIDClient = ReturnType<typeof createInIDClient>;
