# @inid/js

Sign-in with [InID](https://inid.co) for any page, no framework: custom elements and a few functions for Astro, Svelte, Vue, Solid or plain HTML. People sign in with a passkey (Face ID, fingerprint, Windows Hello or the device PIN) or a code to their phone — no passwords.

```bash
npm install @inid/js
```

```html
<script type="module">import "@inid/js";</script>

<inid-signed-out><inid-sign-in app-name="My App"></inid-sign-in></inid-signed-out>
<inid-signed-in><inid-user-button></inid-user-button></inid-signed-in>
```

Importing the package registers the elements (importing it twice is safe). On React, use [`@inid/react`](https://www.npmjs.com/package/@inid/react) instead.

### Without a bundler

```html
<script src="https://cdn.jsdelivr.net/npm/@inid/js@0.1.0/dist/inid.global.js"></script>
<script>InID.configure({ locale: "en" });</script>
```

The script registers the elements and puts the functions on `window.InID`.

## Your server

The elements never hold a key: they talk to your own server, at `/api/inid` (or `api-path`). Mount InID's routes there with a server adapter: [`@inid/astro`](https://www.npmjs.com/package/@inid/astro), [`@inid/sveltekit`](https://www.npmjs.com/package/@inid/sveltekit), [`@inid/nextjs`](https://www.npmjs.com/package/@inid/nextjs), or [`@inid/server`](https://www.npmjs.com/package/@inid/server) for anything else.

| Route | |
|---|---|
| `GET /signin` | Sends the person to InID, or InID's embedded form (`display=embed`) |
| `GET /callback` | Trades the code with your secret key, sets the session cookies |
| `POST /signout` | Revokes the session at InID, clears the cookies |
| `GET /session` | `{ user, accountUrl }` |
| `GET /sessions`, `DELETE /sessions/:id`, `DELETE /sessions?others=1` | The person's sessions at your app |
| `POST /team` | `{ teamId }` (null: their own account): renews the session in that team → `{ user }` |
| `/teams/…` | The person's own teams (apps with teams), forwarded to InID as them |

## Elements

Every element also takes `api-path` and `locale` (`es`, `en` or `pt`); left out, they use `configure()`, then the page's `<html lang>`, then Spanish. The session is asked for once and shared by all of them.

| Element | Attributes | |
|---|---|---|
| `<inid-sign-in>` | `app-name`, `return-to`, `entrance`, `redirect`, `appearance` | The sign-in itself, in your page: phone, code, passkey and Google (which opens in the whole window). It is InID's form in a frame, so passkeys and codes never touch your app. Once signed in, it says who. `redirect` shows a single button to InID's page instead |
| `<inid-sign-in-button>` | `return-to`, `entrance` | A button to sign in; its children are the label |
| `<inid-sign-out-button>` | `return-to` (default `/`) | A button to sign out; its children are the label |
| `<inid-user-button>` | `show-name`, `sign-out-return-to` | Initials and a menu: their sessions, manage their InID, sign out |
| `<inid-user-profile>` | `appearance` | The person's page in your app: their InID account (data, passkeys) in a frame your app can't read, and their sessions |
| `<inid-user-sessions>` | | The person's sessions at your app, the current one marked; they end the others |
| `<inid-signed-in>`, `<inid-signed-out>` | | Shows its children only then |
| `<inid-protect>` | `role`, `permission`, `team-role` | Shows its children only to someone with that role, permission (from their app role or their team role) or role in their active team; to anyone else, the children with `slot="fallback"`. It hides; check on your server too |
| `<inid-team-switcher>` | `after-switch`, `hide-personal` | Apps with teams: the team in use, the others to switch to, their personal account (unless the app requires a team), invitations to accept, their email domain's team to join, "Create team" and "Manage team" |
| `<inid-team-profile>` | `team-id`, `after-leave`, `inline` | The active team (or `team-id`): name and image, members and roles, invitations by email, leaving it and (admins) deleting it |
| `<inid-create-team>` | `after-create`, `inline` | A name; the person becomes its admin and the session switches to it |

`entrance` is a door of your app with its own rules ("team": only your company's people), made in the InID panel.

Colors and corners are CSS variables, set on the elements or any ancestor: `--inid-primary`, `--inid-ink`, `--inid-muted`, `--inid-line`, `--inid-bg`, `--inid-accent`, `--inid-radius`, `--inid-font`. Buttons expose `::part(button)`, cards `::part(card)`.

### Appearance

Your logo, name, colors, corners, theme, font and texts are set once in the InID panel (your app → Appearance) and apply everywhere InID shows itself for your app. From the page you can change some of it for one element, and the page wins over the panel: with `appearance` (JSON, the same as `@inid/react`'s prop) or with CSS custom properties on the element, which also reach InID's frame:

```html
<style>inid-sign-in { --inid-primary: #7c3aed; --inid-radius: 8px; --inid-bg: #fafafa; }</style>
<inid-sign-in appearance='{"theme":"dark","variables":{"fontFamily":"rounded"}}'></inid-sign-in>
```

`theme`: `light`, `dark` or `auto`; `colorPrimary` and `colorBackground` (light theme only): `#rgb` or `#rrggbb`; `borderRadius`: `none`, `small`, `medium`, `large` or a length up to `32px` / `2rem`; `fontFamily`: `system`, `serif`, `rounded` or `mono`. The attribute wins over the CSS properties. Nothing else passes, and InID checks every value again, so no CSS of yours reaches its frame.

## Functions

```ts
import { configure, getUser, signIn, signOut, has, reload, getTeams, setActiveTeam } from "@inid/js";

configure({ apiPath: "/api/inid", locale: "en" }); // both optional
const user = await getUser();                       // InIDUser | null
if (has(user, { role: "admin" })) { /* … */ }
signIn("/dashboard", "team");                       // returnTo?, entrance?
await signOut("/");                                 // POST /signout, then goes to returnTo
await reload();                                     // asks the server again
has(user, { teamRole: "admin" });                   // their role in the active team (user.team)
await getTeams();                                   // { teams, invitations, joinable, settings }
await setActiveTeam("team_…");                      // null: their own account
```

`document` gets an `inid:user` event (`event.detail.user`) when the session loads or changes.

After a team change, `after-switch`, `after-create` and `after-leave` say where to go; by default the page reloads, so what your server rendered for the old team is drawn again.

## Astro

```astro
<inid-signed-out><inid-sign-in app-name="Mi App"></inid-sign-in></inid-signed-out>
<inid-signed-in><inid-user-button show-name></inid-user-button></inid-signed-in>

<script>
  import "@inid/js";
</script>
```

## Svelte

```svelte
<script>
  import "@inid/js";
</script>

<inid-signed-out><inid-sign-in app-name="My App"></inid-sign-in></inid-signed-out>
<inid-signed-in><inid-user-button></inid-user-button></inid-signed-in>
```

## Vue

Tell Vue that tags starting with `inid-` are custom elements:

```ts
// vite.config.ts
import vue from "@vitejs/plugin-vue";

export default {
  plugins: [vue({ template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith("inid-") } } })],
};
```

```vue
<script setup>
import "@inid/js";
</script>

<template>
  <inid-signed-out><inid-sign-in app-name="My App" /></inid-signed-out>
  <inid-signed-in><inid-user-button /></inid-signed-in>
</template>
```

Importing during server rendering is safe: nothing registers without a DOM.

MIT license.
