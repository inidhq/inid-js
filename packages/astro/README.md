# @inid/astro

Sign-in with [InID](https://inid.co) for Astro. People sign in with their phone (a code by WhatsApp or SMS), Face ID, their fingerprint or Google, without passwords, in a form that lives inside your page. Your pages know who they are, their role and their permissions.

```bash
npm install @inid/astro @inid/js
```

Your keys from InID's panel (Settings → Keys), in `.env`:

```bash
INID_PUBLISHABLE_KEY=pk_test_...
INID_SECRET_KEY=sk_test_...
```

In InID's panel, add your app's address to the allowed origins (e.g. `http://localhost:4321`).

## The middleware

Pages that check who's signed in render on demand: `output: "server"` in `astro.config.mjs` (with an adapter, e.g. `@astrojs/node`), or `export const prerender = false` on those pages.

```ts
// src/middleware.ts
import { inid } from "@inid/astro";

export const onRequest = inid({
  protect: ["/dashboard", { path: "/admin", role: "admin" }],
});
```

It answers InID's routes (`/api/inid/…`, no endpoint file needed), keeps the session fresh, and sends whoever isn't signed in to sign in (and back). Someone signed in without the role gets a 403. With other middleware: `sequence(inid(…), yours)` from `astro:middleware`.

## In your pages

```astro
---
// src/pages/dashboard.astro
const { user, has } = Astro.locals.inid;
---
<h1>Hola, {user.name}</h1>
{has({ role: "admin" }) && <a href="/admin">Administración</a>}
```

For TypeScript, in `src/env.d.ts`:

```ts
declare namespace App {
  interface Locals { inid: import("@inid/astro").Auth }
}
```

## The sign-in form and the rest

Web components from [`@inid/js`](https://www.npmjs.com/package/@inid/js):

```astro
---
// src/pages/sign-in.astro
---
<inid-sign-in app-name="Mi App" return-to="/dashboard"></inid-sign-in>
<script>import "@inid/js";</script>
```

`<inid-user-button>`, `<inid-user-profile>`, `<inid-sign-out-button>`, `<inid-signed-in>` / `<inid-signed-out>` and `<inid-protect role="admin">` work the same way. Prefer React? `@inid/react` works as an island too.

## Options

`inid({ protect, publishableKey, secretKey, issuer, appUrl, apiPath })`. Protect rules: a path (and its subpaths), a `RegExp`, or `{ path, role?, permission?, entrance? }` — `entrance` is a door of your app with its own sign-up rules (InID's panel: Sign-in → Entrances).

Docs: https://inid.co/docs/frameworks/ · MIT
