import { describe, expect, it } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import {
  CimdValidationError,
  fetchAndValidateCimdMetadata,
  validateCimdUrl,
  verifyCimdPrivateKeyJwt,
  type CimdClientMetadata
} from "@/lib/mcp/cimd";

const clientId = "https://chatgpt.com/oauth/plaivra/client.json";
const redirectUri = "https://chatgpt.com/connector/oauth/plaivra_callback";
const tokenEndpoint = "https://app.plaivra.com/api/oauth/token";

function jsonFetch(value: unknown, init: ResponseInit = {}) {
  return (async () => new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init
  })) as typeof fetch;
}

function metadataDocument(overrides: Record<string, unknown> = {}) {
  return {
    client_id: clientId,
    client_name: "ChatGPT",
    redirect_uris: [redirectUri],
    token_endpoint_auth_methods_supported: ["none", "private_key_jwt"],
    jwks_uri: "https://chatgpt.com/oauth/jwks.json",
    ...overrides
  };
}

describe("CIMD metadata validation", () => {
  it("fetches the exact allowlisted document and prefers private_key_jwt", async () => {
    const metadata = await fetchAndValidateCimdMetadata({
      clientId,
      redirectUri,
      fetcher: jsonFetch(metadataDocument())
    });
    expect(metadata.selectedTokenEndpointAuthMethod).toBe("private_key_jwt");
    expect(metadata.redirectUris).toContain(redirectUri);
    expect(metadata.jwksUri).toBe("https://chatgpt.com/oauth/jwks.json");
  });

  it("rejects non-HTTPS, credentials, query strings, private or unapproved origins", () => {
    for (const value of [
      "http://chatgpt.com/oauth/client.json",
      "https://user@chatgpt.com/oauth/client.json",
      "https://chatgpt.com/oauth/client.json?next=evil",
      "https://127.0.0.1/oauth/client.json",
      "https://evil.example/oauth/client.json"
    ]) {
      expect(() => validateCimdUrl(value)).toThrow(CimdValidationError);
    }
  });

  it("rejects document identity and redirect mismatches", async () => {
    await expect(fetchAndValidateCimdMetadata({
      clientId,
      redirectUri,
      fetcher: jsonFetch(metadataDocument({ client_id: "https://chatgpt.com/oauth/other.json" }))
    })).rejects.toThrow("does not match");
    await expect(fetchAndValidateCimdMetadata({
      clientId,
      redirectUri,
      fetcher: jsonFetch(metadataDocument({ redirect_uris: ["https://chatgpt.com/connector/oauth/other"] }))
    })).rejects.toThrow("not registered");
  });

  it("rejects redirects, malformed documents, unsafe JWKS origins, and method mismatch", async () => {
    await expect(fetchAndValidateCimdMetadata({
      clientId,
      redirectUri,
      fetcher: (async () => new Response(null, { status: 302, headers: { Location: "https://evil.example" } })) as typeof fetch
    })).rejects.toThrow("redirects are not allowed");
    await expect(fetchAndValidateCimdMetadata({
      clientId,
      redirectUri,
      fetcher: jsonFetch([])
    })).rejects.toThrow("JSON object");
    await expect(fetchAndValidateCimdMetadata({
      clientId,
      redirectUri,
      fetcher: jsonFetch(metadataDocument({ jwks_uri: "https://evil.example/jwks.json" }))
    })).rejects.toThrow("metadata origin");
    await expect(fetchAndValidateCimdMetadata({
      clientId,
      redirectUri,
      fetcher: jsonFetch(metadataDocument({ token_endpoint_auth_methods_supported: ["client_secret_basic"] }))
    })).rejects.toThrow("no compatible");
  });
});

describe("CIMD private_key_jwt", () => {
  async function fixture() {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = await exportJWK(publicKey);
    const metadata: CimdClientMetadata = {
      clientId,
      clientName: "ChatGPT",
      redirectUris: [redirectUri],
      tokenEndpointAuthMethodsSupported: ["private_key_jwt", "none"],
      selectedTokenEndpointAuthMethod: "private_key_jwt",
      jwksUri: "https://chatgpt.com/oauth/jwks.json"
    };
    const now = new Date("2026-07-10T20:00:00.000Z");
    const seconds = Math.floor(now.getTime() / 1000);
    const sign = (key = privateKey, overrides: { kid?: string; iss?: string; aud?: string; exp?: number; nbf?: number } = {}) => {
      let jwt = new SignJWT({})
        .setProtectedHeader({ alg: "RS256", kid: overrides.kid ?? "chatgpt-key-1" })
        .setIssuer(overrides.iss ?? clientId)
        .setSubject(clientId)
        .setAudience(overrides.aud ?? tokenEndpoint)
        .setIssuedAt(seconds)
        .setJti("assertion-1")
        .setExpirationTime(overrides.exp ?? seconds + 120);
      if (overrides.nbf !== undefined) jwt = jwt.setNotBefore(overrides.nbf);
      return jwt.sign(key);
    };
    const fetcher = jsonFetch({ keys: [{ ...jwk, kid: "chatgpt-key-1", alg: "RS256", use: "sig" }] });
    return { metadata, now, seconds, sign, fetcher };
  }

  it("verifies signature, kid, issuer, subject, audience, exp, nbf, iat and jti", async () => {
    const { metadata, now, sign, fetcher } = await fixture();
    const result = await verifyCimdPrivateKeyJwt({
      assertion: await sign(), metadata, tokenEndpoint, fetcher, now
    });
    expect(result).toMatchObject({ jti: "assertion-1", kid: "chatgpt-key-1" });
  });

  it("rejects missing kid, wrong signature, issuer, audience, expiration and nbf", async () => {
    const { metadata, now, seconds, sign, fetcher } = await fixture();
    const other = await generateKeyPair("RS256");
    for (const assertion of [
      await sign(undefined, { kid: "missing-key" }),
      await sign(other.privateKey),
      await sign(undefined, { iss: "https://evil.example/client.json" }),
      await sign(undefined, { aud: "https://evil.example/token" }),
      await sign(undefined, { exp: seconds - 1 }),
      await sign(undefined, { nbf: seconds + 60 })
    ]) {
      await expect(verifyCimdPrivateKeyJwt({ assertion, metadata, tokenEndpoint, fetcher, now }))
        .rejects.toThrow(CimdValidationError);
    }
  });
});
