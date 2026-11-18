// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configure, getUser, has, setActiveTeam, signIn, signOut, type InIDUser } from "../src/index.js";

const ana: InIDUser = {
  id: "u1",
  firstName: "Ana",
  lastName: "Pérez",
  name: "Ana Pérez",
  email: "ana@example.com",
  emailVerified: true,
  phone: null,
  roles: ["admin"],
  permissions: ["invoices:read"],
  publicMetadata: {},
  team: null,
};

// The session store is shared per apiPath, and custom elements stay registered: every test
// gets an apiPath of its own so nothing leaks between them.
let api = "";
let n = 0;
const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const serve = (user: InIDUser | null) =>
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === `${api}/session`) return json({ user, accountUrl: "https://id.example/account" });
    if (url === `${api}/signout` && init?.method === "POST") return new Response(null, { status: 204 });
    if (url === `${api}/sessions`) return json({ sessions: [] });
    return new Response("not found", { status: 404 });
  });
const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};
const mount = (html: string) => {
  document.body.innerHTML = html;
  return document.body.firstElementChild as HTMLElement;
};
const shown = (element: Element) => Boolean(element.shadowRoot!.querySelector("slot:not([name])"));
const assign = () => vi.spyOn(window.location, "assign").mockImplementation(() => {});

beforeEach(() => {
  api = `/api/t${++n}`;
  configure({ apiPath: api, locale: "es" });
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  history.replaceState(null, "", "/shop/cart?x=1");
});
afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("<inid-sign-in>", () => {
  // happy-dom is told not to load frames, and says so on the console
  beforeEach(() => void vi.spyOn(console, "error").mockImplementation(() => {}));
  const frameSrc = (element: Element) => new URL(element.shadowRoot!.querySelector("iframe")!.getAttribute("src")!, location.origin);

  it("frames InID's embedded form with the page, return_to, locale and entrance", async () => {
    serve(null);
    const element = mount(`<inid-sign-in app-name="Mi App" entrance="team" locale="en"></inid-sign-in>`);
    const frame = element.shadowRoot!.querySelector("iframe")!;
    expect(frame.getAttribute("allow")).toBe("publickey-credentials-get *; publickey-credentials-create *");
    expect(frame.getAttribute("scrolling")).toBe("no");
    expect(frame.getAttribute("title")).toBe("Sign in to Mi App");
    const src = frameSrc(element);
    expect(src.pathname).toBe(`${api}/signin`);
    expect(Object.fromEntries(src.searchParams)).toEqual({ display: "embed", return_to: "/shop/cart?x=1", page: "/shop/cart?x=1", ui_locales: "en", entrance: "team" });
    await settle();
    expect(element.shadowRoot!.querySelector("iframe")).toBe(frame);
  });

  it("appearance: the attribute and the CSS properties on the element go to InID's frame, only what InID takes; the card wears them too", () => {
    serve(null);
    const style = document.createElement("style");
    style.textContent = "inid-sign-in { --inid-primary: #7C3AED; --inid-radius: 8px; --inid-bg: url(x) }";
    document.head.append(style);
    try {
      const element = mount(`<inid-sign-in appearance='{"theme":"dark","variables":{"fontFamily":"serif","colorBackground":"red;}","borderRadius":"small"},"css":"body{}"}'></inid-sign-in>`);
      const look = JSON.parse(frameSrc(element).searchParams.get("appearance")!);
      // The attribute wins over the CSS property (the corner); what isn't a known value is gone
      expect(look).toEqual({ theme: "dark", variables: { colorPrimary: "#7C3AED", borderRadius: "small", fontFamily: "serif" } });
      const card = element.shadowRoot!.querySelector<HTMLElement>(".inid-card")!;
      expect(card.style.getPropertyValue("--inid-primary")).toBe("#7c3aed");
      expect(card.style.getPropertyValue("--inid-primary-ink")).toBe("#ffffff");
      expect(card.style.getPropertyValue("--inid-radius")).toBe("6px");
      expect(card.style.getPropertyValue("--inid-bg")).toBe("#111113");
    } finally {
      style.remove();
    }
    expect(frameSrc(mount(`<inid-sign-in appearance="not json"></inid-sign-in>`)).searchParams.has("appearance")).toBe(false);
  });

  it("takes the app's logo, name and colors from its own frame only, without starting the frame over", () => {
    serve(null);
    const element = mount(`<inid-sign-in></inid-sign-in>`);
    const frame = element.shadowRoot!.querySelector("iframe")!;
    const own = {} as Window;
    Object.defineProperty(frame, "contentWindow", { value: own });
    const send = (data: unknown, source: Window | null, origin = "https://id.inid.co") => window.dispatchEvent(new MessageEvent("message", { data, source, origin }));
    const brand = { type: "inid:brand", name: "Acme", logo: "https://id.inid.co/brand/acme/logo.0123456789abcdef0123456789abcdef.png", theme: "light", common: { "--inid-primary": "#16a34a", "--evil": "x", "--inid-radius": "1px;}body{" }, light: { "--inid-bg": "#fafafa" } };
    send(brand, null);
    expect(element.shadowRoot!.querySelector("h2")!.textContent).toBe("Entra");
    send(brand, own);
    const card = element.shadowRoot!.querySelector<HTMLElement>(".inid-card")!;
    expect(element.shadowRoot!.querySelector("h2")!.textContent).toBe("Entra a Acme");
    expect(element.shadowRoot!.querySelector<HTMLImageElement>("img.inid-logo")!.getAttribute("src")).toBe(brand.logo);
    expect([card.style.getPropertyValue("--inid-primary"), card.style.getPropertyValue("--inid-bg"), card.style.getPropertyValue("--inid-radius"), card.style.getPropertyValue("--evil")]).toEqual(["#16a34a", "#fafafa", "", ""]);
    expect(element.shadowRoot!.querySelector("iframe")).toBe(frame);
    // A logo from anywhere but the frame's own origin isn't shown
    const other = mount(`<inid-sign-in></inid-sign-in>`);
    const otherFrame = other.shadowRoot!.querySelector("iframe")!;
    Object.defineProperty(otherFrame, "contentWindow", { value: own });
    send({ ...brand, logo: "https://evil.example/x.png" }, own);
    expect(other.shadowRoot!.querySelector("img")).toBeNull();
  });

  it("uses return-to and the configured locale", () => {
    serve(null);
    const src = frameSrc(mount(`<inid-sign-in return-to="/welcome"></inid-sign-in>`));
    expect(src.searchParams.get("return_to")).toBe("/welcome");
    expect(src.searchParams.get("ui_locales")).toBe("es");
    expect(src.searchParams.has("entrance")).toBe(false);
  });

  it("goes on after Google with inid_continue, and takes it out of the address", () => {
    serve(null);
    history.replaceState(null, "", "/login?a=1&inid_continue=abc123#top");
    const replace = vi.spyOn(history, "replaceState");
    const src = frameSrc(mount(`<inid-sign-in></inid-sign-in>`));
    expect(Object.fromEntries(src.searchParams)).toEqual({ display: "embed", continue: "abc123" });
    expect(replace).toHaveBeenCalledWith(history.state, "", "/login?a=1#top");
    expect(location.search).toBe("?a=1");
  });

  it("takes its height only from its own frame, within range", () => {
    serve(null);
    const element = mount(`<inid-sign-in></inid-sign-in>`);
    const frame = element.shadowRoot!.querySelector("iframe")!;
    // Frames aren't loaded here: the frame's window is a stand-in
    const own = {} as Window;
    Object.defineProperty(frame, "contentWindow", { value: own });
    const send = (data: unknown, source: Window | null) => window.dispatchEvent(new MessageEvent("message", { data, source }));
    expect(frame.style.height).toBe("280px");
    send({ type: "inid:height", height: 420.2 }, own);
    expect(frame.style.height).toBe("421px");
    send({ type: "inid:height", height: 999 }, window);
    send({ type: "inid:height", height: 999 }, null);
    send({ type: "inid:height", height: 5000 }, own);
    send({ type: "inid:height", height: -3 }, own);
    send({ type: "other", height: 300 }, own);
    expect(frame.style.height).toBe("421px");
  });

  it("says who is signed in instead of the form", async () => {
    serve(ana);
    const element = mount(`<inid-sign-in></inid-sign-in>`);
    await settle();
    expect(element.shadowRoot!.querySelector("iframe")).toBeNull();
    expect(element.shadowRoot!.textContent).toContain("Entraste como Ana Pérez");
  });

  it("redirect: a single button to InID's page", async () => {
    serve(null);
    const go = assign();
    const element = mount(`<inid-sign-in redirect entrance="team"></inid-sign-in>`);
    await settle();
    expect(element.shadowRoot!.querySelector("iframe")).toBeNull();
    element.shadowRoot!.querySelector("button")!.click();
    expect(go).toHaveBeenCalledWith(`${api}/signin?return_to=%2Fshop%2Fcart%3Fx%3D1&ui_locales=es&entrance=team`);
  });
});

describe("the session", () => {
  it("is fetched once for every element and getUser()", async () => {
    serve(ana);
    const seen: unknown[] = [];
    document.addEventListener("inid:user", (e) => seen.push((e as CustomEvent).detail.user), { once: true });
    mount(`<div><inid-signed-in>a</inid-signed-in><inid-signed-out>b</inid-signed-out><inid-user-button></inid-user-button><inid-protect role="admin">c</inid-protect></div>`);
    expect(await getUser()).toEqual(ana);
    await settle();
    expect(fetchMock.mock.calls.filter(([url]) => url === `${api}/session`)).toHaveLength(1);
    expect(seen).toEqual([ana]);
  });

  it("shows signed-in, signed-out and protect by who is here", async () => {
    serve(ana);
    mount(
      `<div><inid-signed-in id="in">in</inid-signed-in><inid-signed-out id="out">out</inid-signed-out><inid-protect id="admin" role="admin">x</inid-protect><inid-protect id="owner" role="owner"><span slot="fallback">no</span></inid-protect><inid-protect id="perm" permission="invoices:read">y</inid-protect></div>`
    );
    const get = (id: string) => document.getElementById(id)!;
    // Nothing shows until the server answers
    expect(["in", "out", "admin", "owner"].map((id) => shown(get(id)))).toEqual([false, false, false, false]);
    await settle();
    expect(shown(get("in"))).toBe(true);
    expect(shown(get("out"))).toBe(false);
    expect(shown(get("admin"))).toBe(true);
    expect(shown(get("perm"))).toBe(true);
    expect(shown(get("owner"))).toBe(false);
    expect(get("owner").shadowRoot!.querySelector("slot[name=fallback]")).not.toBeNull();
  });

  it("shows signed-out to nobody signed in, and when the server fails", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const element = mount(`<inid-signed-out>hi</inid-signed-out>`);
    await settle();
    expect(shown(element)).toBe(true);
    expect(await getUser()).toBeNull();
  });

  it("has() checks roles and permissions", () => {
    expect(has(ana, { role: "admin" })).toBe(true);
    expect(has(ana, { role: "admin", permission: "invoices:write" })).toBe(false);
    expect(has(null, {})).toBe(false);
    expect(has(ana, {})).toBe(true);
  });

  it("has() and <inid-protect team-role>: the active team's role, and a permission from it", async () => {
    const inTeam = { ...ana, team: { id: "team_1", slug: "acme", name: "Acme", role: "member", permissions: ["invoices:write"] } };
    expect([has(inTeam, { teamRole: "member" }), has(inTeam, { teamRole: "admin" }), has(inTeam, { permission: "invoices:write" }), has(ana, { teamRole: "member" })]).toEqual([true, false, true, false]);
    serve(inTeam);
    const element = mount(`<inid-protect team-role="admin">x<span slot="fallback">no</span></inid-protect>`);
    await settle();
    expect(shown(element)).toBe(false);
    element.setAttribute("team-role", "member");
    expect(shown(element)).toBe(true);
  });
});

describe("teams", () => {
  const acme = { id: "team_1", slug: "acme", name: "Acme", role: "admin", permissions: ["team:manage"] };
  const list = {
    teams: [{ id: "team_1", name: "Acme", slug: "acme", imageUrl: null, role: "admin", permissions: ["team:manage"], manages: true }, { id: "team_2", name: "Beta", slug: "beta", imageUrl: null, role: "member", permissions: [], manages: false }],
    invitations: [{ id: "tinv_1", team: { id: "team_3", name: "Gamma", slug: "gamma", imageUrl: null }, role: "member", expiresAt: "2026-12-01T00:00:00.000Z" }],
    joinable: [],
    settings: { canCreate: true, required: false, maxPerUser: 10, roles: [{ key: "admin", name: "Admin" }, { key: "member", name: "Miembro" }], defaultRole: "member" },
  };
  const calls: string[] = [];
  const serveTeams = (user: InIDUser) => {
    calls.length = 0;
    let current = user;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method || "GET";
      calls.push(`${method} ${url.replace(api, "")}${init?.body ? ` ${init.body}` : ""}`);
      if (url === `${api}/session`) return json({ user: current, accountUrl: "https://id.example/account" });
      if (url === `${api}/teams` && method === "GET") return json(list);
      if (url === `${api}/team` && method === "POST") {
        const { teamId } = JSON.parse(String(init!.body));
        current = { ...current, team: teamId === "team_2" ? { ...acme, id: "team_2", slug: "beta", name: "Beta", role: "member", permissions: [] } : teamId === "team_3" ? { ...acme, id: "team_3", name: "Gamma", role: "member" } : teamId ? acme : null };
        return json({ user: current });
      }
      if (url === `${api}/teams/invitations/tinv_1/accept`) return json({ team: { id: "team_3" } });
      if (url === `${api}/teams/team_1` && method === "GET") return json(list.teams[0]);
      if (url === `${api}/teams/team_1/members`) return json({ members: [{ userId: "u1", role: "admin", firstName: "Ana", lastName: "Pérez", email: "ana@example.com" }, { userId: "u2", role: "member", firstName: "Luis", lastName: null, email: "luis@example.com" }] });
      if (url === `${api}/teams/team_1/invitations` && method === "GET") return json({ invitations: [{ id: "tinv_9", email: "nueva@example.com", role: "member" }] });
      if (url === `${api}/teams/team_1/invitations` && method === "POST") return json({ id: "tinv_10" });
      if (url === `${api}/teams` && method === "POST") return json({ id: "team_9", name: "Nuevo", slug: "nuevo", role: "admin" });
      return new Response("not found", { status: 404 });
    });
  };

  it("<inid-team-switcher>: the team in use, the others, the personal account and an invitation; choosing one renews the session and goes on", async () => {
    serveTeams({ ...ana, team: acme });
    const go = assign();
    const element = mount(`<inid-team-switcher after-switch="/dashboard"></inid-team-switcher>`);
    await settle();
    const button = element.shadowRoot!.querySelector<HTMLButtonElement>(".inid-avatar-btn")!;
    expect(button.textContent).toBe("AAcme");
    button.click();
    const items = [...element.shadowRoot!.querySelectorAll<HTMLButtonElement>("[role=menuitem]")];
    expect(items.map((i) => i.textContent)).toEqual(["APCuenta personal", "AAcme", "BBeta", "GGammaAceptar", "Administrar equipo", "Crear equipo"]);
    expect(items[1].getAttribute("aria-current")).toBe("true");
    items[2].click();
    await settle();
    expect(calls).toContain(`POST /team {"teamId":"team_2"}`);
    expect(go).toHaveBeenCalledWith("/dashboard");
    expect(element.shadowRoot!.querySelector(".inid-avatar-btn")!.textContent).toBe("BBeta");
    // Accepting the invitation: InID adds them, then the session switches to that team
    element.shadowRoot!.querySelector<HTMLButtonElement>(".inid-avatar-btn")!.click();
    [...element.shadowRoot!.querySelectorAll<HTMLButtonElement>("[role=menuitem]")].find((i) => i.textContent?.includes("Gamma"))!.click();
    await settle();
    expect(calls.slice(-2)).toEqual(["POST /teams/invitations/tinv_1/accept", `POST /team {"teamId":"team_3"}`]);
  });

  it("an app that requires a team: no personal account in the switcher; setActiveTeam() renews the session", async () => {
    serveTeams({ ...ana, team: acme });
    list.settings.required = true;
    try {
      const element = mount(`<inid-team-switcher></inid-team-switcher>`);
      await settle();
      element.shadowRoot!.querySelector<HTMLButtonElement>(".inid-avatar-btn")!.click();
      expect(element.shadowRoot!.textContent).not.toContain("Cuenta personal");
    } finally {
      list.settings.required = false;
    }
    expect((await setActiveTeam(null))?.team).toBeNull();
    expect((await getUser())?.team).toBeNull();
  });

  it("<inid-team-profile>: the members with their roles and invitations for an admin; inviting by email", async () => {
    serveTeams({ ...ana, team: acme });
    const element = mount(`<inid-team-profile></inid-team-profile>`);
    await settle();
    const root = element.shadowRoot!;
    expect(root.querySelector<HTMLInputElement>("input[name=name]")!.value).toBe("Acme");
    root.querySelectorAll<HTMLButtonElement>("[role=tab]")[1].click();
    expect([...root.querySelectorAll("li b")].map((b) => b.textContent)).toEqual(["Ana Pérez", "Luis", "nueva@example.com"]);
    // Ana herself: no role to change; Luis: a role to choose and a way out
    expect(root.querySelectorAll("li")[0].querySelector("select")).toBeNull();
    expect(root.querySelectorAll("li")[1].querySelector("select")!.value).toBe("member");
    const form = root.querySelector<HTMLFormElement>("form.inid-row")!;
    form.querySelector<HTMLInputElement>("input[name=email]")!.value = "otra@example.com";
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    await settle();
    expect(calls).toContain(`POST /teams/team_1/invitations {"email":"otra@example.com","role":"member"}`);
  });

  it("<inid-create-team>: a name; the person's session switches to the new team", async () => {
    serveTeams(ana);
    const go = assign();
    const element = mount(`<inid-create-team after-create="/team"></inid-create-team>`);
    const form = element.shadowRoot!.querySelector("form")!;
    form.querySelector("input")!.value = "Nuevo";
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    await settle();
    expect(calls.filter((c) => c.startsWith("POST"))).toEqual([`POST /teams {"name":"Nuevo"}`, `POST /team {"teamId":"team_9"}`]);
    expect(go).toHaveBeenCalledWith("/team");
  });
});

describe("signing in and out", () => {
  it("signIn() goes to the app's signin route", () => {
    const go = assign();
    signIn("/after", "team");
    expect(go).toHaveBeenCalledWith(`${api}/signin?return_to=%2Fafter&ui_locales=es&entrance=team`);
  });

  it("signOut() posts, forgets the person, then navigates", async () => {
    serve(ana);
    const go = assign();
    const element = mount(`<inid-signed-in>in</inid-signed-in>`);
    await settle();
    expect(shown(element)).toBe(true);
    await signOut("/bye");
    expect(fetchMock).toHaveBeenCalledWith(`${api}/signout`, { method: "POST", credentials: "same-origin" });
    expect(shown(element)).toBe(false);
    expect(go).toHaveBeenCalledWith("/bye");
    const posted = fetchMock.mock.invocationCallOrder[fetchMock.mock.calls.findIndex(([url]) => url === `${api}/signout`)];
    expect(posted).toBeLessThan(go.mock.invocationCallOrder[0]);
  });

  it("<inid-sign-out-button> signs out and goes to return-to", async () => {
    serve(ana);
    const go = assign();
    const element = mount(`<inid-sign-out-button return-to="/home"></inid-sign-out-button>`);
    expect(element.shadowRoot!.querySelector("slot")!.textContent).toBe("Salir");
    element.shadowRoot!.querySelector("button")!.click();
    await settle();
    expect(fetchMock).toHaveBeenCalledWith(`${api}/signout`, expect.objectContaining({ method: "POST" }));
    expect(go).toHaveBeenCalledWith("/home");
  });

  it("<inid-sign-in-button> has a localized label and its own api-path", () => {
    const go = assign();
    const element = mount(`<inid-sign-in-button api-path="/auth" locale="pt" return-to="/x"></inid-sign-in-button>`);
    expect(element.shadowRoot!.querySelector("slot")!.textContent).toBe("Continuar com InID");
    element.shadowRoot!.querySelector("button")!.click();
    expect(go).toHaveBeenCalledWith("/auth/signin?return_to=%2Fx&ui_locales=pt");
  });
});

describe("<inid-user-profile>", () => {
  beforeEach(() => void vi.spyOn(console, "error").mockImplementation(() => {}));
  it("frames the person's InID account for this app, with the app's look from its attribute", async () => {
    serve(ana);
    const element = mount(`<inid-user-profile appearance='{"variables":{"colorPrimary":"#0f766e"}}'></inid-user-profile>`);
    await settle();
    const src = new URL(element.shadowRoot!.querySelector("iframe")!.getAttribute("src")!);
    expect(src.origin + src.pathname).toBe("https://id.example/account");
    expect(JSON.parse(src.searchParams.get("appearance")!)).toEqual({ variables: { colorPrimary: "#0f766e" } });
    expect(element.shadowRoot!.querySelector<HTMLElement>(".inid-card")!.style.getPropertyValue("--inid-primary")).toBe("#0f766e");
  });
});

describe("<inid-user-button>", () => {
  it("shows the initials and a menu with the person", async () => {
    serve(ana);
    const element = mount(`<inid-user-button show-name></inid-user-button>`);
    await settle();
    const button = element.shadowRoot!.querySelector<HTMLButtonElement>(".inid-avatar-btn")!;
    expect(button.textContent).toBe("APAna");
    button.click();
    const menu = element.shadowRoot!.querySelector("[role=menu]")!;
    expect(menu.textContent).toContain("ana@example.com");
    expect(menu.querySelector("a")!.getAttribute("href")).toBe("https://id.example/account");
    document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(element.shadowRoot!.querySelector("[role=menu]")).toBeNull();
  });
});
