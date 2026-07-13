# Plaivra Web UI Rules

**Status:** Authoritative web adaptation of the Cross-Platform UI Constitution

## 1. Role

The responsive Next.js web app is Plaivra's first production client and functional reference. It must work as a premium mobile web product and a productive desktop product.

## 2. Breakpoint strategy

Use content-driven adaptation. Reference ranges:

- compact phone: below 360 px;
- standard phone: 360–479 px;
- large phone/small tablet: 480–767 px;
- tablet: 768–1023 px;
- desktop: 1024–1439 px;
- large desktop: 1440 px and above.

Breakpoints are not permission to change product behavior. They change layout and navigation presentation.

## 3. Layout

- phone gutter: 16 px; 20 px when width allows;
- tablet gutter: 24–32 px;
- desktop gutter: 32–48 px;
- default content maximum: 1200–1280 px;
- focused form maximum: 560–680 px;
- data tables may use wider containers with horizontal strategy documented;
- avoid more than three major columns in the member product.

## 4. Navigation

- mobile web: stable bottom navigation for highest-frequency domains;
- desktop: persistent sidebar/rail when it reduces repeated navigation cost;
- browser back/forward and direct URLs must work;
- active route is visible without color alone;
- skip link and landmarks are required;
- no hover-only functionality.

## 5. Controls

- minimum mobile hit area: 44 × 44 px; prefer 48 × 48 px;
- primary mobile action: 52–56 px high;
- desktop compact controls may be 36–40 px only when pointer use is expected and an accessible hit target remains;
- visible keyboard focus is mandatory;
- native HTML semantics are preferred over simulated controls.

## 6. Mobile browser behavior

- account for safe-area insets;
- sticky actions remain above browser chrome and keyboards;
- avoid viewport-height traps; use dynamic viewport units where appropriate;
- input focus must not hide the field or primary action;
- validate iOS Safari and Android Chrome behavior;
- preserve user progress across refresh and recoverable navigation.

## 7. Desktop behavior

- use available width to improve comparison and overview, not to inflate cards;
- support keyboard shortcuts only when discoverable and non-conflicting;
- tooltips are supplementary, never the only explanation;
- hover may enhance but never reveal the only available action;
- dense tables require sticky headers, clear sorting, and responsive fallback.

## 8. Accessibility

- meet WCAG 2.2 AA target for core flows;
- support 200% zoom and reflow without loss of function;
- logical focus order;
- focus not obscured by sticky regions;
- status changes announced appropriately;
- semantic headings and labels;
- accessible authentication and password-manager support.

## 9. Performance budgets

For core routes, target:

- immediate pressed state;
- route shell visible without waiting for unrelated requests;
- stable skeleton geometry;
- no large layout shift;
- lazy loading for secondary charts/media;
- client components only where interaction requires them;
- bundle growth justified and measured.

## 10. Web-only surfaces

Admin and operational tools may remain web-only. Member product behavior and data contracts must not depend on desktop-only administration UI.
