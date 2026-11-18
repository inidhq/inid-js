import { ForbiddenException, Inject, Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Auth } from "@inid/server";
import { ENTRANCE_KEY, PERMISSIONS_KEY, PUBLIC_KEY, REQUIRED_KEY, ROLES_KEY, TEAM_ROLES_KEY, rawRequest } from "./constants.js";
import { InIDService } from "./service.js";

// The request behind a route: HTTP's, or the one GraphQL resolvers get in their context
export function requestOf(context: ExecutionContext): unknown {
  if (context.getType() === "http") return context.switchToHttp().getRequest();
  const gql = context.getArgByIndex(2) as { req?: unknown; request?: unknown } | undefined;
  return gql?.req ?? gql?.request;
}

// Someone signed in (from the session cookie or a bearer ID token), with the roles and
// permissions the route asks for. On every route with guard: true, or where a decorator puts it.
@Injectable()
export class InIDGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(InIDService) private readonly inid: InIDService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler();
    const targets = [handler, context.getClass()];
    if (this.isPublic(context)) return true;
    const req = requestOf(context);
    const auth = req ? await this.authOf(req) : null;
    if (!auth?.isSignedIn) {
      const entrance = this.reflector.getAllAndOverride<string | undefined>(ENTRANCE_KEY, targets);
      throw new UnauthorizedException({ statusCode: 401, error: "Unauthorized", message: "Sign in with InID", signInUrl: req ? this.signInUrl(req, entrance) : undefined });
    }
    // The method's roles replace the class's (any of them will do); permissions add up (all needed)
    const roles = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, targets) ?? [];
    if (roles.length && !roles.some((role) => auth.has({ role }))) throw new ForbiddenException({ statusCode: 403, error: "Forbidden", message: "Missing role", roles });
    // A role in the person's active team, the same way (any of them)
    const teamRoles = this.reflector.getAllAndOverride<string[] | undefined>(TEAM_ROLES_KEY, targets) ?? [];
    if (teamRoles.length && !teamRoles.some((teamRole) => auth.has({ teamRole }))) throw new ForbiddenException({ statusCode: 403, error: "Forbidden", message: "Missing team role", teamRoles });
    const permissions = this.reflector.getAllAndMerge<string[]>(PERMISSIONS_KEY, targets) ?? [];
    const missing = permissions.filter((permission) => !auth.has({ permission }));
    if (missing.length) throw new ForbiddenException({ statusCode: 403, error: "Forbidden", message: "Missing permission", permissions: missing });
    return true;
  }

  // @Public() on the method, or on the class unless the method asks for something itself
  private isPublic(context: ExecutionContext) {
    const handler = context.getHandler();
    const onHandler = this.reflector.get<boolean | undefined>(PUBLIC_KEY, handler);
    if (onHandler !== undefined) return onHandler;
    if (!this.reflector.get<boolean | undefined>(PUBLIC_KEY, context.getClass())) return false;
    return ![REQUIRED_KEY, ROLES_KEY, TEAM_ROLES_KEY, PERMISSIONS_KEY].some((key) => this.reflector.get(key, handler) !== undefined);
  }

  // The session the middleware found, else a bearer token; kept on the request for the
  // param decorators (and for a second guard on the same route)
  private async authOf(req: unknown): Promise<Auth> {
    const raw = rawRequest(req);
    let auth = await this.inid.auth(req);
    if (!auth.isSignedIn && raw.headers.authorization) auth = await this.inid.bearer(raw);
    raw.inid = auth;
    if (req !== raw) (req as { inid?: Auth }).inid = auth;
    return auth;
  }

  private signInUrl(req: unknown, entrance?: string) {
    const raw = rawRequest(req);
    const query = new URLSearchParams();
    if (raw.method === "GET") query.set("return_to", raw.originalUrl || raw.url || "/");
    if (entrance) query.set("entrance", entrance);
    const q = query.toString();
    return `${this.inid.server.config.apiPath}/signin${q ? `?${q}` : ""}`;
  }
}
