"use client";
import { createContext, createElement as h, useCallback, useContext, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";

// Sign-in with InID for React. The components talk to the app's own server (its InID routes,
// /api/inid by default: @inid/nextjs mounts them), never to InID with a key.
//
//   <InIDProvider user={await currentUser()}>     the session, once, near the top
//     <SignedOut><SignIn /></SignedOut>
//     <SignedIn><UserButton /></SignedIn>
//   const { user } = useUser()

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
const allows = (user: InIDUser | null, check: AccessCheck) =>
  Boolean(user) && (!check.role || (user!.roles ?? []).includes(check.role)) && (!check.permission || (user!.permissions ?? []).includes(check.permission));

export type Locale = "es" | "en" | "pt";

const TEXTS = {
  es: {
    continue: "Continuar con InID",
    title: "Entra a {app}",
    titlePlain: "Entra",
    lead: "Con una passkey o un código a tu celular. Sin contraseñas.",
    signedInAs: "Entraste como {name}",
    manage: "Gestionar mi InID",
    signOut: "Salir",
    account: "Tu cuenta",
    secured: "Protegido por InID",
    sessions: "Tus sesiones",
    sessionsLead: "Donde entraste a esta app. Cierra las que no reconozcas.",
    profile: "Tu cuenta",
    profileLead: "Tus datos y tus passkeys son de tu InID: cámbialos aquí y llegan a cada app que autorizaste.",
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
    lead: "With a passkey or a code to your phone. No passwords.",
    signedInAs: "Signed in as {name}",
    manage: "Manage my InID",
    signOut: "Sign out",
    account: "Your account",
    secured: "Secured by InID",
    sessions: "Your sessions",
    profile: "Your account",
    profileLead: "Your data and passkeys belong to your InID: change them here and every app you authorized gets them.",
    sessionsLead: "Where you signed in to this app. End the ones you don't recognize.",
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
    lead: "Com uma passkey ou um código no seu celular. Sem senhas.",
    signedInAs: "Você entrou como {name}",
    manage: "Gerenciar meu InID",
    signOut: "Sair",
    account: "Sua conta",
    secured: "Protegido por InID",
    sessions: "Suas sessões",
    profile: "Sua conta",
    profileLead: "Seus dados e suas passkeys são do seu InID: mude-os aqui e cada app que você autorizou os recebe.",
    sessionsLead: "Onde você entrou neste app. Encerre as que não reconhecer.",
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

// ---------- the app's look, from its code ----------
// Over what the app set in InID's panel (Apariencia), for this page:
//   <SignIn appearance={{ theme: "dark", variables: { colorPrimary: "#7c3aed", borderRadius: "small" } }} />
// Only these, and only values InID knows (colors as #hex, corners as a keyword or a length up
// to 32px, the system fonts): InID checks them again and drops anything else.
export interface Appearance {
  theme?: "light" | "dark" | "auto";
  variables?: {
    colorPrimary?: string;
    // The card's and the form's background, in the light theme
    colorBackground?: string;
    borderRadius?: "none" | "small" | "medium" | "large" | `${number}px` | `${number}rem`;
    fontFamily?: "system" | "serif" | "rounded" | "mono";
  };
}
const RADII: Record<string, string> = { none: "0px", small: "6px", medium: "12px", large: "20px" };
const FONTS: Record<string, string> = {
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  rounded: 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", system-ui, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
};
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const LENGTH = /^\d{1,2}(?:\.\d{1,2})?(?:px|rem)$/;
const THEMES = ["light", "dark", "auto"];
const cleanAppearance = (a?: Appearance | null): Appearance | null => {
  if (!a) return null;
  const v = a.variables ?? {};
  const variables = Object.fromEntries(
    Object.entries({
      colorPrimary: typeof v.colorPrimary === "string" && HEX.test(v.colorPrimary.trim()) ? v.colorPrimary.trim() : undefined,
      colorBackground: typeof v.colorBackground === "string" && HEX.test(v.colorBackground.trim()) ? v.colorBackground.trim() : undefined,
      borderRadius: typeof v.borderRadius === "string" && (v.borderRadius in RADII || LENGTH.test(v.borderRadius)) ? v.borderRadius : undefined,
      fontFamily: typeof v.fontFamily === "string" && v.fontFamily in FONTS ? v.fontFamily : undefined,
    }).filter(([, x]) => x !== undefined)
  );
  const out: Appearance = { ...(a.theme && THEMES.includes(a.theme) && { theme: a.theme }), ...(Object.keys(variables).length && { variables }) };
  return Object.keys(out).length ? out : null;
};
// What goes to InID's frame (?appearance=), merged over the provider's
export const appearanceParam = (a?: Appearance | null) => {
  const clean = cleanAppearance(a);
  return clean ? JSON.stringify(clean) : null;
};
const merge = (base?: Appearance | null, over?: Appearance | null): Appearance | null =>
  base || over ? { ...base, ...over, variables: { ...base?.variables, ...over?.variables } } : null;
const expand = (hex: string) => (hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join("")}` : hex).toLowerCase();
const luminance = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(expand(hex).slice(i, i + 2), 16) / 255).map((s) => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4)).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
const inkOn = (hex: string) => ((luminance(hex) + 0.05) / 0.0556 >= 1.05 / (luminance(hex) + 0.05) ? "#111113" : "#ffffff");
const DARK = { "--inid-bg": "#111113", "--inid-ink": "#f5f5f7", "--inid-muted": "#a1a1a6", "--inid-line": "#3a3a3c", "--inid-hover": "#1c1c1e", "--inid-primary": "#c6ff3d", "--inid-primary-ink": "#111113" };
// The card's own custom properties for that look (the frame gets it from InID)
const cardVars = (a: Appearance | null, fromInID: Record<string, string> = {}): Record<string, string> => {
  const clean = cleanAppearance(a);
  const v = clean?.variables ?? {};
  return {
    ...(clean?.theme === "dark" ? DARK : {}),
    ...fromInID,
    ...(v.colorPrimary && { "--inid-primary": expand(v.colorPrimary), "--inid-primary-ink": inkOn(v.colorPrimary) }),
    ...(v.colorBackground && clean?.theme !== "dark" && { "--inid-bg": expand(v.colorBackground) }),
    ...(v.borderRadius && { "--inid-radius": RADII[v.borderRadius] ?? v.borderRadius }),
    ...(v.fontFamily && { "--inid-font": FONTS[v.fontFamily] }),
  };
};
// What InID's frame says about the app's look: only these properties, values that can't end a declaration
const BRAND_VARS = /^--inid-(primary|primary-ink|radius|font|bg|ink|muted|line|fill)$/;
const BRAND_VALUE = /^[#\w\s,.'"()%-]{1,200}$/;
export type FrameBrand = { name: string | null; logo: string | null; theme: string | null; vars: Record<string, string> };
export const readFrameBrand = (data: unknown, origin: string): FrameBrand | null => {
  const d = data as { type?: unknown; name?: unknown; logo?: unknown; theme?: unknown; common?: unknown; light?: unknown } | null;
  if (!d || d.type !== "inid:brand") return null;
  const pick = (o: unknown) => Object.fromEntries(Object.entries(o && typeof o === "object" ? o : {}).filter(([k, v]) => BRAND_VARS.test(k) && typeof v === "string" && BRAND_VALUE.test(v)));
  let logo: string | null = null;
  try {
    if (typeof d.logo === "string" && new URL(d.logo).origin === origin) logo = d.logo;
  } catch {}
  const theme = typeof d.theme === "string" && THEMES.includes(d.theme) ? d.theme : null;
  return { name: typeof d.name === "string" ? d.name.slice(0, 60) : null, logo, theme, vars: { ...(theme === "dark" ? DARK : {}), ...pick(d.common), ...(theme === "light" ? pick(d.light) : {}) } };
};

interface InIDState {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: InIDUser | null;
  // To InID's page and back here (or to returnTo, a path in this app)
  // entrance: a door of the app with its own rules ("team"), made in the InID panel
  signIn: (returnTo?: string, entrance?: string) => void;
  signOut: (returnTo?: string) => Promise<void>;
  // Asks the server again (after something changed)
  reload: () => Promise<void>;
  accountUrl: string;
  apiPath: string;
  locale: Locale;
  t: Texts;
  // The look every component takes unless its own appearance says otherwise
  appearance: Appearance | null;
}

const InIDContext = createContext<InIDState | null>(null);

const useInID = (component: string) => {
  const state = useContext(InIDContext);
  if (!state) throw new Error(`InID: ${component} must be inside <InIDProvider>`);
  return state;
};

// The look, once: classes start with inid-, colors and corners are CSS variables an app can set
const CSS = `
.inid{--inid-ink:#18181b;--inid-muted:#6b6b76;--inid-line:#e6e6ea;--inid-bg:#fff;--inid-hover:#f4f4f6;--inid-accent:#c6ff3d;--inid-radius:10px;font-family:var(--inid-font,inherit);color:var(--inid-ink);box-sizing:border-box}
.inid *{box-sizing:border-box}
.inid-btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;min-height:40px;padding:0 16px;border-radius:calc(var(--inid-radius) - 2px);border:1px solid var(--inid-primary,var(--inid-ink));background:var(--inid-primary,var(--inid-ink));color:var(--inid-primary-ink,#fff);font:600 14px/1 var(--inid-font,inherit);cursor:pointer;text-decoration:none}
.inid-btn:hover{opacity:.9}.inid-btn:focus-visible,.inid-avatar-btn:focus-visible,.inid-menu-item:focus-visible{outline:2px solid var(--inid-ink);outline-offset:2px}
.inid-btn i{width:9px;height:9px;border-radius:2px;background:var(--inid-accent);flex:none}
.inid-btn.inid-wide{width:100%;min-height:44px;font-size:15px}
.inid-card{width:100%;max-width:380px;padding:28px;border:1px solid var(--inid-line);border-radius:calc(var(--inid-radius) + 4px);background:var(--inid-bg);box-shadow:0 1px 2px rgba(16,16,20,.05),0 12px 32px -18px rgba(16,16,20,.18)}
.inid-card h2{margin:16px 0 6px;font-size:20px;font-weight:650;letter-spacing:-.01em}
.inid-card p{margin:0 0 20px;font-size:14px;line-height:1.5;color:var(--inid-muted)}
.inid-frame{display:block;width:100%;border:0;overflow:hidden;margin-top:8px;background:transparent;color-scheme:normal;transition:height .15s ease}
.inid-sessions ul{list-style:none;margin:0 0 12px;padding:0;display:grid;gap:8px}
.inid-sessions li{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid var(--inid-line);border-radius:var(--inid-radius)}
.inid-sessions li b{display:block;font-size:14px;font-weight:600}
.inid-sessions li small{display:block;font-size:12.5px;color:var(--inid-muted)}
.inid-sessions li em{font-style:normal;font-size:12.5px;color:var(--inid-muted);white-space:nowrap}
.inid-sessions[aria-busy]{min-height:60px}
.inid-btn.inid-quiet{background:var(--inid-bg);color:var(--inid-ink);border-color:var(--inid-line);min-height:32px;padding:0 12px;font-size:13px}
.inid-profile{max-width:560px}
.inid-tabs{display:flex;gap:4px;border-bottom:1px solid var(--inid-line);margin:-4px 0 16px}
.inid-tab{font:600 14px/1 var(--inid-font,inherit);color:var(--inid-muted);background:none;border:0;border-bottom:2px solid transparent;padding:10px 12px;margin-bottom:-1px;cursor:pointer}
.inid-tab[aria-selected="true"]{color:var(--inid-ink);border-bottom-color:var(--inid-ink)}
.inid-muted{font-size:14px;color:var(--inid-muted);margin:0 0 12px}
.inid-dialog{width:min(440px,calc(100vw - 32px));padding:24px;border:1px solid var(--inid-line);border-radius:calc(var(--inid-radius) + 4px);background:var(--inid-bg);box-shadow:0 24px 64px -16px rgba(16,16,20,.3)}
.inid-dialog::backdrop{background:rgba(16,16,20,.35)}
.inid-dialog h2{margin:0 0 6px;font-size:18px;font-weight:650}
.inid-dialog p{margin:0 0 16px;font-size:14px;color:var(--inid-muted)}
.inid-dialog form{margin:0}
.inid-card .inid-foot{margin:18px 0 0;padding-top:14px;border-top:1px solid var(--inid-line);font-size:12px;text-align:center}
.inid-mark{display:block;width:32px;height:32px}
.inid-logo{display:block;max-height:36px;max-width:200px;width:auto;height:auto}
@media (prefers-color-scheme:dark){.inid-auto{--inid-bg:#111113;--inid-ink:#f5f5f7;--inid-muted:#a1a1a6;--inid-line:#3a3a3c;--inid-hover:#1c1c1e;--inid-primary:#c6ff3d;--inid-primary-ink:#111113}}
.inid-user{position:relative;display:inline-block}
.inid-avatar-btn{display:inline-flex;align-items:center;gap:8px;padding:2px;border:0;background:none;border-radius:999px;cursor:pointer;font:inherit;color:inherit}
.inid-avatar{display:grid;place-items:center;width:32px;height:32px;border-radius:999px;background:var(--inid-ink);color:#fff;font:600 13px/1 var(--inid-font,inherit)}
.inid-menu{position:absolute;right:0;top:calc(100% + 8px);z-index:50;min-width:248px;padding:6px;border:1px solid var(--inid-line);border-radius:var(--inid-radius);background:var(--inid-bg);box-shadow:0 12px 32px -10px rgba(16,16,20,.18),0 2px 6px rgba(16,16,20,.06)}
.inid-who{display:grid;grid-template-columns:36px minmax(0,1fr);gap:10px;align-items:center;padding:8px 8px 10px;border-bottom:1px solid var(--inid-line);margin-bottom:4px}
.inid-who .inid-avatar{width:36px;height:36px}
.inid-who b{display:block;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.inid-who small{display:block;font-size:12.5px;color:var(--inid-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.inid-menu-item{display:flex;align-items:center;width:100%;min-height:36px;padding:0 8px;border:0;border-radius:6px;background:none;color:var(--inid-ink);font:500 13.5px/1 var(--inid-font,inherit);text-align:left;text-decoration:none;cursor:pointer}
.inid-menu-item:hover{background:var(--inid-hover)}
`;

const Mark = () =>
  h(
    "svg",
    { className: "inid-mark", viewBox: "0 0 100 100", "aria-hidden": true },
    h("rect", { width: 100, height: 100, rx: 23, fill: "#111113" }),
    h("rect", { x: 24, y: 50, width: 20, height: 20, rx: 3, fill: "#fff" }),
    h("rect", { x: 56, y: 30, width: 20, height: 20, rx: 3, fill: "#c6ff3d" })
  );

const initials = (user: InIDUser | null) =>
  ((user?.firstName?.[0] || "") + (user?.lastName?.[0] || "") || user?.email?.[0] || "·").toUpperCase();

export interface InIDProviderProps {
  children?: ReactNode;
  // Who is signed in, as the server knows it (currentUser() in a layout): nothing to wait for.
  // Left out, the provider asks the server once it's in the browser.
  user?: InIDUser | null;
  // Where the app's InID routes are
  apiPath?: string;
  locale?: Locale;
  // The app's look for every component here (each one's appearance wins over it)
  appearance?: Appearance;
}

export function InIDProvider({ children, user: given, apiPath = "/api/inid", locale = "es", appearance = undefined }: InIDProviderProps) {
  const [state, setState] = useState<{ isLoaded: boolean; user: InIDUser | null; accountUrl: string }>({
    isLoaded: given !== undefined,
    user: given ?? null,
    accountUrl: "https://id.inid.co/account",
  });
  const reload = useCallback(async () => {
    try {
      const res = await fetch(`${apiPath}/session`, { credentials: "same-origin", cache: "no-store" });
      const body = (await res.json()) as { user: InIDUser | null; accountUrl?: string };
      setState((s) => ({ isLoaded: true, user: body.user, accountUrl: body.accountUrl || s.accountUrl }));
    } catch {
      setState((s) => ({ ...s, isLoaded: true }));
    }
  }, [apiPath]);
  // The server's answer is the source: a new one replaces what was here
  useEffect(() => {
    if (given !== undefined) setState((s) => ({ ...s, isLoaded: true, user: given }));
    else void reload();
  }, [given, reload]);
  // By value: an object written inline in the page is a new one at every render
  const lookKey = JSON.stringify(appearance ?? null);
  const shared = useMemo<Appearance | null>(() => JSON.parse(lookKey), [lookKey]);
  const value = useMemo<InIDState>(
    () => ({
      ...state,
      isSignedIn: Boolean(state.user),
      apiPath,
      locale,
      t: TEXTS[locale] ?? TEXTS.es,
      appearance: shared,
      reload,
      signIn: (returnTo, entrance) => {
        const back = returnTo ?? `${location.pathname}${location.search}`;
        location.assign(`${apiPath}/signin?${new URLSearchParams({ return_to: back, ui_locales: locale, ...(entrance && { entrance }) })}`);
      },
      signOut: async (returnTo = "/") => {
        await fetch(`${apiPath}/signout`, { method: "POST", credentials: "same-origin" }).catch(() => {});
        setState((s) => ({ ...s, user: null }));
        location.assign(returnTo);
      },
    }),
    [state, apiPath, locale, reload, shared]
  );
  return h(InIDContext.Provider, { value }, h("style", { "data-inid": "" }, CSS), children);
}

// ---------- hooks ----------
export function useUser() {
  const { isLoaded, isSignedIn, user } = useInID("useUser()");
  return { isLoaded, isSignedIn, user };
}

export function useAuth() {
  const { isLoaded, isSignedIn, user, signIn, signOut, reload } = useInID("useAuth()");
  // has({ role: "admin" }), has({ permission: "facturas:ver" })
  const has = useCallback((check: AccessCheck) => allows(user, check), [user]);
  return { isLoaded, isSignedIn, userId: user?.id ?? null, has, signIn, signOut, reload };
}

// ---------- what shows by who is here ----------
export function SignedIn({ children }: { children?: ReactNode }) {
  const { isLoaded, isSignedIn } = useInID("<SignedIn>");
  return isLoaded && isSignedIn ? h("div", { style: { display: "contents" } }, children) : null;
}

export function SignedOut({ children }: { children?: ReactNode }) {
  const { isLoaded, isSignedIn } = useInID("<SignedOut>");
  return isLoaded && !isSignedIn ? h("div", { style: { display: "contents" } }, children) : null;
}

// Shows its children only to someone with that role or permission; to anyone else, the
// fallback. It hides; the app's server still checks (auth().has, or the proxy's rules).
export function Protect({ role, permission, fallback = null, children }: AccessCheck & { fallback?: ReactNode; children?: ReactNode }) {
  const { isLoaded, user } = useInID("<Protect>");
  if (!isLoaded) return null;
  return allows(user, { role, permission }) ? h("div", { style: { display: "contents" } }, children) : h("div", { style: { display: "contents" } }, fallback);
}

// ---------- buttons ----------
// A button of its own, or the app's own element made to sign in when clicked. The element
// is wrapped, not copied: one sent by a server component is the same on the server and in
// the browser that way, and the click reaches the wrapper from it.
const Trigger = ({ children, onActivate }: { children?: ReactNode; onActivate: () => void }) =>
  h("span", { style: { display: "contents" }, onClick: (e: MouseEvent) => (e.preventDefault(), onActivate()) }, children);

export function SignInButton({ children, returnTo, className, entrance }: { children?: ReactNode; returnTo?: string; className?: string; entrance?: string }) {
  const { signIn, t } = useInID("<SignInButton>");
  if (children != null && typeof children !== "string") return h(Trigger, { onActivate: () => signIn(returnTo, entrance) }, children);
  return h("button", { type: "button", className: `inid inid-btn${className ? ` ${className}` : ""}`, onClick: () => signIn(returnTo, entrance) }, h("i", { "aria-hidden": true }), children ?? t.continue);
}

export function SignOutButton({ children, returnTo, className }: { children?: ReactNode; returnTo?: string; className?: string }) {
  const { signOut, t } = useInID("<SignOutButton>");
  if (children != null && typeof children !== "string") return h(Trigger, { onActivate: () => void signOut(returnTo) }, children);
  return h("button", { type: "button", className: `inid inid-btn${className ? ` ${className}` : ""}`, onClick: () => void signOut(returnTo) }, children ?? t.signOut);
}

// ---------- the sign-in card ----------
// InID's own form, inside the app's page: the phone, the code, the passkey,
// and Google (which opens in the whole window: Google can't be shown inside another site).
// It's InID's page in a frame, so passkeys, codes and InID's cookies never touch the app.
// redirect: a single button to InID's page instead. entrance: a door of the app with its own
// rules and role ("team": only the company's people), made in the InID panel.
// appearance: the app's look for this card, over the one set in InID's panel (Apariencia);
// the card takes the panel's look too (its logo and name) once InID's frame tells it.
export function SignIn({ appName, returnTo, className, redirect = false, entrance, appearance }: { appName?: string; returnTo?: string; className?: string; redirect?: boolean; entrance?: string; appearance?: Appearance }) {
  const { isSignedIn, user, signIn, apiPath, locale, t, appearance: shared } = useInID("<SignIn>");
  const look = merge(shared, appearance);
  const lookParam = appearanceParam(look);
  const [fromInID, setFromInID] = useState<FrameBrand | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [height, setHeight] = useState(280);
  // Decided once: React may run the effect twice, and a second sign-in would replace the first
  const chosen = useRef<string | null>(null);
  // Where to come back to is only known in the browser
  useEffect(() => {
    if (redirect || isSignedIn) return;
    if (chosen.current) return setSrc(chosen.current);
    const here = new URL(location.href);
    // Back from Google: the form goes on where InID left it (asking for the phone, say)
    const resume = here.searchParams.get("inid_continue");
    if (resume !== null) {
      here.searchParams.delete("inid_continue");
      history.replaceState(history.state, "", here.pathname + here.search + here.hash);
      setSrc((chosen.current = `${apiPath}/signin?${new URLSearchParams({ display: "embed", continue: resume })}`));
      return;
    }
    const page = `${here.pathname}${here.search}`;
    setSrc((chosen.current = `${apiPath}/signin?${new URLSearchParams({ display: "embed", return_to: returnTo ?? page, page, ui_locales: locale, ...(entrance && { entrance }), ...(lookParam && { appearance: lookParam }) })}`));
  }, [redirect, isSignedIn, returnTo, apiPath, locale, entrance, lookParam]);
  // The form says how tall it is, and the app's look InID has for it
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      const brand = readFrameBrand(e.data, e.origin);
      if (brand) return setFromInID(brand);
      if (e.data?.type !== "inid:height") return;
      const next = Number(e.data.height);
      if (next > 0 && next < 4000) setHeight(Math.ceil(next));
    };
    addEventListener("message", onMessage);
    return () => removeEventListener("message", onMessage);
  }, []);
  const name = appName || fromInID?.name;
  const title = name ? fill(t.title, { app: name }) : t.titlePlain;
  // The theme the code asked for wins over the panel's (InID's frame already says the result)
  const theme = look?.theme ?? fromInID?.theme;
  const style = cardVars(look, fromInID?.vars) as Record<string, string>;
  const top = fromInID?.logo ? h("img", { className: "inid-logo", src: fromInID.logo, alt: name || "" }) : h(Mark);
  const body = isSignedIn
    ? h("p", null, fill(t.signedInAs, { name: user?.name || user?.email || "" }))
    : redirect
      ? [h("p", { key: "lead" }, t.lead), h("button", { key: "go", type: "button", className: "inid-btn inid-wide", onClick: () => signIn(returnTo, entrance) }, h("i", { "aria-hidden": true }), t.continue)]
      : src
        ? h("iframe", { ref: frame, src, title, className: "inid-frame", style: { height }, scrolling: "no", allow: "publickey-credentials-get *; publickey-credentials-create *" })
        : h("div", { className: "inid-frame", style: { height } });
  return h("section", { className: `inid inid-card${theme === "auto" ? " inid-auto" : ""}${className ? ` ${className}` : ""}`, style, "aria-label": title }, top, h("h2", null, title), body, h("p", { className: "inid-foot" }, t.secured));
}

// ---------- the person's sessions ----------
// Where they're signed in to this app (each browser), the one in use marked; they end the
// others here. The app's server asks InID for them (its InID routes, sessions).
export function UserSessions() {
  const { apiPath, locale, t } = useInID("<UserSessions>");
  type Item = { id: string; createdAt: string; lastActiveAt: string; device: string | null; current: boolean };
  const [items, setItems] = useState<Item[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    try {
      const res = await fetch(`${apiPath}/sessions`, { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setItems(((await res.json()) as { sessions: Item[] }).sessions);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [apiPath]);
  useEffect(() => void load(), [load]);
  const end = async (path: string) => {
    await fetch(`${apiPath}/sessions${path}`, { method: "DELETE", credentials: "same-origin" }).catch(() => {});
    await load();
  };
  const date = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short" });
  const ago = (iso: string) => {
    const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
    return minutes < 2 ? t.now : minutes < 60 ? fill(t.minutesAgo, { n: String(minutes) }) : minutes < 1440 ? fill(t.hoursAgo, { n: String(Math.round(minutes / 60)) }) : date(iso);
  };
  if (failed) return h("p", { className: "inid-muted" }, "—");
  if (!items) return h("div", { className: "inid-sessions", "aria-busy": true });
  const others = items.filter((x) => !x.current);
  return h(
    "div",
    { className: "inid inid-sessions" },
    h("ul", null, ...items.map((x) =>
      h("li", { key: x.id },
        h("span", null, h("b", null, x.device || t.browser), h("small", null, fill(t.since, { date: date(x.createdAt), ago: ago(x.lastActiveAt) }))),
        x.current ? h("em", null, t.thisOne) : h("button", { type: "button", className: "inid-btn inid-quiet", onClick: () => void end(`/${encodeURIComponent(x.id)}`) }, t.end)
      )
    )),
    others.length > 1 ? h("button", { type: "button", className: "inid-btn inid-quiet", onClick: () => void end("?others=1") }, t.endOthers) : null
  );
}

// ---------- the person's own page in the app ----------
// Their account (InID's own page, in a frame the app can't read: their data, passkeys, the
// apps they authorized; changing data asks them for a code or a passkey) and their sessions
// at this app. What they change reaches the app with its next session (or user.updated).
// appearance: as <SignIn />'s; the frame (Mi InID for this app) takes the panel's look and this
export function UserProfile({ className, appearance }: { className?: string; appearance?: Appearance }) {
  const { isSignedIn, accountUrl, reload, t, appearance: shared } = useInID("<UserProfile>");
  const look = merge(shared, appearance);
  const lookParam = appearanceParam(look);
  const src = lookParam ? `${accountUrl}${accountUrl.includes("?") ? "&" : "?"}${new URLSearchParams({ appearance: lookParam })}` : accountUrl;
  const [tab, setTab] = useState<"account" | "sessions">("account");
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(560);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || e.data?.type !== "inid:height") return;
      const next = Number(e.data.height);
      if (next > 0 && next < 6000) setHeight(Math.ceil(next));
    };
    addEventListener("message", onMessage);
    return () => removeEventListener("message", onMessage);
  }, []);
  // Back from changing something there: the app asks its server again
  useEffect(() => {
    const again = () => void reload();
    addEventListener("focus", again);
    return () => removeEventListener("focus", again);
  }, [reload]);
  if (!isSignedIn) return null;
  const tabButton = (key: "account" | "sessions", label: string) => h("button", { key, type: "button", role: "tab", "aria-selected": tab === key, className: "inid-tab", onClick: () => setTab(key) }, label);
  return h(
    "section",
    { className: `inid inid-card inid-profile${look?.theme === "auto" ? " inid-auto" : ""}${className ? ` ${className}` : ""}`, style: cardVars(look) as Record<string, string>, "aria-label": t.profile },
    h("div", { className: "inid-tabs", role: "tablist" }, tabButton("account", t.profile), tabButton("sessions", t.sessions)),
    tab === "account"
      ? [h("p", { key: "lead", className: "inid-muted" }, t.profileLead), h("iframe", { key: "frame", ref: frame, src, title: t.profile, className: "inid-frame", style: { height }, scrolling: "no", allow: "publickey-credentials-get *; publickey-credentials-create *" })]
      : [h("p", { key: "lead", className: "inid-muted" }, t.sessionsLead), h(UserSessions, { key: "list" })]
  );
}

// ---------- the person, in a corner ----------
export function UserButton({ showName = false, signOutReturnTo }: { showName?: boolean; signOutReturnTo?: string }) {
  const { isLoaded, user, signOut, accountUrl, t } = useInID("<UserButton>");
  const [open, setOpen] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (showSessions) dialog.current?.showModal?.();
  }, [showSessions]);
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const away = (e: Event) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        root.current?.querySelector<HTMLElement>(".inid-avatar-btn")?.focus();
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const items = [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
        const at = items.indexOf(document.activeElement as HTMLElement);
        items[(at + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
      }
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", keys);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", keys);
    };
  }, [open]);
  if (!isLoaded || !user) return null;
  const detail = user.email || user.phone || "";
  return h(
    "div",
    { className: "inid inid-user", ref: root },
    h(
      "button",
      { type: "button", className: "inid-avatar-btn", "aria-haspopup": "menu", "aria-expanded": open, "aria-label": t.account, onClick: () => setOpen(!open) },
      h("span", { className: "inid-avatar", "aria-hidden": true }, initials(user)),
      showName ? h("span", null, user.firstName || user.name) : null
    ),
    open
      ? h(
          "div",
          { className: "inid-menu", role: "menu", ref: menu },
          h("div", { className: "inid-who" }, h("span", { className: "inid-avatar", "aria-hidden": true }, initials(user)), h("span", null, h("b", null, user.name || detail), h("small", null, detail))),
          h("button", { role: "menuitem", type: "button", className: "inid-menu-item", onClick: () => (setOpen(false), setShowSessions(true)) }, t.sessions),
          h("a", { role: "menuitem", className: "inid-menu-item", href: accountUrl, target: "_blank", rel: "noopener" }, t.manage),
          h("button", { role: "menuitem", type: "button", className: "inid-menu-item", onClick: () => void signOut(signOutReturnTo) }, t.signOut)
        )
      : null,
    showSessions
      ? h(
          "dialog",
          { ref: dialog, className: "inid inid-dialog", "aria-label": t.sessions, onClose: () => setShowSessions(false) },
          h("h2", null, t.sessions),
          h("p", null, t.sessionsLead),
          h(UserSessions),
          h("form", { method: "dialog" }, h("button", { type: "submit", className: "inid-btn inid-wide" }, t.close))
        )
      : null
  );
}
