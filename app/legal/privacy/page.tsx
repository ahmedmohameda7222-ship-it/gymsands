import { LegalPage, LegalSection } from "@/components/legal/legal-page";
import { LEGAL_OPERATOR } from "@/lib/legal/operator";
import { PRIVACY_VERSION } from "@/lib/legal/versions";

const emailHref = `mailto:${LEGAL_OPERATOR.email}`;

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Privacy"
      title="Privacy Policy"
      intro={`Version ${PRIVACY_VERSION}. This policy explains what Plaivra processes, why it is processed, how optional ChatGPT access works, and the controls available to you.`}
      updatedLabel="11 July 2026"
    >
      <div lang="en" data-legal-language className="space-y-8">
        <LegalSection title="1. Controller and contact">
          <p>Plaivra is operated by {LEGAL_OPERATOR.name} as an individual operator. The controller responsible for Plaivra is:</p>
          <address className="not-italic">
            {LEGAL_OPERATOR.name}<br />
            {LEGAL_OPERATOR.street}<br />
            {LEGAL_OPERATOR.postalCode} {LEGAL_OPERATOR.city}<br />
            {LEGAL_OPERATOR.countryEn}<br />
            Email: <a href={emailHref}>{LEGAL_OPERATOR.email}</a>
          </address>
          <p>Use the same address for privacy, support, or security reports. Add “Privacy” or “Security” to the subject so the request can be prioritized.</p>
        </LegalSection>

        <LegalSection title="2. Scope of this policy">
          <p>This policy covers the Plaivra website, web application, accounts, tracking and planning features, private file storage, support communications, and the optional connection that lets ChatGPT use authorized Plaivra tools. It does not govern ChatGPT itself or third-party websites you choose to visit.</p>
        </LegalSection>

        <LegalSection title="3. Data categories">
          <ul className="space-y-2">
            <li><strong>Account and eligibility:</strong> user ID, email, name, sign-in provider, account state, age declaration, and versioned 16+ eligibility confirmation.</li>
            <li><strong>Profile and preferences:</strong> goals, schedule, training experience, equipment, optional height, weight, target weight, gender, lifestyle preferences, app settings, and consent history.</li>
            <li><strong>Training:</strong> plans, days, exercises, sets, repetitions, loads, sessions, history, alternatives, favorites, and user-authored notes.</li>
            <li><strong>Nutrition and hydration:</strong> foods, meals, recipes, meal plans, groceries, calories, macronutrients, targets, preferences, water logs, and related notes.</li>
            <li><strong>Progress and wellness:</strong> body measurements, weight, progress entries and photos, records, habits, tasks, sleep, recovery, supplements, and daily check-ins.</li>
            <li><strong>Functional constraints:</strong> optional user-authored movements, areas, foods, or practical limitations that an authorized planning task should respect. Plaivra does not infer a diagnosis.</li>
            <li><strong>ChatGPT connection:</strong> connection label and status, permitted scopes, OAuth client/resource metadata, grant/revocation timestamps, and redacted tool activity.</li>
            <li><strong>Security and operations:</strong> authentication events, short-lived authorization data, rate-limit records, idempotency hashes, error events, release/version data, and minimized audit records.</li>
            <li><strong>Privacy and support:</strong> export/deletion requests, support messages, delivery status, and minimized processing evidence.</li>
          </ul>
          <p>Plaivra does not need payment-card credentials for its current unpaid launch scope and does not collect payment credentials through ChatGPT tools.</p>
        </LegalSection>

        <LegalSection title="4. Sensitive fitness and body data">
          <p>Fitness, nutrition, body, progress-photo, wellness, and functional-constraint information may be sensitive and may reveal information about physical condition. Plaivra treats it as highly protected user-provided data. Where Article 9 GDPR applies, processing relies on the separate explicit consent collected during registration. You may withdraw that consent for future processing, but affected features may then be unavailable.</p>
          <p>Plaivra is not a medical application. It does not diagnose, infer a diagnosis, prescribe, or treat. Stored text is treated as user-provided data, not as instructions for the system or verified medical fact.</p>
        </LegalSection>

        <LegalSection title="5. Purposes and legal bases">
          <ul className="space-y-2">
            <li><strong>Provide the account and requested features:</strong> performance of a contract under Article 6(1)(b) GDPR.</li>
            <li><strong>Process voluntarily provided sensitive fitness/body data:</strong> Article 6(1)(b) and, where required, explicit consent under Article 9(2)(a) GDPR.</li>
            <li><strong>Connect ChatGPT and apply permissions:</strong> your consent under Article 6(1)(a), plus Article 9(2)(a) where special-category data is involved.</li>
            <li><strong>Security, fraud prevention, rate limiting, debugging, and accountable audit:</strong> legitimate interests under Article 6(1)(f), balanced against data minimization and your rights.</li>
            <li><strong>Support and privacy requests:</strong> Article 6(1)(b), (c), or (f), depending on the request and applicable obligation.</li>
            <li><strong>Legal obligations and claims:</strong> Article 6(1)(c) or (f), where applicable.</li>
          </ul>
          <p>The precise legal-basis analysis, especially for sensitive data and international transfers, requires professional legal review before launch.</p>
        </LegalSection>

        <LegalSection title="6. Optional ChatGPT and Plaivra tools">
          <p>The ChatGPT connection is optional and off until you initiate it in ChatGPT, authenticate, and grant limited scopes. For a declared task, Plaivra maps required scopes, retrieves only whitelisted task-relevant fields, and rejects missing, expired, revoked, wrong-resource, or cross-user authorization.</p>
          <p>When an authorized Plaivra tool succeeds, the structured result is stored directly in Plaivra and remains visible, editable, and correctable. Plaivra does not add a generic second approval/import queue. Explicit confirmation is still required for destructive or materially consequential actions.</p>
          <p>Public tools use strict input/output contracts. Redacted activity records may contain tool name, outcome, time, and a safe reason code. They exclude raw prompts, tokens, authorization codes, private notes, measurements, photo paths, and internal exception details.</p>
        </LegalSection>

        <LegalSection title="7. OAuth, tokens, permissions, and revocation">
          <p>Plaivra uses authorization code flow with PKCE and resource-bound access. Reusable access tokens and authorization codes are stored as hashes, not reusable plaintext. Server-side checks cover issuer, audience/resource, expiry, not-before time, scope, connection ownership, saved permissions, and revocation.</p>
          <p>You can review or revoke a connection and reduce permissions in Settings. Revocation stops future ChatGPT access. A deletion request revokes active ChatGPT connections, OAuth access tokens, and Supabase refresh sessions when accepted.</p>
        </LegalSection>

        <LegalSection title="8. Recipients and processors">
          <ul className="space-y-2">
            <li><strong>Supabase:</strong> database, authentication, private file storage, and related platform services.</li>
            <li><strong>Production hosting/deployment provider:</strong> application delivery, server execution, and operational logs.</li>
            <li><strong>Resend:</strong> only when an email function or deletion-completion notification is configured and used.</li>
            <li><strong>OpenAI/ChatGPT:</strong> only when you activate the connection or otherwise use ChatGPT; OpenAI processes data within its own product and contractual context.</li>
            <li><strong>Public food/exercise data sources:</strong> product or exercise queries may be sent without Plaivra account data when those functions are used.</li>
          </ul>
          <p>Processor agreements, roles, sub-processors, hosting configuration, and transfer safeguards must be verified and documented before launch. Plaivra does not claim endorsement or approval by OpenAI or any provider.</p>
        </LegalSection>

        <LegalSection title="9. International transfers">
          <p>Some providers may process data outside the EU/EEA. A transfer may occur only with a lawful transfer mechanism, such as an adequacy decision or appropriate safeguards including Standard Contractual Clauses, plus supplementary measures where required. The final provider-by-provider transfer assessment is a launch-blocking professional-review item.</p>
        </LegalSection>

        <LegalSection title="10. Storage, security, and access control">
          <p>Implemented safeguards include HTTPS in production, owner-scoped Row Level Security, server-only service credentials, private owner-folder photo storage, signed URLs, hashed OAuth artifacts, scoped authorization, rate limits, strict schemas, redacted logs, replay protection, and cross-user tests. No system can guarantee absolute security.</p>
          <p>Do not send credentials, medical records, or unnecessary sensitive information to support. Report suspected unauthorized access promptly to <a href={emailHref}>{LEGAL_OPERATOR.email}</a>.</p>
        </LegalSection>

        <LegalSection title="11. Retention">
          <p>Account content is retained while the account is active and until you delete individual records or a verified account deletion completes, unless a legal obligation or active legal hold requires limited retention. Completion evidence is minimized and separated from deleted account content.</p>
          <p>OAuth codes/tokens, redacted MCP activity, operational security logs, completed privacy requests, idempotency records, and deletion evidence have bounded cleanup mechanisms with dry-run metrics and batching. Concrete periods have not yet been owner/legal approved and must remain unconfigured until that review is complete. Public launch is blocked until the final periods, purposes, alerts, and recovery process are approved and published. No unapproved period is represented here as final.</p>
        </LegalSection>

        <LegalSection title="12. Export and account deletion">
          <p>Settings provide an authenticated ZIP export containing canonical JSON, per-domain CSV files, and a storage-object manifest. Credentials, reusable tokens, idempotency hashes, and internal security telemetry are excluded.</p>
          <p>Account deletion requires recent reauthentication, a detailed impact summary, and exact confirmation. The lifecycle revokes connections, checks legal holds and provider cleanup, disables access, removes private objects through the Storage API, removes or anonymizes dependent records, deletes the Auth user, and sends a completion notification when configured. Failures retry safely and expose a non-sensitive status.</p>
        </LegalSection>

        <LegalSection title="13. Your rights">
          <p>Subject to applicable conditions, you may request access, correction, erasure, restriction, portability, or object to processing, and may withdraw consent for the future. Use Plaivra Settings or email <a href={emailHref}>{LEGAL_OPERATOR.email}</a>. Identity verification may be required.</p>
          <p>You may complain to a competent supervisory authority, including the Bavarian State Office for Data Protection Supervision (BayLDA), Promenade 18, 91522 Ansbach, Germany.</p>
        </LegalSection>

        <LegalSection title="14. Cookies, local storage, and analytics">
          <p>Plaivra uses necessary browser storage and authentication/session technologies for sign-in, security, language, and user-selected preferences. The audited launch code does not include advertising or marketing trackers. Privacy-aware product analytics may be introduced only after purpose, provider, data fields, retention, and consent requirements are approved and disclosed. Non-essential analytics will not be enabled before any required consent.</p>
        </LegalSection>

        <LegalSection title="15. Age eligibility">
          <p>The initial EU launch is limited to people aged 16 or older. Registration and onboarding enforce the same threshold. Accounts with missing or conflicting historical evidence are reviewed and are not silently deleted. Plaivra has not implemented a parental-consent architecture.</p>
        </LegalSection>

        <LegalSection title="16. Changes and versions">
          <p>Material changes receive a new version and, where required, a renewed consent. The current policy version and effective date appear at the top of this page. Earlier consent records remain versioned for accountability.</p>
        </LegalSection>
      </div>
    </LegalPage>
  );
}
