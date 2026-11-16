# @inid/react

The React side of sign-in with [InID](https://inid.co): `<SignIn />`, `<UserButton />`, `useUser()` and friends. People sign in with Face ID, their fingerprint or a code to their phone — no passwords.

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
| `<InIDProvider user? apiPath? locale?>` | `user`: who is signed in, if your server already knows (nothing to wait for) |
| `<SignIn appName? returnTo? redirect? />` | The sign-in itself, in your page: phone, code, Face ID or fingerprint, and Google (which opens in the whole window). It is InID's form in a frame, so passkeys and codes never touch your app. `redirect` shows a single button to InID's page instead |
| `<SignInButton>`, `<SignOutButton>` | A button, or wrap your own |
| `<UserProfile />` | The person's page in your app: their InID account (data, Face ID) in a frame your app can't read, and their sessions |
| `<UserSessions />` | The person's sessions at your app, the current one marked; they end the others (also in `<UserButton>` → Your sessions) |
| `<Protect role? permission? fallback?>` | Shows its children only to someone with that role or permission (it hides; check on your server too) |
| `<UserButton />` | Initials and a menu: manage their InID, sign out |
| `<SignedIn>`, `<SignedOut>` | Shows its children only then |
| `useUser()`, `useAuth()` | The person, `has({ role, permission })`, and `signIn()` / `signOut()` |

Spanish, English and Portuguese (`locale`). Colors and corners are CSS variables on `.inid`: `--inid-ink`, `--inid-accent`, `--inid-radius`, `--inid-font`.

MIT license.
