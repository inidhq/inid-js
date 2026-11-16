// InID for Express (and anything with Connect-style middleware):
//
//   app.use(inid({ protect: ["/dashboard", { path: "/admin", role: "admin" }] }));
//   app.get("/dashboard", (req, res) => res.send(`Hola, ${req.auth.user.name}`));
//
// It answers InID's routes (/api/inid/…), keeps the session fresh, protects the paths given,
// and leaves who's signed in on req.auth and res.locals.auth.
import type { IncomingMessage, ServerResponse } from "node:http";
import { createInID, type Auth, type GateOptions, type InIDConfig } from "./index.js";

export type { Auth } from "./index.js";

type Req = IncomingMessage & { originalUrl?: string; protocol?: string; auth?: Auth };
type Res = ServerResponse & { locals?: Record<string, unknown> };
type Next = (err?: unknown) => void;

// The request as the web sees it (InID's routes only need the URL, the method and cookies).
// Exported for other Node frameworks built on http (NestJS, Fastify's raw request).
export function webRequest(req: IncomingMessage & { originalUrl?: string; protocol?: string }, trustProxy = false): Request {
  const forwarded = trustProxy ? String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() : "";
  const proto = forwarded || req.protocol || ((req.socket as { encrypted?: boolean }).encrypted ? "https" : "http");
  const host = (trustProxy && String(req.headers["x-forwarded-host"] || "").split(",")[0].trim()) || req.headers.host || "localhost";
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const v of value) headers.append(name, v);
    else if (value !== undefined) headers.set(name, value);
  }
  return new Request(`${proto}://${host}${req.originalUrl || req.url || "/"}`, { method: req.method, headers });
}

export async function send(res: ServerResponse, response: Response) {
  res.statusCode = response.status;
  response.headers.forEach((value, name) => {
    if (name !== "set-cookie") res.setHeader(name, value);
  });
  const cookies = response.headers.getSetCookie?.() ?? [];
  if (cookies.length) res.setHeader("set-cookie", cookies);
  res.end(Buffer.from(await response.arrayBuffer()));
}

export function inid(options: Partial<InIDConfig> & GateOptions & { trustProxy?: boolean } = {}) {
  const { protect, routes, trustProxy = false, ...config } = options;
  const server = createInID(config);
  return async (req: Req, res: Res, next: Next) => {
    try {
      const gate = await server.gate(webRequest(req, trustProxy), { protect, routes });
      if (gate.response) return await send(res, gate.response);
      if (gate.setCookies.length) res.setHeader("set-cookie", gate.setCookies);
      // This same request already sees the renewed session
      if (gate.cookieHeader !== undefined) req.headers.cookie = gate.cookieHeader;
      req.auth = gate.auth;
      if (res.locals) res.locals.auth = gate.auth;
      next();
    } catch (err) {
      next(err);
    }
  };
}
