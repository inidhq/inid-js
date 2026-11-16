# @inid/node

InID for an organization's Node.js server (Node 18+). No dependencies: it only uses `fetch` and `node:crypto`. TypeScript types included.

[InID](https://inid.co) signs your buyers up in one tap: they save their details once, and at your organization the form fills itself. This library is your server's side of it.

```bash
npm install @inid/node
```

```js
import { createInID, InIDError } from "@inid/node";

const inid = createInID({
  secretKey: process.env.INID_SECRET_KEY,         // sk_live_...
  webhookSecret: process.env.INID_WEBHOOK_SECRET, // whsec_... (for webhooks)
});

// A token from the pixel or from a webhook, for the data the buyer authorized. It works once.
const customer = await inid.exchange(token);

// The webhook exactly as it arrived (before parsing the JSON) and its header. Throws if it isn't InID's.
const event = inid.verifyWebhook(rawBody, req.headers["inid-signature"]);

// Invite a customer you already have to save their details in InID.
const { url, token: invite } = await inid.invite({ phone: "+573001234567", profile: { firstName: "Ana" } });
```

Errors are `InIDError`, with a `code` (`invalid_token`, `invalid_secret_key`, `invalid_signature`…) and an HTTP `status`.

## Server key

So that a leaked secret key is useless, tie it to a key that never leaves your server. From then on InID refuses the secret key unless the request is signed by that key.

```js
import { createInID, generateServerKey } from "@inid/node";

const serverKey = generateServerKey();   // once; keep it where you keep your secrets
const inid = createInID({ secretKey: process.env.INID_SECRET_KEY, serverKey });
await inid.tieServerKey();                // once
```

With `serverKey`, every request carries its own proof (a DPoP proof, RFC 9449). For other requests to InID with your secret key, `inid.headers(method, url)` returns the headers to send.

## Documentation

The guides are in Spanish for now:

- [Node.js library](https://inid.co/docs/node-library/)
- [API](https://inid.co/docs/api/) · [Webhooks](https://inid.co/docs/webhooks/) · [Keys](https://inid.co/docs/keys-and-billing/)

MIT license. Using InID needs an organization account and its keys: [panel.inid.co](https://panel.inid.co).
