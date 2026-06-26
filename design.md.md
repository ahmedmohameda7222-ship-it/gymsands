# Plaivra Design System Spec

## 70% Glassmorphism / 30% Solid Tracking UI

Version: 1.0  
Target app: Plaivra  
Target repo: `ahmedmohameda7222-ship-it/gymsands`  
Purpose: Full-app UI redesign guidance for Codex implementation.

---

# 0. What This File Is

This file is the single design reference for rebuilding the Plaivra UI.

Codex must use this file as the implementation source of truth for:

- Visual direction
- Glassmorphism rules
- Solid tracking rules
- Font sizes
- Spacing
- Border radius
- Shadows
- Layout grids
- Mobile behavior
- Component variants
- Route-by-route surface decisions
- Do-not-remove constraints
- Accessibility constraints
- Build/testing expectations

This is not a marketing concept.  
This is an implementation spec.

---

# 1. Product Context

Plaivra is a private fitness and wellness tracking dashboard.

The app stores, edits, and tracks:

- Workout plans
- Workout sessions
- Workout history
- Exercise library
- Meal plans
- Food logs
- Calories
- Macros
- Hydration
- Progress
- Personal records
- Habits
- Daily fit tasks
- Sleep/recovery
- Supplements
- Settings/admin tools

Plaivra does **not** generate workout or meal plans inside the app.  
Users create plans with ChatGPT, then export/import those plans into Plaivra for tracking.

Therefore:

- Plaivra is not an AI coach.
- Plaivra is not a “command center” that tells the user what to do.
- Plaivra is a premium execution and tracking layer.

Correct product feeling:

> ChatGPT creates the plan. Plaivra organizes, edits, schedules, and tracks it.

---

# 2. Current Repo Architecture Observed

The app uses:

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Radix UI primitives
- Lucide icons
- Framer Motion
- Recharts
- Supabase Auth/database/storage
- Existing app-level theme system
- Existing accessibility/settings layer
- Existing reusable UI components

Important existing files/areas:

```text
app/layout.tsx
app/globals.css
tailwind.config.ts
components/layout/app-shell.tsx
components/layout/page-heading.tsx
components/layout/brand.tsx
components/ui/card.tsx
components/ui/button.tsx
lib/themes.ts
app/(private)/dashboard/page.tsx
app/(private)/calories/page.tsx
app/(private)/my-workout/plans/page.tsx
components/workouts/my-workout-plans.tsx
components/workouts/workout-calendar.tsx
components/workouts/workout-browser.tsx
components/meals/calories-page-sections.tsx
components/meals/food-log-list.tsx
components/shared/chatgpt-import-card.tsx
```

Codex should preserve the existing architecture and improve the design system around it.

---

# 3. Design Direction

## Final UI Type

```text
Premium Mobile-First Bento Dashboard UI
+
70% Glassmorphism
+
30% Solid Tracking
```

The app should feel:

- Premium
- Calm
- Modern
- Clean
- Warm
- Wellness-focused
- Mobile-first
- Easy to scan
- Practical for daily tracking

The app should not feel:

- Like a crypto dashboard
- Like a cyber/neon gym app
- Like a fake AI coach
- Like an over-designed Dribbble mockup
- Like a full transparent app with bad readability
- Like a crowded enterprise dashboard

---

# 4. Core Design Rule

## 70% Glass / 30% Solid

### 70% Glassmorphism

Use glass for surfaces that are:

- Summary-based
- Short-text
- Navigational
- Visual hierarchy elements
- Dashboard widgets
- Status cards
- Search/filter shells
- Overview sections

### 30% Solid Tracking

Use solid surfaces for areas that are:

- Dense
- Text-heavy
- Form-heavy
- Table/list-heavy
- Critical
- Destructive
- Editing-related
- Requiring high readability

### Practical Rule

Use glass where the user scans.  
Use solid where the user reads, edits, logs, or confirms.

---

# 5. What Must Stay Real

Do not add fake modules.

Use only real Plaivra app sections/routes:

```text
/dashboard
/my-workout/plans
/workouts
/workout-history
/calories
/calories/food-hub
/calories/custom-food-meal
/calories/weekly-overview
/my-meal-plan
/progress
/personal-records
/wellness
/hydration
/habits
/sleep-recovery
/supplements
/daily-fit-tasks
/settings
/profile
/admin
/onboarding
/login
/register
```

Do not add fake dashboard concepts like:

- Execution Score
- AI Coach Recommendation
- Plaivra Says
- Next Best Action
- Open Loops
- Command Center
- AI Priority
- AI Plan Score

Allowed AI-related surfaces only:

- ChatGPT import card
- Meal/workout import flows
- AI connection settings
- About/landing page copy
- Connector status if already exists

---

# 6. Global Visual Identity

Preserve Plaivra’s current brand base.

## Base Brand Colors

```css
--app-bg: #F8F6F1;
--surface: #FFFFFF;
--surface-elevated: #FDFCFA;
--primary: #2D3A1E;
--primary-hover: #1F2A14;
--primary-soft: #E8EDE0;
--secondary: #C49A3B;
--secondary-hover: #A67E2E;
--text-primary: #1A1A1A;
--text-secondary: #6B6B6B;
--text-tertiary: #A3A3A3;
--border: #E8E5DF;
--border-subtle: #F0EDE8;
--success: #3A7D44;
--warning: #B85C00;
--destructive: #9E2B2B;
--button-text: #FFFFFF;
```

## Glass Colors

```css
--glass-bg: rgba(255, 255, 255, 0.48);
--glass-bg-soft: rgba(255, 255, 255, 0.34);
--glass-bg-strong: rgba(255, 255, 255, 0.66);
--glass-border: rgba(255, 255, 255, 0.58);
--glass-border-strong: rgba(255, 255, 255, 0.72);
--glass-shadow: 0 22px 70px rgba(26, 26, 26, 0.12);
--glass-shadow-soft: 0 14px 42px rgba(26, 26, 26, 0.085);
--glass-blur: blur(24px) saturate(150%);
--glass-blur-strong: blur(30px) saturate(165%);
```

## Solid Tracking Colors

```css
--solid-tracking-bg: rgba(255, 255, 255, 0.94);
--solid-tracking-bg-strong: rgba(255, 255, 255, 0.98);
--solid-tracking-elevated: rgba(253, 252, 250, 0.96);
--solid-tracking-border: rgba(232, 229, 223, 0.88);
--solid-tracking-shadow: 0 10px 34px rgba(26, 26, 26, 0.08);
```

## Background

Use this warm wellness background for the private app:

```css
body {
  background:
    radial-gradient(circle at 8% 0%, rgba(232, 237, 224, 0.98), transparent 28rem),
    radial-gradient(circle at 84% 7%, rgba(196, 154, 59, 0.30), transparent 25rem),
    radial-gradient(circle at 55% 48%, rgba(45, 58, 30, 0.10), transparent 30rem),
    linear-gradient(135deg, #F8F6F1 0%, #EFE8DA 45%, #F8F6F1 100%);
}
```

Keep dark mode supported.  
Do not break existing theme switching.

---

# 7. Typography System

Use system sans / current app font stack unless the repo already has a custom font.

Recommended font stack:

```css
font-family:
  Inter,
  ui-sans-serif,
  system-ui,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  sans-serif;
```

If no Inter is imported, keep Tailwind `font-sans`.

## Typography Scale

| Token | Mobile | Desktop | Line Height | Weight | Use |
|---|---:|---:|---:|---:|---|
| `display` | 34px | 52px–58px | 0.95 | 800–900 | Landing hero only |
| `page-title` | 26px | 32px | 1.12 | 750–800 | PageHeading h1 |
| `section-title` | 21px | 24px | 1.18 | 750–800 | Section headings |
| `card-title` | 15px | 16px | 1.25 | 700–800 | Card titles |
| `card-title-lg` | 18px | 20px | 1.2 | 750–850 | Featured cards |
| `body` | 14px | 15px | 1.55 | 400–500 | Descriptions |
| `body-sm` | 13px | 14px | 1.45 | 400–500 | Card descriptions |
| `caption` | 12px | 12px | 1.35 | 500–600 | Labels/details |
| `micro` | 11px | 11px | 1.25 | 600–700 | Nav group labels |
| `metric` | 28px | 34px | 1.0 | 800–900 | Metric values |
| `metric-lg` | 34px | 44px | 0.95 | 850–950 | Large summary values |
| `button` | 14px | 14px | 20px | 650–750 | Buttons |
| `nav-label` | 11px | 12px | 14px | 650–750 | Mobile bottom nav |

## Tailwind Examples

```tsx
// Page title
<h1 className="text-[26px] font-bold leading-[1.12] tracking-[-0.035em] sm:text-[32px]">

// Section title
<h2 className="text-[21px] font-bold leading-[1.18] tracking-[-0.03em] sm:text-2xl">

// Card title
<h3 className="text-[15px] font-bold leading-5 tracking-[-0.015em] sm:text-base">

// Card description
<p className="text-[13px] leading-5 text-muted-foreground sm:text-sm">

// Metric value
<p className="text-[28px] font-extrabold leading-none tracking-[-0.055em] sm:text-[34px]">

// Micro label
<p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
```

## Text Rules

- Keep dashboard copy short.
- Use labels, numbers, and action verbs.
- Avoid long paragraphs inside cards.
- Use muted text only on strong glass or solid surfaces.
- Do not put small muted text on very transparent backgrounds.

Good:

```text
Calories
1,420 kcal
880 kcal left
```

Bad:

```text
Based on your overall nutrition strategy, the system recommends that you keep moving toward your calorie target today.
```

---

# 8. Spacing System

Use consistent spacing across all pages.

## Base Scale

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-7: 28px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
```

## Page Padding

| Context | Padding |
|---|---:|
| Mobile page x | 16px |
| Mobile page top | 20px |
| Mobile page bottom | 112px because bottom nav |
| Tablet page x | 24px |
| Desktop page x | 32px |
| Desktop page top | 28px–32px |
| Desktop content max width | 1280px |

## Card Padding

| Card Type | Mobile | Desktop |
|---|---:|---:|
| Small metric card | 14px | 16px |
| Standard card | 16px | 18px–20px |
| Featured card | 18px–20px | 24px–28px |
| Dense solid row | 12px | 12px–14px |
| Dialog/sheet | 16px | 20px |

## Gaps

| Context | Mobile | Desktop |
|---|---:|---:|
| Bento grid gap | 10px | 12px–16px |
| Section gap | 24px | 32px |
| Card internal gap | 10px–12px | 12px–16px |
| Row gap | 8px–10px | 10px–12px |
| Button group gap | 8px | 8px–10px |

---

# 9. Radius System

Current app radius is too small for the desired premium glass direction. Increase the radius system.

```css
--radius-xs: 10px;
--radius-sm: 14px;
--radius-md: 18px;
--radius-lg: 22px;
--radius-xl: 26px;
--radius-2xl: 32px;
--radius-pill: 999px;
```

Usage:

| Element | Radius |
|---|---:|
| Main cards | 22px–26px |
| Featured/hero cards | 28px–32px |
| Small metric cards | 20px–22px |
| Rows | 14px–18px |
| Buttons | 14px–16px |
| Chips | 999px |
| Mobile bottom nav shell | 24px top if detached, otherwise 0 |
| Floating quick button | 999px |

---

# 10. Shadow System

Use shadows carefully. Glass already adds depth.

```css
--shadow-soft: 0 8px 24px rgba(26, 26, 26, 0.06);
--shadow-card: 0 14px 36px rgba(26, 26, 26, 0.08);
--shadow-glass: 0 22px 70px rgba(26, 26, 26, 0.12);
--shadow-floating: 0 18px 42px rgba(45, 58, 30, 0.26);
--shadow-none: none;
```

Usage:

| Element | Shadow |
|---|---|
| Glass cards | `--shadow-glass` |
| Solid tracking cards | `--shadow-card` or `--shadow-soft` |
| Sidebar/topbar | soft directional shadow |
| Floating plus | `--shadow-floating` |
| Dense rows | no heavy shadow |

---

# 11. Surface System

Codex should implement reusable surface utilities.

## Required CSS Classes

Add to `app/globals.css`:

```css
.premium-page-bg {
  background:
    radial-gradient(circle at 8% 0%, rgba(232, 237, 224, 0.98), transparent 28rem),
    radial-gradient(circle at 84% 7%, rgba(196, 154, 59, 0.30), transparent 25rem),
    radial-gradient(circle at 55% 48%, rgba(45, 58, 30, 0.10), transparent 30rem),
    linear-gradient(135deg, #F8F6F1 0%, #EFE8DA 45%, #F8F6F1 100%);
}

.glass-shell {
  background: linear-gradient(180deg, rgba(255,255,255,.55), rgba(255,255,255,.30));
  border: 1px solid rgba(255,255,255,.48);
  backdrop-filter: blur(28px) saturate(160%);
  -webkit-backdrop-filter: blur(28px) saturate(160%);
  box-shadow: 0 14px 50px rgba(26,26,26,.07);
}

.glass-card {
  background: linear-gradient(145deg, rgba(255,255,255,.58), rgba(255,255,255,.28));
  border: 1px solid rgba(255,255,255,.58);
  backdrop-filter: blur(24px) saturate(150%);
  -webkit-backdrop-filter: blur(24px) saturate(150%);
  box-shadow: 0 22px 70px rgba(26, 26, 26, 0.12);
  border-radius: 1.5rem;
}

.glass-card-strong {
  background: linear-gradient(145deg, rgba(255,255,255,.72), rgba(255,255,255,.42));
  border: 1px solid rgba(255,255,255,.68);
  backdrop-filter: blur(24px) saturate(155%);
  -webkit-backdrop-filter: blur(24px) saturate(155%);
  box-shadow: 0 18px 52px rgba(26, 26, 26, 0.10);
  border-radius: 1.5rem;
}

.solid-tracking-card {
  background: linear-gradient(180deg, rgba(255,255,255,.96), rgba(253,252,250,.96));
  border: 1px solid rgba(232,229,223,.90);
  box-shadow: 0 10px 34px rgba(26, 26, 26, 0.08);
  border-radius: 1.25rem;
}

.solid-row {
  background: rgba(255,255,255,.88);
  border: 1px solid rgba(232,229,223,.88);
  border-radius: 1rem;
}

.glass-chip {
  background: rgba(255,255,255,.40);
  border: 1px solid rgba(255,255,255,.50);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-radius: 999px;
}

.bento-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.625rem;
}

@media (min-width: 640px) {
  .bento-grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 0.75rem;
  }
}

@media (min-width: 1280px) {
  .bento-grid {
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 1rem;
  }
}
```

## Fallback for Unsupported Glass

```css
@supports not ((backdrop-filter: blur(10px)) or (-webkit-backdrop-filter: blur(10px))) {
  .glass-shell,
  .glass-card,
  .glass-card-strong,
  .glass-chip {
    background: rgba(255,255,255,.88);
  }
}
```

## Reduced Transparency Accessibility

If app settings include a reduced-transparency or accessibility class, use:

```css
.reduce-transparency .glass-shell,
.reduce-transparency .glass-card,
.reduce-transparency .glass-card-strong,
.reduce-transparency .glass-chip {
  background: rgba(255,255,255,.94);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
```

---

# 12. Bento Layout System

## Desktop Grid

Use 12 columns.

```tsx
<div className="bento-grid">
```

Desktop spans:

| Card | Span |
|---|---:|
| Page overview | 6–8 columns |
| Metric cards | 3 columns |
| Workout card | 6 columns |
| Meal plan card | 6 columns |
| Import card | 5 columns |
| Calendar | 7 columns |
| Food log | 8 columns |
| Water card | 4 columns |
| Search/filter hero | 8 columns |
| Filter panel | 4 columns |
| Full-width summaries | 12 columns |

## Tablet Grid

Use 6 columns.

Tablet spans:

| Card | Span |
|---|---:|
| Overview | 6 |
| Metric | 3 |
| Workout/Meal | 6 |
| Import/Calendar | 6 |
| Plan card | 3 |
| Food log | 6 |

## Mobile Grid

Use 2 columns.

Mobile spans:

| Card | Span |
|---|---:|
| Overview | 2 |
| Metric card | 1 |
| Workout card | 2 |
| Meal plan card | 2 |
| Food log | 2 |
| Forms | 2 |
| Calendar | 2 |
| Plan card | 2 |

Mobile must never require horizontal scrolling except for chips/tabs intentionally.

---

# 13. Components to Create or Update

Codex should avoid one-off styling everywhere.

## Recommended new shared component

Create:

```text
components/ui/surface.tsx
```

Suggested API:

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

type SurfaceVariant = "glass" | "glassStrong" | "solid";

export function Surface({
  variant = "glass",
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  variant?: SurfaceVariant;
}) {
  return (
    <div
      className={cn(
        variant === "glass" && "glass-card",
        variant === "glassStrong" && "glass-card-strong",
        variant === "solid" && "solid-tracking-card",
        className
      )}
      {...props}
    />
  );
}
```

## Optional Bento component

Create:

```text
components/ui/bento-grid.tsx
```

Suggested API:

```tsx
export function BentoGrid({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("bento-grid", className)} {...props} />;
}
```

## Update existing Card

Current `Card` should remain compatible.

Do not break existing imports.

Option:

- Keep `Card` default as solid or glass?  
- Recommended: keep `Card` stable as readable default, then add `Surface` for new UI.

Safer strategy:

- Do not globally turn every `Card` into glass.
- Use `Surface` or class names per route.
- Dense existing pages may break if every Card becomes transparent.

## Button

Update button style carefully:

- Existing minimum height is good.
- Keep min height 44px.
- Increase radius from current small radius to 14–16px.
- Primary button: solid olive.
- Outline button: glass outline on glass areas, solid outline on solid areas.
- Destructive remains solid red.

Button classes target:

```tsx
"inline-flex min-h-11 items-center justify-center gap-2 rounded-[14px] text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
```

---

# 14. App Shell Rules

## Desktop Sidebar

Current app has a fixed desktop sidebar. Redesign it as glass shell.

Requirements:

- Keep all nav groups.
- Keep all routes.
- Keep admin items.
- Keep profile/logout block.
- Keep active route behavior.
- Use `glass-shell`.
- Active nav item should be solid olive.
- Inactive nav items can use subtle glass hover.

Sidebar sizing:

```text
Width: keep 18rem / w-72
Padding: 16px horizontal, 20px vertical
Nav item height: 42–44px
Nav item radius: 14–16px
Nav icon box: 32–36px if used
Group label: 11px uppercase, tracking 0.16–0.18em
```

## Topbar

Requirements:

- Sticky top.
- Glass background.
- Keep tagline/title.
- Keep actions.
- Do not make it visually heavy.

Sizing:

```text
Height mobile: 64px
Height desktop: 72px
Padding mobile: 16px
Padding desktop: 24–32px
Border bottom: glass border
```

## Main Content

Current `max-w-7xl` is good.

Target:

```tsx
<main className="pb-32 lg:ml-72 lg:pb-0">
  <motion.div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
```

Keep existing motion transition subtle.

## Mobile Bottom Nav

Current mobile bottom nav is correct structurally.

Redesign:

- Use glass shell.
- Keep `Today`, `Train`, `Eat`, `More`.
- Keep central floating quick log button.
- `+` button stays solid olive.
- Nav labels 11px.
- Icons 20px.
- Hit areas at least 56px height.

Target:

```text
Height: 72–80px
Background: glass
Backdrop blur: 22–28px
Top border: rgba(255,255,255,.50)
Quick button: 56px, solid olive, white icon, 4px border with background color
```

## Quick Log Sheet

Glass shell for sheet container.

Action rows:

- Use solid or strong glass.
- Keep all actions.
- Do not add fake actions.

Actions:

```text
Log Food
Add Water
Start Workout
Add Progress
Add Habit Task
```

---

# 15. Page Heading

Update `PageHeading` to feel premium.

Target sizing:

```text
Margin bottom mobile: 20px
Margin bottom desktop: 28px
Title mobile: 26px / weight 750–800
Title desktop: 32px / weight 750–800
Description: 14–16px / line-height 1.55
Action buttons wrap cleanly
```

Recommended class:

```tsx
<div className="mb-5 flex flex-col gap-4 sm:mb-7 sm:flex-row sm:items-end sm:justify-between">
  <h1 className="text-[26px] font-bold leading-[1.12] tracking-[-0.035em] text-foreground sm:text-[32px]">
  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
```

Do not make PageHeading glass by default.  
Page content cards should carry the glass style.

---

# 16. Route-by-Route Design Rules

## 16.1 Dashboard `/dashboard`

Purpose: daily overview.

Use glass for:

- Setup/overview card
- Calories metric
- Protein metric
- Water metric
- Weight metric
- Quick links container
- Wellness summary wrapper
- Weekly focus summary if visible

Use solid for:

- Today workout exercise list
- Meal plan item rows
- Done/Skip rows
- Dense nested detail rows
- Error details

Layout:

```text
PageHeading
Optional setup card: glassStrong
Metrics: 2-column mobile, 4-column desktop glass cards
Today workout: solid tracking card
Meal plan: solid tracking card
Quick links: glass card/chips
Wellness summary: glass wrapper + solid rows if dense
```

Metric card exact style:

```text
Padding: 14px mobile / 16–18px desktop
Radius: 22px
Label: 13px, weight 700
Value: 28px mobile / 34px desktop, weight 850
Detail: 12–13px muted
Icon: 40–42px rounded square
Progress: 8px height
```

Do not add AI recommendation text.

---

## 16.2 Workout Plans `/my-workout/plans`

Purpose: import/manage workout plans.

Use glass for:

- ChatGPT import card
- Active plan calendar
- Plan cards
- Empty state
- Archived plans wrapper

Use solid for:

- Plan actions dropdown
- Rename input
- Delete/archive confirmation
- Exercise rows inside detailed plan

Layout:

```text
PageHeading
ChatGptImportCard: glassStrong
MyWorkoutPlans wrapper
Toolbar: simple buttons
WorkoutCalendar: glass card
Plan cards: glass card
Action menus: solid-tracking-card
```

Plan card typography:

```text
Badge: 12px, weight 700
Plan name: 16px, weight 750
Meta: 13px muted
Plan facts: 3 small glass inner cards
Button: full width, 44px height
```

Mobile:

- Today workout card remains prominent.
- Start Today’s Workout button full-width, height 48px.

---

## 16.3 Exercise Library `/workouts`

Purpose: browse/search exercises.

Use glass for:

- Search bar shell
- Filter drawer/sheet shell
- Filter chips
- Exercise cards
- Favorite/custom action area

Use solid for:

- Custom exercise form
- Long instructions
- Exercise edit form
- Dense metadata lists

Exercise card:

```text
Radius: 22px
Padding: 16px
Title: 16px weight 750
Badges: glass chips
Primary action: solid olive button
Secondary action: outline/glass button
```

Search bar:

```text
Height: 48px
Radius: 16px
Glass background
Icon: 18–20px
Text: 14px
```

Filters:

Keep existing filter categories:

```text
Muscle Category
Primary Muscle
Equipment
Mechanics
Exercise Type
Force Type
Experience Level
Secondary Muscles
```

---

## 16.4 Workout History `/workout-history`

Use glass for:

- Summary cards
- Filter/date controls
- History overview

Use solid for:

- Session rows
- Exercise/set logs
- Notes
- Delete/edit actions

---

## 16.5 Calorie Tracker `/calories`

Purpose: daily food/macros/water tracking.

Use glass for:

- Tabs wrapper
- Macro summary cards
- Calories/Protein/Carbs/Fat/Water cards
- Weekly tracker summary
- Water mini summary
- CompactNutritionSummary outer card

Use solid for:

- FoodLogList
- Food rows
- Target forms
- Goal-based target setup
- API food tools if dense
- Water log history
- Delete actions

Mobile rules:

- Keep current mobile select for tabs.
- Keep compact nutrition summary first.
- Keep More Tools collapsed.
- Do not show every tool at once.

Desktop rules:

- 5 macro cards can be glass.
- FoodLogList must be solid.
- WaterCard can be glass summary with solid history rows.

Macro card:

```text
Label: 12px weight 700
Value: 28–32px weight 850
Progress: 8px
Target text: 12px muted
```

---

## 16.6 Food Hub `/calories/food-hub`

Use glass for:

- Search/import/browse headers
- Food category cards
- Recent/favorite food cards

Use solid for:

- Search results rows if dense
- Add food form
- Quantity/serving forms
- Barcode result details

---

## 16.7 Custom Food / Meal Builder `/calories/custom-food-meal`

Mostly solid.

Use glass only for:

- Page overview
- Small summary cards
- Preview cards

Use solid for:

- Inputs
- Ingredient rows
- Nutrition fields
- Save/delete actions

Reason: builder is form-heavy.

---

## 16.8 Weekly Nutrition Overview `/calories/weekly-overview`

Use glass for:

- Weekly summary cards
- Chart containers
- Macro distribution cards

Use solid for:

- Dense daily rows
- Tables
- Export/report controls if detailed

Charts:

- Use solid or strong glass container.
- Ensure axis/legend contrast is readable.
- Do not put chart labels on weak transparent surfaces.

---

## 16.9 Meal Plan `/my-meal-plan`

Use glass for:

- Meal plan summary
- Day selector
- Meal type filters
- Macro overview

Use solid for:

- Meal rows
- Edit meal forms
- Ingredients/macros rows
- Done/Skip controls

---

## 16.10 Progress `/progress`

Use glass for:

- Weight overview
- Measurement summary
- Photo summary
- Trend cards

Use solid for:

- Entry forms
- Entry history rows
- Photo upload controls
- Measurement tables

---

## 16.11 Personal Records `/personal-records`

Use glass for:

- PR overview
- PR category cards
- Summary metrics

Use solid for:

- Add/edit PR forms
- Record history rows

---

## 16.12 Wellness `/wellness`

Use glass for:

- Wellness summary
- Habit summary card
- Sleep/recovery summary card
- Supplements summary card

Use solid for:

- Logs
- Check rows
- Notes
- Editable details

---

## 16.13 Hydration `/hydration`

Use glass for:

- Water progress summary
- Quick add buttons
- Weekly hydration summary

Use solid for:

- Water log history
- Custom amount input

---

## 16.14 Habits `/habits`

Use glass for:

- Habit summary cards
- Completion progress
- Habit overview

Use solid for:

- Habit creation/edit form
- Daily habit check rows if many

---

## 16.15 Sleep Recovery `/sleep-recovery`

Use glass for:

- Sleep summary
- Recovery overview
- Weekly summary

Use solid for:

- Sleep log form
- Recovery notes
- History rows

---

## 16.16 Supplements `/supplements`

Use glass for:

- Supplement summary
- Daily overview

Use solid for:

- Supplement rows
- Edit/add form
- History/log rows

---

## 16.17 Daily Fit Tasks `/daily-fit-tasks`

Use glass for:

- Daily task summary
- Completion overview

Use solid for:

- Task check rows
- Task creation/edit form

---

## 16.18 Settings `/settings`

Settings should be mostly solid.

Use glass for:

- Small profile/account summary card
- Theme preview cards
- Page-level decorative cards

Use solid for:

- Toggles
- Inputs
- Privacy settings
- Sync settings
- AI connection settings
- Admin settings
- Language/settings forms

Reason: settings need maximum clarity.

---

## 16.19 Profile `/profile`

Mostly solid.

Use glass for:

- Profile summary card

Use solid for:

- Profile form
- Goals/details forms
- Personal information inputs

---

## 16.20 Admin `/admin`

Mostly solid.

Use glass only for:

- High-level admin summary cards

Use solid for:

- Tables
- User rows
- Food/exercise edit forms
- API status details
- Dangerous actions

Admin pages should prioritize reliability over visual effects.

---

## 16.21 Auth `/login` and `/register`

Use glass for:

- Outer auth background
- Brand panel
- Decorative panels

Use solid for:

- Form card
- Inputs
- Password reset
- Error messages

Form card:

```text
Width: max 420px
Radius: 24px
Padding: 24px mobile / 28px desktop
Background: solid-tracking-card
```

---

## 16.22 Landing Page `/`

Landing can be more visual than private app.

Use glass for:

- Public nav
- Hero content card
- Feature cards
- About cards
- CTA wrapper

Use solid for:

- Primary CTAs
- Auth CTAs
- Any form/input

---

## 16.23 Onboarding `/onboarding`

Use mixed surfaces.

Glass:

- Step shell
- Progress overview
- Summary

Solid:

- Inputs
- Selects
- Injury/limitations fields
- Any form-heavy area

---

# 17. Component-Level Sizes

## Cards

| Component | Mobile | Desktop |
|---|---:|---:|
| Small metric card min height | 118px | 126px |
| Standard card min height | auto | auto |
| Featured card min height | 200px | 240px |
| Card radius | 20px | 24px |
| Featured radius | 26px | 32px |
| Card padding | 14–16px | 18–24px |

## Buttons

| Button | Height | Padding | Radius | Text |
|---|---:|---:|---:|---|
| default | 44px | 16px x | 14px | 14px semibold |
| small | 40px | 12px x | 12px | 13px semibold |
| large | 48px | 20px x | 16px | 15px semibold |
| icon | 44x44px | none | 14px | icon 18–20px |
| floating quick log | 56x56px | none | 999px | icon 24px |

## Inputs

| Input | Size |
|---|---:|
| height | 44px |
| mobile min height | 44px |
| radius | 14px |
| padding x | 12px |
| font size | 14px |
| border | solid-tracking-border |
| background | solid white/solid tracking |

Inputs should usually be solid.

## Chips / Badges

| Chip | Size |
|---|---:|
| height | 28–32px |
| padding x | 10–12px |
| radius | 999px |
| font size | 12px |
| weight | 700–800 |

Use glass chips on glass cards.

---

# 18. Icon Rules

Use existing Lucide icons.

Sizes:

| Context | Icon Size |
|---|---:|
| Sidebar icon | 18–20px |
| Mobile bottom nav icon | 20px |
| Button icon | 16px |
| Card icon | 20px |
| Metric icon box | 40–42px box, 18–20px icon |
| Empty state icon | 34–42px |
| Floating plus | 24px |

Metric icon box:

```tsx
<span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/45 text-primary backdrop-blur-md">
```

Do not use too many emoji icons in production UI. Prefer Lucide icons.

---

# 19. Navigation Rules

Desktop nav groups must remain:

```text
Today
Train
Eat
Progress
Wellness
Settings
Admin if user is admin
```

Mobile primary nav must remain:

```text
Today
Train
Eat
More
```

Quick log must remain:

```text
Log Food
Add Water
Start Workout
Add Progress
Add Habit Task
```

Do not remove routes from navigation.

---

# 20. Accessibility Rules

Glass must not reduce readability.

## Contrast

- Body text on cards must be readable.
- Avoid small muted text on weak glass.
- Use `glass-card-strong` for text-heavy glass cards.
- Use solid tracking cards for forms/logs/tables.
- Primary actions must be clearly visible.
- Destructive actions must remain red and clear.

## Focus

Keep focus ring:

```css
:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
```

Do not remove keyboard accessibility.

## Motion

Keep existing reduce motion support.

Allowed motion:

- Small page fade
- Slight card hover lift on desktop
- Dialog/sheet open animation
- Button hover

Avoid:

- Bouncy cards
- Moving gradients while tracking
- Heavy parallax
- Constant shimmer
- Large blur animations

## Touch Targets

Mobile touch targets must be at least 44px high.

---

# 21. Dark Mode Rules

Dark mode must still work.

Dark glass should not be pure transparent black.

Recommended dark glass:

```css
.dark {
  --glass-bg: rgba(30, 33, 26, 0.58);
  --glass-bg-soft: rgba(30, 33, 26, 0.38);
  --glass-bg-strong: rgba(36, 39, 31, 0.72);
  --glass-border: rgba(255, 255, 255, 0.10);
  --solid-tracking-bg: rgba(30, 33, 26, 0.94);
  --solid-tracking-border: rgba(58, 61, 51, 0.88);
}
```

In dark mode:

- Text must stay bright.
- Muted text must not become too faint.
- Primary button may use light olive if current theme defines it.
- Avoid very strong gold glow.

---

# 22. Theme System Rules

The repo already has multiple themes.

Do not break the theme system.

The glass system should use existing CSS variables where possible:

- `--app-bg`
- `--surface`
- `--surface-elevated`
- `--color-primary`
- `--color-secondary`
- `--text-primary`
- `--text-secondary`
- `--color-border`

When themes change, glass should adapt from the active theme.

If implementing theme-aware glass, use color-mix:

```css
.glass-card {
  background:
    linear-gradient(
      145deg,
      color-mix(in srgb, var(--surface) 62%, transparent),
      color-mix(in srgb, var(--surface-elevated) 34%, transparent)
    );
}
```

Fallback if `color-mix` causes compatibility issues:

- Use rgba values from this file.

---

# 23. Implementation Order

Codex should follow this order.

## Step 1 — Add design tokens

Update:

```text
app/globals.css
tailwind.config.ts if needed
```

Add:

- Glass variables
- Solid tracking variables
- Radius variables
- Surface utility classes
- Bento grid class
- Fallbacks
- Reduced transparency support

## Step 2 — Add reusable components

Create:

```text
components/ui/surface.tsx
components/ui/bento-grid.tsx
```

Optional:

```text
components/ui/glass-chip.tsx
```

## Step 3 — Update AppShell

Update:

```text
components/layout/app-shell.tsx
```

Apply:

- Glass sidebar
- Glass topbar
- Glass mobile nav
- Solid floating quick log button
- Strong active states

## Step 4 — Update shared components

Update:

```text
components/ui/button.tsx
components/ui/card.tsx
components/layout/page-heading.tsx
components/dashboard/metric-card.tsx
```

Do this carefully to avoid breaking all pages.

Recommended:

- Keep `Card` safe/readable.
- Add new classes or component variants.
- Use glass classes intentionally on route pages.

## Step 5 — Update core routes first

Update:

```text
app/(private)/dashboard/page.tsx
app/(private)/calories/page.tsx
app/(private)/my-workout/plans/page.tsx
app/(private)/workouts/page.tsx
```

## Step 6 — Update secondary routes

Update:

```text
progress
personal-records
wellness
hydration
habits
sleep-recovery
supplements
daily-fit-tasks
settings
profile
admin
```

## Step 7 — Update auth/landing

Update:

```text
app/page.tsx
app/login/page.tsx
app/register/page.tsx
```

## Step 8 — Test

Run:

```bash
npm run lint
npm run typecheck
npm run build
```

If something fails, fix it.  
If build cannot be completed, list exact errors.

---

# 24. Do Not Remove Anything

This redesign must preserve:

- AuthProvider
- ToastProvider
- UserSettingsProvider
- AppPreferenceEffects
- Theme bootstrap
- Skip to content link
- Supabase integration
- Onboarding redirect logic
- Dashboard loading logic
- Workout plan import
- Workout plan builder
- Workout calendar
- Workout session tracking
- Exercise library filters
- Food logging
- Food Hub
- Custom food/meal builder
- Barcode lookup
- Weekly nutrition
- Meal plan tracking
- Hydration
- Habits
- Sleep/recovery
- Supplements
- Progress photos/measurements
- Personal records
- Settings
- Admin tools
- Translations/i18n
- RTL support
- Reduced motion support
- Private profile/hide profile details
- Current routes and active route logic

This is a UI change, not a product rewrite.

---

# 25. Copy Rules

Use short labels.

Good labels:

```text
Today
Calories
Protein
Water
Weight
Today’s workout
Meal plan
Food log
Weekly Summary
Open Plan
Start
Done
Skip
Add Food
Add Water
Add Progress
```

Avoid:

```text
Plaivra recommends
Next best action
AI insight
Execution score
Command center
Open loop
You should
```

---

# 26. Final Acceptance Criteria

The implementation is successful when:

- The app has a consistent 70% glass / 30% solid tracking visual system.
- App shell is glass.
- Dashboard uses bento cards.
- Dense logs and forms remain solid and readable.
- Mobile layout feels better than desktop, not worse.
- No real feature is removed.
- No fake modules are added.
- AI is limited to real import/settings contexts.
- Existing themes/dark mode are not broken.
- Accessibility is preserved.
- `npm run lint`, `npm run typecheck`, and `npm run build` pass or remaining issues are clearly documented.

---

# 27. Summary for Codex

Implement Plaivra as:

```text
Premium Mobile-First Bento Dashboard
70% Glassmorphism
30% Solid Tracking
```

Glass is for beauty and hierarchy.  
Solid is for logging, editing, and readability.

Do not redesign the product logic.  
Redesign the visual system and layout while preserving all functionality.
