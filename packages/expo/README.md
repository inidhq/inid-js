# @inid/expo

Sign-in with [InID](https://inid.co) for React Native and Expo: `<InIDProvider>`, `useInID()`, `<SignInButton />` and friends. People sign in with Face ID, their fingerprint or a code to their phone — no passwords.

Your app is a **public client** (RFC 8252): it holds only your publishable key, never a secret. Signing in opens InID in the system's secure browser (ASWebAuthenticationSession on iOS, Chrome Custom Tabs on Android — never a WebView) with PKCE, comes back to your app's own scheme, and keeps the tokens in the Keychain / Keystore.

```bash
npx expo install @inid/expo expo-auth-session expo-web-browser expo-secure-store expo-crypto
```

## Setup

1. **Your app's scheme**, in `app.json` (then rebuild the app: a scheme is native configuration):

   ```json
   { "expo": { "scheme": "nube" } }
   ```

2. **Register it in InID's panel** as an allowed origin of your app, written `nube://`. InID sends people back to `nube://callback` (any path under that scheme works). While developing in Expo Go the redirect is `exp://…/--/callback`; a development build uses your own scheme.

3. **The provider**, once, near the top:

   ```tsx
   import { InIDProvider, SignedIn, SignedOut, SignInButton, UserButton } from "@inid/expo";

   export default function App() {
     return (
       <InIDProvider publishableKey="pk_live_…" locale="es">
         <SignedOut><SignInButton /></SignedOut>
         <SignedIn><UserButton /></SignedIn>
       </InIDProvider>
     );
   }
   ```

| `<InIDProvider>` prop | |
|---|---|
| `publishableKey` | From InID's panel (`pk_test_…` / `pk_live_…`). Required |
| `issuer` | `https://id.inid.co` |
| `redirectUri` | `makeRedirectUri({ path: "callback" })` from `expo-auth-session` (`nube://callback` in a build with `"scheme": "nube"`) |
| `scope` | `openid profile email phone` |
| `locale` | `es` (default), `en` or `pt`: the components' texts and InID's page |

On start the provider restores the session from secure storage. The ID token lasts minutes; the provider renews it with the refresh token 60 seconds before it ends and whenever the app comes back to the foreground.

## Hooks

```tsx
import { has, useInID, useUser } from "@inid/expo";

const { isLoaded, isSignedIn, user, signIn, signOut, getToken } = useInID();

await signIn();                                  // the user, or null if the person closed InID's page
await signIn({ entrance: "team", loginHint: "+56911112222" });
await signOut();                                 // revokes at InID, forgets it here, asks again next time

const { user } = useUser();
has(user, { role: "admin" });                    // also { permission: "invoices:read" }, or both
```

`user` is `{ id, firstName, lastName, name, email, emailVerified, phone, roles, permissions, publicMetadata }` — the same shape as every InID SDK.

`signIn()` throws an `InIDError` when InID answers with an error or the answer doesn't check (state, nonce, signature).

## Components

| | |
|---|---|
| `<SignInButton entrance? loginHint? onSignedIn? onError?>` | InID's black button, "Continuar con InID" in the provider's language (or your own label as its child) |
| `<SignOutButton onSignedOut?>` | Signs out |
| `<UserButton showName? onPress?>` | The person's initials and name; `onPress` opens your own menu |
| `<SignedIn>`, `<SignedOut>` | Shows its children only then |
| `<Protect role? permission? fallback?>` | Shows its children only to someone with that role or permission (it hides; your backend still checks) |

## Calling your backend

`getToken()` returns a fresh ID token (renewed if it was about to end), or `null` when nobody is signed in. Send it as a bearer:

```ts
const { getToken } = useInID();

const res = await fetch("https://api.nube.app/invoices", {
  headers: { Authorization: `Bearer ${await getToken()}` },
});
```

Your backend checks it with InID's public keys — the same verification as a session, with `aud` equal to your publishable key. The InID server SDKs have a helper for bearer tokens; with `@inid/server`:

```ts
import { createInID } from "@inid/server";

const inid = createInID(); // INID_PUBLISHABLE_KEY, INID_SECRET_KEY

const auth = await inid.bearer(request); // Authorization: Bearer <the ID token>
if (!auth.isSignedIn) return new Response("Unauthorized", { status: 401 });
auth.user;                    // who is calling
auth.has({ role: "admin" });  // their role in your app
```

Other languages: the PHP, Python, Go, Ruby, Java and .NET SDKs have the same helper.

## How it works

- **Sign-in**: `{issuer}/oauth/authorize` with `client_id`, `redirect_uri`, `response_type=code`, `scope`, `state`, `nonce`, PKCE S256 (`expo-crypto` for the hash and random bytes), `ui_locales`, plus `prompt=login` after a sign-out. The code is traded at `/oauth/token` with `client_id` and `code_verifier` and **no Authorization header**.
- **ID token**: RS256 only, its key from InID's JWKS (`/.well-known/jwks.json`, kept an hour), the signature checked in plain TypeScript (React Native has no WebCrypto), and `iss`, `aud`, `exp` and the flow's `nonce`. A token restored from secure storage was checked when it arrived; on start only its claims are checked again.
- **Renewal**: `grant_type=refresh_token` with `client_id`. If InID says no (4xx) the session is over and the tokens are deleted; if InID can't be reached, a token that hasn't ended stays.
- **Sign-out**: `/oauth/revoke` with the refresh token and `client_id`, the stored tokens deleted, and `prompt=login` on the next sign-in.
- Without React, `createInIDClient(options, expoDeps)` does the same; its state is `getState()` / `subscribe()`.

MIT license.
