# InID for JavaScript

Sign-in with [InID](https://inid.co): people sign in with their phone (a code by WhatsApp or SMS), Face ID, their fingerprint or Google, without passwords, in a form that lives inside your page. Your app knows who they are, their role and their permissions.

| Package | For |
|---|---|
| [`@inid/nextjs`](packages/nextjs) | Next.js: the proxy, `auth()`, the React components |
| [`@inid/react`](packages/react) | React: `<SignIn />`, `<UserProfile />`, `<Protect>`, hooks |
| [`@inid/astro`](packages/astro) | Astro: a middleware and `Astro.locals.inid` |
| [`@inid/sveltekit`](packages/sveltekit) | SvelteKit: a `handle` hook and `event.locals.inid` |
| [`@inid/server`](packages/server) | Any server with web Requests (Remix, React Router, Hono, Nuxt, Bun, Deno) and Express |
| [`@inid/js`](packages/js) | Web components for any framework or plain HTML |
| [`@inid/expo`](packages/expo) | React Native and Expo apps |
| [`@inid/node`](packages/node) | InID's API from Node: tokens, webhooks, the app API |

Docs: https://inid.co/docs/ · Other languages: [PHP](https://github.com/inidhq/inid-php), [Python](https://github.com/inidhq/inid-python), [Go](https://github.com/inidhq/inid-go), [Ruby](https://github.com/inidhq/inid-ruby), [Java](https://github.com/inidhq/inid-java), [.NET](https://github.com/inidhq/inid-dotnet), [Flutter](https://github.com/inidhq/inid-flutter), [WordPress](https://github.com/inidhq/inid-wordpress).

## Developing

```bash
pnpm install
pnpm check   # lint, types, tests
pnpm build
```

Every change on `main` that passes the tests is released: all packages share one version, tagged `vX.Y.Z`, and published to npm with provenance.

MIT
