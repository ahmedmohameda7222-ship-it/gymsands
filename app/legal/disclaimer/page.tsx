import { LegalPage, LegalSection } from "@/components/legal/legal-page";

export default function DisclaimerPage() {
  return (
    <LegalPage eyebrow="Health & safety" title="Fitness and Health Disclaimer" intro="Important limitations for Plaivra and AI-generated fitness, nutrition and wellness content.">
      <LegalSection title="Not medical advice">
        <p>Plaivra and connected AI outputs are for general informational and tracking purposes only. They are not medical advice and are not a diagnosis, treatment, cure or prevention of any disease, injury or health condition.</p>
      </LegalSection>
      <LegalSection title="Get professional guidance">
        <p>Consult a qualified doctor before starting or changing exercise, nutrition, supplement or wellness activities, particularly if you have symptoms, an injury, a medical condition, take medication, are pregnant, or are unsure what is safe. A qualified trainer or dietitian can help adapt plans to you.</p>
      </LegalSection>
      <LegalSection title="Stop if pain occurs">
        <p>Stop exercising immediately if you feel pain, dizziness, faintness, unusual shortness of breath or other concerning symptoms, and seek appropriate medical care. Never use Plaivra or ChatGPT for emergencies.</p>
      </LegalSection>
      <LegalSection title="AI output">
        <p>AI can be incomplete or wrong. Review every recommendation and action, use your own judgment, and do not treat automated content as professional advice.</p>
      </LegalSection>
    </LegalPage>
  );
}
