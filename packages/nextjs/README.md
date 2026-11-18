# @inid/nextjs

Sign-in with [InID](https://inid.co) for Next.js (14, 15 and 16, App Router). People sign in with a passkey (Face ID, fingerprint, Windows Hello or the device PIN) or a code to their phone — no passwords — and arrive with a verified phone, a confirmed email and their name.

```bash
npm install @inid/nextjs
```

You need an organization in [panel.inid.co](https://panel.inid.co) (your app, for InID). Use its test keys while developing (their addresses can be `http://localhost`), and add your app's address to the organization.

```bash
# .env.local
INID_PUBLISHABLE_KEY=pk_test_...
INID_SECRET_KEY=sk_test_...
```

## Four files

**1. The sign-in routes** — `app/api/inid/[...inid]/route.ts`

```ts
import { handlers } from "@inid/nextjs/server";

export const { GET, POST } = handlers;
```

**2. The proxy** — `proxy.ts` (on Next.js 14 or 15: `middleware.ts` with `inidMiddleware`)

```ts
import { inidProxy } from "@inid/nextjs/server";

// Keeps the session fresh, and sends whoever isn't signed in from /dashboard to sign in
export default inidProxy({ protect: ["/dashboard"] });

export const config = { matcher: ["/((?!_next/|favicon.ico).*)"] };
```

It also sends people coming back from Google to your site (when Google's screen shows your domain) straight on to InID.

**3. The provider** — `app/layout.tsx`

```tsx
import { InIDProvider, SignedIn, SignedOut, SignInButton, UserButton } from "@inid/nextjs";
import { currentUser } from "@inid/nextjs/server";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <InIDProvider user={await currentUser()} locale="en">
          <header>
            <SignedIn><UserButton /></SignedIn>
            <SignedOut><SignInButton /></SignedOut>
          </header>
          {children}
        </InIDProvider>
      </body>
    </html>
  );
}
```

**4. Who is here** — any server component, route handler or server action

```ts
import { auth } from "@inid/nextjs/server";

const { isSignedIn, user } = await auth();
// user: { id, firstName, lastName, name, email, emailVerified, phone }
```

## Components and hooks

| | |
|---|---|
| `<SignIn appName="My App" />` | The sign-in itself, in your page: phone, code, passkey and Google (which opens in the whole window). It is InID's form in a frame, so passkeys and codes never touch your app. `redirect` shows a single button to InID's page instead |
| `<SignInButton />`, `<SignOutButton />` | A button, or wrap your own: `<SignInButton><button>Sign in</button></SignInButton>` |
| `<UserButton />` | The person's initials, with a menu: manage their InID, sign out |
| `<SignedIn>`, `<SignedOut>` | Shows its children only then |
| `useUser()` | `{ isLoaded, isSignedIn, user }` |
| `useAuth()` | `{ isLoaded, isSignedIn, userId, has({ role, permission }), signIn(returnTo?), signOut(returnTo?) }` |
| `<Protect role="admin">` | Shows its children only to someone with that role or permission |

Texts in Spanish, English and Portuguese (`locale="es" | "en" | "pt"`). Your logo, colors and texts are set in the InID panel (your app → Appearance); `<SignIn appearance={{ theme: "dark", variables: { colorPrimary: "#7c3aed" } }} />` changes them for a page (see [`@inid/react`](https://www.npmjs.com/package/@inid/react#appearance)). The card's colors and corners are CSS variables on `.inid`: `--inid-primary`, `--inid-ink`, `--inid-accent`, `--inid-radius`, `--inid-font`.

## Who may sign up

In InID's panel, **Sign-in** → **Who may sign up**: anyone, or only an access list (emails or `@domains`, with a confirmed email); plus a block list that can never sign up. Also: **role by domain** (whoever signs in with `@yourcompany.com` may sign up and gets, say, the "member" role), **block disposable emails**, **always require a confirmed email**, and **only phones from certain countries**. It applies to people new to your app. Whoever is refused is told so on InID's page, and your app gets nothing.

### Entrances: other rules for other parts of your app

The rules above are the **general entrance**: the one your pages use unless they choose another (a shop's customers, say). For a part of your app with other rules, like your team's, add an **entrance** in the same place: its name, its key (`team`), the role people who come in through it get, and its own rules. Each page chooses its door:

```tsx
<SignIn entrance="team" />                       // the form in the page
<SignInButton entrance="team" />                 // or a button

// proxy.ts: whoever isn't signed in at /admin signs in through the team's entrance
inidProxy({ protect: [{ path: "/admin", role: "staff", entrance: "team" }] })
```

A **restricted** entrance (access list or waitlist) checks everyone who comes in through it, not only newcomers: in goes whoever has one of the roles it gives (its own and its domains'), an invitation, or an email its rules accept; whoever gets in without a role gets the entrance's. A customer who signed up at the shop can't come in through the team's door. Routes stay protected by role (`role` in `inidProxy`, `has()`): the entrance decides who signs up and with which role, the role decides what they can see.

## Invitations and waitlist

In **Users**, invite someone by email (with a role, if your app has roles): they get in with that email confirmed in InID even if your app is access-list only or has a waitlist. With **Waitlist** (in Who may sign up), newcomers wait until you approve them there. InID doesn't send the invitation email yet: let them know yourself. From your server, with your secret key: `GET /v1/access`, `POST /v1/invitations` (`{ "email", "role"? }`, or several at once to bring your existing users: `{ "invitations": [{ "email", "role"? }, …] }`, up to 200, answering `{ "invited", "failed" }`) and `DELETE /v1/access/{email}`.

## Roles and permissions

Define your app's roles in InID's panel (**Roles**: a key your code checks, a name, its permissions, and the role new users get) and give each person theirs in **Users**. They come signed with every sign-in, so your app stores nothing:

```ts
const { has } = await auth();
if (!has({ permission: "invoices:read" })) notFound();
```

```tsx
<Protect role="admin" fallback={<p>No access</p>}>…</Protect>
```

```ts
export default inidProxy({ protect: ["/dashboard", { path: "/admin", role: "admin" }] }); // 403 without the role
```

From your server: `PUT https://id.inid.co/v1/users/{id}/role` with your secret key and `{ "role": "admin" }` (`null` goes back to the default role). A change arrives with the next session renewal (ten minutes at most). `<Protect>` only hides: check what matters on the server.

## The person's profile

`<UserProfile />` is their page in your app: **Your account** (their InID inside your page: their data, passkeys and the apps they authorized; changing data asks for a code or their passkey) and **Sessions**. The account part is InID's own page in a frame your app can't read, and only your sites may show it. What they change reaches your app with their next session (and the `user.updated` webhook).

```tsx
// app/profile/page.tsx (protect it in proxy.ts)
export default function Profile() {
  return <UserProfile />;
}
```

## Metadata and user management

Each user can carry your app's metadata: the **public** part comes in the session (`user.publicMetadata`, on the server and in React), the **private** part only to your server (`GET /v1/users/{id}`). Edit it in InID's panel (**Users** → **View**) or with `PATCH /v1/users/{id}/metadata`. There you can also search users, block someone (`PUT /v1/users/{id}/blocked`) or take them out of your app (`DELETE /v1/users/{id}`).

## Sessions

Every sign-in is a session (its `sid` is in the token). People see theirs in `<UserButton>` → **Your sessions** (or `<UserSessions />` anywhere), the current one marked, and end the others. In InID's panel, **Users** → **Sessions** lists and ends anyone's. From your server, with your secret key: `GET /v1/users/{id}/sessions`, `DELETE /v1/users/{id}/sessions` (all) or `DELETE /v1/users/{id}/sessions/{sid}` at `https://id.inid.co`. An ended session isn't renewed: the person is out at the next renewal (ten minutes at most).

## How it works

Signing in is OpenID Connect's authorization code flow with PKCE: your server trades the code with your secret key, which never reaches the browser. The session is InID's signed ID token in an `httpOnly` cookie: your app checks it with InID's public keys, without calling InID. It lasts ten minutes; the proxy renews it with the refresh token (another `httpOnly` cookie) before it ends. Signing out revokes it at InID; the person's own InID stays signed in, as with any "Sign in with…".

Each app gets its own id for the same person: two apps can't match their users through InID.

## More

- [Guide (Spanish)](https://inid.co/docs/nextjs/) · [API](https://inid.co/docs/api/)
- Not on Next.js? [`@inid/react`](https://www.npmjs.com/package/@inid/react) has the components; your server mounts the same four routes.

MIT license.
