# Nutrition Native Visual Contract Design

**Date:** 2026-08-23  
**Status:** Direction A approved in principle; corrections incorporated; pending final Planner lock  
**Branch:** `design/nutrition-diary-v1`  
**Scope:** Shared visual-system authority for Nutrition → Diary, Meal Plan, Food Library, My Recipes, and Summary  

## 1. Authority and boundary

This document is the shared **Nutrition Native Visual Contract**. It defines the visual, material, component, spacing, typography, state, and cross-platform presentation rules that all five canonical Nutrition destinations must use.

It is subordinate to the existing Plaivra product, control, architecture, delivery, data, security, accessibility, and domain authorities. It does not change nutrition domain semantics, persistence, commands, permissions, synchronization, or approved product behavior.

The existing Diary product contract remains authoritative for Diary behavior and semantics:

- `docs/superpowers/specs/2026-08-23-nutrition-diary-design.md`

This visual contract must not duplicate or reinterpret that Diary product contract. When Diary is rendered, its product semantics come from the Diary design spec and its visual presentation comes from this document.

Future page-specific Nutrition design specs may add page composition and component decisions, but they must reuse this shared contract unless a later Planner-approved amendment explicitly changes the shared system.

## 2. Design direction

Nutrition uses **Direction A: native system-led restraint**.

The product should feel native, calm, precise, fast, and trustworthy. It is a high-frequency product workspace, not a lifestyle landing page and not a decorative health dashboard.

The design objective is:

> Plaivra content architecture expressed with native-platform confidence.

The physical use case is a person logging or checking food quickly on a phone during a normal day, then reviewing plans, recipes, or trends more deliberately on a larger device. This requires high legibility, fast scanning, meaningful density, restrained decoration, and clear separation between content and controls.

### 2.1 Product-register rule

Inside Nutrition, familiarity is a feature. Do not import marketing-page visual moves into the product surface.

Reject:

- glass on every card;
- nested cards;
- giant rounded rectangles as a default;
- decorative gradients or glows;
- dashboard gauge clusters;
- icon-tile stacks;
- repeated identical metric cards;
- color-only meaning;
- custom platform affordances when the native control already solves the job well.

## 3. Native metrics versus Plaivra custom-surface tokens

The numeric values in this contract are **Plaivra baseline tokens for custom surfaces and custom layout composition**. They are not overrides of system-owned metrics.

### 3.1 Native-metric precedence

System-managed components keep their platform-native measurements, padding, safe-area behavior, typography metrics, material geometry, and interaction behavior even when those values do not land on Plaivra's 4-point baseline.

This includes, but is not limited to:

- SwiftUI navigation bars and titles;
- toolbars and toolbar items;
- tab bars and sidebars;
- system buttons and menus;
- sheets and sheet chrome;
- search fields;
- safe-area insets;
- system typography line metrics;
- keyboard avoidance/presentation behavior;
- Material 3 system components on Android;
- browser/native form controls when retained on web.

Do not distort a native component merely to force it onto a Plaivra spacing token.

### 3.2 Plaivra custom spacing baseline

For custom Nutrition composition, prefer the following baseline family:

- 4
- 8
- 12
- 16
- 24
- 32
- 48
- 64

These values create rhythm and reuse. They are defaults, not a prohibition on non-4 values. Optical alignment, system integration, responsive composition, accessibility, text metrics, and platform conventions may require other values.

Typical custom content insets:

- compact phone content: approximately 16 pt;
- regular-width/tablet custom content: typically 24-32 pt where the layout supports it.

Related labels and values usually sit 4-8 pt apart; row internals usually 8-12 pt; related subsections usually 16-24 pt; major conceptual regions usually 24-32 pt or more according to platform and content density.

## 4. Material and layering model

Apple's current iOS 26 design guidance treats Liquid Glass as a distinct **functional layer** for controls and navigation above the content layer. Plaivra Nutrition adopts that semantic separation.

Nutrition has three conceptual layers:

1. **Canvas:** food, meals, recipes, charts, and primary readable information.
2. **Structured content surface:** a grouped object whose boundary improves comprehension, such as the Diary Daily Snapshot or a planned-meal block.
3. **Functional layer:** navigation, toolbar controls, transient controls, and a small number of high-value floating controls.

### 4.1 Liquid Glass allowed use

On iOS 26/iPadOS 26, prefer the system-provided Liquid Glass appearance where native components receive it automatically, including appropriate:

- navigation and toolbar items;
- tab/side navigation;
- popovers and transient functional controls;
- sheet chrome where provided by the system.

Custom Liquid Glass is exceptional, not decorative.

### 4.2 Liquid Glass prohibited use

Do not apply Liquid Glass as the normal Nutrition content material.

Specifically prohibit routine glass treatment for:

- macro/content cards;
- meal sections;
- food rows;
- recipe tiles;
- chart containers;
- planned-meal content blocks;
- general page backgrounds.

Use standard content surfaces, semantic system backgrounds/materials, separators, and negative space instead.

### 4.3 Plate dock exception

The persistent Plate action dock in the approved Food Logging Session is the selected custom Liquid Glass exception because it is a floating functional/action layer above scrolling content.

Its **semantic floating-dock role is mandatory; its optical glass treatment is adaptive**.

Before using custom glass, verify all of the following:

- Reduce Transparency;
- Increase Contrast;
- Dark Mode;
- legibility over actual scrolling content beneath the dock;
- keyboard presentation and keyboard avoidance;
- Dynamic Type and large accessibility sizes.

If Liquid Glass reduces clarity, contrast, hierarchy, keyboard usability, or content legibility in any of these conditions, retain the floating Plate dock but use a stronger regular material or solid functional surface appropriate to the active environment. Optical glass is never more important than semantic clarity.

Clear Liquid Glass is not the default Plate treatment. Prefer regular/adaptive treatment because the dock contains meaningful text and a commit action.

## 5. Typography contract

### 5.1 iOS and iPadOS

Use the platform system typography through semantic text styles. Do not bundle SF Pro as an app font.

Preferred semantic roles:

| Plaivra role | Native direction | Use |
| --- | --- | --- |
| `pageTitle` | platform navigation-title behavior | Diary, Meal Plan, Food Library, My Recipes, Summary |
| `metricPrimary` | title-class, semibold, monospaced/tabular digits | large calorie or summary values |
| `sectionTitle` | title3/headline-class, semibold | meals and major content sections |
| `rowPrimary` | body, regular/medium | food, recipe, and plan item identity |
| `rowValue` | body/subheadline, medium, monospaced/tabular digits when comparing values | kcal, grams, percentages |
| `supporting` | subheadline | brand, serving, secondary totals |
| `metadata` | footnote | source, timestamp, sync state |
| `caption` | caption only for genuinely tertiary information | minor chart annotation |

Use native Dynamic Type. The standard body scale should remain around the system body style rather than shrinking dense interfaces into unreadable typography.

Numbers that visually compare with each other use tabular/monospaced-digit behavior; surrounding labels remain proportional system type.

Arabic uses the platform's Arabic system typography and correct bidirectional layout. Do not force Latin font metrics or manually tuned Latin tracking onto Arabic.

### 5.2 Dynamic Type

At large accessibility sizes:

- horizontal value/metadata compositions may stack vertically;
- important content must not disappear to preserve compact geometry;
- rows grow instead of clipping;
- macro labels and values remain semantically grouped;
- meaningful SF Symbols scale appropriately with the text they support.

## 6. Page-title and header contract

### 6.1 iPhone root Nutrition destinations

For root Nutrition destinations on iPhone, the default is the platform's **Large Title** navigation behavior where appropriate for the navigation context.

Canonical titles are:

- Diary
- Meal Plan
- Food Library
- My Recipes
- Summary

The title may collapse naturally as the user scrolls. Do not recreate a fake sticky custom header simply to imitate the system.

### 6.2 iPad and regular width

In `NavigationSplitView` or other regular-width native hierarchies, use the platform-appropriate title behavior for the active column/detail context. Do **not** force a Large Title into every iPad detail surface for cross-device visual consistency.

The goal is semantic title consistency, not identical title geometry on every device.

### 6.3 Page actions

Page-level secondary actions belong in the native toolbar where that matches platform convention.

`Ask ChatGPT` uses the established Plaivra app-wide ChatGPT affordance. Nutrition must not invent a second icon language for the same product capability.

No Nutrition page duplicates the five Nutrition destinations as an additional internal top tab bar.

## 7. Custom-surface radius contract

These are Plaivra custom-content baselines, not overrides of native component shapes:

- **8 pt:** compact embedded custom surface or control where custom styling is necessary;
- **12 pt:** standard structured content surface;
- **16 pt:** important larger grouped content surface.

System-managed buttons, sheets, menus, search fields, toolbars, and controls retain system geometry.

Avoid routine 24/28/32/40 pt custom content cards. Pill/capsule shapes are reserved for controls or compact tags where the platform and semantics justify them.

## 8. Surfaces, cards, dividers, and elevation

Nutrition must not become a card wall.

Default hierarchy order:

1. negative space and typography;
2. system separator/hairline;
3. content-background contrast or standard material;
4. custom bordered/grouped surface when a semantic object benefits from containment;
5. elevation/shadow only when actual layering needs to be communicated.

Routine list rows do not receive floating shadows.

Do not nest a decorative card inside another decorative card.

### 8.1 Page composition families

The five pages share one system but are not forced into one composition:

- **Diary:** execution ledger, with one strong Daily Snapshot surface and mostly flat meal/list content;
- **Meal Plan:** planning workspace; planned-meal objects may earn more containment;
- **Food Library:** search/index surface; primarily flat searchable rows;
- **My Recipes:** authored-content collection; recipe identity may justify richer row/tile containment;
- **Summary:** analytical surface; charts and grouped analysis, not one card per metric.

Page-specific visual specs determine exact composition after each page is designed.

## 9. Button and icon-button hierarchy

### 9.1 Primary actions

Use the visually prominent button style for the action that completes the current task or is the overwhelmingly likely next action. Usually one prominent action is enough in a task context; do not create a field of competing prominent controls.

Examples include:

- Log items;
- Save recipe;
- Apply changes.

### 9.2 Secondary actions

Use native secondary/plain/bordered treatments according to platform convention for actions such as:

- Ask ChatGPT;
- Edit;
- View details;
- contextual Mark eaten when it is not the task's primary commit.

### 9.3 Inline actions

Prefer text plus a familiar symbol when the label materially improves comprehension, for example `Add Food`.

Do not convert every meaningful action into an unlabeled circular icon.

### 9.4 Hit regions

On Apple touch interfaces, controls need an effective hit region of at least 44 × 44 pt even when their visible glyph is smaller.

On Android touch interfaces, use the platform's approximately 48 dp minimum interactive target conventions.

System controls own their native sizing and content padding.

### 9.5 Symbols

On Apple platforms, prefer SF Symbols for familiar system actions and match symbol weight to adjacent typography. Use accessibility labels for icon-only controls.

Do not mix unrelated icon families within one platform renderer.

## 10. Nutrition row system

Use a small number of reusable row families rather than inventing a per-page row vocabulary.

The following are **custom-row baseline minimums**, not fixed system row heights:

| Row class | Baseline minimum | Purpose |
| --- | ---: | --- |
| `compactControlRow` | ~44 pt | compact custom selectors/date controls |
| `standardRow` | ~56 pt | simple food/history/filter entries |
| `nutritionRow` | ~60-64 pt | food identity + serving + nutrition value |
| `richRow` | ~72 pt and up | recipe/image or multi-line planning content |

Rows expand for Dynamic Type, localization, accessibility, and content length.

Default information order is:

> primary identity → secondary context → trailing decision-relevant value/action

Avoid decorative badge clusters and permanently visible icon toolbars inside every row.

## 11. Nutrition goal and macro visualization

Nutrition target attainment uses a dedicated Plaivra Nutrition visualization because its semantics and visual requirements differ from generic task/operation progress.

This is **not** based on a categorical claim that SwiftUI `ProgressView` is invalid for all goal-style values. Implementation may reuse appropriate native primitives where they satisfy the visual/accessibility contract. The product-level decision is that the exposed component must communicate nutrition goals, current/target values, over-target states, incomplete data, and accessibility semantics correctly.

### 11.1 Calories

Numerical hierarchy is primary:

```text
1,480 / 2,200 kcal
720 remaining
```

Any graphical treatment is supporting information, never the only representation.

### 11.2 Protein, carbohydrates, and fat

Each macro uses a compact labeled current/target representation with a thin supporting goal indicator.

Do not use three giant rings or a watch-style activity-ring imitation as the default Nutrition language.

A thin custom indicator may use approximately 4 pt thickness as a baseline when that remains legible under active accessibility conditions.

### 11.3 Data palette

The product action accent remains reserved primarily for action/selection. Nutrition data uses a restrained semantic visualization palette with stable roles such as:

- `dataEnergy`;
- `dataProtein`;
- `dataCarbs`;
- `dataFat`;
- `dataHydration`.

Diary and Summary must use the same semantic mapping.

Labels and values accompany color. Never require hue recognition to understand the data.

### 11.4 Over-target behavior

Over target is a factual nutrition state, not automatically an application error.

Do not flood the component with error red. Communicate the numeric overage directly, and reserve destructive/error semantics for genuine application errors or destructive actions.

## 12. Toolbars and functional controls

Use system toolbar APIs and placement conventions rather than manually drawing toolbar chrome.

On iOS 26, let standard toolbar items receive their system-provided Liquid Glass behavior automatically. Organize related toolbar actions into logical groups rather than placing every action into one undifferentiated cluster.

Do not add custom glass behind a toolbar that already receives the system material.

## 13. Sheet and transient-flow contract

Sheets are for scoped tasks closely related to the current context. Complex or prolonged authoring flows deserve more space.

### 13.1 Food Logging Session

The approved unified Food Logging Session is a substantial workflow containing search/history, secondary methods, Plate continuity, and multi-add behavior.

On iPhone, default to a full-height or large working presentation rather than treating the logger as a small half-sheet. Preserve stable keyboard/search/result/Plate geometry.

Camera/barcode presentation may use a platform-appropriate full-screen or immersive transient presentation when required.

On iPad, use an adaptive page/form-sheet or regular-width composition that gives the task enough working space; exact layout is finalized in the relevant page/session visual spec.

### 13.2 Simple utilities

Small scoped utilities such as a custom hydration amount, compact filter, or quantity adjustment may use a resizable sheet with appropriate medium/large detents when that improves progressive disclosure.

Use a grabber when the sheet is intentionally resizable.

### 13.3 Dismissal and commit

Protect meaningful unsaved work when interactive dismissal would lose it.

For appropriate single-view iOS/iPadOS sheets, follow current platform placement conventions: Cancel/Close leading, Done/commit trailing when both are present. Do not show Cancel, Back, and Done together without a real multi-step reason.

Avoid sheet-on-sheet navigation. Close or transition the first task cleanly before presenting another sheet.

## 14. Shared state language

All five Nutrition pages use one semantic state vocabulary.

### Pressed
Use native press feedback; custom controls must visibly acknowledge activation.

### Selected
Use platform-appropriate selection treatment. Do not rely on color alone when shape, icon, or label can reinforce state.

### Disabled
Reduce prominence while retaining legibility. Disabled must not look like unavailable content if it is merely temporarily noninteractive.

### Initial loading
Use native progress/activity treatment where real loading exists. Prefer preserving page structure and meaningful skeleton/placeholder geometry only when it improves comprehension.

### Refreshing
Keep previously valid content visible while updating when safe to do so.

### Saving/submitting
Prefer progress feedback in or adjacent to the initiating control when appropriate; prevent duplicate submits.

### Offline
Use a quiet inline status with a symbol/label. Cached functionality remains usable according to the domain contract.

### Queued sync
Secondary status, not a blocking modal.

### Needs attention
Attach the state to the affected object with a clear review/retry/discard path according to the product contract.

### Error
Localize the error to the failing component or operation whenever possible. One component failure must not automatically blank the whole page.

### Empty
Plain explanation plus the most useful next action. No decorative empty-state illustration is required by default.

### Incomplete nutrition data
Neutral informational treatment, not destructive/error red.

### Success
Prefer visible data change and platform-appropriate feedback/haptics. Do not leave permanent green success cards after ordinary actions.

### Destructive
Use the platform destructive role and confirmation only when loss/destruction warrants it.

## 15. iOS 26 and SwiftUI behavior

Use native containers and behaviors as architecture allows, including `NavigationStack` / `NavigationSplitView`, system toolbars, system search, system sheets, and standard navigation behavior.

Do not manually recreate system navigation bars merely to match a static mock.

### 15.1 Accessibility/environment requirements

Design must survive:

- Dynamic Type through accessibility sizes;
- Bold Text;
- Increase Contrast;
- Reduce Transparency;
- Reduce Motion;
- light and dark appearance;
- VoiceOver;
- RTL and bidirectional text;
- compact and regular size classes;
- portrait and landscape where supported;
- software keyboard presentation;
- safe areas and device cutouts.

The visual hierarchy must remain understandable when transparency effects are reduced or eliminated.

## 16. Android adaptation

Android implements the **same semantic design contract**, not an optical iOS clone.

Translate concepts as follows:

| Semantic concept | iOS/iPadOS | Android |
| --- | --- | --- |
| System type | SF system families | Android system/Roboto |
| Root title | native navigation title behavior | Material 3 top app bar hierarchy |
| Functional layer | system Liquid Glass/material behavior | Material 3 tonal/elevated surfaces |
| Touch target | Apple 44 pt class | Android ~48 dp class |
| Primary action | native prominent style | filled primary button |
| Secondary action | native secondary/plain | tonal/outlined/text according to role |
| Sheet | native sheet/full-height presentation | modal bottom sheet or full-screen destination |
| Navigation | tab/sidebar/split behavior | navigation bar/rail/drawer according to window size |
| Data visualization | Plaivra semantic goal visuals | same semantics implemented with Compose-native primitives |

Do **not** fake Liquid Glass on Android. The translation target is functional hierarchy and semantic layering.

Android-native metrics and Material components take precedence over Plaivra custom-surface baseline numbers where they differ.

## 17. Web translation

Web preserves the same semantic hierarchy without pretending to be SwiftUI.

Use the existing Plaivra web typography/design-system authority rather than attempting to ship SF Pro as a web imitation of iOS.

### 17.1 Interaction targets

In touch/coarse-pointer/mobile web contexts, use approximately 44 px-class effective targets for important controls.

Desktop/fine-pointer web may use a denser accessible control system where higher information density is beneficial. Do not force every desktop control to 44 px if that harms expert scanning or data density.

Desktop controls must still provide:

- adequate pointer hit regions for their context;
- clear hover and pressed feedback where hover exists;
- visible keyboard focus;
- full keyboard operation;
- WCAG-conformant contrast and semantics;
- no functionality that exists only on hover.

### 17.2 Material translation

Web navigation/toolbars may use a restrained secondary surface or modest backdrop treatment where it improves functional layering. Always provide a solid/opaque fallback and do not reproduce exaggerated glassmorphism.

### 17.3 Responsive translation

Mobile web uses the compact content rhythm; desktop becomes wider and more efficient rather than stretching a single phone column indefinitely.

Use logical properties and RTL-safe composition. Large-screen page layouts are finalized per page, especially Meal Plan and Summary.

## 18. Diary visual application

This section applies the shared contract to the already-approved Diary product architecture. It does not redefine Diary behavior.

### 18.1 Header and date navigation

Diary uses the title behavior in Section 6 and the established page-level Ask ChatGPT toolbar affordance.

The selected-date control is compact, obvious, and not wrapped in a decorative card. Previous/next controls retain adequate touch targets; the central date affords date selection. Native swipe day navigation may remain an accelerator where approved by the Diary product contract.

### 18.2 Daily Snapshot

Diary earns one primary grouped content surface for the Daily Snapshot.

Baseline custom treatment:

- approximately 16 pt custom radius;
- approximately 16 pt internal custom padding;
- standard content surface/material;
- no decorative shadow by default;
- no Liquid Glass.

The calorie consumed/target and remaining/over value lead the hierarchy. Protein, carbohydrates, and fat follow as compact goal visuals. Fiber and incomplete-data messaging sit one hierarchy lower.

Do not split the Snapshot into repeated equal metric cards.

### 18.3 Hydration

Hydration is a compact execution row/region, not a second dashboard card. Quick-add controls use platform-appropriate button behavior. The content region itself remains a standard content surface.

### 18.4 Meal sections

Breakfast, Lunch, Dinner, Snacks, and conditional compatibility content use a ledger/list rhythm.

Meal headers communicate identity and relevant aggregate value without becoming decorative cards. Actual logged foods use the shared `nutritionRow` family with inset/system separators and accessible row growth.

Advanced row actions should use platform-appropriate swipe actions, menus, detail surfaces, or deliberate edit/multi-select modes instead of a permanent icon cluster.

### 18.5 Planned context

Planned-meal content must remain visually distinguishable from actual logs without becoming louder than actual intake. A lightly differentiated standard content surface and explicit semantic label are preferred over glass or heavy color.

The product semantics for Planned / Completed / Completed with changes / Skipped remain entirely governed by the Diary product spec.

### 18.6 Food Logging Session and Plate

Search/result content remains on standard content surfaces. Results use the shared Nutrition row language.

The Plate is the selected floating functional surface. Its position and semantic role remain stable while its material adapts according to Section 4.3. The commit action remains visually clear with the software keyboard visible and at all supported accessibility settings.

## 19. Cross-page consistency rules

The five Nutrition pages feel like one system because they share:

- semantic typography roles;
- numerical formatting and tabular-digit behavior;
- spacing rhythm;
- custom-surface radius family;
- row families;
- button hierarchy;
- icon policy;
- functional-layer material semantics;
- sheet behavior;
- state vocabulary;
- Nutrition data-color mapping;
- accessibility behavior;
- iOS/Android/web translation rules.

They are **not** required to use identical page composition. Consistency is semantic and systemic, not repetition of the same card layout.

## 20. Current Apple/iOS design inputs

This contract was checked against current Apple guidance available on 2026-08-23, including:

- Human Interface Guidelines: Materials;
- Human Interface Guidelines: Typography;
- Human Interface Guidelines: Buttons;
- Human Interface Guidelines: Sheets;
- Human Interface Guidelines: progress indicators, used only as supporting reference for progress primitives and not as a categorical restriction on Nutrition goal visualization;
- SwiftUI Landmarks guidance for building with Liquid Glass and refining system-provided Liquid Glass in toolbars.

Key Apple-aligned decisions:

- Liquid Glass is a functional/control-navigation layer, not the default content material;
- system-provided controls/material behavior should generally be allowed to adapt automatically;
- custom glass is sparse and subordinate to legibility/accessibility;
- iPhone touch controls maintain approximately 44 × 44 pt effective hit regions;
- Dynamic Type and adaptive layouts are mandatory design inputs;
- sheets are scoped task surfaces and complex/prolonged workflows deserve sufficient space;
- current iOS/iPadOS sheet conventions place Cancel/Close leading and Done/commit trailing for appropriate single-view commit sheets.

## 21. Anti-slop and visual-quality gate

Before any Nutrition page visual design is considered locked, verify:

- no content-layer glass proliferation;
- no nested decorative cards;
- no repeated identical metric-card grid used as a substitute for hierarchy;
- no routine oversized 24-40 pt content radii;
- no decorative gradients/glows;
- no icon-tile stack pattern;
- no color-only macro/state semantics;
- no watch-ring imitation for ordinary macro goals;
- no duplicate Nutrition navigation;
- no per-page reinvention of buttons, rows, states, or icon language;
- no fixed custom row height that clips Dynamic Type/localized content;
- no native component distorted solely to fit the custom 4-point spacing baseline;
- no iOS visual metaphor mechanically copied to Android or web when the platform has a better native convention;
- no custom glass treatment that is less legible than the solid/material fallback under accessibility or keyboard conditions.

## 22. Sequencing and change control

Design sequence is binding:

1. lock this shared Nutrition Native Visual Contract and Diary visual application;
2. design Meal Plan against the shared contract;
3. design Food Library;
4. design My Recipes;
5. design Summary;
6. reconcile all five pages as one Nutrition system;
7. only then create one comprehensive Codex implementation plan.

No implementation begins from this document alone. `writing-plans` is intentionally not invoked until all five Nutrition page designs are complete, reconciled, written, and approved.
