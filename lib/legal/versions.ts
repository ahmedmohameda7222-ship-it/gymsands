export const TERMS_VERSION = "2026-07-02";
export const PRIVACY_VERSION = "2026-07-02";
export const DISCLAIMER_VERSION = "2026-07-02";
export const FITNESS_DATA_CONSENT_VERSION = PRIVACY_VERSION;
export const AGE_CONFIRMATION_VERSION = "2026-07-02";
export const CHATGPT_CONNECTION_CONSENT_VERSION = "2026-07-02";

export const REQUIRED_CONSENTS = [
  { consent_type: "terms", version: TERMS_VERSION },
  { consent_type: "privacy", version: PRIVACY_VERSION },
  { consent_type: "fitness_data", version: FITNESS_DATA_CONSENT_VERSION },
  { consent_type: "health_disclaimer", version: DISCLAIMER_VERSION },
  { consent_type: "age_16", version: AGE_CONFIRMATION_VERSION }
] as const;

export const PENDING_CONSENTS_STORAGE_KEY = "plaivra.pending-required-consents.v1";
