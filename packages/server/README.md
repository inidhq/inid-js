# @inid/server

Sign-in with [InID](https://inid.co) for any server that speaks the web's `Request` and `Response`: Hono, Remix and React Router, Nuxt, Bun, Deno, Cloudflare Workers — and Express. People sign in with their phone (a code by WhatsApp or SMS), a passkey (Face ID, fingerprint, Windows Hello or the device PIN) or Google, without passwords; your server knows who they are, their role and their permissions.

For **Next.js** use [`@inid/nextjs`](https://www.npmjs.com/package/@inid/nextjs), for **Astro** [`@inid/astro`](https://www.npmjs.com/package/@inid/astro), for **SvelteKit** [`@inid/sveltekit`](https://www.npmjs.com/package/@inid/sveltekit). They're built on this package.

```bash
npm install @inid/server
```

Set your keys from InID's panel (Settings → Keys):

```bash
INID_PUBLISHABLE_KEY=pk_test_...
INID_SECRET_KEY=sk_test_...
```

## Any web-standard server

`gate()` does everything for one request: it answers InID's routes (`/api/inid/…`), keeps the session fresh, and sends whoever isn't signed in away from protected paths.

```ts
import { createInID } from "@inid/server";

const inid = createInID();

export async function handler(request: Request): Promise<Response> {
  const { response, auth, setCookies } = await inid.gate(request, {
    protect: ["/dashboard", { path: "/admin", role: "admin" }, { path: "/team", entrance: "team" }],
  });
  if (response) return response; // InID's routes, a sign-in, a 403

  const page = new Response(auth.isSignedIn ? `Hola, ${auth.user!.name}` : "Hola");
  for (const c of setCookies) page.headers.append("set-cookie", c); // a renewed session
  return page;
}
```

`auth` has `isSignedIn`, `userId` (this person's id in your app), `user` (name, email, phone… what they authorized, plus `roles`, `permissions`, `publicMetadata` and `team`, the active team in apps with teams), `session` and `has({ role })` / `has({ teamRole })` / `has({ permission })` (from the app role or the team role). Apps with teams also get `POST /api/inid/team` (switch the active team) and `/api/inid/teams/…` (the person's own teams); see [Teams](https://inid.co/docs/teams/). Anywhere else, `await inid.auth(request)` reads who's signed in.

**Hono:** `app.use(async (c, next) => { const g = await inid.gate(c.req.raw, { protect }); if (g.response) return g.response; c.set("auth", g.auth); await next(); g.setCookies.forEach((s) => c.header("set-cookie", s, { append: true })); })`

**Remix / React Router:** in a resource route `api.inid.$.ts`, `export const loader = ({ request }) => inid.handle(request)` and `export const action = loader`; in loaders, `const auth = await inid.auth(request)`.

**Nuxt:** in `server/middleware/inid.ts`, `const g = await inid.gate(toWebRequest(event), { protect })` and return `g.response` if set.

## Express

```ts
import express from "express";
import { inid } from "@inid/server/express";

const app = express();
app.use(inid({ protect: ["/dashboard"] })); // behind a proxy: inid({ trustProxy: true, … })
app.get("/dashboard", (req, res) => res.send(`Hola, ${req.auth.user.name}`));
```

## Components

The sign-in form and the rest are web components from [`@inid/js`](https://www.npmjs.com/package/@inid/js) (any framework or plain HTML), or React components from [`@inid/react`](https://www.npmjs.com/package/@inid/react):

```html
<script type="module">import "@inid/js";</script>
<inid-sign-in app-name="Mi App"></inid-sign-in>
```

## Options

`createInID({ publishableKey, secretKey, issuer, appUrl, apiPath, scope })` — all optional when set in the environment (`INID_PUBLISHABLE_KEY`, `INID_SECRET_KEY`, `INID_ISSUER`, `INID_APP_URL`). `apiPath` defaults to `/api/inid`. `appUrl` matters behind a proxy that changes the host.

The sign-in route passes the page's `appearance` (from `<SignIn appearance>` or `<inid-sign-in appearance>`, up to 1 KB) on to InID, which checks it.

Protect rules: a path (`"/dashboard"`, its subpaths too), a `RegExp`, or `{ path, role?, permission?, entrance? }`. `entrance` is a door of your app with its own sign-up rules (made in the panel: Sign-in → Who may sign up → Entrances).

Docs: https://inid.co/docs/frameworks/ · MIT
