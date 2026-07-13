# Cross-platform screen parity matrix

Semantic parity does not mean pixel parity. Web uses browser-native navigation, iOS uses Apple-native behavior, and Android uses Material/system behavior.

| User job | Web route | iOS destination | Android destination | Shared contract |
| --- | --- | --- | --- | --- |
| Today | `/dashboard` | Today tab | Today top-level | task projections, execution states |
| Train | `/my-workout/plans` | Train tab | Train top-level | plans, sessions, optimistic concurrency |
| Active workout | `/workouts/session/{id}` | Full-screen session | Full-screen session | offline queue, stable IDs |
| Eat / food log | `/calories` | Eat tab | Eat top-level | food logs, idempotent writes |
| Meal plan / groceries | `/my-meal-plan` | Eat detail | Eat detail | plan items, groceries, conflict rules |
| Progress | `/progress` | Progress tab | Progress top-level | accessible series and summaries |
| Settings | `/settings` | Settings tab | Settings top-level | account and preferences |
| Connections | `/settings/connections` | Connections detail | Connections detail | OAuth scopes/revocation |
| Privacy / export / deletion | `/settings/data-privacy`, `/settings/account` | Privacy & account | Privacy & account | reauth, lifecycle status |
| Subscription | `/settings/subscription` | Subscription detail | Subscription detail | provider-neutral entitlement |
| OAuth consent | `/oauth/authorize` | System-browser handoff | Custom Tab handoff | authorization code + PKCE |
| Legal / support | `/legal/*` | In-app browser/system browser | Custom Tab/system browser | versioned legal URLs |

Every implemented destination requires loading, empty, error, offline, retry, revoked, large-text, screen-reader, keyboard-visible where relevant, and reduced-motion coverage before native launch.
