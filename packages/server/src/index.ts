// InID for any server that speaks the web's Request and Response (Astro, SvelteKit, Remix and
// React Router, Hono, Nuxt, Bun, Deno, Next.js): the routes that sign people in and out, the
// session in its cookies (renewed before it ends), and who may see each path.
//
//   const inid = createInID();                       // INID_PUBLISHABLE_KEY, INID_SECRET_KEY
//   const { response, auth, setCookies } = await inid.gate(request, { protect: ["/dashboard"] });
//   if (response) return response;                  // InID's routes, a sign-in, a 403
//   …the page, with auth.user and auth.has({ role: "admin" }); then add setCookies to it
import { configFromEnv, createInIDAuth, hasAccess, userOf, verifyIdToken, type AccessCheck, type InIDAuth, type InIDConfig, type InIDSession, type InIDUser } from "./core.js";

export * from "./core.js";

// A path (or pattern) that needs someone signed in, and, as an object, a role or a
// permission too: { path: "/admin", role: "admin" }; entrance: the door its sign-in goes
// through, with that door's rules ({ path: "/admin", role: "staff", entrance: "team" })
export type Rule = string | RegExp | ({ path: string | RegExp; entrance?: string } & AccessCheck);
export type Protect = Rule[] | ((request: Request) => boolean);

// Who is signed in, for a page or an API route
export interface Auth {
  isSignedIn: boolean;
  userId: string | null;
  user: InIDUser | null;
  session: InIDSession | null;
  // has({ role: "admin" }), has({ permission: "facturas:ver" })
  has: (check: AccessCheck) => boolean;
}

export function authOf(session: InIDSession | null): Auth {
  return { isSignedIn: Boolean(session), userId: session?.user.id ?? null, user: session?.user ?? null, session, has: (check) => hasAccess(session?.user, check) };
}

const under = (path: string, rule: string | RegExp) => (typeof rule === "string" ? path === rule || path.startsWith(rule.endsWith("/") ? rule : `${rule}/`) : rule.test(path));
export function rulesFor(request: Request, protect?: Protect): Rule[] {
  if (!protect) return [];
  if (typeof protect === "function") return protect(request) ? ["/"] : [];
  const path = new URL(request.url).pathname;
  return protect.filter((rule) => under(path, typeof rule === "object" && !(rule instanceof RegExp) ? rule.path : rule));
}

export interface GateOptions {
  protect?: Protect;
  // InID's routes (apiPath/…) answered here; false where the framework mounts them itself
  routes?: boolean;
}
export interface Gate {
  // When set, answer with it: InID's routes, a sign-in, back from Google, a 403
  response?: Response;
  auth: Auth;
  // Cookies the page's own response must carry (a renewed session)
  setCookies: string[];
  // The request's cookies as they are now (renewed), for the rest of this same request
  cookieHeader?: string;
  // apiPath/… with routes: false: nothing was done, the framework's route answers
  skipped?: boolean;
}

const withCookies = (response: Response, cookies: string[]) => {
  for (const c of cookies) response.headers.append("set-cookie", c);
  return response;
};

// What every framework's middleware does with each request
export async function gate(inid: InIDAuth, request: Request, { protect, routes = true }: GateOptions = {}): Promise<Gate> {
  const url = new URL(request.url);
  const { apiPath } = inid.config;
  const anonymous = authOf(null);
  if (url.pathname === apiPath || url.pathname.startsWith(`${apiPath}/`)) {
    return routes ? { response: await inid.handle(request), auth: anonymous, setCookies: [] } : { auth: anonymous, setCookies: [], skipped: true };
  }
  // Back from Google on the organization's own site (its domain on Google's screen): Google's
  // answer is for InID, so the person goes straight on there, before any page renders
  const state = url.searchParams.get("state") || "";
  if (state.startsWith("inidg_") && (url.searchParams.has("code") || url.searchParams.has("error"))) {
    return { response: new Response(null, { status: 307, headers: { location: `${inid.config.issuer}/oauth/google/callback${url.search}` } }), auth: anonymous, setCookies: [] };
  }
  const secure = (inid.config.appUrl || url.origin).startsWith("https://");
  const { session, setCookies, cookieHeader } = await inid.session(request.headers.get("cookie"), { refresh: true, secure });
  const rules = rulesFor(request, protect);
  const needs = rules.filter((r): r is { path: string | RegExp; entrance?: string } & AccessCheck => typeof r === "object" && !(r instanceof RegExp));
  if (!session && rules.length) {
    const entrance = needs.find((rule) => rule.entrance)?.entrance;
    const to = new URLSearchParams({ return_to: url.pathname + url.search, ...(entrance && { entrance }) });
    const response = new Response(null, { status: 307, headers: { location: new URL(`${apiPath}/signin?${to}`, url).toString(), "cache-control": "no-store" } });
    return { response: withCookies(response, setCookies), auth: anonymous, setCookies: [] };
  }
  if (session && needs.some((rule) => !hasAccess(session.user, rule))) {
    // Signed in, without the role or permission the path needs
    const response = new Response("Forbidden", { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } });
    return { response: withCookies(response, setCookies), auth: authOf(session), setCookies: [] };
  }
  return { auth: authOf(session), setCookies, cookieHeader };
}

// One InID for this server: its routes, sessions and gate, with the keys from the environment
// (INID_PUBLISHABLE_KEY, INID_SECRET_KEY, INID_ISSUER…) unless given
export function createInID(config: Partial<InIDConfig> = {}) {
  const inid = createInIDAuth(configFromEnv(config));
  return {
    ...inid,
    gate: (request: Request, options?: GateOptions) => gate(inid, request, options),
    // Who is signed in, from a request (it reads the session; the gate is what renews it)
    auth: async (request: Request) => authOf((await inid.session(request.headers.get("cookie"))).session),
    // Who is calling, from a native app (@inid/expo, inid_flutter): its ID token as a bearer,
    // signed by InID for this app and not ended. A Request, or the token itself.
    bearer: async (from: Request | string) => {
      const header = typeof from === "string" ? `Bearer ${from}` : from.headers.get("authorization") || "";
      const token = /^Bearer\s+(\S+)$/i.exec(header)?.[1];
      const checked = token ? await verifyIdToken(token, { issuer: inid.config.issuer, audience: inid.config.publishableKey }) : null;
      if (!checked || checked.expired) return authOf(null);
      return authOf({ user: userOf(checked.claims), expiresAt: checked.exp, claims: checked.claims });
    },
  };
}
export type InID = ReturnType<typeof createInID>;
