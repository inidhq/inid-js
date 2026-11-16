import { applyDecorators, createParamDecorator, SetMetadata, UseGuards, type ExecutionContext } from "@nestjs/common";
import { authOf, type Auth as ServerAuth, type InIDUser } from "@inid/server";
import { ENTRANCE_KEY, PERMISSIONS_KEY, PUBLIC_KEY, REQUIRED_KEY, ROLES_KEY, rawRequest } from "./constants.js";
import { InIDGuard, requestOf } from "./guard.js";

// Who is signed in (isSignedIn, userId, user, session, has()); a type and a decorator
export type Auth = ServerAuth;

// Open to anyone, when the guard is on every route (guard: true)
export const Public = () => SetMetadata(PUBLIC_KEY, true);

// Someone signed in. These put the guard on the route themselves, so they work without
// guard: true (with it, it just runs once more, from what it already found).
export const RequireInID = () => applyDecorators(SetMetadata(REQUIRED_KEY, true), UseGuards(InIDGuard));
export const Auth = RequireInID;

// Any of these roles
export const Roles = (...roles: string[]) => applyDecorators(SetMetadata(ROLES_KEY, roles), UseGuards(InIDGuard));

// All of these permissions (the class's and the method's)
export const Permissions = (...permissions: string[]) => applyDecorators(SetMetadata(PERMISSIONS_KEY, permissions), UseGuards(InIDGuard));

// The entrance someone signs in through when the route turns them away (in the 401's signInUrl)
export const Entrance = (entrance: string) => SetMetadata(ENTRANCE_KEY, entrance);

const authIn = (context: ExecutionContext): Auth => {
  const req = requestOf(context);
  return (req ? rawRequest(req).inid : undefined) ?? authOf(null);
};

// The signed-in person (InIDUser), or one of their fields: @CurrentUser("email")
export const CurrentUser = createParamDecorator((field: keyof InIDUser | undefined, context: ExecutionContext) => {
  const user = authIn(context).user;
  return field ? (user?.[field] ?? null) : user;
});

// The whole auth object: @InIDAuth() auth: Auth
export const InIDAuth = createParamDecorator((_: unknown, context: ExecutionContext) => authIn(context));

// The signed-in person's id at this app
export const UserId = createParamDecorator((_: unknown, context: ExecutionContext) => authIn(context).userId);
