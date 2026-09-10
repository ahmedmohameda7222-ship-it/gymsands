export type ProtectedSegmentKeyProvider = Readonly<{
  getKey(keyId: string): Promise<Uint8Array>;
}>;

export async function loadAes256ProtectedSegmentKey(
  provider: ProtectedSegmentKeyProvider | null | undefined,
  keyId: string,
): Promise<Uint8Array> {
  if (!provider) throw new Error("Protected segment key provider is required.");
  if (typeof keyId !== "string" || keyId.trim().length === 0) {
    throw new Error("Protected segment key ID is required.");
  }

  const key = await provider.getKey(keyId);
  if (!(key instanceof Uint8Array) || key.byteLength !== 32) {
    throw new Error("Protected segment AES-256 key must contain exactly 32 bytes.");
  }

  return new Uint8Array(key);
}
