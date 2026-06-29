import { LegalPage, LegalSection } from "@/components/legal/legal-page";

export default function TermsPage() {
  return (
    <LegalPage eyebrow="Legal" title="Terms of Service" intro="Terms template for use of Plaivra's fitness tracking and optional ChatGPT connection features.">
      <LegalSection title="Service and eligibility">
        <p>Plaivra provides tools for personal fitness, nutrition, wellness and progress tracking. Users must be at least 18 years old and provide accurate account information.</p>
      </LegalSection>
      <LegalSection title="Account security and AI control">
        <p>Users are responsible for protecting account credentials and one-time ChatGPT connection codes. ChatGPT access is limited to saved AI permissions and can be revoked from Settings. Users must review high-impact actions and outputs before relying on them.</p>
      </LegalSection>
      <LegalSection title="Acceptable use and availability">
        <p>[Add reviewed rules on prohibited use, suspension, service availability, intellectual property, subscriptions if any, liability limitations, termination and governing law.]</p>
      </LegalSection>
      <LegalSection title="Health limitation">
        <p>Plaivra is not medical advice and does not diagnose or treat any condition. Consult a qualified doctor or trainer before beginning or changing a program, and stop immediately if you experience pain or concerning symptoms.</p>
      </LegalSection>
    </LegalPage>
  );
}
