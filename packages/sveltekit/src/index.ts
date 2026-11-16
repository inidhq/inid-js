// InID for SvelteKit:
//
//   // src/hooks.server.ts
//   import { inid } from "@inid/sveltekit";
//   export const handle = inid({ protect: ["/dashboard", { path: "/admin", role: "admin" }] });
//   // (with other hooks: sequence(inid(…), yours) from @sveltejs/kit/hooks)
//
//   // +page.server.ts, +layout.server.ts, +server.ts
//   export const load = ({ locals }) => ({ user: locals.inid.user });
//
// The hook answers InID's routes (/api/inid/…), keeps the session fresh, sends whoever isn't
// signed in away from the protected paths and leaves who's signed in on event.locals.inid.
// The components are @inid/js's: <script>import "@inid/js";</script> <inid-sign-in />
import { createInID, type Auth, type GateOptions, type InIDConfig } from "@inid/server";

export { hasAccess, type AccessCheck, type Auth, type InIDUser, type Protect, type Rule } from "@inid/server";

// What SvelteKit gives a handle hook (only what this one uses)
interface Event {
  request: Request;
  locals: Record<string, unknown>;
}

export function inid(options: Partial<InIDConfig> & GateOptions = {}) {
  const { protect, routes, ...config } = options;
  let server: ReturnType<typeof createInID> | null = null;
  return async ({ event, resolve }: { event: Event; resolve: (event: Event) => Response | Promise<Response> }) => {
    server ??= createInID(config);
    const gate = await server.gate(event.request, { protect, routes });
    if (gate.response) return gate.response;
    event.locals.inid = gate.auth;
    const response = await resolve(event);
    if (!gate.setCookies.length) return response;
    // A renewed session goes back with the page (a copy: some responses' headers are frozen)
    const sent = new Response(response.body, response);
    for (const c of gate.setCookies) sent.headers.append("set-cookie", c);
    return sent;
  };
}
