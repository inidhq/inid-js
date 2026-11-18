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
  // The team they work in now (apps with teams), with their role there; null: none
  team: InIDTeam | null;
}

export interface InIDTeam {
  id: string;
  slug: string;
  name: string;
  role: string;
  permissions: string[];
}

// role: an app role; teamRole: a role in the active team; permission: from either
export type AccessCheck = { role?: string; permission?: string; teamRole?: string };
export type Locale = "es" | "en" | "pt";

// has(user, { role: "admin" }), has(user, { teamRole: "admin" }), has(user, { permission: "invoices:read" })
export const has = (user: InIDUser | null | undefined, check: AccessCheck): boolean =>
  Boolean(user) &&
  (!check.role || (user!.roles ?? []).includes(check.role)) &&
  (!check.teamRole || user!.team?.role === check.teamRole) &&
  (!check.permission || (user!.permissions ?? []).includes(check.permission) || Boolean(user!.team?.permissions?.includes(check.permission)));

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
    teams: "Equipos",
    switchTeam: "Cambiar de equipo",
    personal: "Cuenta personal",
    createTeam: "Crear equipo",
    createTeamLead: "Un espacio para trabajar con otras personas. Tú quedas como su administrador.",
    teamName: "Nombre del equipo",
    create: "Crear",
    manageTeam: "Administrar equipo",
    invitations: "Invitaciones",
    accept: "Aceptar",
    join: "Unirte",
    fromDomain: "De tu dominio",
    general: "General",
    members: "Miembros",
    invite: "Invitar",
    inviteEmail: "correo@empresa.com",
    pending: "Invitaciones pendientes",
    revoke: "Quitar",
    remove: "Sacar",
    leave: "Salir del equipo",
    deleteTeam: "Eliminar equipo",
    confirmDelete: "¿Eliminar {team}? Sus miembros dejan de verlo y no se puede deshacer.",
    confirmLeave: "¿Salir de {team}?",
    save: "Guardar",
    imageUrl: "Imagen (una dirección https)",
    you: "Tú",
    noTeam: "Aún no estás en un equipo.",
    role: "Rol",
    failed: "Algo falló. Inténtalo de nuevo.",
    not_allowed: "Tu rol en este equipo no lo permite.",
    last_admin: "El equipo necesita al menos un administrador.",
    invalid_email: "Revisa el correo.",
    too_many_teams: "Ya estás en el máximo de equipos.",
    invalid_team: "Revisa el nombre del equipo.",
    team_creation_disabled: "En esta app no puedes crear equipos.",
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
    sessionsLead: "Where you signed in to this app. End the ones you don't recognize.",
    profile: "Your account",
    profileLead: "Your data and passkeys belong to your InID: change them here and every app you authorized gets them.",
    thisOne: "This session",
    end: "End",
    endOthers: "End the others",
    since: "Since {date} · active {ago}",
    now: "now",
    minutesAgo: "{n} min ago",
    hoursAgo: "{n} h ago",
    close: "Done",
    browser: "Browser",
    teams: "Teams",
    switchTeam: "Switch team",
    personal: "Personal account",
    createTeam: "Create team",
    createTeamLead: "A space to work with other people. You'll be its admin.",
    teamName: "Team name",
    create: "Create",
    manageTeam: "Manage team",
    invitations: "Invitations",
    accept: "Accept",
    join: "Join",
    fromDomain: "From your domain",
    general: "General",
    members: "Members",
    invite: "Invite",
    inviteEmail: "name@company.com",
    pending: "Pending invitations",
    revoke: "Revoke",
    remove: "Remove",
    leave: "Leave team",
    deleteTeam: "Delete team",
    confirmDelete: "Delete {team}? Its members lose access and it can't be undone.",
    confirmLeave: "Leave {team}?",
    save: "Save",
    imageUrl: "Image (an https address)",
    you: "You",
    noTeam: "You're not in a team yet.",
    role: "Role",
    failed: "Something went wrong. Try again.",
    not_allowed: "Your role in this team doesn't allow it.",
    last_admin: "The team needs at least one admin.",
    invalid_email: "Check the email.",
    too_many_teams: "You're already in as many teams as allowed.",
    invalid_team: "Check the team's name.",
    team_creation_disabled: "This app doesn't let you create teams.",
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
    sessionsLead: "Onde você entrou neste app. Encerre as que não reconhecer.",
    profile: "Sua conta",
    profileLead: "Seus dados e suas passkeys são do seu InID: mude-os aqui e cada app que você autorizou os recebe.",
    thisOne: "Esta sessão",
    end: "Encerrar",
    endOthers: "Encerrar as outras",
    since: "Desde {date} · ativa {ago}",
    now: "agora",
    minutesAgo: "há {n} min",
    hoursAgo: "há {n} h",
    close: "Pronto",
    browser: "Navegador",
    teams: "Equipes",
    switchTeam: "Trocar de equipe",
    personal: "Conta pessoal",
    createTeam: "Criar equipe",
    createTeamLead: "Um espaço para trabalhar com outras pessoas. Você fica como administrador.",
    teamName: "Nome da equipe",
    create: "Criar",
    manageTeam: "Gerenciar equipe",
    invitations: "Convites",
    accept: "Aceitar",
    join: "Entrar",
    fromDomain: "Do seu domínio",
    general: "Geral",
    members: "Membros",
    invite: "Convidar",
    inviteEmail: "nome@empresa.com",
    pending: "Convites pendentes",
    revoke: "Remover",
    remove: "Tirar",
    leave: "Sair da equipe",
    deleteTeam: "Excluir equipe",
    confirmDelete: "Excluir {team}? Seus membros perdem o acesso e não dá para desfazer.",
    confirmLeave: "Sair de {team}?",
    save: "Salvar",
    imageUrl: "Imagem (um endereço https)",
    you: "Você",
    noTeam: "Você ainda não está em uma equipe.",
    role: "Função",
    failed: "Algo deu errado. Tente de novo.",
    not_allowed: "Sua função nesta equipe não permite.",
    last_admin: "A equipe precisa de pelo menos um administrador.",
    invalid_email: "Confira o e-mail.",
    too_many_teams: "Você já está no máximo de equipes.",
    invalid_team: "Confira o nome da equipe.",
    team_creation_disabled: "Este app não permite criar equipes.",
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
  const store = storeFor(resolveApiPath());
  await store.load();
  // As it is now (a team switched after it loaded, say)
  return store.state.user;
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

// ---------- teams ----------
// The app's InID routes, as JSON; what InID refused comes back as an error with its code
async function call(apiPath: string, path: string, method = "GET", body?: unknown): Promise<any> {
  const res = await fetch(`${apiPath}/${path}`, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    ...(body !== undefined && { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw Object.assign(new Error(String(data.error || "failed")), { code: String(data.error || "failed") });
  return data;
}

const switchTeam = async (apiPath: string, teamId: string | null) => {
  const { user } = (await call(apiPath, "team", "POST", { teamId })) as { user: InIDUser | null };
  const store = storeFor(apiPath);
  store.set({ ...store.state, loaded: true, user });
  return user;
};

// Works in another team (null: their own account): the server renews the session with it
export function setActiveTeam(teamId: string | null): Promise<InIDUser | null> {
  return switchTeam(resolveApiPath(), teamId);
}

// The person's teams, the invitations to their email and their domain's team to join, with
// what the app lets them do (creating, whether a team is required, the team roles)
export type TeamItem = { id: string; name: string; slug: string; imageUrl: string | null; role: string; permissions: string[]; manages: boolean };
export type TeamsList = {
  teams: TeamItem[];
  invitations: Array<{ id: string; team: { id: string; name: string; slug: string; imageUrl: string | null }; role: string; expiresAt: string }>;
  joinable: Array<{ id: string; name: string; slug: string; imageUrl: string | null }>;
  settings: { canCreate: boolean; required: boolean; maxPerUser: number; roles: Array<{ key: string; name: string }>; defaultRole: string };
};
export function getTeams(): Promise<TeamsList> {
  return call(resolveApiPath(), "teams");
}

// What a team change goes on to: the after-* attribute's path, or the page again
const goOn = (after: string | null) => (after ? location.assign(after) : location.reload());
const teamInitial = (name: string | undefined) => (name?.trim()[0] || "·").toUpperCase();
const errorText = (t: Texts, err: unknown) => (t as Record<string, string>)[(err as { code?: string }).code ?? ""] ?? t.failed;

// ---------- the look ----------
// Same as @inid/react's. Inside each shadow root, --i-* take the app's --inid-* when set
// (on the element or any ancestor) so the app can theme it from outside.
const CSS = `
:host{display:inline-block}
:host([hidden]){display:none}
.inid{--i-ink:var(--inid-ink,#18181b);--i-muted:var(--inid-muted,#6b6b76);--i-line:var(--inid-line,#e6e6ea);--i-bg:var(--inid-bg,#fff);--i-hover:var(--inid-hover,#f4f4f6);--i-accent:var(--inid-accent,#c6ff3d);--i-radius:var(--inid-radius,10px);--i-primary:var(--inid-primary,var(--i-ink));--i-primary-ink:var(--inid-primary-ink,#fff);font-family:var(--inid-font,inherit);color:var(--i-ink);box-sizing:border-box}
.inid *{box-sizing:border-box}
.inid-btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;min-height:40px;padding:0 16px;border-radius:calc(var(--i-radius) - 2px);border:1px solid var(--i-primary);background:var(--i-primary);color:var(--i-primary-ink);font:600 14px/1 var(--inid-font,inherit);cursor:pointer;text-decoration:none}
.inid-btn:hover{opacity:.9}.inid-btn:focus-visible,.inid-avatar-btn:focus-visible,.inid-menu-item:focus-visible{outline:2px solid var(--i-ink);outline-offset:2px}
.inid-btn i{width:9px;height:9px;border-radius:2px;background:var(--i-accent);flex:none}
.inid-btn.inid-wide{width:100%;min-height:44px;font-size:15px}
.inid-card{width:100%;max-width:380px;padding:28px;border:1px solid var(--i-line);border-radius:calc(var(--i-radius) + 4px);background:var(--i-bg);box-shadow:0 1px 2px rgba(16,16,20,.05),0 12px 32px -18px rgba(16,16,20,.18)}
.inid-card h2{margin:16px 0 6px;font-size:20px;font-weight:650;letter-spacing:-.01em}
.inid-card p{margin:0 0 20px;font-size:14px;line-height:1.5;color:var(--i-muted)}
.inid-frame{display:block;width:100%;border:0;overflow:hidden;margin-top:8px;background:transparent;color-scheme:normal;transition:height .15s ease}
.inid-sessions ul,.inid-list ul{list-style:none;margin:0 0 12px;padding:0;display:grid;gap:8px}
.inid-sessions li,.inid-list li{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid var(--i-line);border-radius:var(--i-radius)}
.inid-sessions li b,.inid-list li b{display:block;font-size:14px;font-weight:600}
.inid-sessions li small,.inid-list li small{display:block;font-size:12.5px;color:var(--i-muted)}
.inid-sessions li em,.inid-list li em{font-style:normal;font-size:12.5px;color:var(--i-muted);white-space:nowrap}
.inid-list li>span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis}
.inid-list li>span:last-child{display:flex;gap:6px;align-items:center;flex:none}
.inid-list h3{margin:16px 0 8px;font-size:13px;font-weight:650}
.inid-field{width:100%;min-height:40px;padding:0 12px;border:1px solid var(--i-line);border-radius:calc(var(--i-radius) - 2px);background:var(--i-bg);color:var(--i-ink);font:400 14px/1.2 var(--inid-font,inherit)}
.inid-field:focus{outline:2px solid var(--i-ink);outline-offset:1px}
select.inid-field{width:auto;min-height:32px;padding:0 8px;font-size:13px}
.inid-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px}.inid-row input.inid-field{flex:1;min-width:160px}
.inid-error{color:#c4231a;font-size:13px;margin:0 0 12px}
.inid-menu-label{margin:8px 8px 4px;font-size:11.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--i-muted)}
.inid-menu-item[aria-current="true"]{font-weight:650}
.inid-menu-item small{margin-left:auto;padding-left:8px;font-size:12px;color:var(--i-muted)}
.inid-menu-item .inid-avatar,.inid-avatar-btn .inid-avatar.inid-square{width:24px;height:24px;font-size:11px;margin-right:8px;flex:none}
.inid-avatar.inid-square{border-radius:calc(var(--i-radius) - 4px)}
.inid-menu hr{border:0;border-top:1px solid var(--i-line);margin:4px 0}
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
.inid-logo{display:block;max-height:36px;max-width:200px;width:auto;height:auto}
@media (prefers-color-scheme:dark){.inid-auto{--inid-bg:#111113;--inid-ink:#f5f5f7;--inid-muted:#a1a1a6;--inid-line:#3a3a3c;--inid-hover:#1c1c1e;--inid-primary:#c6ff3d;--inid-primary-ink:#111113}}
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

// ---------- the app's look, from its page ----------
// Over what the app set in InID's panel (Apariencia), for one element: its appearance attribute
// (JSON, as @inid/react's prop) or CSS custom properties on it (inid-sign-in { --inid-primary:
// #7c3aed; --inid-radius: 8px; --inid-bg: #fafafa }). The attribute wins. Only colors as #hex,
// corners as a keyword or a length up to 32px and the system fonts pass; InID checks them again.
export interface Appearance {
  theme?: "light" | "dark" | "auto";
  variables?: { colorPrimary?: string; colorBackground?: string; borderRadius?: string; fontFamily?: "system" | "serif" | "rounded" | "mono" };
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
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
export function cleanAppearance(a: unknown): Appearance | null {
  if (!a || typeof a !== "object") return null;
  const { theme, variables: v = {} } = a as { theme?: unknown; variables?: Record<string, unknown> };
  const variables = Object.fromEntries(
    Object.entries({
      colorPrimary: HEX.test(str(v.colorPrimary)) ? str(v.colorPrimary) : undefined,
      colorBackground: HEX.test(str(v.colorBackground)) ? str(v.colorBackground) : undefined,
      borderRadius: str(v.borderRadius) in RADII || LENGTH.test(str(v.borderRadius)) ? str(v.borderRadius) : undefined,
      fontFamily: str(v.fontFamily) in FONTS ? str(v.fontFamily) : undefined,
    }).filter(([, x]) => x !== undefined)
  );
  const out: Appearance = { ...(typeof theme === "string" && THEMES.includes(theme) && { theme: theme as Appearance["theme"] }), ...(Object.keys(variables).length && { variables }) };
  return Object.keys(out).length ? out : null;
}
// The element's look: its CSS custom properties, then its attribute over them
export function appearanceOf(el: Element): Appearance | null {
  let given: unknown = null;
  try {
    given = JSON.parse(el.getAttribute("appearance") || "null");
  } catch {}
  const css = typeof getComputedStyle === "function" ? getComputedStyle(el) : null;
  const prop = (name: string) => css?.getPropertyValue(name).trim() || undefined;
  const g = (given && typeof given === "object" ? given : {}) as Appearance;
  return cleanAppearance({ theme: g.theme, variables: { colorPrimary: prop("--inid-primary"), colorBackground: prop("--inid-bg"), borderRadius: prop("--inid-radius"), ...g.variables } });
}
const expand = (hex: string) => (hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join("")}` : hex).toLowerCase();
const luminance = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(expand(hex).slice(i, i + 2), 16) / 255).map((s) => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4)).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
const inkOn = (hex: string) => ((luminance(hex) + 0.05) / 0.0556 >= 1.05 / (luminance(hex) + 0.05) ? "#111113" : "#ffffff");
const DARK = { "--inid-bg": "#111113", "--inid-ink": "#f5f5f7", "--inid-muted": "#a1a1a6", "--inid-line": "#3a3a3c", "--inid-hover": "#1c1c1e", "--inid-primary": "#c6ff3d", "--inid-primary-ink": "#111113" };
// The card's own custom properties for a look (the frame gets it from InID)
const cardVars = (a: Appearance | null, fromInID: Record<string, string> = {}): Record<string, string> => {
  const v = a?.variables ?? {};
  return {
    ...(a?.theme === "dark" ? DARK : {}),
    ...fromInID,
    ...(v.colorPrimary && { "--inid-primary": expand(v.colorPrimary), "--inid-primary-ink": inkOn(v.colorPrimary) }),
    ...(v.colorBackground && a?.theme !== "dark" && { "--inid-bg": expand(v.colorBackground) }),
    ...(v.borderRadius && { "--inid-radius": RADII[v.borderRadius] ?? v.borderRadius }),
    ...(v.fontFamily && { "--inid-font": FONTS[v.fontFamily] }),
  };
};
// What InID's frame says about the app's look: only these properties, values that can't end a declaration
const BRAND_VARS = /^--inid-(primary|primary-ink|radius|font|bg|ink|muted|line|fill)$/;
const BRAND_VALUE = /^[#\w\s,.'"()%-]{1,200}$/;
type FrameBrand = { name: string | null; logo: string | null; theme: string | null; vars: Record<string, string> };
export function readFrameBrand(data: unknown, origin: string): FrameBrand | null {
  const d = data as { type?: unknown; name?: unknown; logo?: unknown; theme?: unknown; common?: unknown; light?: unknown } | null;
  if (!d || d.type !== "inid:brand") return null;
  const pick = (o: unknown) => Object.fromEntries(Object.entries(o && typeof o === "object" ? o : {}).filter(([k, v]) => BRAND_VARS.test(k) && typeof v === "string" && BRAND_VALUE.test(v)));
  let logo: string | null = null;
  try {
    if (typeof d.logo === "string" && new URL(d.logo).origin === origin) logo = d.logo;
  } catch {}
  const theme = typeof d.theme === "string" && THEMES.includes(d.theme) ? d.theme : null;
  return { name: typeof d.name === "string" ? d.name.slice(0, 60) : null, logo, theme, vars: { ...(theme === "dark" ? DARK : {}), ...pick(d.common), ...(theme === "light" ? pick(d.light) : {}) } };
}
const paint = (node: HTMLElement, vars: Record<string, string>) => {
  for (const [k, v] of Object.entries(vars)) node.style.setProperty(k, v);
};

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
  static observedAttributes = [...InIDElement.observedAttributes, "role", "permission", "team-role"];
  protected key() {
    const { loaded, user } = this.session;
    if (!loaded) return "wait";
    return has(user, { role: this.getAttribute("role") || undefined, permission: this.getAttribute("permission") || undefined, teamRole: this.getAttribute("team-role") || undefined }) ? "show" : "fallback";
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
// InID's own form, inside the app's page: the phone, the code, the passkey,
// and Google (which opens in the whole window: Google can't be shown inside another site).
// It's InID's page in a frame, so passkeys, codes and InID's cookies never touch the app.
// redirect: a single button to InID's page instead.
class SignInElement extends InIDElement {
  static observedAttributes = [...InIDElement.observedAttributes, "app-name", "return-to", "entrance", "redirect", "appearance"];
  private height = 280;
  // The app's look as InID's frame told it (its logo, name, colors)
  private brand: FrameBrand | null = null;
  private stopBrand: (() => void) | null = null;
  // Decided once: a second sign-in would replace the first (and inid_continue is used up)
  private src: string | null = null;
  private frame: HTMLIFrameElement | null = null;
  private stopListening: (() => void) | null = null;

  connectedCallback() {
    this.stopListening ??= listenForHeight(() => this.frame, 4000, (height) => this.resize(height));
    if (!this.stopBrand) {
      const onMessage = (e: MessageEvent) => {
        const own = this.frame?.contentWindow;
        const brand = own && e.source === own ? readFrameBrand(e.data, e.origin) : null;
        if (brand) this.applyBrand(brand);
      };
      addEventListener("message", onMessage);
      this.stopBrand = () => removeEventListener("message", onMessage);
    }
    super.connectedCallback();
  }
  disconnectedCallback() {
    this.stopListening?.();
    this.stopBrand?.();
    this.stopListening = this.stopBrand = null;
    super.disconnectedCallback();
  }

  // In place: drawing the card again would start the frame over
  private applyBrand(brand: FrameBrand) {
    this.brand = brand;
    const card = this.root.querySelector<HTMLElement>(".inid-card");
    if (!card) return;
    paint(card, cardVars(appearanceOf(this), brand.vars));
    card.classList.toggle("inid-auto", (appearanceOf(this)?.theme ?? brand.theme) === "auto");
    if (brand.logo) card.querySelector(".inid-mark")?.replaceWith(el("img", { class: "inid-logo", src: brand.logo, alt: brand.name || "" }));
    const h2 = card.querySelector("h2");
    if (h2) h2.textContent = this.heading;
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
    const look = appearanceOf(this);
    return (this.src = `${this.apiPath}/signin?${new URLSearchParams({
      display: "embed",
      return_to: this.getAttribute("return-to") || page,
      page,
      ui_locales: this.locale,
      ...(entrance && { entrance }),
      ...(look && { appearance: JSON.stringify(look) }),
    })}`);
  }

  private get heading() {
    const app = this.getAttribute("app-name") || this.brand?.name;
    return app ? fill(this.t.title, { app }) : this.t.titlePlain;
  }

  protected key() {
    const { user } = this.session;
    const mode = user ? `in:${user.name || user.email || ""}` : this.hasAttribute("redirect") ? "redirect" : `frame:${this.chooseSrc()}`;
    // (the name InID's frame tells is put in place: drawn again, the frame would start over)
    return `${mode}|${this.getAttribute("app-name") ?? ""}|${this.locale}`;
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
      this.look(el("section", { class: "inid inid-card", part: "card", "aria-label": title }, mark(), el("h2", {}, title), ...body, el("p", { class: "inid-foot" }, t.secured))),
    ];
  }

  private look(card: HTMLElement) {
    const look = appearanceOf(this);
    paint(card, cardVars(look, this.brand?.vars));
    if ((look?.theme ?? this.brand?.theme) === "auto") card.classList.add("inid-auto");
    if (this.brand?.logo) card.querySelector(".inid-mark")?.replaceWith(el("img", { class: "inid-logo", src: this.brand.logo, alt: this.brand.name || "" }));
    return card;
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
  static observedAttributes = [...InIDElement.observedAttributes, "appearance"];
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
    return `${loaded && Boolean(user)}|${this.tab}|${accountUrl}|${this.locale}|${this.getAttribute("appearance") ?? ""}`;
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
      // The app's look over the panel's, for Mi InID in its frame (appearance, CSS properties)
      const look = appearanceOf(this);
      const src = look ? `${accountUrl}${accountUrl.includes("?") ? "&" : "?"}${new URLSearchParams({ appearance: JSON.stringify(look) })}` : accountUrl;
      this.frame = el("iframe", { src, title: t.profile, class: "inid-frame", style: `height:${this.height}px`, scrolling: "no", allow: ALLOW }) as HTMLIFrameElement;
      body = [el("p", { class: "inid-muted" }, t.profileLead), this.frame];
    } else body = [el("p", { class: "inid-muted" }, t.sessionsLead), sessionsOf(this)];
    return [
      style(`${CSS}:host{display:block}`),
      ((card) => (paint(card, cardVars(appearanceOf(this))), card))(el("section", { class: `inid inid-card inid-profile${appearanceOf(this)?.theme === "auto" ? " inid-auto" : ""}`, part: "card", "aria-label": t.profile }, el("div", { class: "inid-tabs", role: "tablist" }, tab("account", t.profile), tab("sessions", t.sessions)), ...body)),
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

// ---------- teams ----------
// A new team: its name; the person its admin, then the session works in it. inline: inside
// something of the app's (a dialog), without a card of its own. after-create: where to go.
class CreateTeamElement extends InIDElement {
  static observedAttributes = [...InIDElement.observedAttributes, "after-create", "inline"];
  private error: string | null = null;
  private busy = false;
  protected get needsSession() {
    return false;
  }
  protected key() {
    return JSON.stringify([this.error, this.busy, this.locale, this.hasAttribute("inline")]);
  }
  private async create(form: HTMLFormElement) {
    this.busy = true;
    this.error = null;
    this.update();
    try {
      const team = (await call(this.apiPath, "teams", "POST", { name: String(new FormData(form).get("name") || "") })) as TeamItem;
      await switchTeam(this.apiPath, team.id);
      this.dispatchEvent(new CustomEvent("inid:team", { bubbles: true, composed: true, detail: { team } }));
      goOn(this.getAttribute("after-create"));
    } catch (err) {
      this.error = errorText(this.t, err);
      this.busy = false;
      this.update();
    }
  }
  protected view(): Node[] {
    const t = this.t;
    const body = [
      el("p", { class: "inid-muted" }, t.createTeamLead),
      el("form", { class: "inid-row", onsubmit: (e: Event) => (e.preventDefault(), void this.create(e.target as HTMLFormElement)) },
        el("input", { class: "inid-field", name: "name", required: true, maxlength: "80", placeholder: t.teamName, "aria-label": t.teamName, autocomplete: "organization" }),
        el("button", { type: "submit", class: "inid-btn", disabled: this.busy }, t.create)
      ),
      this.error && el("p", { class: "inid-error", role: "alert" }, this.error),
    ];
    const css = style(`${CSS}:host{display:block}`);
    if (this.hasAttribute("inline")) return [css, el("div", { class: "inid" }, ...body)];
    return [css, el("section", { class: "inid inid-card", part: "card", "aria-label": t.createTeam }, el("h2", { style: "margin-top:0" }, t.createTeam), ...body)];
  }
}

// The person's teams, in a corner: the one in use, the others, their own account (where the
// app doesn't require a team), invitations to accept, their domain's team to join, and creating
// or managing one. after-switch: where to go after a change (else the page reloads).
class TeamSwitcherElement extends InIDElement {
  static observedAttributes = [...InIDElement.observedAttributes, "after-switch", "hide-personal"];
  private list: TeamsList | null = null;
  private open = false;
  private dialog: "create" | "manage" | null = null;
  private error: string | null = null;
  private cleanup: (() => void) | null = null;

  connectedCallback() {
    const away = (e: Event) => {
      if (this.open && !e.composedPath().includes(this)) ((this.open = false), this.update());
    };
    const keys = (e: KeyboardEvent) => {
      if (this.open && e.key === "Escape") ((this.open = false), this.update());
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", keys);
    this.cleanup = () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", keys);
    };
    super.connectedCallback();
    void this.load();
  }
  disconnectedCallback() {
    this.cleanup?.();
    this.cleanup = null;
    super.disconnectedCallback();
  }
  private async load() {
    try {
      this.list = (await call(this.apiPath, "teams")) as TeamsList;
    } catch {
      this.list = null;
    }
    this.update();
  }
  private async act(run: () => Promise<unknown>) {
    this.open = false;
    this.error = null;
    this.update();
    try {
      await run();
      goOn(this.getAttribute("after-switch"));
    } catch (err) {
      this.error = errorText(this.t, err);
      this.update();
    }
  }
  protected key() {
    const { loaded, user } = this.session;
    return JSON.stringify([loaded && user, this.list, this.open, this.dialog, this.error, this.locale]);
  }
  protected view(): Node[] {
    const { loaded, user } = this.session;
    if (!loaded || !user) return [];
    const t = this.t;
    const active = user.team;
    const list = this.list;
    const item = (label: string, onclick: () => void, extra: { current?: boolean; note?: string; avatar?: string } = {}) =>
      el("button", { role: "menuitem", type: "button", class: "inid-menu-item", "aria-current": extra.current ? "true" : null, onclick },
        extra.avatar !== undefined && el("span", { class: "inid-avatar inid-square", "aria-hidden": "true" }, extra.avatar),
        el("span", {}, label),
        extra.note && el("small", {}, extra.note)
      );
    const enter = (id: string | null) => () => void this.act(() => switchTeam(this.apiPath, id));
    const take = (path: string) => () => void this.act(async () => switchTeam(this.apiPath, ((await call(this.apiPath, path, "POST")) as { team: { id: string } }).team.id));
    const personal = !this.hasAttribute("hide-personal") && !list?.settings.required;
    const menu =
      this.open &&
      el("div", { class: "inid-menu", role: "menu" },
        el("p", { class: "inid-menu-label" }, t.teams),
        personal && item(t.personal, enter(null), { current: !active, avatar: initials(user) }),
        ...(list?.teams ?? []).map((x) => item(x.name, enter(x.id), { current: x.id === active?.id, avatar: teamInitial(x.name) })),
        Boolean(list?.invitations.length || list?.joinable.length) && el("p", { class: "inid-menu-label" }, t.invitations),
        ...(list?.invitations ?? []).map((i) => item(i.team.name, take(`teams/invitations/${encodeURIComponent(i.id)}/accept`), { note: t.accept, avatar: teamInitial(i.team.name) })),
        ...(list?.joinable ?? []).map((x) => item(x.name, take(`teams/${encodeURIComponent(x.id)}/join`), { note: `${t.join} · ${t.fromDomain}`, avatar: teamInitial(x.name) })),
        el("hr"),
        active && item(t.manageTeam, () => ((this.open = false), (this.dialog = "manage"), this.update())),
        list?.settings.canCreate && item(t.createTeam, () => ((this.open = false), (this.dialog = "create"), this.update()))
      );
    const inner = { "api-path": this.getAttribute("api-path"), locale: this.getAttribute("locale"), inline: true };
    const after = this.getAttribute("after-switch");
    const dialog =
      this.dialog &&
      el("dialog", { class: "inid inid-dialog", "aria-label": this.dialog === "create" ? t.createTeam : t.manageTeam, onclose: () => ((this.dialog = null), this.update()) },
        el("h2", {}, this.dialog === "create" ? t.createTeam : (active?.name ?? t.manageTeam)),
        this.dialog === "create" ? el("inid-create-team", { ...inner, "after-create": after }) : el("inid-team-profile", { ...inner, "after-leave": after }),
        el("form", { method: "dialog" }, el("button", { type: "submit", class: "inid-btn inid-quiet" }, t.close))
      );
    return [
      style(),
      el("div", { class: "inid inid-user" },
        el("button", { type: "button", class: "inid-avatar-btn", part: "button", "aria-haspopup": "menu", "aria-expanded": String(this.open), "aria-label": t.switchTeam, onclick: () => ((this.open = !this.open), this.update()) },
          el("span", { class: "inid-avatar inid-square", "aria-hidden": "true" }, active ? teamInitial(active.name) : initials(user)),
          el("span", {}, active?.name ?? t.personal)
        ),
        this.error && el("p", { class: "inid-error", role: "alert" }, this.error),
        menu,
        dialog
      ),
    ];
  }
  protected rendered() {
    if (this.dialog) this.root.querySelector<HTMLDialogElement>("dialog")?.showModal?.();
  }
}

type Member = { userId: string; role: string; firstName: string | null; lastName: string | null; email: string | null };
type Invitation = { id: string; email: string; role: string };

// One team (the one in use, unless team-id says another): its name and image, its members and
// their roles, invitations by email and changing or taking out members (for whoever runs it),
// leaving it and deleting it. inline: without a card of its own. after-leave: where to go.
class TeamProfileElement extends InIDElement {
  static observedAttributes = [...InIDElement.observedAttributes, "team-id", "after-leave", "inline"];
  private tab: "general" | "members" = "general";
  private team: TeamItem | null = null;
  private members: Member[] = [];
  private invitations: Invitation[] = [];
  private settings: TeamsList["settings"] | null = null;
  private error: string | null = null;
  private loadedFor: string | null = null;

  private get teamId() {
    return this.getAttribute("team-id") || this.session.user?.team?.id || null;
  }
  private get base() {
    return `teams/${encodeURIComponent(this.teamId ?? "")}`;
  }
  private async load() {
    const id = this.teamId;
    if (!id) return;
    this.loadedFor = id;
    try {
      this.settings = ((await call(this.apiPath, "teams")) as TeamsList).settings;
      this.team = (await call(this.apiPath, this.base)) as TeamItem;
      this.members = ((await call(this.apiPath, `${this.base}/members`)) as { members: Member[] }).members;
      this.invitations = this.team.manages ? ((await call(this.apiPath, `${this.base}/invitations`)) as { invitations: Invitation[] }).invitations : [];
    } catch (err) {
      this.error = errorText(this.t, err);
    }
    this.update();
  }
  private run(fn: () => Promise<unknown>, after: () => unknown = () => this.load()) {
    return async () => {
      this.error = null;
      try {
        await fn();
        await after();
      } catch (err) {
        this.error = errorText(this.t, err);
        this.update();
      }
    };
  }
  protected key() {
    if (this.session.loaded && this.teamId && this.teamId !== this.loadedFor) void this.load();
    return JSON.stringify([this.session.loaded, this.teamId, this.tab, this.team, this.members, this.invitations, this.error, this.locale]);
  }
  protected view(): Node[] {
    const t = this.t;
    const css = style(`${CSS}:host{display:block}`);
    const wrap = (...children: Child[]) =>
      this.hasAttribute("inline") ? el("div", { class: "inid inid-list" }, ...children) : el("section", { class: "inid inid-card inid-profile inid-list", part: "card", "aria-label": this.team?.name ?? t.teams }, ...children);
    if (!this.session.loaded) return [css];
    if (!this.teamId) return [css, wrap(el("p", { class: "inid-muted" }, t.noTeam))];
    const team = this.team;
    if (!team) return [css, wrap(this.error ? el("p", { class: "inid-error", role: "alert" }, this.error) : el("div", { "aria-busy": "true", style: "min-height:60px" }))];
    const me = this.session.user?.id;
    const roles = this.settings?.roles ?? [];
    const roleName = (key: string) => roles.find((r) => r.key === key)?.name ?? key;
    const options = (selected?: string) => roles.map((r) => el("option", { value: r.key, selected: r.key === selected }, r.name));
    const after = () => goOn(this.getAttribute("after-leave"));
    const out = (path: string, method: string) => async () => {
      await call(this.apiPath, path, method);
      // Out of the team in use: back to their own account (another one where a team is required)
      if (this.session.user?.team?.id === team.id) await switchTeam(this.apiPath, null).catch(() => {});
    };
    const tab = (key: "general" | "members", label: string) =>
      el("button", { type: "button", role: "tab", "aria-selected": String(this.tab === key), class: "inid-tab", onclick: () => ((this.tab = key), this.update()) }, label);
    const general: Child[] = [
      team.manages
        ? el("form", { onsubmit: (e: Event) => {
            e.preventDefault();
            const form = new FormData(e.target as HTMLFormElement);
            void this.run(() => call(this.apiPath, this.base, "PATCH", { name: form.get("name"), imageUrl: String(form.get("imageUrl") || "") || null }))();
          } },
            el("div", { class: "inid-row" }, el("input", { class: "inid-field", name: "name", value: team.name, required: true, maxlength: "80", "aria-label": t.teamName })),
            el("div", { class: "inid-row" }, el("input", { class: "inid-field", name: "imageUrl", type: "url", value: team.imageUrl ?? "", placeholder: t.imageUrl, "aria-label": t.imageUrl }), el("button", { type: "submit", class: "inid-btn" }, t.save))
          )
        : el("p", { class: "inid-muted" }, `${t.role}: ${roleName(team.role)}`),
      el("div", { class: "inid-row" },
        el("button", { type: "button", class: "inid-btn inid-quiet", onclick: () => confirm(fill(t.confirmLeave, { team: team.name })) && void this.run(out(`${this.base}/leave`, "POST"), after)() }, t.leave),
        team.manages && el("button", { type: "button", class: "inid-btn inid-quiet", onclick: () => confirm(fill(t.confirmDelete, { team: team.name })) && void this.run(out(this.base, "DELETE"), after)() }, t.deleteTeam)
      ),
    ];
    const nameOf = (m: Member) => [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email || m.userId;
    const memberPath = (m: Member) => `${this.base}/members/${encodeURIComponent(m.userId)}`;
    const people: Child[] = [
      el("ul", {}, ...this.members.map((m) =>
        el("li", {},
          el("span", {}, el("b", {}, nameOf(m)), el("small", {}, m.userId === me ? t.you : (m.email ?? ""))),
          el("span", {},
            ...(team.manages && m.userId !== me
              ? [
                  el("select", { class: "inid-field", "aria-label": t.role, onchange: (e: Event) => void this.run(() => call(this.apiPath, memberPath(m), "PATCH", { role: (e.target as HTMLSelectElement).value }))() }, ...options(m.role)),
                  el("button", { type: "button", class: "inid-btn inid-quiet", onclick: () => void this.run(() => call(this.apiPath, memberPath(m), "DELETE"))() }, t.remove),
                ]
              : [el("em", {}, roleName(m.role))])
          )
        )
      )),
      team.manages &&
        el("form", { class: "inid-row", onsubmit: (e: Event) => {
          e.preventDefault();
          const form = e.target as HTMLFormElement;
          const data = new FormData(form);
          void this.run(() => call(this.apiPath, `${this.base}/invitations`, "POST", { email: data.get("email"), role: data.get("role") }))();
        } },
          el("input", { class: "inid-field", name: "email", type: "email", required: true, placeholder: t.inviteEmail, "aria-label": t.inviteEmail }),
          el("select", { class: "inid-field", name: "role", "aria-label": t.role }, ...options(this.settings?.defaultRole)),
          el("button", { type: "submit", class: "inid-btn" }, t.invite)
        ),
      this.invitations.length > 0 && el("h3", {}, t.pending),
      this.invitations.length > 0 &&
        el("ul", {}, ...this.invitations.map((i) =>
          el("li", {},
            el("span", {}, el("b", {}, i.email), el("small", {}, roleName(i.role))),
            el("span", {}, el("button", { type: "button", class: "inid-btn inid-quiet", onclick: () => void this.run(() => call(this.apiPath, `${this.base}/invitations/${encodeURIComponent(i.id)}`, "DELETE"))() }, t.revoke))
          )
        )),
    ];
    return [
      css,
      wrap(
        el("div", { class: "inid-tabs", role: "tablist" }, tab("general", t.general), tab("members", t.members)),
        this.error && el("p", { class: "inid-error", role: "alert" }, this.error),
        ...(this.tab === "general" ? general : people)
      ),
    ];
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
  "inid-team-switcher": TeamSwitcherElement,
  "inid-team-profile": TeamProfileElement,
  "inid-create-team": CreateTeamElement,
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
  TeamSwitcherElement,
  TeamProfileElement,
  CreateTeamElement,
};
