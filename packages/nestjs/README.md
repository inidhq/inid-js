# @inid/nestjs

Sign-in with [InID](https://inid.co) for NestJS (Express or Fastify). People sign in with their phone (a code by WhatsApp or SMS), a passkey (Face ID, fingerprint, Windows Hello or the device PIN) or Google, without passwords. Your controllers know who they are, their roles and their permissions, from the session cookie of your web app or from the ID token your mobile app sends.

```bash
npm install @inid/nestjs
```

Your keys from InID's panel (Settings → Keys), in `.env`:

```bash
INID_PUBLISHABLE_KEY=pk_test_...
INID_SECRET_KEY=sk_test_...
INID_WEBHOOK_SECRET=whsec_...   # only for webhooks
```

In InID's panel, add your app's address to the allowed origins (e.g. `http://localhost:3000`).

## The module

```ts
// app.module.ts
import { Module } from "@nestjs/common";
import { InIDModule } from "@inid/nestjs";

@Module({
  imports: [InIDModule.forRoot({ guard: true })],
})
export class AppModule {}
```

The module is global. On every route, its middleware answers InID's routes (`/api/inid/signin`, `callback`, `signout`, `session`, `sessions`), keeps the session fresh (a renewed session's cookies go out with your response, and the rest of the request already sees them), applies your `protect` rules, and leaves who's signed in on `req.inid`.

With options from other providers:

```ts
InIDModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    publishableKey: config.get("INID_PUBLISHABLE_KEY"),
    secretKey: config.get("INID_SECRET_KEY"),
    guard: true,
  }),
});
```

## The guard

`guard: true` puts `InIDGuard` on every route (as `APP_GUARD`): every route needs someone signed in unless it says `@Public()`.

```ts
import { Controller, Get } from "@nestjs/common";
import { CurrentUser, Public, Roles, type InIDUser } from "@inid/nestjs";

@Controller()
export class AppController {
  @Public()
  @Get()
  home() {
    return "Hola";
  }

  @Get("me")
  me(@CurrentUser() user: InIDUser) {
    return user;
  }

  @Roles("admin")
  @Get("admin")
  admin() {
    return "Only admins";
  }
}
```

Without `guard: true`, routes are open, and the decorators below put the guard on the routes they mark themselves (`@UseGuards(InIDGuard)` works too):

| Decorator | The route needs |
| --- | --- |
| `@Public()` | nothing (with `guard: true`) |
| `@RequireInID()` or `@Auth()` | someone signed in |
| `@Roles("admin", "owner")` | any of these roles |
| `@Permissions("invoices:read", "invoices:write")` | all of these permissions |
| `@Entrance("team")` | (nothing more) the entrance the 401 tells them to sign in through |

They go on a method or on a controller. A method's `@Roles` replaces its controller's; `@Permissions` add up (the controller's and the method's, all needed). A `@Public()` controller's methods can still ask for something with `@RequireInID()`, `@Roles` or `@Permissions`.

```ts
@Controller("invoices")
@Permissions("invoices:read")
export class InvoicesController {
  @Get()
  list() { … }                         // invoices:read

  @Permissions("invoices:write")
  @Post()
  create() { … }                       // invoices:read and invoices:write
}
```

Nobody signed in: **401**, with where to sign in:

```json
{ "statusCode": 401, "error": "Unauthorized", "message": "Sign in with InID", "signInUrl": "/api/inid/signin?return_to=%2Fme" }
```

Signed in without the role or permission: **403**. For pages a browser opens, `protect` rules (below) send people to sign in and back instead.

## Who's signed in

```ts
import { CurrentUser, InIDAuth, UserId, type Auth, type InIDUser } from "@inid/nestjs";

@Get("profile")
profile(
  @CurrentUser() user: InIDUser,          // id, name, firstName, lastName, email, phone, roles, permissions, publicMetadata
  @CurrentUser("email") email: string,    // one field
  @UserId() userId: string,               // the person's id at this app
  @InIDAuth() auth: Auth,                 // isSignedIn, userId, user, session, has()
) {
  if (auth.has({ permission: "reports:read" })) { … }
}
```

On a `@Public()` route they're `null` (or `isSignedIn: false`) for whoever isn't signed in. In a service, `InIDService.auth(req)` gives the same object.

## Protect rules

For pages and paths, before any controller runs:

```ts
InIDModule.forRoot({
  protect: ["/dashboard", { path: "/admin", role: "admin" }, { path: /^\/reports/, permission: "reports:read" }],
});
```

A path (and its subpaths), a `RegExp`, or `{ path, role?, permission?, entrance? }`. Whoever isn't signed in goes to sign in and comes back; someone signed in without the role or permission gets a 403. `entrance` is a door of your app with its own sign-up rules (InID's panel: Sign-in → Entrances).

## Mobile apps and SPAs: bearer tokens

The guard also accepts InID's ID token as `Authorization: Bearer <token>`, checked with InID's public keys (signed by InID, for your publishable key, not ended). That's what [`@inid/expo`](https://www.npmjs.com/package/@inid/expo) and [`inid_flutter`](https://pub.dev/packages/inid_flutter) send with `getToken()`:

```ts
// React Native (@inid/expo)
const { getToken } = useInID();
await fetch("https://api.example.com/invoices", { headers: { Authorization: `Bearer ${await getToken()}` } });
```

Your controllers don't change: `@CurrentUser()`, `@Roles` and `@Permissions` work the same for a cookie or a bearer token. Elsewhere: `InIDService.bearer(req)` (or `bearer(token)`).

## Webhooks

InID signs its webhooks (`inid-signature`) over the body exactly as it was sent, so ask Nest to keep it:

```ts
// main.ts
const app = await NestFactory.create(AppModule, { rawBody: true });
```

```ts
import { Controller, Inject, Post, Req, type RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { InIDService, Public } from "@inid/nestjs";

@Controller("webhooks")
export class WebhooksController {
  constructor(@Inject(InIDService) private readonly inid: InIDService) {}

  @Public()
  @Post("inid")
  receive(@Req() req: RawBodyRequest<Request>) {
    const event = this.inid.verifyWebhook(req.rawBody, req.headers["inid-signature"]); // 400 if forged or stale
    if (event.type === "user.deleted") { … }
    return { ok: true };
  }
}
```

`webhookSecret` comes from `INID_WEBHOOK_SECRET` unless given. `InIDService.exchange(token)` trades a one-time token (from a webhook or the pixel) for the person's data, with [`@inid/node`](https://www.npmjs.com/package/@inid/node).

## The sign-in form and the rest

Web components from [`@inid/js`](https://www.npmjs.com/package/@inid/js) (any page your app serves), or React components from [`@inid/react`](https://www.npmjs.com/package/@inid/react). They talk to the module's routes under `/api/inid`:

```html
<script type="module">import "@inid/js";</script>
<inid-sign-in app-name="Mi App" return-to="/dashboard"></inid-sign-in>
<inid-user-button></inid-user-button>
```

## Fastify

The same module works with `@nestjs/platform-fastify`: Nest hands the middleware Node's own request and response, and the guard and decorators read Fastify's `request.raw`. For webhooks, `NestFactory.create(AppModule, new FastifyAdapter(), { rawBody: true })` and `@Req() req: RawBodyRequest<FastifyRequest>`.

## Options

`InIDModule.forRoot({ publishableKey, secretKey, issuer, appUrl, apiPath, webhookSecret, protect, trustProxy, guard })` — the keys are optional when set in the environment (`INID_PUBLISHABLE_KEY`, `INID_SECRET_KEY`, `INID_ISSUER`, `INID_APP_URL`, `INID_WEBHOOK_SECRET`).

- `apiPath` (default `/api/inid`): where InID's routes live. With `app.setGlobalPrefix("v1")`, Nest runs middleware only under the prefix: use `apiPath: "/v1/inid"` (and `api-path="/v1/inid"` on the components).
- `trustProxy`: behind a proxy, the scheme and host from `X-Forwarded-Proto` and `X-Forwarded-Host` (or set `appUrl`).
- `guard`: `InIDGuard` on every route.

`InIDService.server` is the [`@inid/server`](https://www.npmjs.com/package/@inid/server) instance, for anything else.

Your app's classes are injected as usual. If your build doesn't emit decorator metadata (esbuild, Vitest), inject with `@Inject(InIDService)`.

Works with NestJS 10, 11 and later. Docs: https://inid.co/docs/frameworks/ · MIT
