import { LegalPage, LegalSection } from "@/components/legal/legal-page";

export default function ImpressumPage() {
  return (
    <LegalPage eyebrow="Legal" title="Impressum" intro="Provider identification template under German law.">
      <LegalSection title="Service provider">
        <p>[Legal name / company name]</p>
        <p>[Street and house number], [postal code and city], Germany</p>
        <p>Email: [legal contact email] · Phone: [phone number]</p>
      </LegalSection>
      <LegalSection title="Responsible person and registrations">
        <p>[Managing director / person responsible for content]</p>
        <p>[Commercial register, register court, registration number, VAT ID—where applicable]</p>
      </LegalSection>
      <LegalSection title="Dispute resolution">
        <p>[Add the legally reviewed consumer dispute-resolution statement applicable to the operator.]</p>
      </LegalSection>
    </LegalPage>
  );
}
