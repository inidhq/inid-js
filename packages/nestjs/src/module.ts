import { Global, Module, RequestMethod, type CanActivate, type DynamicModule, type MiddlewareConsumer, type ModuleMetadata, type NestModule, type Provider } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { INID_OPTIONS } from "./constants.js";
import { InIDGuard } from "./guard.js";
import { InIDMiddleware } from "./middleware.js";
import { InIDService, type InIDModuleOptions } from "./service.js";

export interface InIDModuleAsyncOptions extends Pick<ModuleMetadata, "imports"> {
  inject?: any[];
  useFactory: (...args: any[]) => InIDModuleOptions | Promise<InIDModuleOptions>;
}

// Every route, in the syntax of the Nest at hand: Nest 11 (path-to-regexp 8) names its
// wildcards, Nest 10 doesn't know that syntax. Nest 11 is also the one with WebDAV methods.
const ALL_ROUTES = "PROPFIND" in RequestMethod ? "{*splat}" : "*";

// guard: true is read at startup, so forRootAsync can set it too
const open: CanActivate = { canActivate: () => true };

function definition(options: Provider, imports: ModuleMetadata["imports"] = []): DynamicModule {
  return {
    module: InIDModule,
    global: true,
    imports,
    providers: [
      options,
      InIDService,
      InIDGuard,
      InIDMiddleware,
      { provide: APP_GUARD, useFactory: (o: InIDModuleOptions, guard: InIDGuard) => (o.guard ? guard : open), inject: [INID_OPTIONS, InIDGuard] },
    ],
    exports: [INID_OPTIONS, InIDService, InIDGuard],
  };
}

@Global()
@Module({})
export class InIDModule implements NestModule {
  // Keys from the environment (INID_PUBLISHABLE_KEY, INID_SECRET_KEY…) unless given
  static forRoot(options: InIDModuleOptions = {}): DynamicModule {
    return definition({ provide: INID_OPTIONS, useValue: options });
  }

  // Options from other providers (ConfigService…)
  static forRootAsync({ imports, inject = [], useFactory }: InIDModuleAsyncOptions): DynamicModule {
    return definition({ provide: INID_OPTIONS, useFactory, inject }, imports);
  }

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(InIDMiddleware).forRoutes({ path: ALL_ROUTES, method: RequestMethod.ALL });
  }
}
