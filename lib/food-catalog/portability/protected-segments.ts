import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "AES-256-GCM" as const;
const NODE_ALGORITHM = "aes-256-gcm";
const NONCE_BYTES = 12;
const TRANSPORT_PREFIX = Buffer.from("PLAN7-AES-256-GCM-V1\0", "utf8");

export type ProtectedSegmentKeyProvider = Readonly<{
  getKey(keyId: string): Promise<Uint8Array>;
}>;

export type ProtectedSegmentEnvelopeV1 = Readonly<{
  segment: string;
  algorithm: typeof ALGORITHM;
  keyId: string;
  nonceBase64: string;
  authTagBase64: string;
  ciphertextBase64: string;
  plaintextSemanticSha256: string;
  transportSha256: string;
}>;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function loadAes256ProtectedSegmentKey(
  provider: ProtectedSegmentKeyProvider | null | undefined,
  keyId: string,
): Promise<Uint8Array> {
  if (!provider) throw new Error("Protected segment key provider is required.");
  if (typeof keyId !== "string" || keyId.trim().length === 0) throw new Error("Protected segment key ID is required.");
  const key = await provider.getKey(keyId);
  if (!(key instanceof Uint8Array) || key.byteLength !== 32) {
    throw new Error("Protected segment AES-256 key must contain exactly 32 bytes.");
  }
  return new Uint8Array(key);
}

function transportBytes(nonce: Uint8Array, authTag: Uint8Array, ciphertext: Uint8Array): Buffer {
  return Buffer.concat([
    TRANSPORT_PREFIX,
    Buffer.from(nonce),
    Buffer.from(authTag),
    Buffer.from(ciphertext),
  ]);
}

function decodeBase64(value: string, label: string, allowEmpty = false): Buffer {
  if (typeof value !== "string") throw new Error(`${label} is required.`);
  if (value.length === 0) {
    if (allowEmpty) return Buffer.alloc(0);
    throw new Error(`${label} is required.`);
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.length === 0 || decoded.toString("base64").replace(/=+$/u, "") !== value.replace(/=+$/u, "")) {
    throw new Error(`${label} must be canonical base64.`);
  }
  return decoded;
}

export function createProtectedSegmentNonceReuseGuard() {
  const claimed = new Set<string>();
  return Object.freeze({
    claim(keyId: string, nonce: Uint8Array): true {
      if (typeof keyId !== "string" || keyId.trim().length === 0) throw new Error("Nonce claim key ID is required.");
      if (!(nonce instanceof Uint8Array) || nonce.byteLength !== NONCE_BYTES) {
        throw new Error(`AES-256-GCM nonce must contain exactly ${NONCE_BYTES} bytes.`);
      }
      const token = `${keyId}:${Buffer.from(nonce).toString("hex")}`;
      if (claimed.has(token)) throw new Error("Protected segment nonce reuse is forbidden for the same key ID.");
      claimed.add(token);
      return true;
    },
  });
}

const processNonceReuseGuard = createProtectedSegmentNonceReuseGuard();

export async function encryptProtectedSegment(input: Readonly<{
  segment: string;
  plaintext: Uint8Array;
  keyId: string;
  keyProvider: ProtectedSegmentKeyProvider | null | undefined;
}>): Promise<ProtectedSegmentEnvelopeV1> {
  if (typeof input.segment !== "string" || input.segment.trim().length === 0) {
    throw new Error("Protected segment name is required.");
  }
  if (!(input.plaintext instanceof Uint8Array)) throw new Error("Protected segment plaintext bytes are required.");

  const key = await loadAes256ProtectedSegmentKey(input.keyProvider, input.keyId);
  const nonce = randomBytes(NONCE_BYTES);
  processNonceReuseGuard.claim(input.keyId, nonce);

  const cipher = createCipheriv(NODE_ALGORITHM, Buffer.from(key), nonce);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(input.plaintext)),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return Object.freeze({
    segment: input.segment,
    algorithm: ALGORITHM,
    keyId: input.keyId,
    nonceBase64: nonce.toString("base64"),
    authTagBase64: authTag.toString("base64"),
    ciphertextBase64: ciphertext.toString("base64"),
    plaintextSemanticSha256: sha256(input.plaintext),
    transportSha256: sha256(transportBytes(nonce, authTag, ciphertext)),
  });
}

export async function decryptProtectedSegment(
  envelope: ProtectedSegmentEnvelopeV1,
  keyProvider: ProtectedSegmentKeyProvider | null | undefined,
): Promise<Buffer> {
  if (envelope.algorithm !== ALGORITHM) throw new Error("Unsupported protected segment encryption algorithm.");
  if (!/^[0-9a-f]{64}$/iu.test(envelope.plaintextSemanticSha256)) {
    throw new Error("Protected segment plaintext semantic hash is invalid.");
  }
  if (!/^[0-9a-f]{64}$/iu.test(envelope.transportSha256)) {
    throw new Error("Protected segment transport hash is invalid.");
  }

  const nonce = decodeBase64(envelope.nonceBase64, "Protected segment nonce");
  if (nonce.byteLength !== NONCE_BYTES) throw new Error(`AES-256-GCM nonce must contain exactly ${NONCE_BYTES} bytes.`);
  const authTag = decodeBase64(envelope.authTagBase64, "Protected segment authentication tag");
  const ciphertext = decodeBase64(envelope.ciphertextBase64, "Protected segment ciphertext", true);

  const observedTransportSha256 = sha256(transportBytes(nonce, authTag, ciphertext));
  if (observedTransportSha256 !== envelope.transportSha256) {
    throw new Error("Protected segment transport integrity mismatch.");
  }

  const key = await loadAes256ProtectedSegmentKey(keyProvider, envelope.keyId);
  try {
    const decipher = createDecipheriv(NODE_ALGORITHM, Buffer.from(key), nonce);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    if (sha256(plaintext) !== envelope.plaintextSemanticSha256) {
      throw new Error("Protected segment plaintext semantic integrity mismatch.");
    }
    return plaintext;
  } catch (error) {
    if (error instanceof Error && /semantic integrity mismatch/u.test(error.message)) throw error;
    throw new Error("Protected segment authentication/decryption failed.", { cause: error });
  }
}
