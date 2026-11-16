import "reflect-metadata";
import { Controller, Get, Headers, Inject, type INestApplication, Module, Post, Req, type RawBodyRequest } from "@nestjs/common";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Auth, CurrentUser, Entrance, InIDAuth, InIDModule, InIDService, Permissions, Public, Roles, UserId, type InIDModuleOptions, type InIDUser } from "../src/index.js";
import { config, idToken, renewed, signWebhook, stubFetch } from "./helpers.js";

let restore: () => void;
beforeAll(() => {
  restore = stubFetch();
});
afterAll(() => restore());

// esbuild emits no decorator metadata: everything injected says what it wants (@Inject)
@Controller()
class AppController {
  constructor(@Inject(InIDService) private readonly inid: InIDService) {}

  @Public()
  @Get()
  home(@InIDAuth() auth: Auth) {
    return { open: true, signedIn: auth.isSignedIn };
  }

  @Get("me")
  me(@CurrentUser() user: InIDUser, @CurrentUser("email") email: string, @UserId() id: string, @Headers("cookie") cookie?: string) {
    return { name: user.name, email, id, cookie: cookie ?? null };
  }

  @Roles("admin", "owner")
  @Get("admin")
  admin() {
    return { admin: true };
  }

  @Permissions("invoices:read", "invoices:write")
  @Get("invoices")
  invoices() {
    return { invoices: [] };
  }

  @Entrance("team")
  @Get("team")
  team() {
    return { team: true };
  }

  @Public()
  @Post("webhooks/inid")
  webhook(@Req() req: RawBodyRequest<{ headers: Record<string, string> }>) {
    return this.inid.verifyWebhook(req.rawBody, req.headers["inid-signature"]);
  }
}

// Open by default; @Public on the class, but its methods can still ask
@Public()
@Controller("shop")
class ShopController {
  @Get()
  list() {
    return { products: [] };
  }

  @Roles("staff")
  @Get("stock")
  stock() {
    return { stock: 3 };
  }
}

@Controller("notes")
@Permissions("notes:read")
class NotesController {
  @Permissions("notes:write")
  @Post()
  write() {
    return { saved: true };
  }
}

const options = { ...config, webhookSecret: "whsec_test", protect: ["/dashboard"], guard: true } satisfies InIDModuleOptions;

async function appWith(imports: unknown[], platform: "express" | "fastify", controllers: any[] = [AppController, ShopController, NotesController]) {
  @Module({ imports: imports as any[], controllers })
  class AppModule {}
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = platform === "fastify" ? moduleRef.createNestApplication(new FastifyAdapter(), { rawBody: true, logger: false }) : moduleRef.createNestApplication({ rawBody: true, logger: false });
  await app.init();
  if (platform === "fastify") await (app.getHttpAdapter().getInstance() as { ready: () => Promise<void> }).ready();
  return app as INestApplication;
}

const bearer = (claims: Record<string, unknown> = {}) => ({ authorization: `Bearer ${idToken(claims)}` });

describe.each(["express", "fastify"] as const)("InIDModule on %s", (platform) => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await appWith([InIDModule.forRoot(options)], platform);
  });
  afterAll(() => app.close());
  const http = () => request(app.getHttpServer());

  it("answers InID's routes: sign-in goes to InID with the app's key", async () => {
    const res = await http().get("/api/inid/signin?return_to=/me");
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^https:\/\/id\.inid\.example\/oauth\/authorize\?client_id=pk_test_x&/);
    expect(String(res.headers["set-cookie"])).toMatch(/__inid_flow_/);
  });

  it("protect rules: signed out, to sign in and back", async () => {
    const res = await http().get("/dashboard?tab=2");
    expect([res.status, res.headers.location]).toEqual([307, expect.stringMatching(/\/api\/inid\/signin\?return_to=%2Fdashboard%3Ftab%3D2$/)]);
  });

  it("the guard: 401 signed out (with where to sign in), @Public passes", async () => {
    const out = await http().get("/me");
    expect([out.status, out.body.signInUrl]).toEqual([401, "/api/inid/signin?return_to=%2Fme"]);
    expect((await http().get("/team")).body.signInUrl).toBe("/api/inid/signin?return_to=%2Fteam&entrance=team");
    expect((await http().get("/")).body).toEqual({ open: true, signedIn: false });
  });

  it("a bearer ID token (native apps, SPAs): who's calling, in @CurrentUser and @UserId", async () => {
    const res = await http().get("/me").set(bearer());
    expect([res.status, res.body]).toEqual([200, { name: "Ana", email: "ana@example.com", id: "u1", cookie: null }]);
    expect((await http().get("/me").set(bearer({ aud: "pk_test_other" }))).status).toBe(401);
    const forged = bearer({ roles: ["admin"] }).authorization.split(".");
    expect((await http().get("/me").set({ authorization: `${forged[0]}.${idToken().split(".")[1]}.${forged[2]}` })).status).toBe(401);
  });

  it("@Roles: any of them; @Permissions: all of them", async () => {
    expect((await http().get("/admin").set(bearer({ roles: ["staff"] }))).status).toBe(403);
    expect((await http().get("/admin").set(bearer({ roles: ["owner"] }))).status).toBe(200);
    expect((await http().get("/invoices").set(bearer({ permissions: ["invoices:read"] }))).status).toBe(403);
    expect((await http().get("/invoices").set(bearer({ permissions: ["invoices:read", "invoices:write"] }))).status).toBe(200);
  });

  it("class and method decorators: a public class's method can ask; permissions add up", async () => {
    expect((await http().get("/shop")).status).toBe(200);
    expect((await http().get("/shop/stock")).status).toBe(401);
    expect((await http().get("/shop/stock").set(bearer({ roles: ["staff"] }))).status).toBe(200);
    expect((await http().post("/notes").set(bearer({ permissions: ["notes:write"] }))).status).toBe(403);
    expect((await http().post("/notes").set(bearer({ permissions: ["notes:read", "notes:write"] }))).status).toBe(201);
  });

  it("the session cookie, renewed before it ends: new cookies out, and this request already sees them", async () => {
    expect((await http().get("/me").set("cookie", `__inid_session=${idToken()}`)).body.name).toBe("Ana");
    renewed.id_token = idToken({ given_name: "Ana María" });
    const res = await http().get("/me").set("cookie", `__inid_session=${idToken({}, 30)}; __inid_refresh=r1`);
    expect([res.status, res.body.name, res.body.cookie]).toEqual([200, "Ana María", expect.stringContaining("__inid_refresh=r2")]);
    expect(String(res.headers["set-cookie"])).toMatch(/__inid_session=.+__inid_refresh=r2/);
  });
});

describe("without guard: true", () => {
  let app: INestApplication;
  beforeAll(async () => {
    // Options from a factory, as with ConfigService
    app = await appWith([InIDModule.forRootAsync({ useFactory: async () => ({ ...config, webhookSecret: "whsec_test" }) })], "express");
  });
  afterAll(() => app.close());
  const http = () => request(app.getHttpServer());

  it("routes are open, and the decorators bring the guard themselves", async () => {
    expect((await http().get("/team")).status).toBe(200);
    expect((await http().get("/shop")).status).toBe(200);
    expect((await http().get("/admin")).status).toBe(401);
    expect((await http().get("/admin").set(bearer({ roles: ["admin"] }))).status).toBe(200);
  });

  it("webhooks: the raw body and its signature, checked", async () => {
    const body = JSON.stringify({ type: "user.created", sub: "u1", created_at: "2026-11-16T00:00:00Z" });
    const ok = await http().post("/webhooks/inid").set("content-type", "application/json").set("inid-signature", signWebhook("whsec_test", body)).send(body);
    expect([ok.status, ok.body.type]).toEqual([201, "user.created"]);
    const forged = await http().post("/webhooks/inid").set("content-type", "application/json").set("inid-signature", signWebhook("whsec_other", body)).send(body);
    expect(forged.status).toBe(400);
  });

  it("InIDService: verifyWebhook, bearer, and @inid/server for the rest", async () => {
    const inid = app.get(InIDService);
    const body = '{"type":"session.ended","sub":"u1","sid":"s1","created_at":"2026-11-16T00:00:00Z"}';
    expect(inid.verifyWebhook(Buffer.from(body), signWebhook("whsec_test", body))).toMatchObject({ type: "session.ended", sid: "s1" });
    expect(() => inid.verifyWebhook(body, `t=${Math.floor(Date.now() / 1000) - 3600},v1=00`)).toThrow("invalid_signature");
    expect(() => inid.verifyWebhook(undefined, "t=1,v1=00")).toThrow(/rawBody: true/);
    expect((await inid.bearer(idToken())).userId).toBe("u1");
    expect((await inid.bearer({ headers: {} })).isSignedIn).toBe(false);
    expect(inid.server.config.apiPath).toBe("/api/inid");
  });
});
