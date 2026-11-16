// Type-only stand-in (see ../react-native/index.d.ts)
export declare enum CryptoDigestAlgorithm {
  SHA256 = "SHA-256",
}
export declare enum CryptoEncoding {
  HEX = "hex",
  BASE64 = "base64",
}
export declare function digestStringAsync(algorithm: CryptoDigestAlgorithm, data: string, options?: { encoding: CryptoEncoding }): Promise<string>;
export declare function getRandomBytes(byteCount: number): Uint8Array;
