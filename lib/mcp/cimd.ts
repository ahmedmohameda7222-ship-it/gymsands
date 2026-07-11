import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from "node:dns";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { createLocalJWKSet, decodeProtectedHeader, jwtVerify, type JSONWebKeySet } from "jose";

const MAX_METADATA_BYTES = 64 * 1024;
const FETCH_TIMEOUT_MS = 5_000;
const CLIENT_ASSERTION_MAX_AGE_SECONDS = 5 * 60;
const SUPPORTED_CLIENT_AUTH_METHODS = ["private_key_jwt", "none"] as const;
const ALLOWED_ASSERTION_ALGORITHMS = ["PS256", "RS256", "ES256"];

export type CimdClientAuthMethod = (typeof SUPPORTED_CLIENT_AUTH_METHODS)[number];

export type CimdClientMetadata = {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  tokenEndpointAuthMethodsSupported: CimdClientAuthMethod[];
  selectedTokenEndpointAuthMethod: CimdClientAuthMethod;
  jwksUri: string | null;
};

export class CimdValidationError extends Error {
  constructor(message: string, readonly code = "invalid_client") {
    super(message);
    this.name = "CimdValidationError";
  }
}

function ipv4Octets(address: string) {
  const octets = address.split(".").map(Number);
  return octets.length === 4 && octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)
    ? octets
    : null;
}

/** True only for globally routable addresses that an OAuth metadata fetch may contact. */
export function isPublicCimdNetworkAddress(address: string) {
  const family = isIP(address);
  if (family === 4) {
    const octets = ipv4Octets(address);
    if (!octets) return false;
    const [a, b, c] = octets;
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    );
  }
  if (family === 6) {
    const normalized = address.toLowerCase().split("%")[0];
    if (normalized.includes(".")) return false; // Fail closed for IPv4-mapped/embedded forms.
    const first = Number.parseInt(normalized.split(":")[0] || "0", 16);
    if (first < 0x2000 || first > 0x3fff) return false; // Only the current global-unicast range.
    return !(
      normalized.startsWith("2001:0000:") ||
      normalized.startsWith("2001:0:") ||
      normalized.startsWith("2001:2:") ||
      normalized.startsWith("2001:db8:") ||
      normalized.startsWith("2001:10:") ||
      normalized.startsWith("2001:20:")
    );
  }
  return false;
}

type DnsLookupAll = (
  hostname: string,
  options: LookupOptions & { all: true },
  callback: (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void
) => void;

/**
 * Resolve inside the HTTPS socket connection and return only already-vetted
 * addresses. This removes the preflight/connect DNS-rebinding gap.
 */
export function createCimdSafeLookup(resolver: DnsLookupAll = dnsLookup as DnsLookupAll): LookupFunction {
  return (hostname, options, callback) => {
    resolver(hostname, { all: true, verbatim: true }, (error, addresses) => {
      if (error) return callback(error, "", 0);
      if (!addresses.length || addresses.some(({ address }) => !isPublicCimdNetworkAddress(address))) {
        const unsafe = new Error("CIMD metadata host resolved to a private or reserved network address.") as NodeJS.ErrnoException;
        unsafe.code = "EACCES";
        return callback(unsafe, "", 0);
      }
      const requestedFamily = options.family === 4 || options.family === 6 ? options.family : 0;
      const eligible = requestedFamily ? addresses.filter(({ family }) => family === requestedFamily) : addresses;
      if (!eligible.length) {
        const unavailable = new Error("CIMD metadata host has no address for the requested network family.") as NodeJS.ErrnoException;
        unavailable.code = "EADDRNOTAVAIL";
        return callback(unavailable, "", 0);
      }
      if (options.all) return callback(null, eligible);
      return callback(null, eligible[0].address, eligible[0].family);
    });
  };
}

const safeCimdNetworkFetch = ((url: URL, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
  const request = httpsRequest(url, {
    method: init?.method ?? "GET",
    headers: init?.headers as Record<string, string> | undefined,
    signal: init?.signal ?? undefined,
    lookup: createCimdSafeLookup()
  }, (response) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    response.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_METADATA_BYTES) {
        response.destroy(new CimdValidationError("CIMD metadata response is too large."));
        return;
      }
      chunks.push(chunk);
    });
    response.on("end", () => {
      const headers = new Headers();
      for (const [name, value] of Object.entries(response.headers)) {
        if (Array.isArray(value)) value.forEach((entry) => headers.append(name, entry));
        else if (value !== undefined) headers.set(name, String(value));
      }
      resolve(new Response(Buffer.concat(chunks), {
        status: response.statusCode ?? 500,
        statusText: response.statusMessage,
        headers
      }));
    });
    response.on("error", reject);
  });
  request.on("error", reject);
  request.end();
})) as typeof fetch;

function configuredOrigins(value: string | undefined) {
  const entries = (value ?? "https://chatgpt.com")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return new Set(entries.map((entry) => {
    const url = new URL(entry);
    const canonicalEntry = entry.endsWith("/") ? entry.slice(0, -1) : entry;
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/" ||
      canonicalEntry !== url.origin ||
      (url.port && url.port !== "443") ||
      (isIP(url.hostname) !== 0 && !isPublicCimdNetworkAddress(url.hostname))
    ) {
      throw new CimdValidationError("CIMD allowed origins must be canonical HTTPS origins.");
    }
    return url.origin;
  }));
}

export function validateCimdUrl(value: string, allowedOriginsValue?: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CimdValidationError("client_id must be a valid HTTPS CIMD document URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    url.search ||
    url.hash ||
    url.pathname === "/" ||
    url.toString() !== value ||
    (isIP(url.hostname) !== 0 && !isPublicCimdNetworkAddress(url.hostname))
  ) {
    throw new CimdValidationError("client_id must be an exact canonical HTTPS CIMD document URL without credentials, query, or fragment.");
  }
  if (!configuredOrigins(allowedOriginsValue).has(url.origin)) {
    throw new CimdValidationError("The CIMD metadata origin is not allowed.");
  }
  return url;
}

function validateSameOriginHttpsUrl(value: string, clientUrl: URL, label: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CimdValidationError(`${label} must be a valid HTTPS URL.`);
  }
  if (
    url.protocol !== "https:" ||
    url.origin !== clientUrl.origin ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    url.search ||
    url.hash ||
    url.toString() !== value
  ) {
    throw new CimdValidationError(`${label} must be an exact HTTPS URL on the CIMD metadata origin.`);
  }
  return url;
}

async function fetchExactJson(
  url: URL,
  fetcher: typeof fetch,
  label: string
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetcher(url, {
      method: "GET",
      redirect: "manual",
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store"
    });
    if (response.status >= 300 && response.status < 400) {
      throw new CimdValidationError(`${label} redirects are not allowed.`);
    }
    if (!response.ok) throw new CimdValidationError(`${label} could not be fetched.`);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("application/json") && !contentType.includes("application/jwk-set+json")) {
      throw new CimdValidationError(`${label} must use a JSON content type.`);
    }
    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (contentLength > MAX_METADATA_BYTES) throw new CimdValidationError(`${label} is too large.`);
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_METADATA_BYTES) throw new CimdValidationError(`${label} is too large.`);
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new CimdValidationError(`${label} must be a JSON object.`);
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof CimdValidationError) throw error;
    throw new CimdValidationError(`${label} could not be fetched safely.`);
  } finally {
    clearTimeout(timeout);
  }
}

function stringArray(value: unknown, label: string) {
  if (!Array.isArray(value) || !value.length || value.some((entry) => typeof entry !== "string" || !entry.trim())) {
    throw new CimdValidationError(`${label} must be a non-empty string array.`);
  }
  return Array.from(new Set(value as string[]));
}

export async function fetchAndValidateCimdMetadata({
  clientId,
  redirectUri,
  allowedOrigins,
  fetcher = safeCimdNetworkFetch
}: {
  clientId: string;
  redirectUri?: string;
  allowedOrigins?: string;
  fetcher?: typeof fetch;
}): Promise<CimdClientMetadata> {
  const clientUrl = validateCimdUrl(clientId, allowedOrigins);
  const document = await fetchExactJson(clientUrl, fetcher, "CIMD metadata document");
  if (document.client_id !== clientId) {
    throw new CimdValidationError("CIMD client_id does not match the exact metadata document URL.");
  }
  if (typeof document.client_name !== "string" || !document.client_name.trim()) {
    throw new CimdValidationError("CIMD client_name must be a non-empty string.");
  }

  const redirectUris = stringArray(document.redirect_uris, "redirect_uris");
  if (redirectUri && !redirectUris.includes(redirectUri)) {
    throw new CimdValidationError("redirect_uri is not registered by the CIMD document.", "invalid_redirect_uri");
  }

  const advertisedMethods = stringArray(
    document.token_endpoint_auth_methods_supported,
    "token_endpoint_auth_methods_supported"
  );
  const intersection = SUPPORTED_CLIENT_AUTH_METHODS.filter((method) => advertisedMethods.includes(method));
  if (!intersection.length) {
    throw new CimdValidationError("CIMD client and Plaivra have no compatible token endpoint authentication method.");
  }
  const selectedTokenEndpointAuthMethod = intersection[0];

  let jwksUri: string | null = null;
  if (selectedTokenEndpointAuthMethod === "private_key_jwt") {
    const advertisedJwks = typeof document.jwks_uri === "string"
      ? document.jwks_uri
      : `${clientUrl.origin}/oauth/jwks.json`;
    jwksUri = validateSameOriginHttpsUrl(advertisedJwks, clientUrl, "jwks_uri").toString();
  }

  return {
    clientId,
    clientName: document.client_name.trim().slice(0, 120),
    redirectUris,
    tokenEndpointAuthMethodsSupported: intersection,
    selectedTokenEndpointAuthMethod,
    jwksUri
  };
}

export async function verifyCimdPrivateKeyJwt({
  assertion,
  metadata,
  tokenEndpoint,
  fetcher = safeCimdNetworkFetch,
  now = new Date()
}: {
  assertion: string;
  metadata: CimdClientMetadata;
  tokenEndpoint: string;
  fetcher?: typeof fetch;
  now?: Date;
}) {
  if (!metadata.jwksUri) throw new CimdValidationError("CIMD client did not publish a JWKS URL.");
  if (!assertion || assertion.length > 16_384) throw new CimdValidationError("A valid client_assertion is required.");
  const clientUrl = new URL(metadata.clientId);
  const jwksUrl = validateSameOriginHttpsUrl(metadata.jwksUri, clientUrl, "jwks_uri");
  const jwks = await fetchExactJson(jwksUrl, fetcher, "CIMD JWKS") as unknown as JSONWebKeySet;
  if (!Array.isArray(jwks.keys) || !jwks.keys.length) throw new CimdValidationError("CIMD JWKS contains no signing keys.");

  try {
    const protectedHeader = decodeProtectedHeader(assertion);
    const kid = protectedHeader.kid;
    if (typeof kid !== "string" || !kid.trim() || kid.length > 200) {
      throw new CimdValidationError("client_assertion requires an exact bounded kid.");
    }
    if (typeof protectedHeader.alg !== "string" || !ALLOWED_ASSERTION_ALGORITHMS.includes(protectedHeader.alg)) {
      throw new CimdValidationError("client_assertion signing algorithm is not allowed.");
    }
    const matchingKeys = jwks.keys.filter((key) => key.kid === kid);
    if (matchingKeys.length !== 1) throw new CimdValidationError("client_assertion kid does not identify exactly one signing key.");
    const signingKey = matchingKeys[0];
    if (signingKey.use !== undefined && signingKey.use !== "sig") {
      throw new CimdValidationError("CIMD signing key use must be sig.");
    }
    if (signingKey.key_ops !== undefined && (!Array.isArray(signingKey.key_ops) || !signingKey.key_ops.includes("verify"))) {
      throw new CimdValidationError("CIMD signing key must allow verify operations.");
    }
    if (signingKey.alg !== undefined && signingKey.alg !== protectedHeader.alg) {
      throw new CimdValidationError("CIMD signing key algorithm does not match the assertion.");
    }
    const result = await jwtVerify(assertion, createLocalJWKSet(jwks), {
      algorithms: ALLOWED_ASSERTION_ALGORITHMS,
      issuer: metadata.clientId,
      subject: metadata.clientId,
      audience: tokenEndpoint,
      currentDate: now,
      clockTolerance: 5
    });
    const { jti, iat, exp } = result.payload;
    const nowSeconds = Math.floor(now.getTime() / 1000);
    if (typeof jti !== "string" || !jti || jti.length > 200) throw new CimdValidationError("client_assertion requires a bounded jti.");
    if (typeof iat !== "number" || iat > nowSeconds + 5 || nowSeconds - iat > CLIENT_ASSERTION_MAX_AGE_SECONDS) {
      throw new CimdValidationError("client_assertion iat is invalid or too old.");
    }
    if (typeof exp !== "number" || exp <= nowSeconds || exp - nowSeconds > CLIENT_ASSERTION_MAX_AGE_SECONDS) {
      throw new CimdValidationError("client_assertion exp is invalid.");
    }
    return { jti, expiresAt: new Date(exp * 1000).toISOString(), kid };
  } catch (error) {
    if (error instanceof CimdValidationError) throw error;
    throw new CimdValidationError("client_assertion signature, kid, claims, or validity window is invalid.");
  }
}
