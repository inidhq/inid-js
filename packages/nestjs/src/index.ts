// Sign-in with InID for NestJS (Express or Fastify):
//
//   @Module({ imports: [InIDModule.forRoot({ guard: true })] })   // INID_PUBLISHABLE_KEY, INID_SECRET_KEY
//   export class AppModule {}
//
//   @Roles("admin") @Get("admin") admin(@CurrentUser() user: InIDUser) { … }
//   @Public() @Get() home() { … }
//
// The module answers InID's routes (/api/inid/…), keeps the session fresh and leaves who's
// signed in on req.inid; the guard asks for someone signed in (cookie or bearer ID token).
export { INID_OPTIONS } from "./constants.js";
export { Auth, CurrentUser, Entrance, InIDAuth, Permissions, Public, RequireInID, Roles, TeamRoles, UserId } from "./decorators.js";
export { InIDGuard } from "./guard.js";
export { InIDMiddleware } from "./middleware.js";
export { InIDModule, type InIDModuleAsyncOptions } from "./module.js";
export { InIDService, type InIDModuleOptions } from "./service.js";
export type { AccessCheck, InIDSession, InIDTeam, InIDUser, Protect, Rule } from "@inid/server";
export type { Customer, WebhookEvent } from "@inid/node";
