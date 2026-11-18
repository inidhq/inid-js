import { NextResponse, type NextRequest } from "next/server.js";
import { authOf, configFromEnv, createInIDAuth, gate, type Auth, type InIDAuth, type InIDConfig, type InIDUser, type Protect } from "@inid/server";

// InID for a Next.js app's server:
//
//   proxy.ts                         export default inidProxy({ protect: ["/dashboard"] })
//   app/api/inid/[...inid]/route.ts  export const { GET, POST } = handlers
//   anywhere on the server           const { user } = await auth()
//
// The keys come from INID_PUBLISHABLE_KEY and INID_SECRET_KEY (or setup({ ... }) first).

export { InIDAuthError, hasAccess, type AccessCheck, type Auth, type InIDConfig, type InIDSession, type InIDTeam, type InIDUser, type Protect, type Rule } from "@inid/server";

let instance: InIDAuth | null = null;
const inid = () => (instance ??= createInIDAuth(configFromEnv()));

// Only when the keys don't come from the environment: call it once, before anything else
export function setup(config: Partial<InIDConfig>) {
  instance = createInIDAuth(configFromEnv(config));
}

// The routes that sign in and out (mounted at app/api/inid/[...inid]/route.ts)
export const handlers = {
  GET: (request: Request) => inid().handle(request),
  POST: (request: Request) => inid().handle(request),
};

// Runs before every page: keeps the session fresh (a session about to end is renewed here,
// where cookies can be set) and sends whoever isn't signed in away from the protected paths.
// protect: ["/dashboard", { path: "/admin", role: "admin", entrance: "team" }]
export function inidProxy(options: { protect?: Protect | ((request: NextRequest) => boolean) } = {}) {
  return async (request: NextRequest) => {
    const checked = await gate(inid(), request, { protect: options.protect as Protect | undefined, routes: false });
    if (checked.response) return checked.response;
    let response: NextResponse;
    if (checked.cookieHeader !== undefined) {
      // This same request already sees the renewed session
      const headers = new Headers(request.headers);
      headers.set("cookie", checked.cookieHeader);
      response = NextResponse.next({ request: { headers } });
    } else {
      response = NextResponse.next();
    }
    for (const c of checked.setCookies) response.headers.append("set-cookie", c);
    return response;
  };
}
// The same, under the name Next.js 14 and 15 use (middleware.ts)
export const inidMiddleware = inidProxy;

// Who is signed in, in server components, route handlers and server actions. It reads the
// session; the proxy is what renews it.
export async function auth(): Promise<Auth> {
  const { cookies } = await import("next/headers.js");
  const jar = await cookies();
  const header = jar
    .getAll()
    .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join("; ");
  return authOf((await inid().session(header)).session);
}

// The same, from a request (route handlers that receive one)
export async function getAuth(request: Request): Promise<Auth> {
  return authOf((await inid().session(request.headers.get("cookie"))).session);
}

export async function currentUser(): Promise<InIDUser | null> {
  return (await auth()).user;
}

