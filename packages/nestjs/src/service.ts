import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { createInID as createNodeInID, InIDError, type Customer, type InID as NodeInID, type WebhookEvent } from "@inid/node";
import { authOf, createInID, type Auth, type InID, type InIDConfig, type Protect } from "@inid/server";
import { webRequest } from "@inid/server/express";
import { INID_OPTIONS, rawRequest } from "./constants.js";

export interface InIDModuleOptions extends Partial<InIDConfig> {
  // Signs InID's webhooks (INID_WEBHOOK_SECRET unless given)
  webhookSecret?: string;
  // Paths that need someone signed in (and a role or permission), as in @inid/server
  protect?: Protect;
  // Behind a proxy: the scheme and host from X-Forwarded-Proto and X-Forwarded-Host
  trustProxy?: boolean;
  // The guard on every route (APP_GUARD); @Public() opens one
  guard?: boolean;
}

@Injectable()
export class InIDService {
  // @inid/server's InID, for anything this service doesn't wrap
  readonly server: InID;
  private readonly webhookSecret?: string;
  private node?: NodeInID;

  constructor(@Inject(INID_OPTIONS) private readonly options: InIDModuleOptions) {
    const { protect: _p, trustProxy: _t, guard: _g, webhookSecret, ...config } = options;
    this.server = createInID(config);
    this.webhookSecret = webhookSecret ?? process.env.INID_WEBHOOK_SECRET;
  }

  // Who's signed in: what the middleware (or the guard) left on the request, else its session
  async auth(req: unknown): Promise<Auth> {
    const raw = rawRequest(req);
    return raw.inid ?? this.server.auth(webRequest(raw, this.options.trustProxy));
  }

  // Who's calling from a native app or a SPA: an InID ID token in Authorization: Bearer
  bearer(from: unknown): Promise<Auth> {
    if (typeof from === "string") return this.server.bearer(from);
    const token = /^Bearer\s+(\S+)$/i.exec(rawRequest(from).headers.authorization || "")?.[1];
    return token ? this.server.bearer(token) : Promise.resolve(authOf(null));
  }

  // An InID webhook, checked: the body exactly as it came (Nest's rawBody: true) and its
  // inid-signature header. A forged or stale one is a 400.
  verifyWebhook(rawBody: string | Buffer | undefined, signature: string | string[] | undefined): WebhookEvent {
    if (rawBody === undefined) throw new Error("@inid/nestjs: no raw body; create the app with NestFactory.create(AppModule, { rawBody: true }) and pass req.rawBody");
    try {
      return this.nodeClient().verifyWebhook(rawBody, Array.isArray(signature) ? signature[0] : signature);
    } catch (err) {
      if (err instanceof InIDError && err.code === "invalid_signature") throw new BadRequestException("invalid_signature");
      throw err;
    }
  }

  // A one-time token (from a webhook or the pixel) for the person's data
  exchange(token: string): Promise<Customer> {
    return this.nodeClient().exchange(token);
  }

  // Made when first needed: most apps never verify a webhook
  private nodeClient() {
    this.node ??= createNodeInID({ secretKey: this.server.config.secretKey, webhookSecret: this.webhookSecret, apiUrl: this.server.config.issuer });
    return this.node;
  }
}
