import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server.js";
import { inidProxy, setup } from "../src/server.js";

// Back from Google on the app's own site (its domain on Google's screen): the proxy sends
// Google's answer on to InID before any page renders
describe("inidProxy and Google's return", () => {
  setup({ publishableKey: "pk_test_app", secretKey: "sk_test_app", issuer: "https://id.inid.example", appUrl: "https://app.example" });
  const proxy = inidProxy();

  it("InID's answer goes on to InID, as it came", async () => {
    const res = await proxy(new NextRequest("https://app.example/?state=inidg_abc&code=g-code&scope=email"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://id.inid.example/oauth/google/callback?state=inidg_abc&code=g-code&scope=email");
  });

  it("anything else is the app's own", async () => {
    for (const url of ["https://app.example/?state=theirs&code=x", "https://app.example/?state=inidg_abc", "https://app.example/"]) {
      expect((await proxy(new NextRequest(url))).headers.get("location")).toBeNull();
    }
  });
});

describe("roles and permissions", () => {
  it("has() asks for a role, a permission, or both", async () => {
    const { hasAccess } = await import("../../server/src/core.js");
    const user = { roles: ["admin"], permissions: ["facturas:ver"] };
    expect(hasAccess(user, { role: "admin" })).toBe(true);
    expect(hasAccess(user, { permission: "facturas:ver" })).toBe(true);
    expect(hasAccess(user, { role: "admin", permission: "facturas:editar" })).toBe(false);
    expect(hasAccess(user, { role: "member" })).toBe(false);
    expect(hasAccess(null, { role: "admin" })).toBe(false);
  });
});
