import type { IncomingMessage } from "node:http";
import type { Auth } from "@inid/server";

// The module's options, for whoever needs them (the service, the middleware)
export const INID_OPTIONS = Symbol.for("@inid/nestjs:options");

// Metadata the decorators leave for the guard
export const PUBLIC_KEY = "inid:public";
export const REQUIRED_KEY = "inid:required";
export const ROLES_KEY = "inid:roles";
export const PERMISSIONS_KEY = "inid:permissions";
export const TEAM_ROLES_KEY = "inid:team-roles";
export const ENTRANCE_KEY = "inid:entrance";

// Node's request as the middleware sees it (Express's, or Fastify's raw one)
export type NodeRequest = IncomingMessage & { inid?: Auth; originalUrl?: string; protocol?: string };

// Express hands Nest the Node request itself; Fastify wraps it (request.raw)
export function rawRequest(req: unknown): NodeRequest {
  const r = req as NodeRequest & { raw?: NodeRequest };
  return r.raw ?? r;
}
