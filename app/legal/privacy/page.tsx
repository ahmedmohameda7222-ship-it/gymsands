import { LegalPage, LegalSection } from "@/components/legal/legal-page";
import { LEGAL_OPERATOR } from "@/lib/legal/operator";

const emailHref = `mailto:${LEGAL_OPERATOR.email}`;

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Datenschutz / Privacy"
      title="Datenschutzerklärung"
      intro="Diese Datenschutzerklärung erläutert, wie Plaivra personenbezogene und gesundheitsnahe Daten verarbeitet. Die deutsche Fassung steht zuerst; eine englische Zusammenfassung folgt."
    >
      <div lang="de" className="space-y-8">
        <LegalSection title="1. Verantwortlicher">
          <p>Plaivra wird von Ahmed Mohamed als individuellem Betreiber geführt. Verantwortlicher im Sinne der Datenschutz-Grundverordnung (DSGVO) ist:</p>
          <address className="not-italic">
            {LEGAL_OPERATOR.name}<br />
            {LEGAL_OPERATOR.street}<br />
            {LEGAL_OPERATOR.postalCode} {LEGAL_OPERATOR.city}<br />
            {LEGAL_OPERATOR.countryDe}<br />
            E-Mail: <a href={emailHref}>{LEGAL_OPERATOR.email}</a>
          </address>
        </LegalSection>

        <LegalSection title="2. Was Plaivra anbietet">
          <p>Plaivra ist eine digitale Anwendung zur Verwaltung von Training, Ernährung, Mahlzeiten, Kalorien, Hydration, Fortschritt, Körperdaten, Fotos, Gewohnheiten, Schlaf und Erholung, Supplementen sowie persönlichen Rekorden. Nutzer können ChatGPT optional über eine OAuth-/MCP-Verbindung anbinden, um freigegebene Plaivra-Funktionen zu verwenden.</p>
        </LegalSection>

        <LegalSection title="3. Verarbeitete Datenkategorien">
          <ul className="space-y-2">
            <li>Konto- und Profildaten, insbesondere Name, E-Mail-Adresse, Kontokennung und Einstellungen;</li>
            <li>Trainingsdaten wie Pläne, Übungen, Sätze, Wiederholungen, Gewichte, Historie und Notizen;</li>
            <li>Ernährungsdaten wie Lebensmittel, Mahlzeiten, Kalorien, Makronährstoffe und Mahlzeitenpläne;</li>
            <li>Hydrationsdaten, Fortschritt, Körpergewicht, Körpermaße, persönliche Rekorde und hochgeladene Fortschrittsfotos;</li>
            <li>Wellnessdaten wie Gewohnheiten, Aufgaben, Schlaf, Erholung und Supplemente;</li>
            <li>AI-Berechtigungen und ChatGPT-/OAuth-/MCP-Verbindungsmetadaten, einschließlich Scopes, Status, Ablauf- und Widerrufsinformationen;</li>
            <li>redigierte Aktivitäts- und Audit-Einträge zu erlaubten, verweigerten oder fehlgeschlagenen ChatGPT-Aktionen;</li>
            <li>technische Sicherheitsdaten wie Sitzungs-, Zugriffs-, Rate-Limit- und Fehlerereignisse;</li>
            <li>Kommunikationsdaten, wenn der Betreiber kontaktiert wird.</li>
          </ul>
        </LegalSection>

        <LegalSection title="4. Fitness-, Körper- und Gesundheitsbezug">
          <p>Trainings-, Ernährungs-, Körper-, Fortschritts- und Wellnessdaten können sensibel sein und je nach Inhalt Rückschlüsse auf die körperliche oder gesundheitliche Situation erlauben. Plaivra behandelt solche Angaben daher vorsorglich als besonders schutzbedürftig. Bei der Registrierung wird eine gesonderte ausdrückliche Einwilligung für die vom Nutzer bereitgestellten fitness-, ernährungs-, körper- und wellnessbezogenen Daten eingeholt. Die Einwilligung kann mit Wirkung für die Zukunft widerrufen werden; betroffene Funktionen können danach nicht weiter bereitgestellt werden.</p>
        </LegalSection>

        <LegalSection title="5. Zwecke und Rechtsgrundlagen">
          <ul className="space-y-2">
            <li><strong>Kontobereitstellung und angeforderte Funktionen:</strong> Art. 6 Abs. 1 lit. b DSGVO.</li>
            <li><strong>Freiwillig bereitgestellte gesundheitsnahe Daten:</strong> Art. 6 Abs. 1 lit. b DSGVO und, soweit Art. 9 DSGVO anwendbar ist, die ausdrückliche Einwilligung nach Art. 9 Abs. 2 lit. a DSGVO.</li>
            <li><strong>Optionale ChatGPT-Verbindung:</strong> Einwilligung nach Art. 6 Abs. 1 lit. a DSGVO; bei betroffenen besonderen Daten zusätzlich Art. 9 Abs. 2 lit. a DSGVO.</li>
            <li><strong>Sicherheit, Missbrauchsabwehr und Auditierung:</strong> Art. 6 Abs. 1 lit. f DSGVO. Das berechtigte Interesse ist der sichere, nachvollziehbare Betrieb von Plaivra.</li>
            <li><strong>Support und Datenschutzanfragen:</strong> Art. 6 Abs. 1 lit. b oder f DSGVO.</li>
            <li><strong>Gesetzliche Pflichten:</strong> Art. 6 Abs. 1 lit. c DSGVO, soweit einschlägig.</li>
          </ul>
        </LegalSection>

        <LegalSection title="6. ChatGPT, MCP und OAuth">
          <p>Die ChatGPT-Verbindung ist optional und standardmäßig deaktiviert. Sie wird nur nach einer bewussten Verknüpfung, Anmeldung und Zustimmung des Nutzers aktiviert. Plaivra verwendet einen OAuth-Autorisierungscodefluss mit PKCE. Der Zugriff ist auf gespeicherte AI-Berechtigungen und angeforderte Scopes begrenzt und schlägt bei fehlenden Berechtigungen geschlossen fehl.</p>
          <p>Wiederverwendbare Verbindungs- und Zugriffstoken sowie Autorisierungscodes werden in der Datenbank nicht im Klartext gespeichert, sondern als Hash bzw. notwendige Metadaten. Verbindungen können widerrufen werden. Schreibende oder destruktive Aktionen können eine zusätzliche Bestätigung erfordern. Aktivitätsprotokolle enthalten redigierte Zusammenfassungen, aber keine rohen Prompts, Token, Autorisierungscodes, privaten Notizen oder Körpermesswerte.</p>
          <p>OpenAI bzw. ChatGPT verarbeitet Informationen innerhalb des jeweiligen ChatGPT-Produkts nach den dort geltenden Bedingungen und Datenschutzhinweisen. Die konkrete datenschutzrechtliche Rolle von OpenAI hängt vom verwendeten Produkt- und Vertragskontext ab. Plaivra behauptet keine Freigabe oder Empfehlung durch OpenAI.</p>
        </LegalSection>

        <LegalSection title="7. AI-generierte Inhalte">
          <p>Von AI erzeugte Trainings- oder Ernährungspläne können unvollständig, falsch oder ungeeignet sein. Plaivra speichert oder verwaltet solche Inhalte nur auf Veranlassung des Nutzers. Nutzer müssen Inhalte und Aktionen vor der Verwendung selbst prüfen. Plaivra erteilt keine medizinische Beratung.</p>
        </LegalSection>

        <LegalSection title="8. Dienstleister und Empfänger">
          <p>Für den technischen Betrieb werden nur tatsächlich aktivierte Dienste eingesetzt. Dazu gehören insbesondere Supabase für Datenbank, Authentifizierung und privaten Dateispeicher sowie der Hosting- und Deployment-Anbieter der eingesetzten Produktionsumgebung. Soweit E-Mail-Funktionen aktiviert sind, kann Resend für den Versand eingesetzt werden. OpenAI/ChatGPT erhält Daten nur, wenn ein Nutzer die optionale Verbindung aktiviert und eine entsprechende Aktion veranlasst.</p>
          <p>Weitere öffentliche Datenquellen können für Lebensmittel- oder Übungsinformationen abgefragt werden; dabei sollen keine Plaivra-Kontodaten übermittelt werden. Die konkreten Verträge, Rollen und Auftragsverarbeitungsbedingungen müssen vor öffentlichem Start abschließend dokumentiert und geprüft werden.</p>
        </LegalSection>

        <LegalSection title="9. Übermittlungen außerhalb EU/EWR">
          <p>Einzelne technische Anbieter können Daten außerhalb der Europäischen Union oder des Europäischen Wirtschaftsraums verarbeiten. Solche Übermittlungen dürfen nur auf einer zulässigen Grundlage erfolgen, etwa einem Angemessenheitsbeschluss oder geeigneten Garantien wie Standardvertragsklauseln. Wo erforderlich, müssen diese Garantien und ergänzende Schutzmaßnahmen vor dem öffentlichen Start abgeschlossen und dokumentiert sein.</p>
        </LegalSection>

        <LegalSection title="10. Speicherdauer">
          <ul className="space-y-2">
            <li>Konto- und Profildaten werden grundsätzlich bis zur Kontolöschung beziehungsweise Bearbeitung eines Löschantrags gespeichert, soweit keine gesetzlichen Gründe entgegenstehen.</li>
            <li>Fitness-, Ernährungs-, Körper-, Fortschritts- und Wellnessdaten bleiben gespeichert, bis sie vom Nutzer gelöscht werden oder im Rahmen der Kontolöschung entfernt werden.</li>
            <li>Aktive OAuth-Verbindungsmetadaten bleiben für die Verbindung erforderlich; widerrufene und abgelaufene Metadaten können für einen begrenzten Sicherheits- und Nachweiszeitraum aufbewahrt werden.</li>
            <li>Audit- und Sicherheitsprotokolle werden nur für einen begrenzten, zweckgebundenen Zeitraum benötigt. Eine abschließende automatisierte Löschfrist ist noch zu konfigurieren und bleibt ein Startvorbehalt.</li>
            <li>Abgelaufene OAuth-Codes und Zugriffstoken müssen regelmäßig technisch bereinigt werden; die automatische Bereinigung ist noch nicht produktiv aktiviert.</li>
            <li>Datenschutzanfragen werden solange gespeichert, wie dies für Bearbeitung, Nachweis und gesetzliche Pflichten erforderlich ist.</li>
          </ul>
        </LegalSection>

        <LegalSection title="11. Cookies, Local Storage und ähnliche Technologien">
          <p>Plaivra verwendet notwendige Browser-Speichertechnologien für Anmeldung, Sitzungsverwaltung, Sicherheitsfunktionen und vom Nutzer gewählte Einstellungen. Derzeit ist im Anwendungscode kein Marketing- oder Werbetracking vorgesehen. Falls später nicht notwendige Analyse- oder Marketingtechnologien eingeführt werden, dürfen sie erst nach der jeweils erforderlichen Einwilligung eingesetzt werden.</p>
        </LegalSection>

        <LegalSection title="12. Sicherheit">
          <p>Zu den tatsächlich vorgesehenen Schutzmaßnahmen gehören HTTPS bei der produktiven Übertragung, Supabase Row-Level Security, ein privater und eigentümergebundener Fortschrittsfoto-Speicher, gehashte OAuth-Token und Codes, serverseitige Benutzer- und Scope-Prüfungen, Eingabevalidierung, Rate Limits, widerrufbare Verbindungen und redigierte Audit-Logs. Kein technisches System kann vollständige Sicherheit garantieren.</p>
        </LegalSection>

        <LegalSection title="13. Rechte betroffener Personen">
          <p>Nach den gesetzlichen Voraussetzungen bestehen Rechte auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit, Widerspruch sowie Widerruf einer Einwilligung mit Wirkung für die Zukunft. In den Plaivra-Einstellungen können Export- und Löschanfragen erfasst werden; diese Anfragen werden nachverfolgt und nicht als sofort vollständig ausgeführt dargestellt.</p>
          <p>Anfragen können an <a href={emailHref}>{LEGAL_OPERATOR.email}</a> gerichtet werden. Beschwerden können außerdem bei einer Datenschutzaufsichtsbehörde eingereicht werden, insbesondere beim Bayerischen Landesamt für Datenschutzaufsicht (BayLDA), Promenade 18, 91522 Ansbach.</p>
        </LegalSection>

        <LegalSection title="14. Kein Medizinprodukt und keine medizinische Beratung">
          <p>Plaivra ist kein medizinischer Dienst, kein Gesundheitsversorger, kein Notfalldienst und kein Medizinprodukt. Plaivra stellt keine Diagnose, Behandlung, klinische Ernährungsberatung oder medizinische Empfehlung bereit. Personen mit Verletzungen, Erkrankungen, Schwangerschaft, Essstörungen oder Fragen zu Medikamenten, Supplementen oder klinischer Ernährung sollten qualifizierte Fachpersonen konsultieren.</p>
        </LegalSection>

        <LegalSection title="15. Änderungen">
          <p>Diese Datenschutzerklärung kann angepasst werden, wenn sich Funktionen, Rechtslage oder technische Verarbeitung ändern. Wesentliche Änderungen werden in geeigneter Weise kenntlich gemacht; soweit erforderlich, wird eine neue Zustimmung eingeholt.</p>
        </LegalSection>
      </div>

      <div lang="en" className="space-y-8 border-t border-border/70 pt-8">
        <LegalSection title="English summary">
          <p>Plaivra is operated by Ahmed Mohamed as an individual operator. The controller responsible for Plaivra is Ahmed Mohamed, {LEGAL_OPERATOR.street}, {LEGAL_OPERATOR.postalCode} {LEGAL_OPERATOR.city}, {LEGAL_OPERATOR.countryEn}. Contact: <a href={emailHref}>{LEGAL_OPERATOR.email}</a>.</p>
          <p>Plaivra processes account, workout, nutrition, hydration, body, progress-photo, wellness, AI-permission, OAuth-connection and redacted activity data to provide user-requested features and secure the service. Fitness and body-related information can be sensitive and may qualify as special-category data; registration therefore includes a separate explicit consent for data the user chooses to provide.</p>
          <p>The ChatGPT connection is optional, disabled by default, scope-controlled, revocable and protected by OAuth with PKCE. Stored credentials and authorization codes are hashed rather than retained as reusable plaintext. Redacted activity logs exclude raw prompts, tokens, authorization codes, private notes and body measurements.</p>
          <p>Depending on active configuration, technical recipients include Supabase, the production hosting provider, Resend for enabled email functions, and OpenAI/ChatGPT only when the user activates the connection. International-transfer safeguards and processor terms must be finalized before public launch where required.</p>
          <p>Users may request access, correction, erasure, restriction, portability or object to qualifying processing, withdraw consent prospectively, and complain to a supervisory authority. Requests may be sent to <a href={emailHref}>{LEGAL_OPERATOR.email}</a>.</p>
          <p>Plaivra is not a medical service, healthcare provider, emergency service or medical device and does not provide diagnosis, treatment, clinical nutrition or medical advice.</p>
        </LegalSection>
      </div>
    </LegalPage>
  );
}
