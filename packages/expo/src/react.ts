import { createContext, Fragment, createElement as h, type ReactNode, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AppState, Pressable, type StyleProp, Text, type TextStyle, View, type ViewStyle } from "react-native";
import { type AccessCheck, createInIDClient, has, type InIDClient, type InIDDeps, type InIDUser, type SignInOptions } from "./client.js";
import { defaultRedirectUri, expoDeps } from "./expo.js";

// Sign-in with InID for React Native / Expo.
//
//   <InIDProvider publishableKey="pk_live_…">     once, near the top
//     <SignedOut><SignInButton /></SignedOut>
//     <SignedIn><UserButton /></SignedIn>
//   const { user, getToken } = useInID()

export type Locale = "es" | "en" | "pt";

const TEXTS = {
  es: { continue: "Continuar con InID", signOut: "Salir", signingIn: "Abriendo InID…" },
  en: { continue: "Continue with InID", signOut: "Sign out", signingIn: "Opening InID…" },
  pt: { continue: "Continuar com InID", signOut: "Sair", signingIn: "Abrindo InID…" },
};
type Texts = (typeof TEXTS)["es"];

export interface InIDContextValue {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: InIDUser | null;
  // To InID's page in the system's browser and back: the user, or null if the person closed it
  signIn: (options?: SignInOptions) => Promise<InIDUser | null>;
  // Revokes the session at InID and forgets it here; the next sign-in asks again
  signOut: () => Promise<void>;
  // A fresh ID token for your backend (Authorization: Bearer …), or null
  getToken: () => Promise<string | null>;
  locale: Locale;
  t: Texts;
  client: InIDClient;
}

const InIDContext = createContext<InIDContextValue | null>(null);

const useContextOf = (component: string) => {
  const value = useContext(InIDContext);
  if (!value) throw new Error(`InID: ${component} must be inside <InIDProvider>`);
  return value;
};

export interface InIDProviderProps {
  children?: ReactNode;
  // From InID's panel (pk_test_… / pk_live_…). The app has no secret key: it's a public client.
  publishableKey: string;
  issuer?: string;
  // Where InID sends the person back: your app's scheme, registered in InID's panel as an
  // allowed origin (nube://). Default: makeRedirectUri({ path: "callback" })
  redirectUri?: string;
  scope?: string;
  locale?: Locale;
  // Tests and other platforms only: replaces Expo's storage, crypto and browser
  deps?: InIDDeps;
}

export function InIDProvider({ children, publishableKey, issuer = "https://id.inid.co", redirectUri, scope, locale = "es", deps }: InIDProviderProps) {
  const client = useMemo(
    () => createInIDClient({ publishableKey, issuer, redirectUri: redirectUri ?? defaultRedirectUri(), scope, locale }, deps ?? expoDeps),
    [publishableKey, issuer, redirectUri, scope, locale, deps]
  );
  const state = useSyncExternalStore(client.subscribe, client.getState, client.getState);
  const { isLoaded, expiresAt } = state;

  useEffect(() => void client.load(), [client]);

  // Renew 60 s before the ID token ends; if InID couldn't be reached, try again every 30 s
  // (a renewed token changes expiresAt, which starts this over)
  useEffect(() => {
    if (!isLoaded || expiresAt === null) return;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const wait = (ms: number) => {
      timer = setTimeout(() => {
        void client.getToken().finally(() => {
          if (!stopped && client.getState().expiresAt === expiresAt) wait(30_000);
        });
      }, ms);
    };
    const due = (expiresAt - 60) * 1000 - Date.now();
    wait(due > 0 ? due : 30_000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [client, isLoaded, expiresAt]);

  // Timers don't run in the background: back in the foreground, renew if it's time
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void client.getToken();
    });
    return () => subscription.remove();
  }, [client]);

  const value = useMemo<InIDContextValue>(
    () => ({
      isLoaded: state.isLoaded,
      isSignedIn: Boolean(state.user),
      user: state.user,
      signIn: client.signIn,
      signOut: client.signOut,
      getToken: client.getToken,
      locale,
      t: TEXTS[locale] ?? TEXTS.es,
      client,
    }),
    [state, client, locale]
  );
  return h(InIDContext.Provider, { value }, children);
}

// ---------- hooks ----------
export function useInID() {
  const { isLoaded, isSignedIn, user, signIn, signOut, getToken } = useContextOf("useInID()");
  return { isLoaded, isSignedIn, user, signIn, signOut, getToken };
}

export function useUser() {
  const { isLoaded, isSignedIn, user } = useContextOf("useUser()");
  return { isLoaded, isSignedIn, user };
}

// ---------- what shows by who is here ----------
export function SignedIn({ children }: { children?: ReactNode }) {
  const { isLoaded, isSignedIn } = useContextOf("<SignedIn>");
  return isLoaded && isSignedIn ? h(Fragment, null, children) : null;
}

export function SignedOut({ children }: { children?: ReactNode }) {
  const { isLoaded, isSignedIn } = useContextOf("<SignedOut>");
  return isLoaded && !isSignedIn ? h(Fragment, null, children) : null;
}

// Shows its children only to someone with that role or permission; to anyone else, the
// fallback. It hides; your backend still checks.
export function Protect({ role, permission, teamRole, fallback = null, children }: AccessCheck & { fallback?: ReactNode; children?: ReactNode }) {
  const { isLoaded, user } = useContextOf("<Protect>");
  if (!isLoaded) return null;
  return h(Fragment, null, has(user, { role, permission, teamRole }) ? children : fallback);
}

// ---------- buttons ----------
const INK = "#18181b";
const ACCENT = "#c6ff3d";

const buttonStyle = (pressed: boolean, disabled: boolean): ViewStyle => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: 9,
  minHeight: 44,
  paddingHorizontal: 16,
  borderRadius: 8,
  backgroundColor: INK,
  opacity: disabled ? 0.6 : pressed ? 0.85 : 1,
});
const labelStyle: TextStyle = { color: "#fff", fontSize: 15, fontWeight: "600" };

export interface SignInButtonProps extends SignInOptions {
  // The label; "Continuar con InID" in the provider's language by default
  children?: string;
  style?: StyleProp<ViewStyle>;
  onSignedIn?: (user: InIDUser) => void;
  onError?: (error: unknown) => void;
}

// InID's black button: opens InID in the system's browser and comes back signed in
export function SignInButton({ children, style, entrance, loginHint, onSignedIn, onError }: SignInButtonProps) {
  const { signIn, t } = useContextOf("<SignInButton>");
  const [busy, setBusy] = useState(false);
  const press = useCallback(async () => {
    setBusy(true);
    try {
      const user = await signIn({ entrance, loginHint });
      if (user) onSignedIn?.(user);
    } catch (err) {
      if (onError) onError(err);
      else console.warn(err);
    } finally {
      setBusy(false);
    }
  }, [signIn, entrance, loginHint, onSignedIn, onError]);
  return h(
    Pressable,
    { accessibilityRole: "button", accessibilityState: { busy, disabled: busy }, disabled: busy, onPress: () => void press(), style: ({ pressed }: { pressed: boolean }) => [buttonStyle(pressed, busy), style] },
    h(View, { style: { width: 9, height: 9, borderRadius: 2, backgroundColor: ACCENT } }),
    h(Text, { style: labelStyle }, busy ? t.signingIn : (children ?? t.continue))
  );
}

export function SignOutButton({ children, style, onSignedOut }: { children?: string; style?: StyleProp<ViewStyle>; onSignedOut?: () => void }) {
  const { signOut, t } = useContextOf("<SignOutButton>");
  return h(
    Pressable,
    { accessibilityRole: "button", onPress: () => void signOut().then(() => onSignedOut?.()), style: ({ pressed }: { pressed: boolean }) => [buttonStyle(pressed, false), style] },
    h(Text, { style: labelStyle }, children ?? t.signOut)
  );
}

const initials = (user: InIDUser | null) => ((user?.firstName?.[0] || "") + (user?.lastName?.[0] || "") || user?.email?.[0] || "·").toUpperCase();

// The person's initials and name; onPress for the app's own menu (sign out, profile)
export function UserButton({ showName = true, style, onPress }: { showName?: boolean; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const { user } = useContextOf("<UserButton>");
  if (!user) return null;
  const label = user.name || user.email || user.phone || "";
  return h(
    Pressable,
    { accessibilityRole: "button", accessibilityLabel: label, disabled: !onPress, onPress, style: [{ flexDirection: "row", alignItems: "center", gap: 8 }, style] },
    h(
      View,
      { style: { width: 32, height: 32, borderRadius: 16, backgroundColor: INK, alignItems: "center", justifyContent: "center" } },
      h(Text, { style: { color: "#fff", fontSize: 13, fontWeight: "600" } }, initials(user))
    ),
    showName && label ? h(Text, { style: { color: INK, fontSize: 15, fontWeight: "500" }, numberOfLines: 1 }, label) : null
  );
}
