import { LegalPage, LegalSection } from "@/components/legal/legal-page";
import { LEGAL_OPERATOR } from "@/lib/legal/operator";
import { TERMS_VERSION } from "@/lib/legal/versions";

const emailHref = `mailto:${LEGAL_OPERATOR.email}`;

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of Use"
      intro={`Version ${TERMS_VERSION}. These terms govern use of Plaivra, its tracking and planning features, and its optional permission-controlled ChatGPT connection.`}
      updatedLabel="11 July 2026"
    >
      <div lang="en" data-legal-language className="space-y-8">
        <LegalSection title="1. Operator and agreement">
          <p>Plaivra is offered by {LEGAL_OPERATOR.name}, {LEGAL_OPERATOR.street}, {LEGAL_OPERATOR.postalCode} {LEGAL_OPERATOR.city}, {LEGAL_OPERATOR.countryEn}. Contact: <a href={emailHref}>{LEGAL_OPERATOR.email}</a>.</p>
          <p>By creating an account or using Plaivra, you agree to these Terms and acknowledge the Privacy Policy and Health and Medical Disclaimer. If you do not agree, do not use the service.</p>
        </LegalSection>

        <LegalSection title="2. Eligibility and accounts">
          <p>The initial EU launch is for people aged 16 or older. Plaivra has no parental-consent workflow. You must give accurate eligibility and account information, keep credentials confidential, use only your own account, and promptly report suspected unauthorized access.</p>
          <p>You are responsible for activity conducted through your account unless applicable law provides otherwise. Plaivra may require renewed consent after a material policy change.</p>
        </LegalSection>

        <LegalSection title="3. What Plaivra provides">
          <p>Plaivra stores and presents personal fitness context and user-controlled permissions; supports structured training, nutrition, hydration, progress, and wellness plans and tracking; provides direct editing and correction; and can expose authorized tools to ChatGPT.</p>
          <p>ChatGPT is the optional reasoning/execution layer. Plaivra is the storage, permissions, execution, visualization, tracking, history, correction, privacy, and direct-control layer. A successful authorized tool writes the structured result directly; there is no normal copy/import or second generic approval queue.</p>
          <p>Plaivra may change, improve, pause, or discontinue features for technical, security, legal, or operational reasons. Availability is not guaranteed and maintenance or incidents may interrupt access.</p>
        </LegalSection>

        <LegalSection title="4. ChatGPT connection and authorization">
          <p>The ChatGPT connection is optional. It requires authentication, OAuth authorization, saved permissions, and a valid resource-bound token. Plaivra checks ownership, connection state, scope, saved permissions, expiry, revocation, and request contracts server-side.</p>
          <p>ChatGPT receives only whitelisted task-relevant Plaivra context for the declared job. Authorized Plaivra tools may create or update records directly. Destructive or materially consequential actions require explicit confirmation. You may reduce permissions or revoke a connection at any time.</p>
          <p>OpenAI/ChatGPT is a separate service governed by its own applicable terms and privacy materials. Plaivra does not claim that OpenAI has reviewed, endorsed, approved, or made Plaivra available on any specific platform.</p>
        </LegalSection>

        <LegalSection title="5. AI limitations and user review">
          <p>AI output can be inaccurate, incomplete, unsuitable, delayed, or inconsistent. You must review plans, logs, calculations, substitutions, and actions before relying on them. Plaivra does not guarantee fitness progress, muscle gain, weight change, health outcomes, nutritional accuracy, or the availability or accuracy of third-party data.</p>
          <p>Stored user text is treated as data. Prompt injection, attempts to override tool rules, or instructions embedded in stored notes do not authorize access or actions.</p>
        </LegalSection>

        <LegalSection title="6. Health and medical limits">
          <p>Plaivra is not a medical service, healthcare provider, emergency service, or medical device. It does not diagnose, infer a diagnosis, prescribe, treat, or provide clinical nutrition or medical advice.</p>
          <p>Seek qualified professional advice for injuries, medical conditions, pregnancy, eating disorders, intolerances, medicines, supplements, or clinical nutrition. Stop activity and seek appropriate help for pain, dizziness, faintness, unusual shortness of breath, or other warning signs. Do not use Plaivra or ChatGPT for emergencies.</p>
        </LegalSection>

        <LegalSection title="7. Your content and permissions">
          <p>You retain rights you hold in information and content you enter or upload. You grant Plaivra the limited permission needed to store, process, display, back up, export, and transmit that content to an authorized provider only to deliver the functions you request.</p>
          <p>You must have the right to provide the content and must not upload unlawful material, another person’s confidential data without authority, malware, or content that infringes rights. Do not use Plaivra as a clinical record system.</p>
        </LegalSection>

        <LegalSection title="8. Acceptable use">
          <p>You must not:</p>
          <ul className="space-y-2">
            <li>access another person’s account or data, or bypass authentication, permissions, Row Level Security, rate limits, or user isolation;</li>
            <li>probe, attack, overload, scrape, reverse engineer, or automate the service in an abusive or unauthorized manner;</li>
            <li>use prompt injection, tool manipulation, forged tokens, replay, or misleading confirmation to obtain unauthorized data or actions;</li>
            <li>introduce malware, unlawful content, or material you have no right to use;</li>
            <li>use Plaivra for diagnosis, treatment, emergencies, or other high-risk purposes outside its stated scope;</li>
            <li>misrepresent Plaivra output as professional medical, legal, or financial advice.</li>
          </ul>
        </LegalSection>

        <LegalSection title="9. Intellectual property">
          <p>Plaivra’s software, branding, interface, and original documentation are protected by applicable intellectual-property laws. These Terms grant a personal, limited, non-exclusive, non-transferable, revocable right to use the service as intended. They do not transfer ownership of Plaivra or third-party content.</p>
        </LegalSection>

        <LegalSection title="10. Suspension, termination, and deletion">
          <p>Plaivra may restrict or suspend access when reasonably necessary to address security risk, abuse, legal obligations, or material breach. Where appropriate, notice and an opportunity to resolve the issue will be provided.</p>
          <p>You may stop using Plaivra and request deletion in Settings. Deletion requires recent reauthentication and explicit confirmation, revokes connected access, checks legal holds/provider cleanup, disables access, removes private objects and account rows, and deletes the Auth account. Once irreversible processing begins, deleted data may not be recoverable.</p>
        </LegalSection>

        <LegalSection title="11. Data export and continuity">
          <p>You can request a portable ZIP export containing canonical JSON, CSV files, and a storage manifest. Keep downloaded archives secure. Plaivra does not promise perpetual storage; export important data before deleting an account or when notified of a service discontinuation.</p>
        </LegalSection>

        <LegalSection title="12. Paid plans, cancellation, and refunds">
          <p>No paid public plan, price, subscription capability, or checkout is represented as active in the audited launch scope. Plaivra will not invent or charge a price without an owner-approved offering and separate payment implementation.</p>
          <p>If paid plans are introduced, the plan capabilities, total price, billing interval, renewal, cancellation, refund, trial, tax, expiry, and platform-specific purchase terms will be shown before purchase and incorporated into an updated version of these Terms. Payment credentials will be collected by the payment provider, not through Plaivra’s ChatGPT tools. Mandatory consumer rights will remain unaffected.</p>
        </LegalSection>

        <LegalSection title="13. Third-party services">
          <p>Plaivra depends on providers such as Supabase, the production hosting provider, and—when you choose them—ChatGPT or email services. Third-party outages, policy changes, data sources, or account restrictions may affect features. Third-party services have their own terms and policies.</p>
        </LegalSection>

        <LegalSection title="14. Liability">
          <p>Nothing in these Terms excludes liability that cannot legally be excluded, including liability for intent, gross negligence, injury to life, body, or health, or mandatory product-liability and consumer-protection rules.</p>
          <p>For slight negligence involving an essential contractual duty, liability is limited to typical foreseeable damage. An essential duty is one whose performance makes the service contract possible and on which a user may normally rely. Otherwise, liability is excluded to the extent permitted by law. This clause requires professional legal review before launch.</p>
        </LegalSection>

        <LegalSection title="15. Changes to these Terms">
          <p>Plaivra may update these Terms for legal, security, technical, or functional reasons. Material changes receive a new version and appropriate notice; renewed consent will be requested where required. Continued use will not be treated as consent where law requires an explicit action.</p>
        </LegalSection>

        <LegalSection title="16. Governing law and disputes">
          <p>German law applies, excluding the UN Convention on Contracts for the International Sale of Goods. Mandatory consumer protections of the country in which a consumer habitually resides remain unaffected. Statutory consumer venues apply.</p>
          <p>The operator is not obligated or willing to participate in dispute-resolution proceedings before a consumer arbitration board. This statement and the governing-law clause require final professional review for the intended launch territories.</p>
        </LegalSection>

        <LegalSection title="17. Contact">
          <p>Questions, support requests, and security reports may be sent to <a href={emailHref}>{LEGAL_OPERATOR.email}</a>. Include only the information needed to investigate your request.</p>
        </LegalSection>
      </div>
    </LegalPage>
  );
}
