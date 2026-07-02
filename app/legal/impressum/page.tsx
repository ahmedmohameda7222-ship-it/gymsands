import { LegalPage, LegalSection } from "@/components/legal/legal-page";
import { LEGAL_OPERATOR } from "@/lib/legal/operator";

export default function ImpressumPage() {
  return (
    <LegalPage
      eyebrow="Rechtliche Angaben"
      title="Impressum"
      intro="Anbieterkennzeichnung für Plaivra als individuell betriebenen digitalen Dienst."
    >
      <LegalSection title="Angaben gemäß § 5 DDG">
        <p>Plaivra wird von Ahmed Mohamed als individuellem Betreiber geführt.</p>
        <address className="not-italic">
          {LEGAL_OPERATOR.name}<br />
          {LEGAL_OPERATOR.street}<br />
          {LEGAL_OPERATOR.postalCode} {LEGAL_OPERATOR.city}<br />
          {LEGAL_OPERATOR.countryDe}
        </address>
      </LegalSection>
      <LegalSection title="Kontakt">
        <p>E-Mail: <a href={`mailto:${LEGAL_OPERATOR.email}`}>{LEGAL_OPERATOR.email}</a></p>
      </LegalSection>
      <LegalSection title="Verbraucherstreitbeilegung">
        <p>Der Betreiber ist nicht verpflichtet und nicht bereit, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>
      </LegalSection>
    </LegalPage>
  );
}
