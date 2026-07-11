import { LegalPage, LegalSection } from "@/components/legal/legal-page";
import { LEGAL_OPERATOR } from "@/lib/legal/operator";

export default function ImpressumPage() {
  return (
    <LegalPage
      eyebrow="Legal notice"
      title="Legal Notice / Impressum"
      intro="Operator identification for Plaivra, an individually operated digital service."
      updatedLabel="11 July 2026"
    >
      <div lang="en" data-legal-language className="space-y-8">
        <LegalSection title="Operator information under Section 5 DDG">
          <p>Plaivra is operated by an individual:</p>
          <address className="not-italic">
            {LEGAL_OPERATOR.name}<br />
            {LEGAL_OPERATOR.street}<br />
            {LEGAL_OPERATOR.postalCode} {LEGAL_OPERATOR.city}<br />
            {LEGAL_OPERATOR.countryEn}
          </address>
        </LegalSection>
        <LegalSection title="Contact, support, and security">
          <p>Email: <a href={`mailto:${LEGAL_OPERATOR.email}`}>{LEGAL_OPERATOR.email}</a></p>
          <p>For a security report, include “Security” in the subject and avoid sending passwords, tokens, or unnecessary sensitive data.</p>
        </LegalSection>
        <LegalSection title="Consumer dispute resolution">
          <p>The operator is not obligated or willing to participate in dispute-resolution proceedings before a consumer arbitration board. This statement requires final professional review for the intended launch territories.</p>
        </LegalSection>
      </div>
    </LegalPage>
  );
}
