// Type-only stand-in (see ../react-native/index.d.ts)
export type KeychainAccessibilityConstant = number;
export declare const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: KeychainAccessibilityConstant;
export interface SecureStoreOptions {
  keychainService?: string;
  keychainAccessible?: KeychainAccessibilityConstant;
}
export declare function getItemAsync(key: string, options?: SecureStoreOptions): Promise<string | null>;
export declare function setItemAsync(key: string, value: string, options?: SecureStoreOptions): Promise<void>;
export declare function deleteItemAsync(key: string, options?: SecureStoreOptions): Promise<void>;
