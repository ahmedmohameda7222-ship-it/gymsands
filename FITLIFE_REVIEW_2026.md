# Plaivra — Comprehensive Code Review

> **Review date:** June 2026  
> **Repo:** `https://github.com/ahmedmohameda7222-ship-it/gymsands`  
> **Stack:** Next.js 16, React 19, TypeScript 5.9, Tailwind CSS 3.4, Supabase, MCP  
> **Total files reviewed:** 40+ core files across `app/`, `components/`, `lib/`, `services/`

---

## Executive Summary

Plaivra is a **well-architected, feature-rich fitness dashboard** with a strong MCP (Model Context Protocol) integration for ChatGPT. The app covers workouts, meal planning, nutrition tracking, hydration, progress, habits, sleep/recovery, supplements, and admin tools. The design system is cohesive and the mobile UX is thoughtfully implemented.

However, there are **critical bugs in the MCP scope enforcement**, **timezone handling bugs**, **massive component files** (800–980 lines), and **heavy code duplication** across date/math utilities that need immediate attention.

---

## Overall Scores

| Category | Score | Grade |
|----------|-------|-------|
| **Architecture & Design** | 82/100 | B+ |
| **Bug-Free Reliability** | 64/100 | C |
| **Code Quality & DRY** | 58/100 | C |
| **UI/UX Professionalism** | 78/100 | B+ |
| **ChatGPT / MCP Integration** | 88/100 | A |
| **Accessibility (a11y)** | 65/100 | C |
| **Performance** | 72/100 | C+ |
| **Security** | 70/100 | C+ |
| **Overall App Score** | **72/100** | **C+** |

---

## 1. Critical Bugs & Logic Errors 🔴

### 1.1 MCP Scope Enforcement Completely Bypassed
**File:** `lib/mcp/auth.ts:179`  
**Severity:** CRITICAL

```typescript
return {
  supabase,
  userId: connection.user_id,
  connectionId: connection.id,
  scopes: MCP_FULL_ACCESS_SCOPES,  // ❌ HARDCODED — ignores DB value!
  profile: profile as McpProfile
};
```

The database stores `scopes` per connection, but the auth handler **overwrites it with hardcoded full access**. This means every ChatGPT connection gets `fitlife.all` regardless of what the user consented to. The scope system is architecturally correct but **non-functional**.

**Fix:** Change to `scopes: connection.scopes ?? MCP_FULL_ACCESS_SCOPES`.

---

### 1.2 Scope Regex Logic Bug — Wrong Scopes Assigned to Tools
**File:** `lib/mcp/server.ts:61-72`  
**Severity:** HIGH

```typescript
if (/profile|goal/i.test(name)) return ["fitlife.profile.write", "fitlife.progress.write"];
```

`update_training_goal` contains the substring `"goal"`, so it matches the **profile/goal** regex instead of the **workout/training** regex. This means a workout-related tool incorrectly requires `fitlife.profile.write` scope. The regex order matters but these patterns are too broad.

**Fix:** Use exact tool name matching or prefix-based patterns instead of loose substring regex.

---

### 1.3 Read Scope Check Allows Write Scopes
**File:** `lib/mcp/server.ts:57-59`  
**Severity:** MEDIUM

```typescript
function readScopeAllowed(ctx: McpContext) {
  return ctx.scopes.some((scope) => scope === "fitlife.all" || scope.endsWith(".read") || scope.endsWith(".write"));
  //                                                                    ❌ write grants read?
}
```

A read-only tool should **not** be accessible with only a `.write` scope. The logic is inverted/permissive. Combined with bug #1.1, this is moot, but if scopes are ever enforced, this is a security hole.

**Fix:** Remove `|| scope.endsWith(".write")` from read scope checks.

---

### 1.4 Timezone Bugs — "Today" Is UTC, Not Local
**Files:** `lib/utils.ts:22`, `lib/mcp/schemas.ts:45`, `lib/mcp/tool-executor.ts:56`, `services/database/nutrition.ts:527`, `services/wellness/wellness-data.ts:61`  
**Severity:** HIGH

```typescript
export function todayIso() {
  return new Date().toISOString().slice(0, 10); // ❌ UTC date, not local!
}
```

`toISOString()` returns **UTC** midnight. A user in Cairo (UTC+2) at 1:00 AM sees "yesterday's" date. This affects:
- Food logging
- Meal plans
- Water tracking
- Workout sessions
- Dashboard "today" view
- MCP tool responses

**Fix:** Use `new Date().toLocaleDateString("en-CA")` (YYYY-MM-DD in local timezone) or accept a timezone offset from the user profile.

---

### 1.5 Dashboard `hasStartedWorkout` Logic Is Wrong
**File:** `app/(private)/dashboard/page.tsx:180`  
**Severity:** MEDIUM

```typescript
const hasStartedWorkout = Boolean(openSessionId || history.length);
```

The setup checklist marks "Start first workout" as **done** if the user has **any** workout history — even if every session was **skipped**. This gives users a false sense of completion.

**Fix:** Change to `Boolean(openSessionId || history.some(s => s.status === "completed"))`.

---

### 1.6 `completedToday` Checks `started_at` Instead of `completed_at`
**File:** `app/(private)/dashboard/page.tsx:179`  
**Severity:** MEDIUM

```typescript
const completedToday = Boolean(history.find((session) => session.status === "completed" && session.started_at?.slice(0, 10) === today));
```

A session started yesterday and completed today will **not** count as "completed today." Should check `completed_at` if available.

**Fix:** `session.completed_at?.slice(0, 10) === today || session.started_at?.slice(0, 10) === today`.

---

### 1.7 Auth Provider Subscription Access Is Fragile
**File:** `components/auth/auth-provider.tsx:144`  
**Severity:** MEDIUM

```typescript
const authListener = listener as unknown as Record<string, { unsubscribe: () => void }>;
authListener[`sub${"scription"}`].unsubscribe();  // ❌ String concatenation hack
```

This relies on runtime string concatenation to access `.subscription`. If Supabase changes internals, this breaks silently. Use the typed API instead.

**Fix:** `listener.subscription.unsubscribe()` (Supabase v2 types support this).

---

### 1.8 `crypto.randomUUID()` May Fail in Older Browsers
**File:** `components/ui/toaster.tsx:37`  
**Severity:** LOW

```typescript
const id = crypto.randomUUID();
```

Fails in insecure HTTP contexts and older browsers. No fallback.

**Fix:** Use `crypto.randomUUID?.() || Math.random().toString(36).slice(2)`.

---

### 1.9 Duplicate `percent` Function Returns Different Types
**Files:** `services/nutrition/calculations.ts:45` vs `services/reports/reporting.ts:45`  
**Severity:** LOW

One returns `number` (e.g., `45`), the other returns `number | null` (e.g., `null` when target is 0). This inconsistency can cause type confusion.

**Fix:** Consolidate into a single utility.

---

## 2. Code Duplicates & DRY Violations 🟡

### 2.1 Date Utilities Duplicated in 8+ Files

| Function | Duplicated In |
|----------|--------------|
| `todayIso()` | `lib/utils.ts`, `lib/mcp/schemas.ts`, `lib/mcp/tool-executor.ts`, `services/database/nutrition.ts`, `services/wellness/wellness-data.ts`, `app/api/food/open-food-facts/route.ts` |
| `addDays(date, days)` | `lib/mcp/tool-executor.ts`, `app/(private)/calories/page.tsx`, `app/(private)/progress/page.tsx`, `app/(private)/hydration/page.tsx` |
| `startOfWeek(value)` | `services/reports/reporting.ts`, `app/(private)/calories/page.tsx`, `app/(private)/progress/page.tsx`, `app/(private)/hydration/page.tsx`, `components/lifestyle/wellness-trackers.tsx`, `components/workouts/workout-plan-builder.tsx`, `components/workouts/workout-calendar.tsx` |
| `toDateOnly(date)` | `app/(private)/calories/page.tsx`, `app/(private)/hydration/page.tsx` |

**Impact:** 30+ lines of duplicated logic. Bugs fixed in one place (e.g., timezone fix) must be applied in 8 files.

**Fix:** Create `lib/date-utils.ts` with all date helpers and migrate every file to use it.

---

### 2.2 MCP `ok`, `fail`, `num`, `sumMacros` Duplicated
**Files:** `lib/mcp/tool-executor.ts` and `lib/mcp/tool-executor-safe.ts`  
**Lines:** ~30 duplicated

Both files define identical helper functions. The "safe" wrapper should import these from the original or a shared module.

---

### 2.3 Error Boundaries Are Copy-Pasted
**Files:** `app/(private)/my-meal-plan/error.tsx`, `app/(private)/meals/error.tsx`  
**Difference:** Only the title and description text change.

**Fix:** Create a single `DefaultErrorBoundary` component in `components/errors/` and reuse it.

---

### 2.4 `useState` Spam in Large Components
**File:** `app/(private)/dashboard/page.tsx` — 17 `useState` calls  
**File:** `app/(private)/calories/page.tsx` — 15+ `useState` calls  
**File:** `components/meals/my-meal-plan-builder.tsx` — 14+ `useState` calls

Complex state should be managed with `useReducer` or extracted into custom hooks (e.g., `useDashboardData`, `useCaloriePageData`).

---

### 2.5 Inline Function Definitions in Render
**Files:** Multiple pages define large helper functions (`buildNextBestActions`, `buildDashboardCoaching`, `hydrationAction`) inside the component body. These are re-created on every render.

**Fix:** Extract to `lib/dashboard-logic.ts` or similar.

---

## 3. ChatGPT / MCP Integration Review ✅

### What's Excellent

| Feature | Status |
|---------|--------|
| Full MCP server with JSON-RPC 2.0 | ✅ |
| OAuth authorization server metadata | ✅ |
| 70+ tool definitions | ✅ |
| Scope-based permission system | ✅ (architecture) |
| Rate limiting (DB + in-memory fallback) | ✅ |
| Audit logging to `mcp_audit_logs` | ✅ |
| HMAC-SHA256 token hashing | ✅ |
| CORS origin validation | ✅ |
| Tool risk levels (read/low/medium/high/admin) | ✅ |
| No in-app LLM generation (correct product model) | ✅ |

### What's Broken

| Feature | Status | Details |
|---------|--------|---------|
| Scope enforcement | ❌ **Broken** | Hardcoded full access (Bug #1.1) |
| Tool scope routing | ❌ **Buggy** | Regex matches wrong scopes (Bug #1.2) |
| Read-only tool access | ❌ **Too permissive** | Write scopes grant read access (Bug #1.3) |
| Historical workout logs | ⚠️ Missing | No `get_workout_history_by_date` tool |
| Bulk data export | ⚠️ Missing | No CSV/JSON export tools for AI |
| Unified query interface | ⚠️ Missing | 70 discrete RPC calls; no single `query_data` tool |

### ChatGPT Score: 88/100 (A)

**Verdict:** The MCP foundation is **production-grade** in architecture, but the scope enforcement has **critical security bugs** that must be fixed before deploying to real users. Once fixed, ChatGPT can access virtually every feature of the app.

---

## 4. UI/UX Review 🎨

### 4.1 What's Professional & Well-Done

| Element | Rating | Notes |
|---------|--------|-------|
| Design system / color tokens | ⭐⭐⭐⭐⭐ | Luxury wellness palette (navy, champagne, sage) is consistent |
| Mobile bottom nav | ⭐⭐⭐⭐⭐ | `env(safe-area-inset-bottom)` support, 6-item grid, `aria-label` |
| Dialog as mobile sheet | ⭐⭐⭐⭐⭐ | `bottom-0`, `rounded-t-2xl`, `max-h-[90dvh]` — excellent pattern |
| Skeleton loading states | ⭐⭐⭐⭐⭐ | `CardSkeleton`, `CardGridSkeleton`, `aria-busy="true"` |
| Button micro-interactions | ⭐⭐⭐⭐ | `hover:-translate-y-0.5` is subtle but nice |
| Page transitions | ⭐⭐⭐⭐ | Framer Motion `opacity` + `y` fade on route change |
| Error states | ⭐⭐⭐⭐ | `ErrorState`, `EmptyState` components are reusable and clear |
| Typography hierarchy | ⭐⭐⭐⭐ | Clear `text-xs uppercase tracking-wide` pattern for labels |
| Responsive grids | ⭐⭐⭐⭐ | `md:grid-cols-2 xl:grid-cols-4` adapts well |
| Touch target sizes | ⭐⭐⭐⭐ | `min-height: 44px` on mobile for inputs/buttons |

### 4.2 UI/UX Bugs & Issues

#### 🔴 Accessibility: `maximumScale: 1` Prevents Zoom
**Files:** `app/layout.tsx:15`, `app/globals.css`  
This violates WCAG 1.4.4 (Resize Text). Users with low vision cannot zoom.

**Fix:** Remove `maximumScale: 1`.

---

#### 🟡 Toast Always Shows Success Icon
**File:** `components/ui/toaster.tsx:56`  
```tsx
<CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
```

Error toasts display a **green checkmark** instead of a red warning icon. Confusing UX.

**Fix:** Accept a `variant` prop (`success` | `error` | `warning`) and render the appropriate icon (`CheckCircle2`, `XCircle`, `AlertTriangle`).

---

#### 🟡 No Skip-to-Content Link
**File:** `components/layout/app-shell.tsx`  
Keyboard users must tab through the entire sidebar to reach main content.

**Fix:** Add `<a href="#main-content" className="sr-only focus:not-sr-only">Skip to content</a>`.

---

#### 🟡 Hero Images Are Not Optimized
**File:** `app/page.tsx:8-10`  
```tsx
const heroImages = [
  "https://images.unsplash.com/...",
  ...
];
```

These are loaded as CSS `background-image`, bypassing Next.js image optimization. The `next.config.mjs` only allows `*.supabase.co`. Large Unsplash images load slowly on mobile.

**Fix:** Use `next/image` with `<Image>` and add `images.unsplash.com` to `remotePatterns`, or use a CDN with `?w=800&q=80` params.

---

#### 🟡 Dashboard Page Is 983 Lines
**File:** `app/(private)/dashboard/page.tsx`  
This is a **maintenance nightmare**. It contains:
- 17 `useState` hooks
- `buildNextBestActions` (166 lines)
- `buildDashboardCoaching` (58 lines)
- `countCompletedTrainingStreak` (20 lines)
- `SmartActionCard`, `RingMetric`, `MacroLine`, `ChecklistLine` inline components

**Fix:** Extract to `components/dashboard/sections/`, `lib/dashboard-logic.ts`, and `hooks/use-dashboard.ts`.

---

#### 🟡 Calories Page Is 821 Lines
**File:** `app/(private)/calories/page.tsx`  
Same issue. Extract `calorieProgressColor`, `mixColor`, `addDays`, `toDateOnly`, `startOfWeek` to `lib/date-utils.ts` and `lib/colors.ts`.

---

#### 🟡 Meal Plan Builder Is 858 Lines
**File:** `components/meals/my-meal-plan-builder.tsx`  
Contains 9 local types, 14 state variables, and massive inline logic. Should be split into sub-components (`MealPlanCalendar`, `MealPlanEditor`, `ShoppingList`, `BatchMealForm`).

---

#### 🟡 Workout Browser Loads 500 Items at Once
**File:** `components/workouts/workout-browser.tsx:17`  
```tsx
const pageSize = 500;
```

The 600-exercise library is loaded entirely into the browser. This is fine for 600 items, but if the library grows to 5,000+, this becomes a performance issue. No virtual scrolling.

**Fix:** Implement pagination or virtual scrolling (e.g., `react-window`).

---

#### 🟡 `window.location.href` in Error Boundaries
**Files:** `app/(private)/my-meal-plan/error.tsx:17`, `app/(private)/meals/error.tsx:17`  
```tsx
onClick={() => { window.location.href = "/dashboard"; }}
```

This causes a **full page reload** instead of a client-side navigation. Use `useRouter` from Next.js.

---

#### 🟡 Z-Index Hierarchy Is Fragile
**File:** `components/ui/toaster.tsx:49` — `z-[70]`  
**File:** `components/ui/dialog.tsx:19` — `z-50`  
**File:** `components/layout/app-shell.tsx:172` — `z-40`  
**File:** `components/layout/mobile-sticky-actions.tsx:8` — `z-30`

Magic numbers (`z-70`, `z-50`, `z-40`) are hard to maintain. Add a design token system:
```css
--z-toast: 70;
--z-modal: 50;
--z-nav: 40;
--z-sticky: 30;
```

---

#### 🟡 Console Warnings in Production
**Files:** 30+ files contain `console.warn` for error logging.  
These are gated by `process.env.NODE_ENV !== "production"` in `lib/error-formatting.ts`, but many service files log unconditionally.

**Fix:** Wrap all service logs with the same env check or use a proper logging service (Sentry, LogRocket).

---

#### 🟢 Good: Mobile Sticky Actions Pattern
**File:** `components/layout/mobile-sticky-actions.tsx`  
```tsx
className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 ..."
```

This is **excellent** — accounts for the bottom nav bar height + iPhone safe area. A well-executed mobile UX pattern.

---

## 5. Security Assessment 🔒

| Concern | Status | Notes |
|---------|--------|-------|
| Supabase RLS | ✅ | Used extensively per migrations |
| MCP token hashing | ✅ | HMAC-SHA256 with secret |
| Rate limiting | ✅ | DB + in-memory fallback |
| Scope enforcement | ❌ | Broken (see Bug #1.1) |
| SQL injection | ✅ | Supabase client is parameterized |
| Admin route guards | ✅ | `adminOnly` prop on `ProtectedRoute` |
| XSS via MCP input | ⚠️ | `userSafeError` strips messages but tool inputs are passed directly to DB. No sanitization on `notes` or `name` fields. |
| `dangerouslySetInnerHTML` | ✅ | Not found in codebase |
| `eval()` / `Function()` | ✅ | Not found |
| Environment variable exposure | ✅ | No `OPENAI_API_KEY` or secrets in client bundle |

**Security Score: 70/100** — Scope enforcement is the primary blocker.

---

## 6. Performance Assessment ⚡

| Concern | Status | Notes |
|---------|--------|-------|
| Bundle size | ⚠️ | 600-exercise library loaded on workout page. No code splitting. |
| Image optimization | ⚠️ | Hero images use raw Unsplash URLs. `next/image` not used. |
| Font loading | ✅ | `font-sans` (system font stack) — no external font blocking render |
| Animation performance | ✅ | Framer Motion uses CSS transforms (`translateY`, `opacity`) |
| Re-renders | ⚠️ | Dashboard has 17 state variables; every `quickAddWater` triggers a full re-render. Use `useMemo` / `useCallback` more aggressively. |
| API call batching | ✅ | Dashboard uses `Promise.all([...])` for 16 parallel queries. Good. |
| Local storage access | ✅ | Wrapped in `typeof window !== "undefined"` checks |
| Client-side Supabase | ✅ | Single shared client instance |

**Performance Score: 72/100** — Main issues are monolithic pages and missing code splitting.

---

## 7. Accessibility (a11y) Assessment ♿

| Concern | Status | Notes |
|---------|--------|-------|
| Zoom disabled | ❌ | `maximumScale: 1` |
| Skip links | ❌ | Missing |
| `aria-label` on nav | ✅ | Mobile nav has it |
| `aria-current="page"` | ✅ | Sidebar and mobile nav |
| `aria-busy` on skeletons | ✅ | `CardSkeleton` has it |
| Form labels | ✅ | `Label` component from Radix |
| Dialog focus trap | ✅ | Radix Dialog handles this |
| Toast announcements | ⚠️ | No `role="alert"` or `aria-live` on toasts |
| Color contrast | ✅ | Primary `#55603D` on `#F5F0E8` passes WCAG AA |
| Focus visible | ✅ | `:focus-visible` with `outline: 2px solid` |
| Touch targets | ✅ | 44px minimum on mobile |
| Alt text on images | ⚠️ | No images use `next/image` with `alt`. Hero images are CSS backgrounds. |

**Accessibility Score: 65/100** — Fix zoom, add skip links, improve toast announcements.

---

## 8. Recommendations (Priority Order)

### P0 — Fix Before Production
1. **Fix MCP scope hardcoding** (`lib/mcp/auth.ts:179`) — use `connection.scopes` from DB.
2. **Fix scope regex routing** (`lib/mcp/server.ts:61-72`) — use exact matching instead of substring regex.
3. **Fix timezone bugs** — Replace all `toISOString().slice(0, 10)` with a locale-aware `todayIso()`.
4. **Fix read scope check** — Remove `.write` from `readScopeAllowed`.
5. **Fix `hasStartedWorkout` logic** — Only count completed workouts.

### P1 — High Impact, Medium Effort
6. **Extract date utilities** — Create `lib/date-utils.ts` and deduplicate `addDays`, `startOfWeek`, `todayIso`, `toDateOnly`.
7. **Split monolithic pages** — Break `dashboard/page.tsx` (983 lines) into `components/dashboard/sections/*`.
8. **Split `calories/page.tsx`** (821 lines) and `my-meal-plan-builder.tsx` (858 lines).
9. **Consolidate `percent` function** — Single source in `lib/math-utils.ts`.
10. **Deduplicate `ok`/`fail`/`num`/`sumMacros`** — Move to `lib/mcp/helpers.ts`.
11. **Add toast variants** — `success` | `error` | `warning` with appropriate icons.
12. **Remove `maximumScale: 1`** — Fix zoom accessibility.
13. **Add skip-to-content link** — In `app-shell.tsx`.
14. **Use `useRouter` in error boundaries** — Replace `window.location.href`.

### P2 — Polish & Performance
15. **Add virtual scrolling** to exercise library for future scale.
16. **Optimize hero images** — Use `next/image` with `priority` and proper sizing.
17. **Add `role="alert"` / `aria-live`** to toast container.
18. **Implement a unified `query_data` MCP tool** — Let ChatGPT fetch multi-domain data in one call.
19. **Add `get_workout_history_by_date` MCP tool** — Fill the missing historical read gap.
20. **Add error boundary for dashboard** — Currently only `my-meal-plan` and `meals` have them.
21. **Create shared `DefaultErrorBoundary`** — Deduplicate error boundary JSX.
22. **Add Z-index design tokens** — `--z-modal`, `--z-toast`, etc. in CSS variables.
23. **Reduce console.warn in production** — Gate all service logs with env checks.
24. **Add `useReducer` for dashboard state** — Replace 17 `useState` calls.

### P3 — Nice to Have
25. **Add a loading overlay** for long MCP operations.
26. **Implement progressive enhancement** — Make forms work without JS for basic functionality.
27. **Add Storybook** for UI component documentation.
28. **Add E2E tests** with Playwright for critical flows (login → dashboard → log food → workout).
29. **Add `getServerSideProps` or `generateStaticParams`** where applicable to reduce client-side loading.
30. **Add `preload` hints** for critical fonts/images.

---

## 9. Final Verdict

Plaivra is a **ambitious, well-designed fitness app** with a genuinely impressive MCP integration. The architecture is solid, the mobile UX is polished, and the design system is cohesive.

However, the codebase suffers from **three critical issues that must be fixed before production:**
1. **MCP scope enforcement is bypassed** (security)
2. **Timezone handling is broken** (data integrity)
3. **Component files are massively oversized** (maintainability)

The **heavy duplication of date utilities and helper functions** indicates a codebase that grew quickly without a shared utility layer. A single `lib/date-utils.ts` and `lib/mcp/helpers.ts` would eliminate ~100 lines of duplicated code and prevent future bugs.

**The ChatGPT integration is the app's standout feature.** With 70+ tools, audit logging, OAuth, and rate limiting, the MCP server is more comprehensive than most production apps. Fixing the scope bugs will make it truly production-ready.

**Overall Score: 72/100 (C+)**  
*With P0 fixes: 85/100 (B+)*  
*With P0 + P1 fixes: 92/100 (A-)*
