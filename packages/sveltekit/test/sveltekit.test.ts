import { describe, expect, it } from "vitest";
import { inid } from "../src/index.js";

const config = { publishableKey: "pk_test_x", secretKey: "sk_test_x", issuer: "https://id.inid.example" };

describe("SvelteKit handle", () => {
  it("InID's routes, protected paths, and who's signed in on event.locals", async () => {
    const handle = inid({ ...config, protect: ["/dashboard"] });
    const event = { request: new Request("https://app.example/about"), locals: {} as Record<string, unknown> };
    const res = await handle({ event, resolve: () => new Response("about") });
    expect([await res.text(), (event.locals.inid as { isSignedIn: boolean }).isSignedIn]).toEqual(["about", false]);
    const out = await handle({ event: { request: new Request("https://app.example/dashboard/x"), locals: {} }, resolve: () => new Response("x") });
    expect([out.status, out.headers.get("location")]).toEqual([307, "https://app.example/api/inid/signin?return_to=%2Fdashboard%2Fx"]);
    const routes = await handle({ event: { request: new Request("https://app.example/api/inid/session"), locals: {} }, resolve: () => new Response("never") });
    expect(await routes.json()).toMatchObject({ user: null });
  });
});
