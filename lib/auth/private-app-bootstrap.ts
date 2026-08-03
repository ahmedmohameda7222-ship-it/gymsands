import type { SupabaseClient } from "@supabase/supabase-js";

import {
  evaluateUserLaunchEligibility,
  type EligibilityStatus,
} from "@/lib/auth/eligibility";
import { MOCK_AUTH_USER_ID } from "@/lib/fixtures/mock-auth";
import { AGE_CONFIRMATION_VERSION, REQUIRED_CONSENTS } from "@/lib/legal/versions";
import { isOnboardingComplete } from "@/lib/onboarding/adaptive-profile";
import {
  defaultUserAppSettings,
  normalizeUserAppSettings,
  normalizeUserAppSettingsRow,
  type UserAppSettings,
  type UserAppSettingsRow,
} from "@/services/database/user-settings";
import {
  evaluateRequiredConsents,
  type ConsentEvaluationRecord,
} from "@/services/database/consents";
import type { Profile } from "@/types";

export const PRIVATE_APP_BOOTSTRAP_CONTRACT_VERSION = 1 as const;

export type AccountAccessState =
  | "active"
  | "deletion_pending"
  | "deletion_processing"
  | "legal_hold"
  | "disabled";

export type PrivateAppBootstrap = {
  contractVersion: typeof PRIVATE_APP_BOOTSTRAP_CONTRACT_VERSION;
  userId: string;
  profile: Profile | null;
  accountAccessState: AccountAccessState;
  consentRecords: ConsentEvaluationRecord[];
  hasRequiredConsents: boolean;
  onboardingAge: number | null;
  onboardingComplete: boolean;
  eligibility: EligibilityStatus;
  settings: UserAppSettings;
};

type JsonRecord = Record<string, unknown>;

const accountAccessStates = new Set<AccountAccessState>([
  "active",
  "deletion_pending",
  "deletion_processing",
  "legal_hold",
  "disabled",
]);

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nullableString(value: unknown, field: string) {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`Private bootstrap ${field} is malformed.`);
  }
  return value;
}

function normalizeProfile(value: unknown, expectedUserId: string): Profile | null {
  if (value === null) return null;
  if (!isRecord(value) || value.id !== expectedUserId) {
    throw new Error("Private bootstrap profile ownership is malformed.");
  }
  if (value.role !== "member" && value.role !== "admin") {
    throw new Error("Private bootstrap profile role is malformed.");
  }
  nullableString(value.email, "profile.email");
  nullableString(value.full_name, "profile.full_name");
  nullableString(value.avatar_url, "profile.avatar_url");
  if (typeof value.created_at !== "string" || typeof value.updated_at !== "string") {
    throw new Error("Private bootstrap profile timestamps are malformed.");
  }
  return value as Profile;
}

function normalizeConsentRecords(value: unknown): ConsentEvaluationRecord[] {
  if (!Array.isArray(value)) {
    throw new Error("Private bootstrap consent records are malformed.");
  }
  return value.map((record) => {
    if (
      !isRecord(record) ||
      typeof record.consent_type !== "string" ||
      typeof record.version !== "string" ||
      typeof record.granted !== "boolean" ||
      (record.revoked_at !== null && typeof record.revoked_at !== "string")
    ) {
      throw new Error("Private bootstrap consent record is malformed.");
    }
    return {
      consent_type: record.consent_type,
      version: record.version,
      granted: record.granted,
      revoked_at: record.revoked_at,
    };
  });
}

function normalizeOnboarding(value: unknown) {
  if (!isRecord(value)) {
    throw new Error("Private bootstrap onboarding summary is malformed.");
  }
  if (
    value.age !== null &&
    (typeof value.age !== "number" || !Number.isInteger(value.age))
  ) {
    throw new Error("Private bootstrap onboarding age is malformed.");
  }
  if (value.completed_at !== null && typeof value.completed_at !== "string") {
    throw new Error("Private bootstrap onboarding completion is malformed.");
  }
  return {
    age: value.age as number | null,
    completed_at: value.completed_at as string | null,
  };
}

function normalizeSettings(value: unknown, expectedUserId: string) {
  if (value === null) {
    return normalizeUserAppSettings(defaultUserAppSettings, expectedUserId);
  }
  if (!isRecord(value) || value.user_id !== expectedUserId) {
    throw new Error("Private bootstrap settings ownership is malformed.");
  }
  return normalizeUserAppSettingsRow(
    value as unknown as UserAppSettingsRow,
  );
}

export function normalizePrivateAppBootstrapPayload(
  value: unknown,
  expectedUserId: string,
): PrivateAppBootstrap {
  if (!isRecord(value)) {
    throw new Error("Private bootstrap response is malformed.");
  }
  if (value.contractVersion !== PRIVATE_APP_BOOTSTRAP_CONTRACT_VERSION) {
    throw new Error("Private bootstrap contract version is unsupported.");
  }
  if (value.userId !== expectedUserId) {
    throw new Error("Private bootstrap user identity does not match the session.");
  }
  if (
    typeof value.accountAccessState !== "string" ||
    !accountAccessStates.has(value.accountAccessState as AccountAccessState)
  ) {
    throw new Error("Private bootstrap account-access state is malformed.");
  }

  const consentRecords = normalizeConsentRecords(value.consentRecords);
  const onboarding = normalizeOnboarding(value.onboarding);
  const ageConfirmationConsent = consentRecords.find(
    (record) =>
      record.consent_type === "age_16" &&
      record.version === AGE_CONFIRMATION_VERSION,
  ) ?? null;

  return {
    contractVersion: PRIVATE_APP_BOOTSTRAP_CONTRACT_VERSION,
    userId: expectedUserId,
    profile: normalizeProfile(value.profile, expectedUserId),
    accountAccessState: value.accountAccessState as AccountAccessState,
    consentRecords,
    hasRequiredConsents: evaluateRequiredConsents(consentRecords),
    onboardingAge: onboarding.age,
    onboardingComplete: isOnboardingComplete(onboarding),
    eligibility: evaluateUserLaunchEligibility({
      ageConfirmationConsent,
      onboardingAge: onboarding.age,
    }),
    settings: normalizeSettings(value.settings, expectedUserId),
  };
}

export async function fetchPrivateAppBootstrap(
  client: SupabaseClient,
  userId: string,
): Promise<PrivateAppBootstrap> {
  const { data, error } = await client.rpc("get_private_app_bootstrap_v1");
  if (error) throw error;
  return normalizePrivateAppBootstrapPayload(data, userId);
}

export function createMockPrivateAppBootstrap(
  userId = MOCK_AUTH_USER_ID,
): PrivateAppBootstrap {
  const consentRecords: ConsentEvaluationRecord[] = REQUIRED_CONSENTS.map(
    (consent) => ({
      consent_type: consent.consent_type,
      version: consent.version,
      granted: true,
      revoked_at: null,
    }),
  );
  const onboarding = {
    age: 25,
    completed_at: new Date(0).toISOString(),
  };
  return {
    contractVersion: PRIVATE_APP_BOOTSTRAP_CONTRACT_VERSION,
    userId,
    profile: {
      id: userId,
      email: "member@plaivra.test",
      full_name: "Plaivra Member",
      role: "admin",
      avatar_url: null,
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
    },
    accountAccessState: "active",
    consentRecords,
    hasRequiredConsents: evaluateRequiredConsents(consentRecords),
    onboardingAge: onboarding.age,
    onboardingComplete: isOnboardingComplete(onboarding),
    eligibility: evaluateUserLaunchEligibility({
      ageConfirmationConsent:
        consentRecords.find(
          (record) =>
            record.consent_type === "age_16" &&
            record.version === AGE_CONFIRMATION_VERSION,
        ) ?? null,
      onboardingAge: onboarding.age,
    }),
    settings: normalizeUserAppSettings(defaultUserAppSettings, userId),
  };
}

type BootstrapLoader = () => Promise<PrivateAppBootstrap>;

export class PrivateAppBootstrapMemoryCache {
  private readonly ready = new Map<string, PrivateAppBootstrap>();
  private readonly inFlight = new Map<string, Promise<PrivateAppBootstrap>>();

  load(
    userId: string,
    loader: BootstrapLoader,
    options: { force?: boolean } = {},
  ): Promise<PrivateAppBootstrap> {
    const currentInFlight = this.inFlight.get(userId);
    if (currentInFlight) return currentInFlight;
    const currentReady = this.ready.get(userId);
    if (!options.force && currentReady) return Promise.resolve(currentReady);

    const request = loader()
      .then((result) => {
        if (result.userId !== userId) {
          throw new Error("Private bootstrap cache received another user's data.");
        }
        if (this.inFlight.get(userId) === request) {
          this.ready.set(userId, result);
          this.inFlight.delete(userId);
        }
        return result;
      })
      .catch((error) => {
        if (this.inFlight.get(userId) === request) {
          this.inFlight.delete(userId);
        }
        throw error;
      });

    this.inFlight.set(userId, request);
    return request;
  }

  clear(userId?: string) {
    if (userId) {
      this.ready.delete(userId);
      this.inFlight.delete(userId);
      return;
    }
    this.ready.clear();
    this.inFlight.clear();
  }

  peek(userId: string) {
    return this.ready.get(userId) ?? null;
  }
}

export const privateAppBootstrapMemoryCache =
  new PrivateAppBootstrapMemoryCache();
