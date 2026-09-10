export type ProtectedSegmentKeyProvider = Readonly<{
  getKey(keyId: string): Promise<Uint8Array>;
}>;

export type ProtectedSegmentEnvironmentBinding = Readonly<{
  keyId: string;
  keyProvider: ProtectedSegmentKeyProvider;
}>;

function decodeCanonicalBase64(value: string, label: string): Buffer {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} is required.`);
  const decoded = Buffer.from(value, "base64");
  if (decoded.length === 0 || decoded.toString("base64").replace(/=+$/u, "") !== value.replace(/=+$/u, "")) {
    throw new Error(`${label} must be canonical base64.`);
  }
  return decoded;
}

export function createEnvironmentProtectedSegmentKeyBinding(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ProtectedSegmentEnvironmentBinding {
  const keyId = env.PLAN7_PROTECTED_SEGMENT_KEY_ID;
  const encoded = env.PLAN7_PROTECTED_SEGMENT_KEY_BASE64;
  if (typeof keyId !== "string" || keyId.trim().length === 0) {
    throw new Error("PLAN7_PROTECTED_SEGMENT_KEY_ID is required for FULL_DR protected segments.");
  }
  if (!/^[A-Za-z0-9._:/-]{1,128}$/u.test(keyId)) {
    throw new Error("PLAN7 protected segment key ID must be a non-secret external key identifier.");
  }
  const key = decodeCanonicalBase64(encoded ?? "", "PLAN7_PROTECTED_SEGMENT_KEY_BASE64");
  if (key.byteLength !== 32) throw new Error("PLAN7 protected segment AES-256 key must contain exactly 32 bytes.");

  return Object.freeze({
    keyId,
    keyProvider: Object.freeze({
      async getKey(requestedKeyId: string): Promise<Uint8Array> {
        if (requestedKeyId !== keyId) throw new Error("Protected segment key ID does not match the configured external key binding.");
        return new Uint8Array(key);
      },
    }),
  });
}

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
