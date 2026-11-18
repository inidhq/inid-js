import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { gate, hasAccess, type InIDAuth, type InIDSession } from "../src/index.js";
import { inid as inidExpress } from "../src/express.js";

// An InID whose session is whatever the test says (gate only asks it these)
const fake = (session: InIDSession | null, renewed: string[] = []) =>
  ({
    config: { apiPath: "/api/inid", issuer: "https://id.inid.example", appUrl: "" },
    session: async () => ({ session, setCookies: renewed, cookieHeader: renewed.length ? "__inid_session=new" : undefined }),
    handle: async () => new Response("inid's routes", { status: 200 }),
  }) as unknown as InIDAuth;
const ana = { user: { id: "u1", name: "Ana", roles: ["staff"], permissions: ["orders:read"] }, expiresAt: 0, claims: {} } as unknown as InIDSession;
const at = (path: string) => new Request(`https://app.example${path}`);

describe("gate: what every framework's middleware does", () => {
  it("answers InID's routes, or leaves them to the framework", async () => {
    expect(await (await gate(fake(null), at("/api/inid/session"))).response!.text()).toBe("inid's routes");
    expect(await gate(fake(null), at("/api/inid/session"), { routes: false })).toMatchObject({ skipped: true });
  });

  it("sends Google's answer on to InID, as it came", async () => {
    const { response } = await gate(fake(null), at("/?state=inidg_abc&code=g&scope=email"));
    expect([response!.status, response!.headers.get("location")]).toEqual([307, "https://id.inid.example/oauth/google/callback?state=inidg_abc&code=g&scope=email"]);
  });

  it("protected paths: to sign in (through their entrance), or 403 without the role; the rest pass", async () => {
    const protect = ["/dashboard", { path: "/admin", role: "admin", entrance: "team" }, { path: /^\/orders/, permission: "orders:read" }];
    const out = await gate(fake(null), at("/admin/users?x=1"), { protect });
    expect(out.response!.headers.get("location")).toBe("https://app.example/api/inid/signin?return_to=%2Fadmin%2Fusers%3Fx%3D1&entrance=team");
    expect((await gate(fake(null), at("/dashboardx"), { protect })).response).toBeUndefined();
    expect((await gate(fake(ana), at("/admin"), { protect })).response!.status).toBe(403);
    const fine = await gate(fake(ana), at("/orders/7"), { protect });
    expect([fine.response, fine.auth.userId, fine.auth.has({ role: "staff" }), fine.auth.has({ role: "admin" })]).toEqual([undefined, "u1", true, false]);
  });

  it("has(): the app role, the active team's role, and a permission from either", async () => {
    const team = { id: "team_1", slug: "acme", name: "Acme", role: "admin", permissions: ["invoices:write"] };
    const inTeam = { roles: ["staff"], permissions: ["orders:read"], team };
    expect([hasAccess(inTeam, { teamRole: "admin" }), hasAccess(inTeam, { teamRole: "member" }), hasAccess(inTeam, { permission: "invoices:write" }), hasAccess(inTeam, { permission: "orders:read" })]).toEqual([true, false, true, true]);
    expect(hasAccess(inTeam, { role: "staff", teamRole: "admin", permission: "invoices:write" })).toBe(true);
    expect(hasAccess(inTeam, { role: "owner", teamRole: "admin" })).toBe(false);
    // Without a team: no team role, only the app's permissions
    const alone = { roles: ["staff"], permissions: ["orders:read"], team: null };
    expect([hasAccess(alone, { teamRole: "admin" }), hasAccess(alone, { permission: "invoices:write" }), hasAccess(alone, {})]).toEqual([false, false, true]);
    // A path that needs a team role
    const admin = { ...ana, user: { ...ana.user, team } } as unknown as InIDSession;
    expect((await gate(fake(ana), at("/team/settings"), { protect: [{ path: "/team", teamRole: "admin" }] })).response!.status).toBe(403);
    expect((await gate(fake(admin), at("/team/settings"), { protect: [{ path: "/team", teamRole: "admin" }] })).response).toBeUndefined();
  });

  it("a renewed session: its cookies for the page, and for the rest of the request", async () => {
    const out = await gate(fake(ana, ["__inid_session=new; Path=/"]), at("/"));
    expect([out.setCookies, out.cookieHeader]).toEqual([["__inid_session=new; Path=/"], "__inid_session=new"]);
  });
});

describe("Express", () => {
  let server: Server | null = null;
  afterEach(() => server?.close());
  const listen = (handler: Parameters<typeof createServer>[1]) =>
    new Promise<string>((resolve) => {
      server = createServer(handler).listen(0, () => resolve(`http://127.0.0.1:${(server!.address() as { port: number }).port}`));
    });

  it("answers InID's routes, protects paths and leaves who's signed in on req.auth", async () => {
    const middleware = inidExpress({ publishableKey: "pk_test_x", secretKey: "sk_test_x", issuer: "https://id.inid.example", protect: ["/dashboard"] });
    const base = await listen((req, res) =>
      middleware(req as never, res as never, () => res.end(JSON.stringify({ signedIn: (req as { auth?: { isSignedIn: boolean } }).auth?.isSignedIn })))
    );
    // Not signed in: the page is theirs to show
    expect(await (await fetch(`${base}/`)).json()).toEqual({ signedIn: false });
    // A protected path: to InID's sign-in, back to where they were
    const protectedPage = await fetch(`${base}/dashboard?tab=1`, { redirect: "manual" });
    expect([protectedPage.status, protectedPage.headers.get("location")]).toEqual([307, `${base}/api/inid/signin?return_to=%2Fdashboard%3Ftab%3D1`]);
    // InID's own routes: the sign-in goes to InID with this app's key
    const signIn = await fetch(`${base}/api/inid/signin?return_to=/dashboard`, { redirect: "manual" });
    expect(signIn.headers.get("location")).toMatch(/^https:\/\/id\.inid\.example\/oauth\/authorize\?client_id=pk_test_x&/);
    expect(signIn.headers.get("set-cookie")).toMatch(/^__inid_flow_/);
  });
});

describe("bearer: a native app's ID token", () => {
  it("who's calling, only with a token InID signed for this app that hasn't ended", async () => {
    const { generateKeyPairSync, createSign } = await import("node:crypto");
    const { createInID } = await import("../src/index.js");
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const issuer = "https://id.bearer.example";
    const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string) => (String(url) === `${issuer}/.well-known/jwks.json` ? new Response(JSON.stringify({ keys: [jwk] })) : new Response("", { status: 404 }))) as typeof fetch;
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const token = (claims: Record<string, unknown>) => {
      const head = `${b64({ alg: "RS256", kid: "k1" })}.${b64(claims)}`;
      return `${head}.${createSign("RSA-SHA256").update(head).sign(privateKey).toString("base64url")}`;
    };
    const now = Math.floor(Date.now() / 1000);
    const claims = { iss: issuer, aud: "pk_test_app", sub: "u1", exp: now + 600, given_name: "Ana", roles: ["admin"] };
    try {
      const inid = createInID({ publishableKey: "pk_test_app", secretKey: "sk_test_app", issuer });
      const ok = await inid.bearer(new Request("https://api.example/me", { headers: { authorization: `Bearer ${token(claims)}` } }));
      expect([ok.isSignedIn, ok.userId, ok.user?.firstName, ok.has({ role: "admin" }), ok.has({})]).toEqual([true, "u1", "Ana", true, true]);
      expect((await inid.bearer(token({ ...claims, aud: "pk_test_other" }))).isSignedIn).toBe(false);
      expect((await inid.bearer(token({ ...claims, exp: now - 5 }))).isSignedIn).toBe(false);
      expect((await inid.bearer(new Request("https://api.example/me"))).isSignedIn).toBe(false);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
