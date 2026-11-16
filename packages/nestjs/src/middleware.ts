import type { ServerResponse } from "node:http";
import { Inject, Injectable, type NestMiddleware } from "@nestjs/common";
import { send, webRequest } from "@inid/server/express";
import { INID_OPTIONS, type NodeRequest } from "./constants.js";
import { InIDService, type InIDModuleOptions } from "./service.js";

// On every route: InID's routes (apiPath/…), a fresh session, the protect rules, and
// req.inid. Nest hands middleware Node's request and response, on Express and on Fastify.
@Injectable()
export class InIDMiddleware implements NestMiddleware {
  constructor(
    @Inject(InIDService) private readonly inid: InIDService,
    @Inject(INID_OPTIONS) private readonly options: InIDModuleOptions,
  ) {}

  async use(req: NodeRequest, res: ServerResponse, next: (err?: unknown) => void) {
    try {
      const gate = await this.inid.server.gate(webRequest(req, this.options.trustProxy), { protect: this.options.protect });
      if (gate.response) return await send(res, gate.response);
      if (gate.setCookies.length) {
        // Added to whatever cookies the response already carries
        const before = res.getHeader("set-cookie");
        res.setHeader("set-cookie", [...(Array.isArray(before) ? before : before ? [String(before)] : []), ...gate.setCookies]);
      }
      // The rest of this request already sees the renewed session
      if (gate.cookieHeader !== undefined) req.headers.cookie = gate.cookieHeader;
      req.inid = gate.auth;
      next();
    } catch (err) {
      next(err);
    }
  }
}
