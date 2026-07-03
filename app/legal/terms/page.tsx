import { LegalPage, LegalSection } from "@/components/legal/legal-page";
import { LEGAL_OPERATOR } from "@/lib/legal/operator";

const emailHref = `mailto:${LEGAL_OPERATOR.email}`;

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Rechtliches / Legal"
      title="Nutzungsbedingungen"
      intro="Diese Bedingungen regeln die Nutzung von Plaivra. Die deutsche Fassung steht zuerst; eine englische Zusammenfassung folgt."
    >
      <div lang="de" className="space-y-8">
        <LegalSection title="1. Anbieter und Geltungsbereich">
          <p>Plaivra wird von Ahmed Mohamed als individuellem Betreiber angeboten. Kontakt: {LEGAL_OPERATOR.name}, {LEGAL_OPERATOR.street}, {LEGAL_OPERATOR.postalCode} {LEGAL_OPERATOR.city}, {LEGAL_OPERATOR.countryDe}, <a href={emailHref}>{LEGAL_OPERATOR.email}</a>.</p>
          <p>Diese Nutzungsbedingungen gelten für die Website, Web-Anwendung, Nutzerkonten, Tracking-Funktionen und optionalen ChatGPT-Verbindungen von Plaivra.</p>
        </LegalSection>
        <LegalSection title="2. Leistungsbeschreibung">
          <p>Plaivra unterstützt die persönliche Verwaltung von Training, Ernährung, Mahlzeiten, Kalorien, Hydration, Fortschritt, Körperdaten, Fotos, Gewohnheiten, Schlaf, Erholung, Supplementen und persönlichen Rekorden. Optional können Nutzer Inhalte und Aktionen von ChatGPT über eine freigegebene Verbindung verwalten.</p>
          <p>Plaivra garantiert keinen Muskelaufbau, Gewichtsverlust, Gesundheitsfortschritt oder sonstigen persönlichen Erfolg. Die Richtigkeit, Vollständigkeit und Eignung AI-generierter Inhalte wird nicht garantiert.</p>
        </LegalSection>
        <LegalSection title="3. Registrierung, Alter und Kontosicherheit">
          <p>Plaivra richtet sich an Personen ab 16 Jahren. Soweit anwendbares Recht darüber hinaus eine Zustimmung Sorgeberechtigter oder andere Voraussetzungen verlangt, muss diese vorliegen. Nutzer müssen richtige Angaben machen, Zugangsdaten schützen und erkennbare unbefugte Zugriffe unverzüglich an den Betreiber melden.</p>
        </LegalSection>
        <LegalSection title="4. Gesundheit und medizinische Grenzen">
          <p>Plaivra ist kein medizinischer Dienst, kein Medizinprodukt, kein Notfalldienst und ersetzt keine Diagnose, Behandlung, medizinische Untersuchung, Therapie oder klinische Ernährungsberatung. AI-generierte Pläne müssen vor der Verwendung geprüft werden.</p>
          <p>Personen mit Erkrankungen, Verletzungen, Schwangerschaft, Essstörungen oder Fragen zu Medikamenten, Supplementen oder klinischer Ernährung sollten vor entsprechenden Entscheidungen qualifizierte ärztliche, therapeutische oder ernährungsmedizinische Beratung einholen. Bei Schmerzen, Schwindel, Atemnot oder anderen Warnzeichen ist die Aktivität abzubrechen und geeignete Hilfe zu suchen.</p>
        </LegalSection>
        <LegalSection title="5. ChatGPT- und AI-Funktionen">
          <p>Die ChatGPT-Verbindung ist optional und standardmäßig deaktiviert. Sie erfordert eine bewusste OAuth-Verknüpfung und gespeicherte AI-Berechtigungen. Zugriffe sind auf Scopes begrenzt, schlagen ohne Berechtigung geschlossen fehl, können widerrufen werden und werden redigiert protokolliert. Folgenreiche Aktionen können eine ausdrückliche Bestätigung erfordern.</p>
          <p>AI-Ausgaben können falsch, unvollständig oder ungeeignet sein. Nutzer bleiben für die Prüfung von Inhalten und Aktionen verantwortlich. Plaivra behauptet keine Freigabe oder Empfehlung durch OpenAI.</p>
        </LegalSection>
        <LegalSection title="6. Zulässige Nutzung">
          <p>Untersagt sind insbesondere:</p>
          <ul className="space-y-2">
            <li>rechtswidrige Nutzung oder Zugriff auf Konten anderer Personen;</li>
            <li>Umgehung von Authentifizierung, Row-Level Security, AI-Berechtigungen oder sonstigen Schutzmaßnahmen;</li>
            <li>Scraping, Überlastung, missbräuchliche Automatisierung, Reverse Engineering oder Sicherheitsangriffe;</li>
            <li>Prompt-Injection- oder Tool-Missbrauch mit dem Ziel, Daten anderer Nutzer oder interne Geheimnisse abzurufen;</li>
            <li>Eingabe, Upload oder Verbreitung rechtswidriger, schädlicher oder unberechtigter Inhalte;</li>
            <li>Nutzung als medizinisches Notfall-, Diagnose- oder Behandlungssystem.</li>
          </ul>
        </LegalSection>
        <LegalSection title="7. Nutzerinhalte">
          <p>Nutzer bleiben für Inhalte verantwortlich, die sie eingeben, hochladen oder importieren. Es dürfen nur Inhalte bereitgestellt werden, zu deren Nutzung sie berechtigt sind. Der Betreiber verarbeitet diese Inhalte nur in dem Umfang, der für Speicherung, Darstellung, Export und die vom Nutzer angeforderten Plaivra-Funktionen erforderlich ist.</p>
        </LegalSection>
        <LegalSection title="8. Verfügbarkeit und Änderungen">
          <p>Eine ununterbrochene oder fehlerfreie Verfügbarkeit wird nicht zugesagt. Funktionen können aus technischen, sicherheitsbezogenen, rechtlichen oder betrieblichen Gründen geändert, eingeschränkt oder eingestellt werden. Zwingende Rechte bleiben unberührt.</p>
        </LegalSection>
        <LegalSection title="9. Haftung">
          <p>Der Betreiber haftet unbeschränkt bei Vorsatz und grober Fahrlässigkeit, bei schuldhafter Verletzung von Leben, Körper oder Gesundheit sowie in Fällen zwingender gesetzlicher Haftung.</p>
          <p>Bei leicht fahrlässiger Verletzung wesentlicher Vertragspflichten ist die Haftung auf den vertragstypischen, vorhersehbaren Schaden begrenzt. Wesentliche Vertragspflichten sind Pflichten, deren Erfüllung die ordnungsgemäße Durchführung überhaupt ermöglicht und auf deren Einhaltung regelmäßig vertraut werden darf. Im Übrigen ist die Haftung ausgeschlossen, soweit dies gesetzlich zulässig ist.</p>
        </LegalSection>
        <LegalSection title="10. Sperrung, Beendigung und Löschung">
          <p>Nutzer können die Nutzung beenden und über die Datenschutzeinstellungen eine Löschanfrage stellen. Eine Anfrage wird nachverfolgt und führt nicht zwingend sofort zur vollständigen technischen Löschung. Der Betreiber kann Zugriffe bei Missbrauch, Sicherheitsrisiken, Rechtsverstößen oder erheblichen Verstößen gegen diese Bedingungen vorübergehend sperren oder beenden.</p>
        </LegalSection>
        <LegalSection title="11. Änderungen der Bedingungen">
          <p>Änderungen können aus rechtlichen, technischen, sicherheitsbezogenen oder funktionalen Gründen mit Wirkung für die Zukunft erfolgen. Wesentliche Änderungen werden angemessen mitgeteilt. Soweit erforderlich, wird eine neue Zustimmung eingeholt.</p>
        </LegalSection>
        <LegalSection title="12. Anwendbares Recht">
          <p>Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts. Zwingende Verbraucherschutzvorschriften des Staates, in dem ein Verbraucher seinen gewöhnlichen Aufenthalt hat, bleiben unberührt. Für Verbraucher gelten die gesetzlichen Gerichtsstände.</p>
        </LegalSection>
      </div>

      <div lang="en" className="space-y-8 border-t border-border/70 pt-8">
        <LegalSection title="English summary">
          <p>Plaivra is operated by Ahmed Mohamed as an individual operator. It provides personal fitness, nutrition, hydration, progress and wellness organization, including an optional permission-controlled ChatGPT connection. No fitness, weight-loss, health or AI-accuracy result is guaranteed.</p>
          <p>Plaivra is intended for users aged 16 or older, subject to any additional guardian-consent requirements under applicable law. Users must protect credentials, provide accurate account information and report unauthorized access.</p>
          <p>Plaivra is not a medical service, medical device or emergency service and does not provide diagnosis, treatment or clinical nutrition advice. Users must review AI-generated content and consult qualified professionals for medical conditions, injuries, pregnancy, eating disorders, medicines, supplements or clinical nutrition.</p>
          <p>ChatGPT access is optional, disabled by default, OAuth-connected, scope-controlled, revocable and redacted in audit records. Attempts to bypass security, AI permissions or user isolation are prohibited.</p>
          <p>Liability remains unlimited for intent, gross negligence, injury to life/body/health and mandatory statutory cases. For slight negligence involving essential obligations, liability is limited to typical foreseeable damage. German law applies without overriding mandatory consumer protections.</p>
          <p>Contact: {LEGAL_OPERATOR.name}, {LEGAL_OPERATOR.street}, {LEGAL_OPERATOR.postalCode} {LEGAL_OPERATOR.city}, {LEGAL_OPERATOR.countryEn}, <a href={emailHref}>{LEGAL_OPERATOR.email}</a>.</p>
        </LegalSection>
      </div>
    </LegalPage>
  );
}
