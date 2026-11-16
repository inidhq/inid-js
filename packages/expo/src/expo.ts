// The platform for the client, from Expo's modules: Keychain/Keystore storage, SHA-256 and
// random bytes from expo-crypto, and ASWebAuthenticationSession / Chrome Custom Tabs.

import { makeRedirectUri } from "expo-auth-session";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import type { InIDDeps } from "./client.js";
import { hexToBytes } from "./encoding.js";

// On the web, the page InID sends back to finishes the sign-in in the window that opened it
WebBrowser.maybeCompleteAuthSession();

// Readable after the first unlock (so renewing works when the app wakes in the background),
// and never in backups or on another device
const secure = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

export const expoDeps: InIDDeps = {
  storage: {
    getItem: (key) => SecureStore.getItemAsync(key, secure),
    setItem: (key, value) => SecureStore.setItemAsync(key, value, secure),
    deleteItem: (key) => SecureStore.deleteItemAsync(key, secure),
  },
  sha256: async (text) => hexToBytes(await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text, { encoding: Crypto.CryptoEncoding.HEX })),
  randomBytes: (length) => Crypto.getRandomBytes(length),
  openAuthSession: (url, redirectUri) => WebBrowser.openAuthSessionAsync(url, redirectUri),
};

// nube://callback in a build with "scheme": "nube"; exp://…/--/callback in Expo Go
export const defaultRedirectUri = () => makeRedirectUri({ path: "callback" });
