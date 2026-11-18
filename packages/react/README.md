# @inid/react

The React side of sign-in with [InID](https://inid.co): `<SignIn />`, `<UserButton />`, `useUser()` and friends. People sign in with a passkey (Face ID, fingerprint, Windows Hello or the device PIN) or a code to their phone — no passwords.

**On Next.js, use [`@inid/nextjs`](https://www.npmjs.com/package/@inid/nextjs)**: it includes these components and the server side.

```bash
npm install @inid/react
```

```tsx
import { InIDProvider, SignedIn, SignedOut, SignIn, UserButton, useUser } from "@inid/react";

<InIDProvider locale="en">
  <SignedOut><SignIn appName="My App" /></SignedOut>
  <SignedIn><UserButton /></SignedIn>
</InIDProvider>
```

The components never hold a key: they talk to your own server, at `/api/inid` (or `apiPath` on the provider). Your server answers four routes there:

| Route | |
|---|---|
| `GET /signin?return_to=/path` | Sends the person to InID (authorization code flow with PKCE) |
| `GET /callback` | Trades the code with your secret key, sets the session cookies |
| `POST /signout` | Revokes the session at InID, clears the cookies |
| `GET /session` | `{ user, accountUrl }` |

`@inid/nextjs` is those routes for Next.js; its `core` works with any server that speaks `Request` and `Response`.

| | |
|---|---|
| `<InIDProvider user? apiPath? locale? appearance?>` | `user`: who is signed in, if your server already knows (nothing to wait for) |
| `<SignIn appName? returnTo? redirect? appearance? />` | The sign-in itself, in your page: phone, code, passkey and Google (which opens in the whole window). It is InID's form in a frame, so passkeys and codes never touch your app. `redirect` shows a single button to InID's page instead |
| `<SignInButton>`, `<SignOutButton>` | A button, or wrap your own |
| `<UserProfile appearance? />` | The person's page in your app: their InID account (data, passkeys) in a frame your app can't read, and their sessions |
| `<UserSessions />` | The person's sessions at your app, the current one marked; they end the others (also in `<UserButton>` → Your sessions) |
| `<Protect role? permission? fallback?>` | Shows its children only to someone with that role or permission (it hides; check on your server too) |
| `<UserButton />` | Initials and a menu: manage their InID, sign out |
| `<SignedIn>`, `<SignedOut>` | Shows its children only then |
| `useUser()`, `useAuth()` | The person, `has({ role, permission })`, and `signIn()` / `signOut()` |

Spanish, English and Portuguese (`locale`).

## Appearance

Your logo, name, colors, corners, theme, font and texts are set once in the InID panel (your app → Appearance) and apply everywhere InID shows itself for your app: the sign-in, its frame in your page, `<UserProfile />`, the consent screen and the emails. From code you can change some of it for a page, and code wins over the panel:

```tsx
<SignIn appearance={{ theme: "dark", variables: { colorPrimary: "#7c3aed", colorBackground: "#fafafa", borderRadius: "small", fontFamily: "rounded" } }} />
<InIDProvider appearance={{ variables: { colorPrimary: "#7c3aed" } }}>…</InIDProvider>  // for every component
```

| | |
|---|---|
| `theme` | `"light"`, `"dark"` or `"auto"` (the device's) |
| `colorPrimary` | `#rgb` or `#rrggbb`; the text on it is picked for contrast |
| `colorBackground` | `#rgb` or `#rrggbb`, light theme only |
| `borderRadius` | `"none"`, `"small"`, `"medium"`, `"large"`, or a length up to `32px` / `2rem` |
| `fontFamily` | `"system"`, `"serif"`, `"rounded"` or `"mono"` (system fonts) |

Nothing else passes: InID checks every value again and drops what it doesn't know, so no CSS of yours reaches its frame. The card around the frame is drawn with the same look (custom properties on `.inid`: `--inid-primary`, `--inid-primary-ink`, `--inid-bg`, `--inid-ink`, `--inid-radius`, `--inid-font`), and takes your logo and name from the panel once InID's frame tells it.

MIT license.
