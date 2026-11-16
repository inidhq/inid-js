import { describe, expect, it } from "vitest";
import { auth, inid } from "../src/index.js";

const config = { publishableKey: "pk_test_x", secretKey: "sk_test_x", issuer: "https://id.inid.example" };
const page = (body = "page") => async () => new Response(body, { headers: { "content-type": "text/html" } });

describe("Astro middleware", () => {
  it("InID's routes, protected paths, and who's signed in on locals", async () => {
    const onRequest = inid({ ...config, protect: [{ path: "/admin", role: "admin" }] });
    const locals: Record<string, unknown> = {};
    // A page anyone sees: it renders, with nobody signed in
    const open = await onRequest({ request: new Request("https://app.example/"), locals }, page("home"));
    expect([await open.text(), auth({ locals }).isSignedIn]).toEqual(["home", false]);
    // A protected one: to sign in, back to it
    const admin = await onRequest({ request: new Request("https://app.example/admin"), locals: {} }, page());
    expect([admin.status, admin.headers.get("location")]).toEqual([307, "https://app.example/api/inid/signin?return_to=%2Fadmin"]);
    // InID's own routes, answered by the middleware (no endpoint file needed)
    const signIn = await onRequest({ request: new Request("https://app.example/api/inid/signin"), locals: {} }, page());
    expect(signIn.headers.get("location")).toMatch(/^https:\/\/id\.inid\.example\/oauth\/authorize\?client_id=pk_test_x&/);
  });

  it("a prerendered page has no visitor: nothing is checked", async () => {
    const locals: Record<string, unknown> = {};
    const res = await inid({ ...config, protect: ["/"] })({ request: new Request("https://app.example/"), locals, isPrerendered: true }, page("built"));
    expect([await res.text(), auth({ locals }).isSignedIn]).toEqual(["built", false]);
  });
});
