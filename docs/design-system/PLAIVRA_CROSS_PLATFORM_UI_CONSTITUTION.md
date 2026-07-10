# Plaivra Cross-Platform UI Constitution

**Version:** 2026.2  
**Status:** Highest UI authority  
**Platforms:** Responsive web, iOS, Android, and selective ChatGPT UI

## 1. Objective

Plaivra must feel like one premium product across every platform without forcing identical pixel-level implementations.

The system is:

```text
one product language
+ shared semantic design tokens
+ shared component contracts
+ platform-native interaction behavior
```

Web is the functional reference implementation. It is not a screenshot template for iOS or Android.

## 2. Priority order

When requirements conflict, use this order:

1. user safety and data clarity;
2. accessibility;
3. platform-native behavior;
4. task clarity and speed;
5. Plaivra product rules;
6. design-system consistency;
7. decorative visual treatment.

## 3. Unit mapping

- Web specifications use CSS pixels (`px`).
- iOS specifications use points (`pt`).
- Android specifications use density-independent pixels (`dp`) and scalable pixels (`sp`).
- Token names are shared; rendered values may adapt by platform.

Never convert blindly between units based only on numeric equality. Preserve the intended physical comfort, hierarchy, and density.

## 4. Touch and pointer targets

Plaivra standards are intentionally stronger than bare minimum compliance.

| Control | Responsive web | iOS | Android |
|---|---:|---:|---:|
| Minimum effective touch target | 44 × 44 px; prefer 48 × 48 on mobile | 44 × 44 pt | 48 × 48 dp |
| Icon-only visual glyph | 20–24 px | 20–24 pt | 20–24 dp |
| Standard button height | 44–48 px | 44–50 pt | 48–52 dp |
| Primary mobile CTA | 52–56 px | 50–56 pt | 52–56 dp |
| Compact desktop-only button | 36–40 px | not a default mobile pattern | not a default mobile pattern |
| Interactive list row | 52–64 px | 52–64 pt | 56–64 dp |

The visible icon may be smaller than the hit area. Adjacent destructive and primary actions require additional separation.

## 5. Spacing scale

Use this semantic scale across platforms:

| Token | Value | Intended use |
|---|---:|---|
| `space-0.5` | 2 | optical correction only |
| `space-1` | 4 | tightly related content |
| `space-2` | 8 | inline and compact groups |
| `space-3` | 12 | compact component padding/gaps |
| `space-4` | 16 | default mobile rhythm |
| `space-5` | 20 | comfortable content separation |
| `space-6` | 24 | card padding and section internals |
| `space-8` | 32 | major section separation |
| `space-10` | 40 | page-level separation |
| `space-12` | 48 | hero or major rhythm |
| `space-16` | 64 | large structural rhythm |

No repeated arbitrary values. An optical exception must be local, documented, and not copied into a new token without evidence.

## 6. Page gutters and widths

### Phone

- minimum horizontal content gutter: 16;
- preferred comfortable gutter on larger phones: 20;
- full-bleed content is limited to media, charts, and deliberate edge treatments;
- sticky bottom actions include safe-area padding.

### Tablet

- horizontal gutter: 24–32;
- use split views only when both panes remain independently useful;
- do not stretch phone cards across the whole screen.

### Desktop web

- standard page gutter: 32–48 px;
- default content maximum: 1200–1280 px;
- focused form maximum: 560–680 px;
- dense data view maximum may exceed 1280 only with a documented need;
- primary text columns should normally remain 60–80 characters wide.

## 7. Radius system

| Token | Value | Use |
|---|---:|---|
| `radius-sm` | 8 | chips, compact controls |
| `radius-md` | 12 | inputs, small cards |
| `radius-lg` | 16 | standard cards and sheets |
| `radius-xl` | 20 | prominent surfaces |
| `radius-2xl` | 24 | hero or high-emphasis surfaces |
| `radius-full` | 999 | pills, avatars, circular controls |

Use fewer radius values, not more. Platform-native system controls may retain their native radius.

## 8. Typography

### Shared semantic roles

- `display`: exceptional marketing or milestone emphasis;
- `title-1`: screen title;
- `title-2`: major section title;
- `title-3`: card or focused group title;
- `body`: primary reading text;
- `body-strong`: emphasized body text;
- `label`: control and metadata label;
- `caption`: secondary metadata only;
- `numeric`: tabular or metric values.

### Web reference scale

| Role | Size / line-height |
|---|---|
| Display | 40–56 / 1.05–1.15 |
| Title 1 | 28–36 / 1.15–1.25 |
| Title 2 | 22–28 / 1.2–1.3 |
| Title 3 | 18–22 / 1.25–1.35 |
| Body | 16 / 1.45–1.6 |
| Secondary body | 14 / 1.4–1.55 |
| Caption | 12–13 / 1.35–1.5 |

### Native requirements

- iOS text must support Dynamic Type and semantic text styles.
- Android text must use scalable `sp` values and support user font scaling.
- Layouts must remain functional at large accessibility text sizes.
- Never truncate primary actions or safety/permission meaning solely to preserve visual symmetry.

## 9. Color and contrast

Use semantic roles rather than feature-specific hardcoded colors:

- background;
- surface;
- elevated surface;
- primary text;
- secondary text;
- border;
- accent;
- accent contrast;
- success;
- warning;
- danger;
- information;
- focus;
- chart series.

Requirements:

- color is never the only state indicator;
- focus, error, selection, and completion include shape, icon, label, or text;
- dark mode is designed, not automatically inverted;
- charts provide labels or accessible summaries;
- body text and controls must meet the accepted accessibility contrast target.

## 10. Elevation and surfaces

Use elevation to explain hierarchy, not decorate every element.

- Page background is the base layer.
- Cards group related content only.
- Sheets, dialogs, menus, and sticky actions may use elevation.
- Nested cards are normally prohibited.
- Glass and blur are restricted to navigation or transitional layers where readability remains strong.
- Shadows must be subtle and consistent.

## 11. Action hierarchy

Each screen or visible section normally has:

- one primary action;
- up to two secondary actions when necessary;
- tertiary, advanced, administrative, and destructive actions in contextual menus or focused flows.

Primary actions use goal-oriented labels:

- `Create plan with ChatGPT`;
- `Start workout`;
- `Save changes`;
- `Connect Plaivra`.

Avoid vague labels:

- `AI`;
- `Magic`;
- `Do it`;
- `Fix`;
- `Continue` when the destination is not obvious.

## 12. Navigation model

### Shared information architecture

Primary product domains:

- Today;
- Train;
- Eat;
- Progress;
- More/Account.

The exact visible destinations may change before Product Constitution Lock, but each destination must have one dominant job.

### Web

- desktop: sidebar or rail for primary domains;
- mobile web: bottom navigation for highest-frequency domains;
- URLs remain addressable and browser history works;
- keyboard and visible focus are first-class.

### iOS

- use native navigation stacks, tab behavior, sheets, safe areas, and swipe-back expectations;
- use bottom tabs only for stable top-level destinations;
- do not reproduce desktop sidebars on phones.

### Android

- respect system back and predictive-back behavior;
- use bottom navigation, navigation rail, or drawer based on window size and destination count;
- support edge-to-edge layouts and insets;
- avoid custom back patterns that conflict with the platform.

## 13. Component contracts

Every shared component specification must define:

- semantic purpose;
- allowed variants;
- size tokens;
- content limits;
- loading, disabled, pressed, focus, selected, error, and success states;
- accessibility name/role/value;
- keyboard or screen-reader behavior;
- analytics events;
- platform adaptations;
- data requirements;
- prohibited usage.

Required core contracts:

- button;
- icon button;
- text field;
- selection control;
- metric card;
- plan card;
- workout exercise row;
- meal item;
- progress chart;
- list row;
- empty state;
- error state;
- skeleton;
- toast/status message;
- dialog/sheet;
- permission group;
- destructive confirmation;
- navigation item.

## 14. Data states

Every user-data screen must define:

- loading;
- first-use empty;
- no-results empty;
- partial data;
- stale data;
- offline/cached data where applicable;
- permission denied;
- recoverable error;
- non-recoverable error;
- saving;
- success;
- conflict or duplicate;
- revoked integration.

Raw technical errors are never the normal user experience.

## 15. Motion

Motion confirms cause and effect.

| Interaction | Reference duration |
|---|---:|
| Press feedback | 70–120 ms |
| Small reveal/change | 140–200 ms |
| Sheet/dialog transition | 200–320 ms |
| Page-level transition | 220–360 ms |
| Success emphasis | 300–600 ms, non-blocking |

Rules:

- repeated logging actions must not wait for decorative animation;
- respect reduced-motion settings on every platform;
- do not animate layout properties when transform/opacity is sufficient;
- no infinite decorative motion on core screens;
- motion must not hide a pending or failed save.

## 16. Forms and keyboards

- labels remain visible; placeholders are not labels;
- use platform-appropriate keyboards and input types;
- preserve user input after validation failure;
- show errors adjacent to the relevant field and summarize when needed;
- do not disable paste in authentication fields;
- support password managers and accessible authentication;
- sticky actions must stay visible above the mobile keyboard when required;
- multi-step forms preserve progress safely.

## 17. Charts and fitness metrics

- chart meaning must remain understandable without color alone;
- include units, time range, source, and whether values are user-entered or calculated;
- avoid implying medical certainty;
- do not exaggerate small changes through misleading axes;
- provide a text summary for assistive technology;
- allow sensitive body metrics to be hidden in the UI.

## 18. ChatGPT-created data

ChatGPT-created records use normal Plaivra product surfaces.

They may include a subtle source label when useful, but must not appear as a separate second-class import system.

The user must be able to:

- identify what was created;
- edit it;
- correct it;
- replace it;
- delete it;
- understand save or failure state.

Do not add a second approval page after a successful tool-confirmed action unless a specific destructive operation requires confirmation before the tool call.

## 19. Responsive and adaptive testing matrix

Minimum rendered checks:

### Web

- 320 × 568;
- 360 × 800;
- 390 × 844;
- 430 × 932;
- 768 × 1024;
- 1024 × 768;
- 1280 × 800;
- 1440 × 900.

### Native

Test small phone, standard phone, large phone, tablet, portrait, landscape where supported, large text, screen reader, reduced motion, dark mode, offline/slow network, and keyboard-visible states.

## 20. Accessibility acceptance

A core flow is not complete until it supports:

- keyboard use on web;
- visible focus;
- correct semantics;
- screen-reader labels and order;
- text scaling;
- sufficient contrast;
- non-color state cues;
- reduced motion;
- comfortable targets;
- error identification and recovery;
- zoom/reflow on web;
- platform accessibility testing on iOS and Android.

## 21. Performance perception

- interaction feedback begins immediately;
- skeletons preserve layout;
- optimistic updates are used only when rollback is safe;
- expensive charts and media load progressively;
- avoid blocking a route on unrelated data;
- display cached user-owned data with clear stale/sync state where appropriate.

## 22. Platform references

Recheck official platform guidance before native implementation milestones:

- Apple Human Interface Guidelines;
- Android Developers adaptive layout and accessibility guidance;
- Material Design guidance where compatible with Plaivra identity;
- WCAG 2.2 for web;
- platform store-review and billing rules.

## 23. Exceptions

An exception must document:

- the rule being overridden;
- user or technical evidence;
- affected platforms;
- accessibility impact;
- implementation boundary;
- review date.

Visual preference alone is not evidence.
