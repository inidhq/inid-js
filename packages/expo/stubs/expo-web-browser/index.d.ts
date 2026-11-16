// Type-only stand-in (see ../react-native/index.d.ts)
export type WebBrowserAuthSessionResult = { type: "success"; url: string } | { type: "cancel" | "dismiss" | "opened" | "locked" };
export declare function openAuthSessionAsync(url: string, redirectUrl?: string | null, options?: Record<string, unknown>): Promise<WebBrowserAuthSessionResult>;
export declare function maybeCompleteAuthSession(options?: { skipRedirectCheck?: boolean }): { type: "success" | "failed"; message: string };
