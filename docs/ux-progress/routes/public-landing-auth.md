# Route Audit: Public landing and auth

**Audit date:** 2026-07-06  
**Auditor:** ChatGPT  
**Status:** Audited  
**Score:** 55 / 100  
**Flow decision:** Needs AI-first positioning, auth-state hardening, and mobile trust polish

---

## Files inspected

- `app/page.tsx`
- `components/layout/public-nav.tsx`
- `components/layout/public-footer.tsx`
- `app/login/page.tsx`
- `app/register/page.tsx`
- `components/auth/auth-page.tsx`
- `components/auth/auth-form.tsx`
- `app/auth/oauth-complete/page.tsx`
- `components/auth/oauth-complete-client.tsx`
- `app/auth/consent-completion/page.tsx`
- `components/auth/consent-completion-client.tsx`
- `app/forgot-password/page.tsx`
- `app/reset-password/page.tsx`
- Related context from:
  - `docs/product/ai-first-tracker-model.md`
  - `docs/ux-progress/routes/calories.md`
  - `docs/ux-progress/routes/my-meal-plan.md`
  - `docs/ux-progress/routes/global-app-shell.md`

---

## 1. Product role

The public landing and auth routes are Plaivra's first impression and account-entry surfaces. They should establish what Plaivra is before the user signs in, then make account creation, login, OAuth completion, consent completion, and password recovery feel trustworthy.

The public surface should answer:

```txt
What is Plaivra in five seconds?
How does ChatGPT-assisted tracking work?
Why is this not another manual calorie/gym tracker?
What data does the user approve before Plaivra tracks it?
Can the user create an account or sign in safely?
What happens when OAuth or consent saving fails?
Can the user recover password/reset flows clearly?
```

Current public landing is visually premium but product positioning is misaligned. It still relies on stock fitness photos and broad feature cards. It says “ChatGPT planning,” but it does not clearly show the workflow:

```txt
Ask ChatGPT / upload context -> user approves result -> Plaivra tracks and visualizes it
```

This is the same product-positioning issue identified in the AI-first tracker model and nutrition/meal-plan audits. The public page should make Plaivra feel like an AI-first tracker/control layer, not a generic fitness dashboard.

---

## 2. AI-first vs manual-entry role

Public landing must be AI-first.

Expected hierarchy:

```txt
1. Hero: Plaivra is an AI-first tracker/control layer
2. 5-second workflow visual:
   -> user asks ChatGPT / uploads context
   -> user approves structured result
   -> Plaivra tracks and visualizes it
3. Product UI cards, not stock gym photos
4. Trust/data-control copy
5. CTA: Create account / Sign in
6. Feature sections grouped by workflow, not database categories
```

Current hierarchy:

```txt
1. Stock image hero carousel
2. Plaivra name and public copy
3. Create account / Login
4. Chips: ChatGPT planning, workout tracking, meal planning, progress, sleep
5. Feature grid: workouts, exercise library, meal planning, calorie tracking, progress, sleep, habits, PRs
```

The current structure says “fitness app with many modules.” The required structure should say “AI-assisted tracking system where Plaivra stores, tracks, and visualizes what the user approves.”

---

## 3. User intent and entry points

| User intent | Expected behavior |
|---|---|
| Understand product | Explain AI-first workflow quickly, not module list first. |
| Decide whether to trust it | Show approval-before-tracking, data control, health disclaimer links. |
| Create account | Clear CTA, consent flow, inline validation, reliable OAuth and email signup. |
| Sign in | Reliable email/password and Google flow with status and failure recovery. |
| Complete OAuth | Visible loading, clear failure/retry, 48px controls. |
| Complete missing consent | Clear required agreements, inline save failure, accessible checkboxes. |
| Reset password | Clear request sent state and update state, not toast-only. |
| Use mobile | 390x844 first; nav/CTA/hero should not crowd or depend on stock imagery. |

---

## 4. Current workflow map

```txt
Public landing /
-> PublicNav
-> hero with stock-image background carousel
-> Plaivra headline and copy
-> Create account / Login
-> feature chips
-> feature cards
-> footer legal links

Login/register
-> AuthPage split layout
-> AuthForm
-> email/password or Google
-> register consents
-> redirect to welcome/dashboard/start page

OAuth completion
-> get session
-> save pending consents if needed
-> verify consents
-> redirect or show error card

Consent completion
-> verify current user consents
-> render agreements if missing
-> save consents

Forgot/reset password
-> request reset email
-> update password
```

Strong points:

- Public nav and footer exist.
- Legal links are visible in the footer.
- Login/register use shared `AuthForm`.
- Auth requests use a 15-second timeout wrapper for email/password auth.
- Register requires terms, privacy, explicit fitness-data consent, disclaimer, and age confirmation.
- OAuth stores pending consents for register flow and verifies required consents before entering app.
- OAuth completion has an error state with retry/back-to-login.
- Consent completion catches save errors and preserves the route.
- Forgot/reset password flows exist.
- Arabic and English public copy exist.

Main workflow issues:

- Landing hero uses stock fitness photos and generic feature framing, which conflicts with the product direction to avoid generic gym app design.
- The 5-second workflow is not visible: ChatGPT/context -> approval -> Plaivra tracking/visualization.
- Product UI cards and workflow visuals are missing from the landing page.
- Landing does not clearly distinguish Plaivra from manual calorie trackers and food database apps.
- Landing CTA is present but does not explain what happens after account creation.
- Public nav mobile hides privacy/login and shows About + Create account only, which weakens trust access on mobile.
- Public nav buttons use `size="sm"`; mobile tap targets need verification against 48px.
- Hero carousel uses CSS animation and stock image slides without clear reduced-motion handling in the component.
- Login/register errors are toast-only; no persistent inline form error.
- Google sign-in has no `isLoading` guard/state for OAuth click itself; repeated taps are possible until redirect.
- Google sign-in registration consent failure is toast-only.
- OAuth completion Suspense fallback is `null`, so the callback can briefly show a blank screen.
- OAuth retry button is `h-11`, below the 48px target.
- Consent completion Suspense fallback is `null`, and checking/loading text is generic.
- Consent checkboxes are small `h-4 w-4`; label rows are not explicitly 48px.
- Forgot password success is toast-only; no inline “check your email” confirmation.
- Reset password lacks password visibility toggles and detailed requirement feedback like register.
- Reset password success is inline, but failure is toast-only.
- Auth inputs/buttons generally rely on defaults; verify all are at least 48px on mobile.

---

## 5. Recommended workflow map

```txt
Landing /
-> Premium AI-first hero:
   -> Plaivra = AI-first tracking overview for food, workouts, progress, wellness
   -> 5-second workflow visual
   -> product UI cards / approved import cards
-> Trust/control strip:
   -> user approves before Plaivra tracks
   -> health-data consent and privacy links
   -> no silent AI changes
-> Workflow sections:
   -> nutrition import/review/track
   -> workout import/session/history
   -> progress/wellness overview
-> CTA section:
   -> create account / sign in

Auth
-> Auth form with inline validation/error states
-> OAuth pending state and repeated-tap prevention
-> Consent completion with explicit save/error states
-> Password recovery with inline sent/saved/failure states
```

This is a **needs AI-first positioning, auth-state hardening, and mobile trust polish** correction. Landing needs product reframing; auth routes need state and control hardening.

---

## 6. Flow decision label

**Needs AI-first positioning, auth-state hardening, and mobile trust polish.**

The landing page should be reframed around Plaivra's AI-first workflow before deeper route polish. Auth flows should not be redesigned visually from scratch; harden their states and controls.

---

## 7. Missing comments / microcopy

Add or improve copy for:

- “Ask ChatGPT or upload context.”
- “Approve the result before Plaivra tracks anything.”
- “Plaivra becomes your tracking overview: food, workouts, progress, wellness.”
- “Manual edits stay available for corrections.”
- “No silent AI changes.”
- “Health and fitness data is stored only after your approval and consent.”
- “Creating your account starts with consent and onboarding.”
- “Signing in with Google…”
- “We could not finish Google sign-in. Try again or use email.”
- “Reset link sent. Check your email.”
- “Password updated. You can sign in now.”

Avoid generic bodybuilding, database, or calorie-counter language.

---

## 8. UI structure

Recommended landing structure:

```txt
1. Public nav with trust/legal access
2. AI-first hero and workflow visual
3. Product UI cards
4. Use cases by workflow
5. Trust/privacy/health disclaimer strip
6. CTA and footer
```

Recommended auth structure:

```txt
1. Auth brand/context
2. Form
3. Inline validation/error/success states
4. Legal/consent links
5. Recovery links
```

Current structural issues:

| Current object | Issue | Recommended change | Priority |
|---|---|---|---|
| Hero carousel | Stock gym imagery. | Replace with product UI/workflow visuals. | P1 |
| Hero copy | Does not explain workflow in 5 seconds. | Add AI-first workflow explanation. | P1 |
| Feature grid | Module list. | Reframe as approved-import workflows. | P1 |
| Mobile nav | Trust links hidden. | Keep privacy/terms/login reachable. | P1 |
| Auth errors | Toast-only. | Inline form status. | P1 |
| OAuth fallback | `null`. | Branded loading state. | P1 |
| Consent checkboxes | Small controls. | 48px label rows / larger checkboxes. | P1 |
| Recovery flows | Toast-only success/failure. | Inline sent/saved/failure states. | P2 |

---

## 9. Buttons and action hierarchy

| Action | Current placement | Problem | Decision | Priority |
|---|---|---|---|---|
| Create account | Hero/nav | Good primary action. | Keep, explain next step. | P1 |
| Login | Hero/nav desktop, hidden mobile nav | Mobile login less visible. | Keep reachable on mobile. | P1 |
| About/privacy/legal | Nav/footer | Mobile privacy hidden in nav. | Add mobile trust access. | P1 |
| Google sign-in | Auth form | No OAuth pending state/repeated-tap guard. | Add pending state. | P1 |
| Submit auth | Auth form | Has loading for email/password. | Keep plus inline status. | P1 |
| Consent continue | Consent completion | Has loading but error toast-only. | Inline error. | P1 |
| OAuth retry | Error card | `h-11`. | 48px. | P1 |
| Reset link | Forgot password | Toast-only success. | Inline sent state. | P2 |

---

## 10. Loading / empty / success / error / pending states

| State | Current behavior | Problem | Required fix | Priority |
|---|---|---|---|---|
| Landing load | Static. | Fine, but animated hero must respect reduced motion. | Reduce/disable carousel motion. | P1 |
| Login/register submit | Loading button + toast errors. | Errors disappear. | Inline error summary. | P1 |
| Google OAuth pending | No local pending. | Repeated taps possible. | OAuth pending state. | P1 |
| OAuth page loading | Spinner; Suspense fallback null. | Possible blank screen and generic loading. | Branded loading fallback. | P1 |
| OAuth failure | Error card. | Good base; button 44px and copy can improve. | 48px controls and clearer recovery. | P1 |
| Consent checking | Spinner and “Loading...”. | Generic. | Branded/checking copy. | P2 |
| Consent save failure | Toast-only. | User may miss it. | Inline error. | P1 |
| Forgot reset sent | Toast-only. | User may miss success. | Inline sent state. | P2 |
| Reset failure | Toast-only. | User may miss failure. | Inline error. | P2 |

---

## 11. Motion and interaction design

Public motion should be premium but restrained.

Required motion behavior:

| Interaction | Current behavior | Problem | Required motion | Priority |
|---|---|---|---|---|
| Landing hero | animated background slides. | Stock/photo carousel can feel generic and may ignore reduced motion. | Replace with static/low-motion product UI cards or gate by reduced-motion. | P1 |
| Auth submit | spinner. | Fine. | Keep. | P2 |
| OAuth callback | spinner. | Fine but needs branded fallback. | Keep simple. | P1 |
| Success/failure | toast-heavy. | Not persistent enough. | Inline status states. | P1 |

No aggressive gym photography, confetti, heavy parallax, or bodybuilding imagery.

---

## 12. Implementation risk

| Risk | Why it matters | Recommendation |
|---|---|---|
| Landing copy defines product positioning. | If generic, users misunderstand Plaivra as a manual tracker. | Align with AI-first tracker model. |
| Auth/consent flows are trust-critical. | Hidden errors reduce account trust. | Add inline/persistent states. |
| OAuth localStorage consent flow is sensitive. | Must preserve pending consent logic. | Do not change consent semantics without security review. |
| Public nav/shared copy affects Arabic/English. | Need both languages to remain usable. | Update public copy consistently. |
| Reduced motion. | Hero carousel may be problematic. | Gate animation or replace with static product visuals. |

---

## 13. Score breakdown

| Category | Score | Max | Notes |
|---|---:|---:|---|
| Route purpose and action hierarchy | 7 | 15 | Public purpose is not aligned with AI-first model. |
| Button size, placement, and hierarchy | 9 | 15 | CTAs exist, but mobile trust/login access and 48px details need work. |
| Spacing consistency and visual rhythm | 8 | 10 | Premium styling base is strong. |
| Feedback, optimistic UI, loading, and errors | 7 | 15 | Auth has loading, but errors/success are too toast-dependent. |
| Motion and interaction quality | 6 | 15 | Hero carousel/stock imagery conflicts with product direction and reduced-motion needs. |
| Mobile-first behavior and tap comfort | 7 | 10 | Layout likely usable, but mobile nav/auth checkboxes need hardening. |
| AI safety, privacy, and high-risk action control | 7 | 10 | Consent flow exists; landing trust story weak. |
| Premium/subscription readiness | 4 | 10 | Visual polish exists, but positioning is not premium/product-specific enough. |
| **Total** | **55** | **100** | Strong visual base, weak product positioning and persistent auth states. |

---

## 14. Constitution violations

| Rule violated | Evidence | Fix |
|---|---|---|
| Product alignment | Landing does not show AI-first approval workflow. | Reframe hero/workflow/feature sections. |
| Avoid generic gym app design | Stock fitness photo carousel. | Use product UI cards and workflow visuals. |
| Loading/error state clarity | Auth errors and reset success are mostly toast-only. | Inline persistent states. |
| 48px tap target baseline | OAuth retry, consent checkboxes, nav small buttons need verification. | Resize/grow targets. |
| Reduced-motion respect | Hero animation not explicitly gated. | Reduce/disable carousel motion. |

---

## 15. Required fixes

| Priority | Fix | Owner | Status |
|---|---|---|---|
| P1 | Reframe landing hero around AI-first workflow: ChatGPT/context -> approval -> Plaivra tracking/visualization. | Codex/Kimi/Human | Open |
| P1 | Replace stock fitness photo carousel with product UI cards/workflow visuals. | Codex/Kimi/Human | Open |
| P1 | Reframe feature grid from module list to approved-import workflows. | Codex/Kimi/Human | Open |
| P1 | Add trust/control strip: approval before tracking, no silent AI changes, privacy/health links. | Codex/Kimi/Human | Open |
| P1 | Keep login/privacy/legal reachable on mobile public nav. | Codex/Kimi/Human | Open |
| P1 | Add OAuth pending state to Google sign-in and prevent repeated taps. | Codex/Kimi/Human | Open |
| P1 | Add inline auth form error/success states in addition to toast. | Codex/Kimi/Human | Open |
| P1 | Replace `Suspense fallback={null}` on auth callback/consent routes with branded loading states. | Codex/Kimi/Human | Open |
| P1 | Resize OAuth retry, consent rows/checks, and mobile nav/auth controls to 48px effective targets. | Codex/Kimi/Human | Open |
| P1 | Add inline consent save failure state. | Codex/Kimi/Human | Open |
| P2 | Add inline forgot-password “reset link sent” state. | Codex/Kimi/Human | Open |
| P2 | Add reset-password inline error and password visibility/requirements parity with register. | Codex/Kimi/Human | Open |
| P2 | Ensure English and Arabic public copy stay aligned. | Codex/Kimi/Human | Open |
| P2 | Gate/disable public hero animation under reduced motion. | Codex/Kimi/Human | Open |

---

## 16. Retest checklist

- [ ] Landing explains the workflow in five seconds: ChatGPT/context -> approval -> Plaivra tracking/visualization.
- [ ] Landing uses product UI cards/workflow visuals instead of stock gym photos.
- [ ] Public copy does not make Plaivra look like a manual calorie tracker or generic gym app.
- [ ] Mobile public nav keeps sign in and trust/legal access reachable.
- [ ] Create account and login CTAs are 48px and clear on 390x844.
- [ ] Google OAuth has a pending state and repeated-click prevention.
- [ ] Auth form errors appear inline, not toast-only.
- [ ] OAuth and consent Suspense fallbacks are branded, not blank.
- [ ] Consent rows/checks meet 48px effective target and remain accessible.
- [ ] Consent save failure appears inline.
- [ ] Forgot password success appears inline.
- [ ] Reset password has inline error and clear requirements.
- [ ] Public hero motion respects reduced-motion settings.
- [ ] Arabic and English public/auth copy remain coherent.
- [ ] No schema, auth semantics, consent semantics, AI import/apply behavior, or private app routes are changed.

---

## 17. Codex prompt section

Use this route with public positioning, auth safety, consent safety, and reduced-motion review.

```txt
/caveman lite

$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + AI-first product positioning reviewer + auth/consent safety reviewer + reduced-motion reviewer
```

Implementation should not change database schema, auth semantics, consent semantics, AI import/apply behavior, private app route behavior, or global theme.

---

## 18. Implementation note

Do not rebuild auth. Preserve the existing auth capabilities:

```txt
Email login/register -> Google OAuth -> consent persistence/completion -> password recovery/reset
```

Rebuild the public landing positioning before visual polish:

```txt
AI-first hero -> 5-second workflow visual -> product UI cards -> trust/control strip -> clear auth CTA
```
