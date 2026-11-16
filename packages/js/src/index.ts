// Sign-in with InID for any page: custom elements and a few functions, no framework.
// Like @inid/react, it talks to the app's own server (its InID routes, /api/inid by default),
// never to InID with a key.
//
//   <script type="module">import "@inid/js";</script>
//   <inid-signed-out><inid-sign-in app-name="My App"></inid-sign-in></inid-signed-out>
//   <inid-signed-in><inid-user-button></inid-user-button></inid-signed-in>

export interface InIDUser {
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
export type Locale = "es" | "en" | "pt";

// has(user, { role: "admin" }), has(user, { permission: "invoices:read" })
export const has = (user: InIDUser | null | undefined, check: AccessCheck): boolean =>
  Boolean(user) && (!check.role || (user!.roles ?? []).includes(check.role)) && (!check.permission || (user!.permissions ?? []).includes(check.permission));

const TEXTS = {
  es: {
    continue: "Continuar con InID",
    title: "Entra a {app}",
    titlePlain: "Entra",
    lead: "Con Face ID, tu huella o un código a tu celular. Sin contraseñas.",
    signedInAs: "Entraste como {name}",
    manage: "Gestionar mi InID",
    signOut: "Salir",
    account: "Tu cuenta",
    secured: "Protegido por InID",
    sessions: "Tus sesiones",
    sessionsLead: "Donde entraste a esta app. Cierra las que no reconozcas.",
    profile: "Tu cuenta",
    profileLead: "Tus datos y tu Face ID son de tu InID: cámbialos aquí y llegan a cada app que autorizaste.",
    thisOne: "Esta sesión",
    end: "Cerrar",
    endOthers: "Cerrar las demás",
    since: "Desde {date} · activa {ago}",
    now: "ahora",
    minutesAgo: "hace {n} min",
    hoursAgo: "hace {n} h",
    close: "Listo",
    browser: "Navegador",
  },
  en: {
    continue: "Continue with InID",
    title: "Sign in to {app}",
    titlePlain: "Sign in",
    lead: "With Face ID, your fingerprint or a code to your phone. No passwords.",
    signedInAs: "Signed in as {name}",
    manage: "Manage my InID",
    signOut: "Sign out",
    account: "Your account",
    secured: "Secured by InID",
    sessions: "Your sessions",
    sessionsLead: "Where you signed in to this app. End the ones you don't recognize.",
    profile: "Your account",
    profileLead: "Your data and Face ID belong to your InID: change them here and every app you authorized gets them.",
    thisOne: "This session",
    end: "End",
    endOthers: "End the others",
    since: "Since {date} · active {ago}",
    now: "now",
    minutesAgo: "{n} min ago",
    hoursAgo: "{n} h ago",
    close: "Done",
    browser: "Browser",
  },
  pt: {
    continue: "Continuar com InID",
    title: "Entre em {app}",
    titlePlain: "Entre",
    lead: "Com Face ID, sua digital ou um código no seu celular. Sem senhas.",
    signedInAs: "Você entrou como {name}",
    manage: "Gerenciar meu InID",
    signOut: "Sair",
    account: "Sua conta",
    secured: "Protegido por InID",
    sessions: "Suas sessões",
    sessionsLead: "Onde você entrou neste app. Encerre as que não reconhecer.",
    profile: "Sua conta",
    profileLead: "Seus dados e seu Face ID são do seu InID: mude-os aqui e cada app que você autorizou os recebe.",
    thisOne: "Esta sessão",
    end: "Encerrar",
    endOthers: "Encerrar as outras",
    since: "Desde {date} · ativa {ago}",
    now: "agora",
    minutesAgo: "há {n} min",
    hoursAgo: "há {n} h",
    close: "Pronto",
    browser: "Navegador",
  },
};
type Texts = (typeof TEXTS)["es"];
const fill = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? "");
const isLocale = (value: string | null | undefined): value is Locale => value === "es" || value === "en" || value === "pt";

// ---------- settings ----------
const settings: { apiPath?: string; locale?: Locale } = {};

export function configure(options: { apiPath?: string; locale?: Locale }): void {
  if (options.apiPath !== undefined) settings.apiPath = options.apiPath;
  if (options.locale !== undefined) settings.locale = options.locale;
}

const resolveApiPath = (given?: string | null) => (given || settings.apiPath || "/api/inid").replace(/\/+$/, "");
const resolveLocale = (given?: string | null): Locale => {
  if (isLocale(given)) return given;
  if (settings.locale) return settings.locale;
  const lang = typeof document === "undefined" ? "" : document.documentElement.lang.slice(0, 2).toLowerCase();
  return isLocale(lang) ? lang : "es";
};

// ---------- the session, fetched once per apiPath and shared by every element ----------
interface Session {
  loaded: boolean;
  user: InIDUser | null;
  accountUrl: string;
}

class Store {
  state: Session = { loaded: false, user: null, accountUrl: "https://id.inid.co/account" };
  loading: Promise<Session> | null = null;
  listeners = new Set<() => void>();
  constructor(readonly apiPath: string) {}

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  set(next: Session) {
    const before = this.state;
    this.state = next;
    for (const listener of [...this.listeners]) listener();
    if (next.loaded && (!before.loaded || JSON.stringify(before.user) !== JSON.stringify(next.user)) && typeof document !== "undefined")
      document.dispatchEvent(new CustomEvent("inid:user", { detail: { user: next.user, apiPath: this.apiPath } }));
  }

  load(force = false): Promise<Session> {
    if (this.loading && !force) return this.loading;
    this.loading = (async () => {
      try {
        const res = await fetch(`${this.apiPath}/session`, { credentials: "same-origin", cache: "no-store" });
        const body = (await res.json()) as { user: InIDUser | null; accountUrl?: string };
        this.set({ loaded: true, user: body.user ?? null, accountUrl: body.accountUrl || this.state.accountUrl });
      } catch {
        this.set({ ...this.state, loaded: true });
      }
      return this.state;
    })();
    return this.loading;
  }
}

const stores = new Map<string, Store>();
const storeFor = (apiPath: string) => {
  let store = stores.get(apiPath);
  if (!store) stores.set(apiPath, (store = new Store(apiPath)));
  return store;
};

// Who is signed in (null when nobody): asked once, then shared
export async function getUser(): Promise<InIDUser | null> {
  return (await storeFor(resolveApiPath()).load()).user;
}

// Asks the server again (after something changed); the elements follow
export async function reload(): Promise<InIDUser | null> {
  return (await storeFor(resolveApiPath()).load(true)).user;
}

const goSignIn = (apiPath: string, locale: Locale, returnTo?: string | null, entrance?: string | null) => {
  const back = returnTo || `${location.pathname}${location.search}`;
  location.assign(`${apiPath}/signin?${new URLSearchParams({ return_to: back, ui_locales: locale, ...(entrance && { entrance }) })}`);
};

const goSignOut = async (apiPath: string, returnTo?: string | null) => {
  await fetch(`${apiPath}/signout`, { method: "POST", credentials: "same-origin" }).catch(() => {});
  const store = storeFor(apiPath);
  store.set({ ...store.state, loaded: true, user: null });
  location.assign(returnTo || "/");
};

// To InID's page and back here (or to returnTo, a path in this app).
// entrance: a door of the app with its own rules ("team"), made in the InID panel
export function signIn(returnTo?: string, entrance?: string): void {
  goSignIn(resolveApiPath(), resolveLocale(), returnTo, entrance);
}

export function signOut(returnTo = "/"): Promise<void> {
  return goSignOut(resolveApiPath(), returnTo);
}

// ---------- the look ----------
// Same as @inid/react's. Inside each shadow root, --i-* take the app's --inid-* when set
// (on the element or any ancestor) so the app can theme it from outside.
const CSS = `
:host{display:inline-block}
:host([hidden]){display:none}
.inid{--i-ink:var(--inid-ink,#18181b);--i-muted:var(--inid-muted,#6b6b76);--i-line:var(--inid-line,#e6e6ea);--i-bg:var(--inid-bg,#fff);--i-hover:var(--inid-hover,#f4f4f6);--i-accent:var(--inid-accent,#c6ff3d);--i-radius:var(--inid-radius,10px);font-family:var(--inid-font,inherit);color:var(--i-ink);box-sizing:border-box}
.inid *{box-sizing:border-box}
.inid-btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;min-height:40px;padding:0 16px;border-radius:calc(var(--i-radius) - 2px);border:1px solid var(--i-ink);background:var(--i-ink);color:#fff;font:600 14px/1 var(--inid-font,inherit);cursor:pointer;text-decoration:none}
.inid-btn:hover{opacity:.9}.inid-btn:focus-visible,.inid-avatar-btn:focus-visible,.inid-menu-item:focus-visible{outline:2px solid var(--i-ink);outline-offset:2px}
.inid-btn i{width:9px;height:9px;border-radius:2px;background:var(--i-accent);flex:none}
.inid-btn.inid-wide{width:100%;min-height:44px;font-size:15px}
.inid-card{width:100%;max-width:380px;padding:28px;border:1px solid var(--i-line);border-radius:calc(var(--i-radius) + 4px);background:var(--i-bg);box-shadow:0 1px 2px rgba(16,16,20,.05),0 12px 32px -18px rgba(16,16,20,.18)}
.inid-card h2{margin:16px 0 6px;font-size:20px;font-weight:650;letter-spacing:-.01em}
.inid-card p{margin:0 0 20px;font-size:14px;line-height:1.5;color:var(--i-muted)}
.inid-frame{display:block;width:100%;border:0;overflow:hidden;margin-top:8px;background:transparent;color-scheme:normal;transition:height .15s ease}
.inid-sessions ul{list-style:none;margin:0 0 12px;padding:0;display:grid;gap:8px}
.inid-sessions li{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid var(--i-line);border-radius:var(--i-radius)}
.inid-sessions li b{display:block;font-size:14px;font-weight:600}
.inid-sessions li small{display:block;font-size:12.5px;color:var(--i-muted)}
.inid-sessions li em{font-style:normal;font-size:12.5px;color:var(--i-muted);white-space:nowrap}
.inid-sessions[aria-busy]{min-height:60px}
.inid-btn.inid-quiet{background:var(--i-bg);color:var(--i-ink);border-color:var(--i-line);min-height:32px;padding:0 12px;font-size:13px}
.inid-profile{max-width:560px}
.inid-tabs{display:flex;gap:4px;border-bottom:1px solid var(--i-line);margin:-4px 0 16px}
.inid-tab{font:600 14px/1 var(--inid-font,inherit);color:var(--i-muted);background:none;border:0;border-bottom:2px solid transparent;padding:10px 12px;margin-bottom:-1px;cursor:pointer}
.inid-tab[aria-selected="true"]{color:var(--i-ink);border-bottom-color:var(--i-ink)}
.inid-muted{font-size:14px;color:var(--i-muted);margin:0 0 12px}
.inid-dialog{width:min(440px,calc(100vw - 32px));padding:24px;border:1px solid var(--i-line);border-radius:calc(var(--i-radius) + 4px);background:var(--i-bg);box-shadow:0 24px 64px -16px rgba(16,16,20,.3)}
.inid-dialog::backdrop{background:rgba(16,16,20,.35)}
.inid-dialog h2{margin:0 0 6px;font-size:18px;font-weight:650}
.inid-dialog p{margin:0 0 16px;font-size:14px;color:var(--i-muted)}
.inid-dialog form{margin:0}
.inid-card .inid-foot{margin:18px 0 0;padding-top:14px;border-top:1px solid var(--i-line);font-size:12px;text-align:center}
.inid-mark{display:block;width:32px;height:32px}
.inid-user{position:relative;display:inline-block}
.inid-avatar-btn{display:inline-flex;align-items:center;gap:8px;padding:2px;border:0;background:none;border-radius:999px;cursor:pointer;font:inherit;color:inherit}
.inid-avatar{display:grid;place-items:center;width:32px;height:32px;border-radius:999px;background:var(--i-ink);color:#fff;font:600 13px/1 var(--inid-font,inherit)}
.inid-menu{position:absolute;right:0;top:calc(100% + 8px);z-index:50;min-width:248px;padding:6px;border:1px solid var(--i-line);border-radius:var(--i-radius);background:var(--i-bg);box-shadow:0 12px 32px -10px rgba(16,16,20,.18),0 2px 6px rgba(16,16,20,.06)}
.inid-who{display:grid;grid-template-columns:36px minmax(0,1fr);gap:10px;align-items:center;padding:8px 8px 10px;border-bottom:1px solid var(--i-line);margin-bottom:4px}
.inid-who .inid-avatar{width:36px;height:36px}
.inid-who b{display:block;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.inid-who small{display:block;font-size:12.5px;color:var(--i-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.inid-menu-item{display:flex;align-items:center;width:100%;min-height:36px;padding:0 8px;border:0;border-radius:6px;background:none;color:var(--i-ink);font:500 13.5px/1 var(--inid-font,inherit);text-align:left;text-decoration:none;cursor:pointer}
.inid-menu-item:hover{background:var(--i-hover)}
`;

const MARK =
  '<svg class="inid-mark" viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" rx="23" fill="#111113"/><rect x="24" y="50" width="20" height="20" rx="3" fill="#fff"/><rect x="56" y="30" width="20" height="20" rx="3" fill="#c6ff3d"/></svg>';

const initials = (user: InIDUser | null) =>
  ((user?.firstName?.[0] || "") + (user?.lastName?.[0] || "") || user?.email?.[0] || "·").toUpperCase();

// A small DOM builder: text goes in as text, never as HTML
type Child = Node | string | null | undefined | false;
function el(tag: string, props: Record<string, unknown> = {}, ...children: Child[]): HTMLElement {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value as EventListener);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children) if (child != null && child !== false) node.append(child);
  return node;
}
const style = (css = CSS) => el("style", {}, css);
const mark = () => {
  const box = document.createElement("template");
  box.innerHTML = MARK;
  return box.content.firstChild as Node;
};

// The height InID's frames ask for, only from that frame and within reason
const listenForHeight = (frame: () => HTMLIFrameElement | null | undefined, max: number, apply: (height: number) => void) => {
  const onMessage = (e: MessageEvent) => {
    const own = frame()?.contentWindow;
    if (!own || e.source !== own || e.data?.type !== "inid:height") return;
    const next = Number(e.data.height);
    if (next > 0 && next < max) apply(Math.ceil(next));
  };
  addEventListener("message", onMessage);
  return () => removeEventListener("message", onMessage);
};

const ALLOW = "publickey-credentials-get *; publickey-credentials-create *";

// ---------- the elements ----------
// Without a DOM (an import during server rendering) the classes still exist; nothing registers
const Base = (typeof HTMLElement === "undefined" ? class {} : HTMLElement) as typeof HTMLElement;

abstract class InIDElement extends Base {
  static observedAttributes = ["api-path", "locale"];
  protected root: ShadowRoot;
  private store: Store | null = null;
  private off: (() => void) | null = null;
  private shown: string | null = null;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
  }

  protected get apiPath() {
    return resolveApiPath(this.getAttribute("api-path"));
  }
  protected get locale() {
    return resolveLocale(this.getAttribute("locale"));
  }
  protected get t(): Texts {
    return TEXTS[this.locale];
  }
  protected get session(): Session {
    return storeFor(this.apiPath).state;
  }
  // Elements that don't depend on who is signed in skip the session
  protected get needsSession() {
    return true;
  }

  connectedCallback() {
    this.follow();
    this.update();
  }
  disconnectedCallback() {
    this.off?.();
    this.off = this.store = null;
  }
  attributeChangedCallback() {
    if (!this.isConnected) return;
    this.follow();
    this.update();
  }

  private follow() {
    if (!this.needsSession) return;
    const store = storeFor(this.apiPath);
    if (store === this.store) return;
    this.off?.();
    this.store = store;
    this.off = store.subscribe(() => this.update());
    void store.load();
  }

  // Rebuilt only when what it shows changed: a frame rebuilt would start over
  protected update(force = false) {
    const key = this.key();
    if (!force && key === this.shown) return;
    this.shown = key;
    this.root.replaceChildren(...this.view());
    this.rendered();
  }
  protected abstract key(): string;
  protected abstract view(): Node[];
  protected rendered() {}
}

// ---------- what shows by who is here ----------
const CONTENTS = ":host{display:contents}:host([hidden]){display:none}";

class SignedInElement extends InIDElement {
  protected key() {
    return String(this.session.loaded && Boolean(this.session.user));
  }
  protected view() {
    return [style(CONTENTS), ...(this.key() === "true" ? [el("slot")] : [])];
  }
}

class SignedOutElement extends InIDElement {
  protected key() {
    return String(this.session.loaded && !this.session.user);
  }
  protected view() {
    return [style(CONTENTS), ...(this.key() === "true" ? [el("slot")] : [])];
  }
}

// Shows its children only to someone with that role or permission; to anyone else, the
// fallback slot. It hides; the app's server still checks.
class ProtectElement extends InIDElement {
  static observedAttributes = [...InIDElement.observedAttributes, "role", "permission"];
  protected key() {
    const { loaded, user } = this.session;
    if (!loaded) return "wait";
    return has(user, { role: this.getAttribute("role") || undefined, permission: this.getAttribute("permission") || undefined }) ? "show" : "fallback";
  }
  protected view() {
    const key = this.key();
    return [style(CONTENTS), ...(key === "show" ? [el("slot")] : key === "fallback" ? [el("slot", { name: "fallback" })] : [])];
  }
}

// ---------- buttons ----------
class SignInButtonElement extends InIDElement {
  static observedAttributes = [...InIDElement.observedAttributes, "return-to", "entrance"];
  protected get needsSession() {
    return false;
  }
  protected key() {
    return this.locale;
  }
  protected view() {
    const go = () => goSignIn(this.apiPath, this.locale, this.getAttribute("return-to"), this.getAttribute("entrance"));
    return [style(), el("button", { type: "button", class: "inid inid-btn", part: "button", onclick: go }, el("i", { "aria-hidden": "true" }), el("slot", {}, this.t.continue))];
  }
}

class SignOutButtonElement extends InIDElement {
  static observedAttributes = [...InIDElement.observedAttributes, "return-to"];
  protected get needsSession() {
    return false;
  }
  protected key() {
    return this.locale;
  }
  protected view() {
    const go = () => void goSignOut(this.apiPath, this.getAttribute("return-to"));
    return [style(), el("button", { type: "button", class: "inid inid-btn", part: "button", onclick: go }, el("slot", {}, this.t.signOut))];
  }
}

// ---------- the sign-in card ----------
// InID's own form, inside the app's page: the phone, the code, Face ID or the fingerprint,
// and Google (which opens in the whole window: Google can't be shown inside another site).
// It's InID's page in a frame, so passkeys, codes and InID's cookies never touch the app.
// redirect: a single button to InID's page instead.
class SignInElement extends InIDElement {
  static observedAttributes = [...InIDElement.observedAttributes, "app-name", "return-to", "entrance", "redirect"];
  private height = 280;
  // Decided once: a second sign-in would replace the first (and inid_continue is used up)
  private src: string | null = null;
  private frame: HTMLIFrameElement | null = null;
  private stopListening: (() => void) | null = null;

  connectedCallback() {
    this.stopListening ??= listenForHeight(() => this.frame, 4000, (height) => this.resize(height));
    super.connectedCallback();
  }
  disconnectedCallback() {
    this.stopListening?.();
    this.stopListening = null;
    super.disconnectedCallback();
  }

  private resize(height: number) {
    this.height = height;
    const box = this.root.querySelector<HTMLElement>(".inid-frame");
    if (box) box.style.height = `${height}px`;
  }

  private chooseSrc() {
    if (this.src) return this.src;
    const here = new URL(location.href);
    // Back from Google: the form goes on where InID left it (asking for the phone, say)
    const resume = here.searchParams.get("inid_continue");
    if (resume !== null) {
      here.searchParams.delete("inid_continue");
      history.replaceState(history.state, "", here.pathname + here.search + here.hash);
      return (this.src = `${this.apiPath}/signin?${new URLSearchParams({ display: "embed", continue: resume })}`);
    }
    const page = `${here.pathname}${here.search}`;
    const entrance = this.getAttribute("entrance");
    return (this.src = `${this.apiPath}/signin?${new URLSearchParams({
      display: "embed",
      return_to: this.getAttribute("return-to") || page,
      page,
      ui_locales: this.locale,
      ...(entrance && { entrance }),
    })}`);
  }

  private get heading() {
    const app = this.getAttribute("app-name");
    return app ? fill(this.t.title, { app }) : this.t.titlePlain;
  }

  protected key() {
    const { user } = this.session;
    const mode = user ? `in:${user.name || user.email || ""}` : this.hasAttribute("redirect") ? "redirect" : `frame:${this.chooseSrc()}`;
    return `${mode}|${this.heading}|${this.locale}`;
  }

  protected view() {
    const { user } = this.session;
    const t = this.t;
    const title = this.heading;
    this.frame = null;
    let body: Node[];
    if (user) body = [el("p", {}, fill(t.signedInAs, { name: user.name || user.email || "" }))];
    else if (this.hasAttribute("redirect")) {
      const go = () => goSignIn(this.apiPath, this.locale, this.getAttribute("return-to"), this.getAttribute("entrance"));
      body = [el("p", {}, t.lead), el("button", { type: "button", class: "inid-btn inid-wide", onclick: go }, el("i", { "aria-hidden": "true" }), t.continue)];
    } else {
      this.frame = el("iframe", { src: this.chooseSrc(), title, class: "inid-frame", style: `height:${this.height}px`, scrolling: "no", allow: ALLOW }) as HTMLIFrameElement;
      body = [this.frame];
    }
    return [
      style(`${CSS}:host{display:block}`),
      el("section", { class: "inid inid-card", part: "card", "aria-label": title }, mark(), el("h2", {}, title), ...body, el("p", { class: "inid-foot" }, t.secured)),
    ];
  }
}

// ---------- the person's sessions ----------
// Where they're signed in to this app (each browser), the one in use marked; they end the
// others here. The app's server asks InID for them (its InID routes, sessions).
type SessionItem = { id: string; createdAt: string; lastActiveAt: string; device: string | null; current: boolean };

class UserSessionsElement extends InIDElement {
  private items: SessionItem[] | null = null;
  private failed = false;
  protected get needsSession() {
    return false;
  }

  connectedCallback() {
    super.connectedCallback();
    void this.load();
  }

  private async load() {
    try {
      const res = await fetch(`${this.apiPath}/sessions`, { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      this.items = ((await res.json()) as { sessions: SessionItem[] }).sessions;
      this.failed = false;
    } catch {
      this.failed = true;
    }
    this.update();
  }

  private async end(path: string) {
    await fetch(`${this.apiPath}/sessions${path}`, { method: "DELETE", credentials: "same-origin" }).catch(() => {});
    await this.load();
  }

  protected key() {
    return `${this.failed}|${JSON.stringify(this.items)}|${this.locale}`;
  }

  protected view(): Node[] {
    const { t, locale } = this;
    const css = style(`${CSS}:host{display:block}`);
    if (this.failed) return [css, el("p", { class: "inid-muted" }, "—")];
    if (!this.items) return [css, el("div", { class: "inid-sessions", "aria-busy": "true" })];
    const date = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short" });
    const ago = (iso: string) => {
      const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
      return minutes < 2 ? t.now : minutes < 60 ? fill(t.minutesAgo, { n: String(minutes) }) : minutes < 1440 ? fill(t.hoursAgo, { n: String(Math.round(minutes / 60)) }) : date(iso);
    };
    const others = this.items.filter((x) => !x.current);
    return [
      css,
      el(
        "div",
        { class: "inid inid-sessions" },
        el(
          "ul",
          {},
          ...this.items.map((x) =>
            el(
              "li",
              {},
              el("span", {}, el("b", {}, x.device || t.browser), el("small", {}, fill(t.since, { date: date(x.createdAt), ago: ago(x.lastActiveAt) }))),
              x.current ? el("em", {}, t.thisOne) : el("button", { type: "button", class: "inid-btn inid-quiet", onclick: () => void this.end(`/${encodeURIComponent(x.id)}`) }, t.end)
            )
          )
        ),
        others.length > 1 && el("button", { type: "button", class: "inid-btn inid-quiet", onclick: () => void this.end("?others=1") }, t.endOthers)
      ),
    ];
  }
}

// A sessions list that asks the same server, in the same language, as the element holding it
const sessionsOf = (owner: HTMLElement) =>
  el("inid-user-sessions", { "api-path": owner.getAttribute("api-path"), locale: owner.getAttribute("locale") });

// ---------- the person's own page in the app ----------
// Their account (InID's own page, in a frame the app can't read) and their sessions here.
class UserProfileElement extends InIDElement {
  private tab: "account" | "sessions" = "account";
  private height = 560;
  private frame: HTMLIFrameElement | null = null;
  private cleanup: Array<() => void> = [];

  connectedCallback() {
    // Back from changing something there: ask the server again
    const again = () => void storeFor(this.apiPath).load(true);
    addEventListener("focus", again);
    this.cleanup = [
      () => removeEventListener("focus", again),
      listenForHeight(
        () => this.frame,
        6000,
        (height) => {
          this.height = height;
          if (this.frame) this.frame.style.height = `${height}px`;
        }
      ),
    ];
    super.connectedCallback();
  }
  disconnectedCallback() {
    for (const stop of this.cleanup) stop();
    this.cleanup = [];
    super.disconnectedCallback();
  }

  protected key() {
    const { loaded, user, accountUrl } = this.session;
    return `${loaded && Boolean(user)}|${this.tab}|${accountUrl}|${this.locale}`;
  }

  protected view(): Node[] {
    this.frame = null;
    const { user, accountUrl } = this.session;
    if (!user) return [];
    const t = this.t;
    const tab = (key: "account" | "sessions", label: string) =>
      el("button", { type: "button", role: "tab", "aria-selected": String(this.tab === key), class: "inid-tab", onclick: () => ((this.tab = key), this.update()) }, label);
    let body: Node[];
    if (this.tab === "account") {
      this.frame = el("iframe", { src: accountUrl, title: t.profile, class: "inid-frame", style: `height:${this.height}px`, scrolling: "no", allow: ALLOW }) as HTMLIFrameElement;
      body = [el("p", { class: "inid-muted" }, t.profileLead), this.frame];
    } else body = [el("p", { class: "inid-muted" }, t.sessionsLead), sessionsOf(this)];
    return [
      style(`${CSS}:host{display:block}`),
      el("section", { class: "inid inid-card inid-profile", part: "card", "aria-label": t.profile }, el("div", { class: "inid-tabs", role: "tablist" }, tab("account", t.profile), tab("sessions", t.sessions)), ...body),
    ];
  }
}

// ---------- the person, in a corner ----------
class UserButtonElement extends InIDElement {
  static observedAttributes = [...InIDElement.observedAttributes, "show-name", "sign-out-return-to"];
  private open = false;
  private showSessions = false;
  private cleanup: (() => void) | null = null;

  connectedCallback() {
    const away = (e: Event) => {
      if (this.open && !e.composedPath().includes(this)) this.setOpen(false);
    };
    const keys = (e: KeyboardEvent) => {
      if (!this.open) return;
      if (e.key === "Escape") {
        this.setOpen(false);
        this.root.querySelector<HTMLElement>(".inid-avatar-btn")?.focus();
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const items = [...this.root.querySelectorAll<HTMLElement>("[role=menuitem]")];
        const at = items.indexOf(this.root.activeElement as HTMLElement);
        items[(at + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
      }
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", keys);
    this.cleanup = () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", keys);
    };
    super.connectedCallback();
  }
  disconnectedCallback() {
    this.cleanup?.();
    this.cleanup = null;
    super.disconnectedCallback();
  }

  private setOpen(open: boolean) {
    this.open = open;
    this.update();
    if (open) this.root.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }

  protected key() {
    const { loaded, user, accountUrl } = this.session;
    return JSON.stringify([loaded && user, accountUrl, this.open, this.showSessions, this.hasAttribute("show-name"), this.locale]);
  }

  protected view(): Node[] {
    const { loaded, user, accountUrl } = this.session;
    if (!loaded || !user) return [];
    const t = this.t;
    const detail = user.email || user.phone || "";
    const avatar = () => el("span", { class: "inid-avatar", "aria-hidden": "true" }, initials(user));
    const menu =
      this.open &&
      el(
        "div",
        { class: "inid-menu", role: "menu" },
        el("div", { class: "inid-who" }, avatar(), el("span", {}, el("b", {}, user.name || detail), el("small", {}, detail))),
        el("button", { role: "menuitem", type: "button", class: "inid-menu-item", onclick: () => ((this.open = false), (this.showSessions = true), this.update()) }, t.sessions),
        el("a", { role: "menuitem", class: "inid-menu-item", href: accountUrl, target: "_blank", rel: "noopener" }, t.manage),
        el("button", { role: "menuitem", type: "button", class: "inid-menu-item", onclick: () => void goSignOut(this.apiPath, this.getAttribute("sign-out-return-to")) }, t.signOut)
      );
    const dialog =
      this.showSessions &&
      el(
        "dialog",
        { class: "inid inid-dialog", "aria-label": t.sessions, onclose: () => ((this.showSessions = false), this.update()) },
        el("h2", {}, t.sessions),
        el("p", {}, t.sessionsLead),
        sessionsOf(this),
        el("form", { method: "dialog" }, el("button", { type: "submit", class: "inid-btn inid-wide" }, t.close))
      );
    return [
      style(),
      el(
        "div",
        { class: "inid inid-user" },
        el(
          "button",
          { type: "button", class: "inid-avatar-btn", part: "button", "aria-haspopup": "menu", "aria-expanded": String(this.open), "aria-label": t.account, onclick: () => this.setOpen(!this.open) },
          avatar(),
          this.hasAttribute("show-name") && el("span", {}, user.firstName || user.name || "")
        ),
        menu,
        dialog
      ),
    ];
  }

  protected rendered() {
    if (this.showSessions) this.root.querySelector<HTMLDialogElement>("dialog")?.showModal?.();
  }
}

// ---------- registration ----------
// Safe to import twice (two bundles, a script tag and a module): the first definition stays
const ELEMENTS: Record<string, CustomElementConstructor> = {
  "inid-sign-in": SignInElement,
  "inid-sign-in-button": SignInButtonElement,
  "inid-sign-out-button": SignOutButtonElement,
  "inid-user-button": UserButtonElement,
  "inid-user-profile": UserProfileElement,
  "inid-user-sessions": UserSessionsElement,
  "inid-signed-in": SignedInElement,
  "inid-signed-out": SignedOutElement,
  "inid-protect": ProtectElement,
};
if (typeof customElements !== "undefined") {
  for (const [name, element] of Object.entries(ELEMENTS)) if (!customElements.get(name)) customElements.define(name, element);
}

export {
  SignInElement,
  SignInButtonElement,
  SignOutButtonElement,
  UserButtonElement,
  UserProfileElement,
  UserSessionsElement,
  SignedInElement,
  SignedOutElement,
  ProtectElement,
};
