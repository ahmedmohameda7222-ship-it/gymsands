import { LegalPage, LegalSection } from "@/components/legal/legal-page";

export default function DisclaimerPage() {
  return (
    <LegalPage
      eyebrow="Gesundheit & Sicherheit / Health & Safety"
      title="Gesundheits- und medizinischer Hinweis"
      intro="Wichtige Grenzen für Fitness-, Ernährungs-, Wellness- und AI-Inhalte in Plaivra."
      localizedCopy={{
        en: { eyebrow: "Health & Safety", title: "Health and Medical Disclaimer", intro: "Important limits for fitness, nutrition, wellness, and AI-assisted content in Plaivra." },
        ar: { eyebrow: "الصحة والسلامة", title: "إخلاء المسؤولية الصحية والطبية", intro: "حدود مهمة لمحتوى اللياقة والتغذية والعافية والمحتوى المدعوم بالذكاء الاصطناعي في Plaivra." }
      }}
    >
      <div lang="de" data-legal-language className="space-y-8">
        <LegalSection title="Keine medizinische Leistung">
          <p>Plaivra ist kein medizinischer Dienst, kein Gesundheitsversorger, kein Notfalldienst und kein Medizinprodukt. Plaivra stellt keine Diagnose oder Behandlung bereit und ersetzt keine ärztliche, therapeutische, pharmazeutische oder klinisch-ernährungsmedizinische Beratung.</p>
        </LegalSection>
        <LegalSection title="Fachlichen Rat einholen">
          <p>Bei Verletzungen, Erkrankungen, Schwangerschaft, Essstörungen, Unverträglichkeiten oder Fragen zu Medikamenten, Supplementen oder klinischer Ernährung sollte vor Trainings-, Ernährungs- oder Wellnessentscheidungen qualifizierter Rat eingeholt werden.</p>
        </LegalSection>
        <LegalSection title="Warnzeichen und Notfälle">
          <p>Bei Schmerzen, Schwindel, Ohnmacht, ungewöhnlicher Atemnot oder anderen Warnzeichen ist die Aktivität sofort abzubrechen und geeignete medizinische Hilfe zu suchen. Plaivra und ChatGPT dürfen nicht für medizinische Notfälle verwendet werden.</p>
        </LegalSection>
        <LegalSection title="AI-Inhalte">
          <p>AI-Ausgaben können unvollständig, falsch oder ungeeignet sein. Nutzer müssen jeden Plan und jede Aktion vor der Umsetzung selbst prüfen und dürfen automatisierte Inhalte nicht als professionelle Empfehlung behandeln.</p>
        </LegalSection>
      </div>
      <div lang="en" data-legal-language className="space-y-8 border-t border-border/70 pt-8">
        <LegalSection title="English summary">
          <p>Plaivra is not a medical service, healthcare provider, emergency service or medical device. It does not provide diagnosis, treatment, clinical nutrition or medical advice. People with injuries, medical conditions, pregnancy, eating disorders, intolerances, or medicine/supplement questions should consult qualified professionals.</p>
          <p>Stop activity and seek appropriate help for pain, dizziness, faintness, unusual shortness of breath or other warning signs. AI output may be incomplete, wrong or unsuitable and must be reviewed before use.</p>
        </LegalSection>
      </div>
      <div lang="ar" dir="rtl" data-legal-language className="space-y-8">
        <LegalSection title="ليست خدمة طبية">
          <p>Plaivra ليست خدمة صحية أو طبية أو خدمة طوارئ أو جهازًا طبيًا، ولا تقدم تشخيصًا أو علاجًا أو تغذية علاجية أو نصيحة طبية.</p>
        </LegalSection>
        <LegalSection title="اطلب رأيًا مختصًا">
          <p>استشر مختصًا مؤهلًا قبل قرارات التمرين أو التغذية أو العافية إذا كانت لديك إصابة أو حالة طبية أو حمل أو اضطراب أكل أو أسئلة حول الأدوية أو المكملات.</p>
        </LegalSection>
        <LegalSection title="علامات التحذير ومحتوى الذكاء الاصطناعي">
          <p>توقف واطلب المساعدة المناسبة عند الألم أو الدوار أو الإغماء أو ضيق التنفس غير المعتاد. قد تكون مخرجات ChatGPT ناقصة أو خاطئة أو غير مناسبة ويجب مراجعتها قبل التطبيق.</p>
        </LegalSection>
      </div>
    </LegalPage>
  );
}
