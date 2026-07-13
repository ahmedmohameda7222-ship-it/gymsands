# Provider-neutral entitlement foundation

Status: source complete; paid launch remains owner-gated.

Plaivra now has one entitlement boundary for Stripe, Apple StoreKit, Google Play Billing, and explicitly audited manual grants. Application capability checks must read `user_entitlements`; they must not inspect a raw provider status in product or MCP code.

## Launch gate

The migration creates no offering, price, or capability. `BILLING_CHECKOUT_ENABLED` defaults to `false`. Checkout requires all of the following:

1. owner approval of plan capabilities and commercial terms;
2. an `approved` `billing_offerings` row with an owner timestamp, provider product/price identifiers, and non-empty capability keys;
3. Stripe server and webhook secrets;
4. updated Terms and Privacy content reviewed for the paid offering;
5. webhook and refund/chargeback tests against Stripe test mode.

No price belongs in source code. Payment credentials are collected on Stripe-hosted Checkout, never by Plaivra or MCP.

## Event and access model

- Provider event IDs are unique in `billing_event_ledger`; replayed events are acknowledged without a second reduction.
- The ledger stores a SHA-256 payload hash and minimized processing metadata, not raw provider payloads or payment credentials.
- Provider customer and subscription IDs are bound to one Plaivra user. Cross-user rebinding is a terminal error.
- Only owner-approved offering capability keys can produce entitlement rows.
- Normalized states are `inactive`, `trialing`, `active`, `grace_period`, `billing_issue`, `cancelled_but_active`, `expired`, and `revoked`.
- Existing history, account privacy controls, and export remain available when a paid entitlement expires.

## Provider status

- Stripe: Checkout, customer portal, signature-verified subscription webhooks, replay ledger, and reducer source are implemented. Production configuration and test-mode evidence remain manual.
- Apple: StoreKit server verification adapter contract exists; there is no native app or receipt acceptance implementation.
- Google: Play Billing verification adapter contract exists; there is no native app or purchase-token acceptance implementation.

## Rollback and forward-fix

Keep `BILLING_CHECKOUT_ENABLED=false` to stop new checkout sessions. Revoke/rotate Stripe secrets and disable the webhook endpoint in Stripe if signature handling is in doubt. Do not delete provider events or entitlement history automatically. Correct provider mapping or reducer defects with an additive migration and replay the affected verified event IDs through an audited forward-fix job.
