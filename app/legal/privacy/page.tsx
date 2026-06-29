import { LegalPage, LegalSection } from "@/components/legal/legal-page";

export default function PrivacyPage() {
  return (
    <LegalPage eyebrow="Privacy" title="Privacy Policy" intro="This template describes Plaivra's intended handling of account, fitness, wellness, body, progress-photo and AI-connection data.">
      <LegalSection title="Controller and contact">
        <p>[Controller legal name, postal address, privacy email, and data-protection officer details if required]</p>
      </LegalSection>
      <LegalSection title="Data and purposes">
        <p>Plaivra processes account and profile data to provide authentication and account management. Fitness, nutrition, wellness, body measurements and progress photos are processed to provide the tracking features selected by the user.</p>
        <p>When a user explicitly connects ChatGPT, Plaivra processes MCP connection tokens, selected AI permission scopes, tool inputs, limited output summaries, denials, timestamps and rate-limit counters to provide and secure that connection.</p>
      </LegalSection>
      <LegalSection title="Legal bases, recipients and transfers">
        <p>[Specify GDPR Articles 6 and 9 legal bases for each purpose, processors including hosting/database providers, transfer safeguards, and retention periods after legal review.]</p>
      </LegalSection>
      <LegalSection title="Your rights">
        <p>Subject to applicable law, users may request access, correction, deletion, restriction, portability or object to processing, and may complain to a competent supervisory authority. Plaivra account settings provide request tracking for export and deletion.</p>
      </LegalSection>
      <LegalSection title="Consent and withdrawal">
        <p>Consent can be withdrawn for future processing where consent is the legal basis. AI access can be changed or revoked in Settings; revocation disables active connection use but does not retroactively erase required security audit records.</p>
      </LegalSection>
    </LegalPage>
  );
}
