# @inid/sveltekit

Sign-in with [InID](https://inid.co) for SvelteKit. People sign in with their phone (a code by WhatsApp or SMS), a passkey (Face ID, fingerprint, Windows Hello or the device PIN) or Google, without passwords, in a form that lives inside your page. Your server knows who they are, their role and their permissions.

```bash
npm install @inid/sveltekit @inid/js
```

Your keys from InID's panel (Settings → Keys), in `.env`:

```bash
INID_PUBLISHABLE_KEY=pk_test_...
INID_SECRET_KEY=sk_test_...
```

In InID's panel, add your app's address to the allowed origins (e.g. `http://localhost:5173`).

## The hook

```ts
// src/hooks.server.ts
import { inid } from "@inid/sveltekit";

export const handle = inid({
  protect: ["/dashboard", { path: "/admin", role: "admin" }],
});
// with other hooks: export const handle = sequence(inid({ … }), yours);
```

It answers InID's routes (`/api/inid/…`), keeps the session fresh, and sends whoever isn't signed in to sign in (and back). Someone signed in without the role gets a 403.

## In your routes

```ts
// src/routes/dashboard/+page.server.ts
export const load = ({ locals }) => ({ name: locals.inid.user?.name, admin: locals.inid.has({ role: "admin" }) });
```

For TypeScript, in `src/app.d.ts`:

```ts
declare global {
  namespace App {
    interface Locals { inid: import("@inid/sveltekit").Auth }
  }
}
export {};
```

## The sign-in form and the rest

Web components from [`@inid/js`](https://www.npmjs.com/package/@inid/js):

```svelte
<script>
  import { onMount } from "svelte";
  onMount(() => import("@inid/js"));
</script>

<inid-sign-in app-name="Mi App" return-to="/dashboard"></inid-sign-in>
```

`<inid-user-button>`, `<inid-user-profile>`, `<inid-sign-out-button>`, `<inid-signed-in>` / `<inid-signed-out>` and `<inid-protect role="admin">` work the same way.

## Options

`inid({ protect, publishableKey, secretKey, issuer, appUrl, apiPath })`. Protect rules: a path (and its subpaths), a `RegExp`, or `{ path, role?, permission?, entrance? }` — `entrance` is a door of your app with its own sign-up rules (InID's panel: Sign-in → Entrances).

Docs: https://inid.co/docs/frameworks/ · MIT
