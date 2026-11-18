// Sign-in with InID for an app's server, with nothing but Web APIs (Request, Response, fetch,
// crypto.subtle): it runs in Next.js's proxy or middleware, in route handlers, and in Node.
//
// The app is an OpenID Connect client of InID (its publishable key is the client id, its
// secret key the client secret). Signing in is the authorization code flow with PKCE; the
// session is InID's signed ID token in a cookie, checked with InID's public keys and never
// with a call to InID. It lasts ten minutes; the refresh token (another cookie) renews it.

export interface InIDConfig {
  publishableKey: string;
  secretKey: string;
  // InID itself (https://id.inid.co); a local one while developing InID
  issuer: string;
  // Where the app's routes for signing in live (the route handler is mounted there)
  apiPath: string;
  // What the app asks the person for
  scope: string;
  // The app's own address, when the requests it sees don't say it (behind some proxies)
  appUrl?: string;
}

export interface InIDUser {
  // The person's id at this app (InID gives each app its own)
  id: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  email: string | null;
  emailVerified: boolean;
  phone: string | null;
  // The app's roles for this person, and what they allow (set in InID's panel or by the
  // app's server); empty when the app has no roles
  roles: string[];
  permissions: string[];
  // What the app keeps public about this person (set in InID's panel or by the app's server)
  publicMetadata: Record<string, unknown>;
}

// Whether someone has a role or a permission (both, if both are asked)
export type AccessCheck = { role?: string; permission?: string };
export function hasAccess(user: Pick<InIDUser, "roles" | "permissions"> | null | undefined, check: AccessCheck) {
  if (!user) return false;
  if (check.role && !user.roles.includes(check.role)) return false;
  if (check.permission && !user.permissions.includes(check.permission)) return false;
  return true;
}

export interface InIDSession {
  user: InIDUser;
  // When this session's token ends (seconds since 1970); renewed before then
  expiresAt: number;
  claims: Record<string, unknown>;
}

export class InIDAuthError extends Error {
  constructor(public code: string, public status?: number) {
    super(code);
  }
}

// out: this browser signed out of the app; its next sign-in asks, instead of going in by itself
export const COOKIES = { session: "__inid_session", refresh: "__inid_refresh", flow: "__inid_flow", out: "__inid_out" } as const;
const SIGNED_OUT_SECONDS = 30 * 24 * 3600;
// A session with less than this left is renewed now, not in the middle of the next request
const RENEW_BEFORE_SECONDS = 60;
const REFRESH_MAX_AGE = 30 * 86_400;

export function configFromEnv(given: Partial<InIDConfig> = {}): InIDConfig {
  const env = ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}) as Record<string, string | undefined>;
  const config: InIDConfig = {
    publishableKey: given.publishableKey ?? env.INID_PUBLISHABLE_KEY ?? "",
    secretKey: given.secretKey ?? env.INID_SECRET_KEY ?? "",
    issuer: (given.issuer ?? env.INID_ISSUER ?? "https://id.inid.co").replace(/\/$/, ""),
    apiPath: (given.apiPath ?? "/api/inid").replace(/\/$/, ""),
    scope: given.scope ?? "openid profile email phone",
    appUrl: (given.appUrl ?? env.INID_APP_URL)?.replace(/\/$/, "") || undefined,
  };
  if (!config.publishableKey.startsWith("pk_")) throw new InIDAuthError("INID_PUBLISHABLE_KEY is missing: set it to your publishable key (pk_...)");
  if (!config.secretKey.startsWith("sk_")) throw new InIDAuthError("INID_SECRET_KEY is missing: set it to your secret key (sk_...)");
  return config;
}

// ---------- small helpers, Web APIs only ----------
const encoder = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (text: string) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4)), (c) => c.charCodeAt(0));
const json = (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes));
const random = (size = 32) => b64url(crypto.getRandomValues(new Uint8Array(size)));
const sha256 = async (text: string) => b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text))));

export function parseCookies(header: string | null | undefined) {
  const jar: Record<string, string> = {};
  for (const part of String(header || "").split(/;\s*/)) {
    const at = part.indexOf("=");
    if (at > 0) jar[part.slice(0, at)] = decodeURIComponent(part.slice(at + 1));
  }
  return jar;
}
const serializeJar = (jar: Record<string, string>) =>
  Object.entries(jar)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("; ");
function cookie(name: string, value: string, { maxAge, path = "/", secure }: { maxAge: number; path?: string; secure: boolean }) {
  return `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

// Only somewhere in the app itself: a path, never another site
export const safeReturn = (to: unknown) => (typeof to === "string" && /^\/(?![/\\])/.test(to) ? to : "/");

// ---------- InID's public keys, kept an hour ----------
// A key it doesn't know (InID just rotated its signing key) is looked for at once, but once
// per key and at most once a second: tokens with made-up key ids can't make it ask InID
// again and again.
const jwks = new Map<string, { at: number; keys: Map<string, CryptoKey>; missed: Set<string>; askedAt: number }>();
async function keyFor(issuer: string, kid: string) {
  const known = jwks.get(issuer);
  const now = Date.now();
  if (known && now - known.at < 3_600_000) {
    if (known.keys.has(kid)) return known.keys.get(kid)!;
    if (known.missed.has(kid) || now - known.askedAt < 1000) return null;
    known.missed.add(kid);
    if (known.missed.size > 100) known.missed.clear();
  }
  // Only the lookups for unknown keys count toward "once a second"
  const askedAt = known ? now : 0;
  if (known) known.askedAt = now;
  const res = await fetch(`${issuer}/.well-known/jwks.json`);
  if (!res.ok) throw new InIDAuthError("jwks_unavailable", res.status);
  const keys = new Map<string, CryptoKey>();
  for (const jwk of ((await res.json()) as { keys: Array<JsonWebKey & { kid: string }> }).keys) {
    if (jwk.kty !== "RSA") continue;
    keys.set(jwk.kid, await crypto.subtle.importKey("jwk", { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]));
  }
  jwks.set(issuer, { at: now, keys, missed: known?.missed ?? new Set(), askedAt });
  return keys.get(kid) ?? null;
}

// An ID token InID signed for this app: its claims, or null. An ended one still comes back
// (expired: true), so the session can be renewed from it.
export async function verifyIdToken(token: string, { issuer, audience, nonce, now = Math.floor(Date.now() / 1000) }: { issuer: string; audience: string; nonce?: string; now?: number }) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = json(fromB64url(parts[0]));
    if (header.alg !== "RS256" || typeof header.kid !== "string") return null;
    const key = await keyFor(issuer, header.kid);
    if (!key) return null;
    if (!(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, fromB64url(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`)))) return null;
    const claims = json(fromB64url(parts[1])) as Record<string, unknown>;
    if (claims.iss !== issuer || claims.aud !== audience || typeof claims.sub !== "string" || typeof claims.exp !== "number") return null;
    if (nonce !== undefined && claims.nonce !== nonce) return null;
    return { claims, exp: claims.exp, expired: claims.exp <= now };
  } catch (err) {
    if (err instanceof InIDAuthError) throw err;
    return null;
  }
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

export function createInIDAuth(config: InIDConfig) {
  const { issuer, apiPath } = config;
  const basic = `Basic ${btoa(`${encodeURIComponent(config.publishableKey)}:${encodeURIComponent(config.secretKey)}`)}`;
  const verify = (token: string, nonce?: string) => verifyIdToken(token, { issuer, audience: config.publishableKey, nonce });

  async function token(params: Record<string, string>) {
    const res = await fetch(`${issuer}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", authorization: basic },
      body: new URLSearchParams(params),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, string>;
    if (!res.ok) throw new InIDAuthError(body.error || "token_failed", res.status);
    return body as unknown as { id_token: string; refresh_token: string; access_token: string; expires_in: number };
  }

  const sessionOf = (checked: { claims: Record<string, unknown>; exp: number }): InIDSession => ({ user: userOf(checked.claims), expiresAt: checked.exp, claims: checked.claims });
  const sessionCookies = (tokens: { id_token: string; refresh_token: string }, secure: boolean) => [
    cookie(COOKIES.session, tokens.id_token, { maxAge: REFRESH_MAX_AGE, secure }),
    cookie(COOKIES.refresh, tokens.refresh_token, { maxAge: REFRESH_MAX_AGE, secure }),
  ];
  const clearCookies = (secure: boolean) => [cookie(COOKIES.session, "", { maxAge: 0, secure }), cookie(COOKIES.refresh, "", { maxAge: 0, secure })];

  // The session in these cookies. With refresh, one that ends within a minute is renewed:
  // setCookies go back to the browser, cookieHeader is what this same request should see.
  async function session(cookieHeader: string | null | undefined, { refresh = false, secure = true } = {}): Promise<{ session: InIDSession | null; setCookies: string[]; cookieHeader?: string }> {
    const jar = parseCookies(cookieHeader);
    const current = jar[COOKIES.session] ? await verify(jar[COOKIES.session]) : null;
    const now = Math.floor(Date.now() / 1000);
    if (current && current.exp - now > RENEW_BEFORE_SECONDS) return { session: sessionOf(current), setCookies: [] };
    const stillGood = current && !current.expired ? sessionOf(current) : null;
    if (!refresh || !jar[COOKIES.refresh]) return { session: stillGood, setCookies: [] };
    try {
      const tokens = await token({ grant_type: "refresh_token", refresh_token: jar[COOKIES.refresh] });
      const renewed = await verify(tokens.id_token);
      if (!renewed) throw new InIDAuthError("invalid_id_token", 400);
      return {
        session: sessionOf(renewed),
        setCookies: sessionCookies(tokens, secure),
        cookieHeader: serializeJar({ ...jar, [COOKIES.session]: tokens.id_token, [COOKIES.refresh]: tokens.refresh_token }),
      };
    } catch (err) {
      // InID said no (signed out elsewhere, authorization taken back): the session is over
      if (err instanceof InIDAuthError && err.status && err.status < 500) {
        const { [COOKIES.session]: _s, [COOKIES.refresh]: _r, ...rest } = jar;
        return { session: null, setCookies: clearCookies(secure), cookieHeader: serializeJar(rest) };
      }
      // InID couldn't be reached: what's still valid stays
      return { session: stillGood, setCookies: [] };
    }
  }

  return {
    config,
    session,

    // The app's routes under apiPath: signin, callback, signout, session
    async handle(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const origin = config.appUrl || url.origin;
      const secure = origin.startsWith("https://");
      const action = url.pathname.startsWith(`${apiPath}/`) ? url.pathname.slice(apiPath.length + 1) : "";
      const redirectUri = `${origin}${apiPath}/callback`;
      const redirect = (to: string, cookies: string[] = []) => {
        const headers = new Headers({ location: to, "cache-control": "no-store" });
        for (const c of cookies) headers.append("set-cookie", c);
        return new Response(null, { status: 302, headers });
      };

      // A tiny page that sends the whole window on (the app's own address, same origin)
      const leaveFrame = (to: string, cookies: string[] = []) => {
        const headers = new Headers({ "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        for (const c of cookies) headers.append("set-cookie", c);
        const target = JSON.stringify(to).replace(/</g, "\\u003c");
        return new Response(`<!doctype html><meta charset="utf-8"><script>(window.top || window).location.replace(${target})</script>`, { status: 200, headers });
      };

      if (request.method === "GET" && action === "signin") {
        // display=embed: InID's form inside the app's own page (<SignIn />)
        const embed = url.searchParams.get("display") === "embed";
        // Back from Google, the frame goes on with the same sign-in (its flow cookie stays)
        const resume = url.searchParams.get("continue");
        if (embed && resume !== null) {
          const q = new URLSearchParams(resume);
          const kept = new URLSearchParams();
          for (const k of ["request", "session", "from", "lang"]) if (q.get(k)) kept.set(k, q.get(k)!);
          kept.set("display", "embed");
          return redirect(`${issuer}/oauth/authorize/continue?${kept}`);
        }
        // page: where the form is (<SignIn />), to go on there after Google
        const flow = { state: random(16), nonce: random(16), verifier: random(32), returnTo: safeReturn(url.searchParams.get("return_to")), ...(embed ? { embed: true, page: safeReturn(url.searchParams.get("page") || url.searchParams.get("return_to")) } : {}) };
        const query = new URLSearchParams({
          client_id: config.publishableKey,
          redirect_uri: redirectUri,
          response_type: "code",
          scope: config.scope,
          state: flow.state,
          nonce: flow.nonce,
          code_challenge: await sha256(flow.verifier),
          code_challenge_method: "S256",
        });
        for (const passed of ["ui_locales", "login_hint", "prompt", "entrance"]) {
          const value = url.searchParams.get(passed);
          if (value) query.set(passed, value);
        }
        // The page's changes to the app's look (<SignIn appearance={…} />): InID checks them
        const appearance = url.searchParams.get("appearance");
        if (appearance && appearance.length <= 1024) query.set("appearance", appearance);
        // In the page, someone InID knows still clicks to go in: never signed in by just
        // loading it (nor again right after signing out)
        if (embed) {
          query.set("display", "embed");
          query.set("prompt", "login");
        }
        // Right after signing out of the app, InID asks too: they chose to leave, so they
        // aren't taken back in just by opening a page of it
        if (parseCookies(request.headers.get("cookie"))[COOKIES.out]) query.set("prompt", "login");
        // One cookie per sign-in (named by its state): two at once (the page's card and a
        // button, two tabs) don't overwrite each other
        const flowCookie = cookie(`${COOKIES.flow}_${flow.state}`, b64url(encoder.encode(JSON.stringify(flow))), { maxAge: 600, path: apiPath, secure });
        return redirect(`${issuer}/oauth/authorize?${query}`, [flowCookie]);
      }

      if (request.method === "GET" && action === "callback") {
        const state = url.searchParams.get("state") || "";
        const flowName = /^[\w-]{1,64}$/.test(state) ? `${COOKIES.flow}_${state}` : COOKIES.flow;
        const clearFlow = cookie(flowName, "", { maxAge: 0, path: apiPath, secure });
        let flow: { state: string; nonce: string; verifier: string; returnTo: string; embed?: boolean; page?: string } | null = null;
        try {
          flow = json(fromB64url(parseCookies(request.headers.get("cookie"))[flowName] || ""));
        } catch {}
        // Back from Google, a sign-in that started in the app's page goes on in it: back to
        // that page, whose form opens where InID left it
        const resume = url.searchParams.get("inid_continue");
        if (resume !== null && flow?.embed && url.searchParams.get("state") === flow.state) {
          const page = new URL(safeReturn(flow.page), "http://app.invalid");
          page.searchParams.set("inid_continue", resume);
          return redirect(page.pathname + page.search);
        }
        const code = url.searchParams.get("code");
        // From InID's form inside the page, the whole page goes on (not just its frame)
        const go = flow?.embed ? leaveFrame : redirect;
        if (!flow || !code || url.searchParams.get("state") !== flow.state) return go(safeReturn(flow?.returnTo), [clearFlow]);
        const tokens = await token({ grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: flow.verifier });
        if (!(await verify(tokens.id_token, flow.nonce))) throw new InIDAuthError("invalid_id_token", 400);
        return go(safeReturn(flow.returnTo), [clearFlow, ...sessionCookies(tokens, secure), cookie(COOKIES.out, "", { maxAge: 0, secure })]);
      }

      if (request.method === "POST" && action === "signout") {
        const refreshToken = parseCookies(request.headers.get("cookie"))[COOKIES.refresh];
        // The sign-in ends at InID too; the person's InID stays signed in (that's theirs)
        if (refreshToken) {
          await fetch(`${issuer}/oauth/revoke`, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded", authorization: basic },
            body: new URLSearchParams({ token: refreshToken, token_type_hint: "refresh_token" }),
            signal: AbortSignal.timeout(3000),
          }).catch(() => {});
        }
        const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
        for (const c of clearCookies(secure)) headers.append("set-cookie", c);
        headers.append("set-cookie", cookie(COOKIES.out, "1", { maxAge: SIGNED_OUT_SECONDS, secure }));
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
      }

      // The person's own sessions at this app (each sign-in, in each browser), and ending
      // them: one (DELETE sessions/:id) or all but this one (DELETE sessions?others=1)
      if (action === "sessions" || action.startsWith("sessions/")) {
        const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
        const { session: current } = await session(request.headers.get("cookie"));
        if (!current) return json({ error: "not_signed_in" }, 401);
        const base = `${issuer}/v1/users/${encodeURIComponent(current.user.id)}/sessions`;
        const asApp = { authorization: `Bearer ${config.secretKey}` };
        const sid = typeof current.claims.sid === "string" ? current.claims.sid : null;
        const list = async () => {
          const res = await fetch(base, { headers: asApp });
          if (!res.ok) throw new InIDAuthError("sessions_unavailable", 502);
          return ((await res.json()) as { sessions: Array<{ id: string; createdAt: string; lastActiveAt: string; device: string | null }> }).sessions;
        };
        if (request.method === "GET") return json({ sessions: (await list()).map((x) => ({ ...x, current: x.id === sid })) });
        if (request.method === "DELETE") {
          const one = action.startsWith("sessions/") ? decodeURIComponent(action.slice("sessions/".length)) : "";
          const ending = one ? [one] : url.searchParams.get("others") ? (await list()).filter((x) => x.id !== sid).map((x) => x.id) : [];
          for (const id of ending) await fetch(`${base}/${encodeURIComponent(id)}`, { method: "DELETE", headers: asApp });
          return json({ ended: ending.length });
        }
      }

      if (request.method === "GET" && action === "session") {
        const { session: current, setCookies } = await session(request.headers.get("cookie"), { refresh: true, secure });
        const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
        for (const c of setCookies) headers.append("set-cookie", c);
        return new Response(JSON.stringify({ user: current?.user ?? null, accountUrl: `${issuer}/account?${new URLSearchParams({ client_id: config.publishableKey })}` }), { status: 200, headers });
      }

      return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { "content-type": "application/json" } });
    },
  };
}

export type InIDAuth = ReturnType<typeof createInIDAuth>;
