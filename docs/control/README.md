# Plaivra Repository Control Plane

Every Plaivra implementation session starts here and follows this authority order:

1. [`docs/product/PLAIVRA_PRODUCT_CONSTITUTION.md`](../product/PLAIVRA_PRODUCT_CONSTITUTION.md) — permanent product principles.
2. [`docs/control/PLAIVRA_DECISIONS.md`](PLAIVRA_DECISIONS.md) — append-only approved decision log.
3. [`docs/control/PLAIVRA_MASTER_PLAN.md`](PLAIVRA_MASTER_PLAN.md) — approved direction, sequencing, and current program.
4. [`docs/control/PLAIVRA_CURRENT_STATE.md`](PLAIVRA_CURRENT_STATE.md) — current implementation and Production status, with dated audit baselines where applicable.
5. [`docs/control/PLAIVRA_ARCHITECTURE_AUTHORITIES.md`](PLAIVRA_ARCHITECTURE_AUTHORITIES.md) — domain source-of-truth and system boundaries.
6. [`docs/control/PLAIVRA_DELIVERY_RULES.md`](PLAIVRA_DELIVERY_RULES.md) — implementation, review, test, merge, and completion rules.
7. Source code, immutable migrations, and Production evidence — final technical truth when implementation facts are disputed.

Historical PRs, completed phase reports, chat messages, and GitHub Actions artifacts are evidence, not current planning authority.

Future implementers must not perform broad rediscovery unless the Product & Engineering Lead explicitly requests an audit.

The decision log is append-only. A decision that changes current direction must update the affected Master Plan, Current State, Architecture Authority, or Delivery Rule in the same PR, so the current control documents and decision log must not contradict each other.

Update the control documents in the same PR whenever a change materially alters current state, domain authority, roadmap, delivery rules, or an approved decision.
