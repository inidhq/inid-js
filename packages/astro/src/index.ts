// InID for Astro (on-demand pages: output "server", or prerender = false on the page):
//
//   // src/middleware.ts
//   import { inid } from "@inid/astro";
//   export const onRequest = inid({ protect: ["/dashboard", { path: "/admin", role: "admin" }] });
//
//   // any page or endpoint
//   const { user, has } = Astro.locals.inid;
//
// The middleware answers InID's routes (/api/inid/…), keeps the session fresh, sends whoever
// isn't signed in away from the protected paths and leaves who's signed in on locals.inid.
// The components are @inid/js's: <script>import "@inid/js";</script> <inid-sign-in></inid-sign-in>
import { createInID, type Auth, type GateOptions, type InIDConfig } from "@inid/server";

export { hasAccess, type AccessCheck, type Auth, type InIDUser, type Protect, type Rule } from "@inid/server";

// What Astro gives a middleware (only what this one uses)
interface Context {
  request: Request;
  locals: Record<string, unknown>;
  isPrerendered?: boolean;
}

export function inid(options: Partial<InIDConfig> & GateOptions = {}) {
  const { protect, routes, ...config } = options;
  let server: ReturnType<typeof createInID> | null = null;
  return async (context: Context, next: () => Promise<Response>) => {
    // A page built ahead of time has no visitor: nothing to check
    if (context.isPrerendered) {
      context.locals.inid = signedOut;
      return next();
    }
    server ??= createInID(config);
    const gate = await server.gate(context.request, { protect, routes });
    if (gate.response) return gate.response;
    context.locals.inid = gate.auth;
    const response = await next();
    if (!gate.setCookies.length) return response;
    // A renewed session goes back with the page (a copy: some responses' headers are frozen)
    const sent = new Response(response.body, response);
    for (const c of gate.setCookies) sent.headers.append("set-cookie", c);
    return sent;
  };
}

const signedOut: Auth = { isSignedIn: false, userId: null, user: null, session: null, has: () => false };

// Who is signed in, from a page or an endpoint: auth(Astro) or auth(context)
export function auth(context: { locals: Record<string, unknown> }): Auth {
  return (context.locals.inid as Auth | undefined) ?? signedOut;
}
