import { LegalPage, LegalSection } from "@/components/legal/legal-page";
import { DISCLAIMER_VERSION } from "@/lib/legal/versions";

export default function DisclaimerPage() {
  return (
    <LegalPage
      eyebrow="Health & Safety"
      title="Health and Medical Disclaimer"
      intro={`Version ${DISCLAIMER_VERSION}. Read these limits before using fitness, nutrition, wellness, or AI-assisted content in Plaivra.`}
      updatedLabel="11 July 2026"
    >
      <div lang="en" data-legal-language className="space-y-8">
        <LegalSection title="Not a medical service">
          <p>Plaivra is a personal fitness context, planning, tracking, and visualization service. It is not a healthcare provider, medical service, emergency service, or medical device. It does not diagnose, infer a diagnosis, prescribe, treat, monitor a disease, or provide clinical nutrition, medical, pharmaceutical, or therapeutic advice.</p>
        </LegalSection>
        <LegalSection title="Use qualified professional advice">
          <p>Consult an appropriately qualified professional before making training, nutrition, supplement, or wellness decisions if you have an injury, medical condition, pregnancy, eating disorder, allergy/intolerance, disability, unusual symptoms, or questions about medicines, supplements, or clinical nutrition.</p>
        </LegalSection>
        <LegalSection title="Warning signs and emergencies">
          <p>Stop activity and seek appropriate help for chest pain, severe or unusual pain, dizziness, fainting, unusual shortness of breath, confusion, allergic reaction, or other concerning symptoms. Call the applicable emergency service in an emergency. Do not wait for Plaivra or ChatGPT to respond.</p>
        </LegalSection>
        <LegalSection title="AI and data limitations">
          <p>AI output and third-party food/exercise data may be wrong, incomplete, outdated, or unsuitable. Review every plan, substitution, target, calculation, and logged action. Functional constraints are user-authored planning context and are not verified medical facts or risk classifications.</p>
        </LegalSection>
        <LegalSection title="Personal responsibility and mandatory rights">
          <p>Choose activities appropriate to your circumstances, environment, equipment, and experience. Nothing in this disclaimer limits liability or consumer rights that cannot legally be limited. The final wording requires professional legal review before public launch.</p>
        </LegalSection>
      </div>
    </LegalPage>
  );
}
