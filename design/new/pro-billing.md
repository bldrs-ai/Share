# Pro / Billing: capability-gated tier + Stripe + quotas

**Status:** Proposed
**Date:** 2026-05-28
**Owner:** Pablo
**Track:** T8 (per `design/roadmap.md` §5)
**Related code:** `netlify/functions/{create-portal-session,stripe-webhook}.js`,
`src/Components/Stripe/`, `src/subscribe/`, `src/Components/Profile/ProfileControl.jsx`,
`src/BaseRoutes.jsx`, `src/store/RepositorySlice.js`
**Related docs:** `design/new/identity-decoupling-decisions.md` §Q4 / §Open Implementation
Details ("Server-side Auth0 enforcement"), `design/new/multi-user-sharing.md`,
`design/new/ads.md`, `design/roadmap.md` §3.9 / §6 Phase D.

This doc lays out the work to turn today's clunky basic-sub plumbing into a Pro-MVP that
gates real product capabilities, decouples billing from OAuth scope, hardens the webhook,
and adds the quota infrastructure the roadmap calls out.


## 1. Background — what's wired today

A working but minimal Pro path exists. Recap so future readers don't have to spelunk:

- **Stripe-hosted pricing.** `Components/Stripe/PricingTable.jsx` embeds the
  `<stripe-pricing-table>` web component. Publishable key (`pk_live_…`) + two table IDs
  (one per theme) are hardcoded inline.
- **Two pricing UI paths.** Standalone `/subscribe/` page (separate React bundle,
  `src/subscribe/`) is the live entry. `Components/Stripe/PricingDialog.jsx` is a better
  in-app dialog but unwired — dead code.
- **`create-portal-session.js`.** Authenticated POST. Derives the Stripe `cus_…` ID
  server-side from Auth0 `app_metadata` after `/userinfo` validation of the caller's
  token. Returns a Stripe Billing Portal URL. (Security-correct — see comment referencing
  PR #1489 for the original report.)
- **`stripe-webhook.js`.** Handles `customer.subscription.created` and
  `customer.subscription.deleted` only. On create: looks up Auth0 user by Stripe customer
  email, patches `app_metadata.subscriptionStatus = 'shareProPendingReauth'` +
  `stripeCustomerId`. On delete: `'freePendingReauth'`. Everything else Sentry-captures as
  an error.
- **Tier surface on the client.** `app_metadata.subscriptionStatus` rides the JWT into
  `useStore.appMetadata`. The single consumer is `ProfileControl.jsx`, which reads
  `appMetadata.stripeCustomerId` (truthy = Pro) and shows "Manage Subscription" or
  "Upgrade to Pro" accordingly.
- **`*PendingReauth` flow.** `BaseRoutes.jsx` (lines 113–134) on silent token refresh
  decodes the claim; if `*PendingReauth`, opens a re-auth modal that re-prompts for
  GitHub scope (`repo` for Pro, `public_repo` for Free). The webhook intentionally writes
  the `*PendingReauth` form so the client knows to walk the user through scope re-grant.

The net effect today: subscribing gives the user GitHub `repo` scope. That is the only
product capability behind the paywall.


## 2. Decisions locked in this doc

Confirmed via the Phase D discussion (`design/roadmap.md` §6 Phase D entry kept in sync):

| # | Decision | Rationale |
|---|---|---|
| D1 | **Pro bundle** = private link sharing + ad-free + larger quotas/cache retention. | "Three-noun pitch" that's coherent to a user. Each maps to one of three independent enforcement layers (T4, T7, subscribe-120). |
| D2 | **Multi-account Sources stays free.** | Provider symmetry is T3's premise; gating it post-hoc undermines T3. Drive multi-account is already free; gating now is a regression. The "two GitHub accounts" user is the future Team-tier target — premature to charge Pro. |
| D3 | **Flat single Pro price.** | Simpler Stripe config, simpler messaging. Team/Enterprise tier deferred post-MVP. |
| D4 | **Decouple billing from OAuth scope.** Split `subscriptionStatus` into `tier` (billing) and `githubScopes` (OAuth grant). The `*PendingReauth` modal fires only when scopes actually change. | Today's coupling breaks the moment Pro features expand beyond GH scope. Ad-free, sharing, quota uplift don't need a scope change; conflating them produces a confusing modal-fires-for-no-reason bug. |
| D5 | **Switch to in-app `PricingDialog`; delete standalone `/subscribe/`.** | One pricing surface, in-context. Removes a stale-state risk (two surfaces drifting apart). |


## 3. Capability map — the new primitive

The single most important piece. Every Pro-gated feature reads through this; adding a
new Pro feature = add a key + add the consumer. Nothing else.

### 3a. Shape

```ts
// src/billing/capabilities.ts

export type Tier = 'pro' | 'free'

export type CapabilityKey =
  | 'share.private'             // boolean: can create private/grant-based shares
  | 'experience.adFree'         // boolean: ad slots suppressed
  | 'quota.publicShareTtlDays'  // number: TTL on anonymous public shares
  | 'quota.uploadSizeBytes'     // number: max GLB share-upload size
  | 'quota.refreshTokenMintRate' // number: max refresh-token mints per day

export type CapabilityValue = boolean | number

export const CAPABILITIES: Record<CapabilityKey, Record<Tier, CapabilityValue>> = {
  'share.private':              {pro: true,        free: false},
  'experience.adFree':          {pro: true,        free: false},
  'quota.publicShareTtlDays':   {pro: 365,         free: 5},
  'quota.uploadSizeBytes':      {pro: 200_000_000, free: 10_000_000},
  'quota.refreshTokenMintRate': {pro: 600,         free: 30},
}

export function getCapability<K extends CapabilityKey>(
  tier: Tier, key: K,
): typeof CAPABILITIES[K][Tier] {
  return CAPABILITIES[key][tier]
}
```

### 3b. Client-side reader

```ts
// src/billing/useCapability.ts
export function useCapability<K>(key: K) {
  const tier = useStore((s) => s.appMetadata?.tier ?? 'free')
  return getCapability(tier, key)
}

export function useIsPro() {
  return useStore((s) => s.appMetadata?.tier === 'pro')
}
```

`useIsPro()` replaces every `appMetadata.stripeCustomerId`-truthy check in the codebase
(today only in `ProfileControl.jsx`; tomorrow in share dialog, ad-slot mounts, etc.).

### 3c. Server-side reader

The capability map lives in client code; Netlify Functions ship their own copy via shared
`netlify/functions/_lib/capabilities.js` (identical key/value table, JavaScript). At
quota-enforcement points (§7), Functions read the caller's tier from the validated JWT and
consult their copy. Two copies of the same table is acceptable here — both small and slow-
changing, version-pinned via commit. Bigger sin would be sharing client/server state
through some cleverer mechanism that fights tree-shaking.

### 3d. Consumer matrix

Every Pro feature gets one line in this table when it lands. Today the matrix is empty;
each PR below adds rows.

| Capability | Surface | Reader | Enforcement |
|---|---|---|---|
| `share.private` | Share dialog (T4 PR2) | `useCapability('share.private')` — gates the visibility chip dropdown + invite-people form | Server-side at the `setVisibility` call: Netlify Function rejects with 402 if caller's tier doesn't grant it. |
| `experience.adFree` | Ad slot mounts (T7 Phase 2) | `useCapability('experience.adFree')` — skips `<ins>` render when true | Client-only; ad slots don't render, so no server check needed. |
| `quota.publicShareTtlDays` | Originator share flow (T2 Phase 5) | UI shows "expires in X days" hint | Server-side at share-upload + nightly retention sweep. |
| `quota.uploadSizeBytes` | Originator share flow (T2 Phase 5) | UI hard-stops at limit with upsell modal | Server-side at the upload endpoint. |
| `quota.refreshTokenMintRate` | T3 PR2 refresh function | (none — invisible to UI in happy path) | Server-side at `gh-oauth-refresh.js`; 429 with retry-after when exceeded. |


## 4. Decoupled `app_metadata` claims

### 4a. Today

```json
{
  "subscriptionStatus": "shareProPendingReauth" | "sharePro" | "freePendingReauth" | "free" | null,
  "stripeCustomerId": "cus_..." | null,
  "userEmail": "..."
}
```

Conflates two orthogonal things — billing state (paid or not) and OAuth grant (which
GitHub scopes did we re-prompt for).

### 4b. After

```json
{
  "tier": "pro" | "free",
  "githubScopes": ["repo"] | ["public_repo"] | [],
  "tierPendingReauth": false,   // true while webhook fired but client hasn't re-grabbed scope
  "stripeCustomerId": "cus_..." | null,
  "userEmail": "..."
}
```

Reads:
- **`tier`** is the billing fact. Drives every `useCapability(...)` call.
- **`githubScopes`** is the OAuth fact. Drives the GitHub-via-Sources Browse + Save flow.
- **`tierPendingReauth`** is a brief transition flag. `BaseRoutes` checks: if true AND
  the current `githubScopes` doesn't include what the new `tier` would justify (e.g.
  jumped to `pro` but still on `public_repo`), open the reauth modal; otherwise clear
  the flag silently. **Modal fires only when scopes actually need to change.**

Concretely: a free user who subscribes triggers a webhook that sets `tier=pro`,
`tierPendingReauth=true`. On next silent refresh the client sees `tier=pro` +
`githubScopes=[public_repo]` (still old) + flag true → opens the reauth modal scoped to
`repo`. After the user re-grants, webhook OR client-side completion sets
`githubScopes=[repo]`, `tierPendingReauth=false`.

A Pro user who toggles **only** an ad-free preference triggers no flag, no modal — the
existing `repo` grant still suffices.

### 4c. Migration

For one release: webhook writes BOTH `subscriptionStatus` (legacy) and
`tier`+`githubScopes`+`tierPendingReauth` (new). `BaseRoutes` prefers the new claims;
falls back to legacy for users who haven't refreshed since the change. After two weeks
of dual-write, drop `subscriptionStatus` writes; keep readers for a release more.

Backfill script: one-shot Node script that walks Auth0 users with non-null
`subscriptionStatus`, derives the new claims, patches. Runs once during deploy of PR3.


## 5. Webhook hardening

Today's `stripe-webhook.js` has three weaknesses called out in the Phase D discussion:

1. **Email-based Auth0 lookup** with "assume the first user is correct." Fragile for
   shared emails or multi-identity Auth0 accounts.
2. **Only `customer.subscription.created` and `.deleted`.** Plan changes, payment
   failures, trial events all Sentry-error.
3. **No idempotency.** A Stripe retry (we return 200 already, so this is rare, but
   webhook deliveries occasionally double).

### 5a. Auth0 user lookup via metadata, not email

At checkout (§6 below), the `create-checkout-session` function attaches
`metadata.auth0UserId = <sub>` to the Stripe Checkout Session. Stripe propagates that
metadata onto the resulting `Customer` and `Subscription` objects. The webhook reads
`subscription.metadata.auth0UserId` (or the parent Customer's metadata) instead of
re-deriving from email. Auth0 `sub` is the canonical key end-to-end.

Fallback for the existing test customers (no metadata set): email lookup with a Sentry
warning. After backfill (§4c) this fallback is dead code; remove in PR3.

### 5b. Event set

| Event | Action | Notes |
|---|---|---|
| `customer.subscription.created` | `tier=pro`, `tierPendingReauth=true` (or false if scope already includes `repo`). | Check `metadata.auth0UserId` first. |
| `customer.subscription.updated` | Re-evaluate from `subscription.items[]`. If still has Pro price → keep `tier=pro`. If changed plan → adjust capabilities. If status flipped to `past_due` / `unpaid` → enter grace mode (see below). | Idempotent: same input → same Auth0 state. |
| `customer.subscription.deleted` | `tier=free`, `tierPendingReauth=true` (or false if scope is already `public_repo`). | |
| `invoice.payment_failed` | Set `tier=pro_grace`, log to Sentry as warning, don't downgrade immediately. Grace TTL = 7 days (Stripe's default `past_due` window). | Capability map treats `pro_grace` as `pro` for capabilities; future feature: nag banner. |
| `invoice.payment_succeeded` | If user was in `pro_grace`, clear back to `tier=pro`. | |
| `customer.subscription.trial_will_end` | Email/notification (out of scope this design); record `trialWillEndAt` for UI countdown. | |
| Anything else | Sentry **debug** (not error). Today's "everything else is an error" wrongly flags benign events like `customer.updated` from billing-portal changes. | |

### 5c. Idempotency

Stripe webhook deliveries can repeat. Each `event.id` is unique and stable. Storage:
Netlify Blobs (a per-deploy KV) keyed on `event.id`, TTL 7 days (Stripe retries within
24h; 7 days is comfortable buffer). On hit → 200 OK no-op.

If Blobs are unavailable in the runtime (open question §11), fall back to Auth0
`app_metadata.lastWebhookEventId` — single-string store, only catches the immediate-prev
retry but better than nothing.

### 5d. Stripe ID env-driven

Move `pk_…` and `prctbl_…` IDs to `process.env`:

- `STRIPE_PUBLISHABLE_KEY` (client-injected via build-time substitution).
- `STRIPE_PRICING_TABLE_ID_LIGHT`, `STRIPE_PRICING_TABLE_ID_DARK`.
- `SHARE_PRO_PRICE_ID` (already exists).

Preview deploys get test-mode IDs by default. The Netlify build config selects the right
env per branch / preview context.


## 6. `create-checkout-session` Netlify Function

New function mirroring `create-portal-session`'s shape and auth pattern. Why we need it:

1. **Enables metadata-based Auth0 lookup** (§5a). No way to attach Auth0 `sub` to a
   subscription created via Stripe's hosted pricing table — only Checkout Sessions can
   carry `metadata`.
2. **Branded entry / exit.** Customizable `success_url` + `cancel_url` back to a
   Bldrs-branded landing. Today the pricing-table flow lands on Stripe's success page.
3. **One canonical entry point.** UI consolidation (§8) routes Upgrade-to-Pro through
   this function rather than through a separate static page.

Shape:

```
POST /.netlify/functions/create-checkout-session
Headers: Authorization: Bearer <user access token>
Body: { returnTo?: string }   // optional cancel-URL hint

→ 200 { url: "https://checkout.stripe.com/c/pay/..." }
→ 401 if no/bad token
→ 502 if Stripe API fails
```

Server-side:
- Validate token → derive `auth0UserId` from `/userinfo` (same as portal function).
- Look up email from Auth0 (Management API) so it pre-fills on Stripe.
- `stripe.checkout.sessions.create({...})` with:
  - `mode: 'subscription'`,
  - `line_items: [{price: SHARE_PRO_PRICE_ID, quantity: 1}]`,
  - `customer_email: <from Auth0>`,
  - `client_reference_id: auth0UserId` (visible in Stripe dashboard for support),
  - `metadata: {auth0UserId}` and `subscription_data.metadata: {auth0UserId}`,
  - `success_url: 'https://bldrs.ai/?subscribed=1'`,
  - `cancel_url: returnTo || 'https://bldrs.ai/'`.

Reuses the Auth0 management-token cache pattern from `create-portal-session`.


## 7. Quotas (subscribe-120)

Three enforcement points named in `design/roadmap.md` §3.9 `subscribe-120`. Each
authoritatively server-side; the client gets a soft hint via the capability map for UI.

### 7a. GLB upload size — `quota.uploadSizeBytes`

Enforced at T2 Phase 5 originator-share upload endpoint (Netlify Function, not yet built
— see `glb-model-sharing.md` Phase 5).

- Free: 10 MB. Pro: 200 MB.
- 413 Payload Too Large with structured error `{reason: 'quota_exceeded', limit, current}`
  → client opens Pro upsell modal.

### 7b. Refresh-token mint rate — `quota.refreshTokenMintRate`

Enforced at `netlify/functions/gh-oauth-refresh.js` (T3 PR1, already exists; needs the
quota check added).

- Free: 30 mints/day per Auth0 `sub`. Pro: 600/day.
- Counter store: same as idempotency (Netlify Blobs, key `quota:refresh:<sub>:<YYYY-MM-DD>`,
  TTL 2 days). Increment-then-check pattern.
- 429 Too Many Requests with `Retry-After` (seconds until midnight UTC) and structured
  body `{reason: 'quota_exceeded', counter: 'refresh', limit, current}`.
- The 30/day free limit is comfortable for a normal user (a refresh happens on 401, so
  ~1–2/day for active use); 600/day Pro covers heavy use.

### 7c. Public-share retention — `quota.publicShareTtlDays`

Enforced at the originator-share upload endpoint (set `expiresAt` on the artifact metadata)
plus a nightly retention sweep that deletes expired artifacts.

- Free: 5 days. Pro: 365 days.
- Sweep is a scheduled Netlify Function (`@netlify/functions` cron) running daily.

### 7d. Hard vs soft limits

Hard limit at the enforcement point (server returns error). Soft hint client-side via the
capability map (e.g. share dialog shows "expires in 5 days" with upsell hint).

No grace beyond the natural `pro_grace` state (§5b) — once you're free, free limits apply
immediately. We'll watch for support friction here; if it spikes, add a brief soft-landing.


## 8. UI consolidation

### 8a. Pricing surface

- Wire `PricingDialog` into `ProfileControl`:
  - "Upgrade to Pro" menu item → `setPricingDialogOpen(true)` instead of
    `window.location.href = '/subscribe/?...'`.
  - The dialog's PricingTable embeds the Stripe-hosted table same as today. (For PR2
    after `create-checkout-session` lands, switch the dialog to a "Subscribe" button
    that hits the new function and redirects to Stripe Checkout — fewer iframes, more
    control.)
- Delete `src/subscribe/index.jsx` + `public/subscribe/` build output + the entry in the
  ESBuild config.
- The single `/subscribe/*` route gets removed from `BaseRoutes` / Netlify redirects.

### 8b. Upsell surfaces

| Surface | Trigger | Reader | UX |
|---|---|---|---|
| Profile menu | Always-on for free users | `useIsPro()` | "Upgrade to Pro" → dialog |
| Share dialog (#1421) | Free user picks "Private" visibility | `useCapability('share.private')` | Inline upsell card replaces the People/Link tabs; "Subscribe to enable" CTA → dialog |
| Quota wall | Free user hits upload-size / share-TTL limit | Server returns 402/413 with `reason: 'quota_exceeded'` | Modal: "You've reached the X limit on the Free tier — upgrade to bump to Y" → dialog |
| Ad slot context | Page mount where ad would render | `useCapability('experience.adFree')` | (No upsell on the page — the absence is the Pro value-add. Optional small "Get ad-free with Pro" link in footer.) |

### 8c. `useIsPro()` migration

Single sweep PR. Replaces:

- `appMetadata?.stripeCustomerId` truthy checks (today: `ProfileControl.jsx` line 61).
- `subscriptionStatus === 'sharePro'` direct reads (today: `Subscription.spec.ts`
  fixture; ProfileControl.test.jsx assertions).

After: all readers go through `useIsPro()` or `useCapability(...)`. The store keeps
`appMetadata` as the raw underlying claim; the hooks are the canonical readers.


## 9. Implementation phases — PR sequence

Each PR ends green; each is independently revertable. Total estimated effort: 4–6 weeks.

### PR1: Capability map + `useIsPro()` refactor

- `src/billing/capabilities.ts` + `useIsPro` + `useCapability` hooks.
- Replace `stripeCustomerId` reads in `ProfileControl.jsx`.
- No behavior change; tests pin the equivalence.
- Smallest possible foundation — everything else builds on this.

Estimate: 1–2 days.

### PR2: `create-checkout-session` + webhook hardening (idempotency, full event set, metadata-based lookup) + env-driven Stripe IDs

- New `netlify/functions/create-checkout-session.js`.
- Rewrite `stripe-webhook.js` per §5. Idempotency via Netlify Blobs (or fallback per
  §5c open question).
- Move Stripe IDs to env (`STRIPE_PUBLISHABLE_KEY`, table IDs, price ID); update
  `PricingTable.jsx` to read from build-injected env.
- Co-exist with old flow: existing Stripe-hosted-table checkout still works.

Estimate: ~1 week.

### PR3: Decoupled `app_metadata` claims (D4)

- Webhook dual-writes `tier`/`githubScopes`/`tierPendingReauth` and legacy
  `subscriptionStatus`.
- Backfill script for existing test customers.
- `BaseRoutes` prefers new claims, falls back to legacy.
- After two-week canary, follow-up PR removes legacy writes.

Estimate: 3–5 days + 2-week soak.

### PR4: Pricing UI consolidation (D5)

- Wire `PricingDialog` into `ProfileControl`.
- Switch "Upgrade to Pro" to dialog + new `create-checkout-session` flow.
- Delete `src/subscribe/`, `public/subscribe/`, ESBuild entry, route.
- E2E for the new flow.

Estimate: 2–3 days.

### PR5: Upsells in share dialog + quota-wall modal

- Share dialog (T4 PR2 dependency) shows inline Pro upsell when user picks "Private".
- Generic `QuotaWallModal` component triggered by structured server errors.
- Wire into existing 401/402/413 catch points.

Estimate: 3–5 days (some bundled with T4 PR2).

### PR6: Quota infrastructure + enforcement

- `_lib/quotas.js` shared module — Netlify Blobs counter primitives.
- Wire into `gh-oauth-refresh` (rate limit).
- Wire into upload endpoint when T2 Phase 5 lands (size limit).
- Scheduled function for public-share retention sweep.

Estimate: 1 week + dependent on T2 Phase 5.

### PR7: Ads gating

- `useCapability('experience.adFree')` at the ad-slot mount points (T7 Phase 2
  dependency).
- Verify test hermeticity (ads.md §"Test hermeticity") still holds.

Estimate: 1–2 days (small after T7 Phase 2 lands).


## 10. Telemetry

`gtagEvent` calls at each Pro touchpoint, so we can measure funnel:

| Event | When | Properties |
|---|---|---|
| `pro_upsell_shown` | Any upsell surface renders | `surface: 'profile' \| 'share-dialog' \| 'quota-wall' \| 'ad-context'`, `trigger?` |
| `pro_upsell_clicked` | User clicks the upgrade CTA | same |
| `pro_checkout_started` | `create-checkout-session` succeeds, redirect issued | `auth0Sub` (hashed) |
| `pro_checkout_completed` | `?subscribed=1` on landing OR webhook `subscription.created` (server-side) | `auth0Sub` |
| `pro_checkout_abandoned` | User lands on `cancel_url` | |
| `pro_portal_opened` | `create-portal-session` returns | |
| `pro_quota_hit` | Server returns `reason: 'quota_exceeded'` | `counter: 'upload' \| 'refresh' \| 'shareTTL'`, `current`, `limit` |
| `pro_capability_used` | Any `share.private` / etc. capability actually exercised by a Pro user | `key`, `surface` |

Watch the funnel weekly for the first month. The signal that this work succeeded is
`pro_checkout_completed / pro_upsell_shown` moving above ~1%, not zero.


## 11. Open questions

- **Quota / idempotency state store.** Netlify Blobs are the natural choice but the
  surface is newer; alternatives are Redis (Upstash) or even Auth0 `app_metadata` for
  the slow-changing TTL counters. Decision needed before PR2 lands. *Recommendation:*
  Netlify Blobs — already in the stack, no new vendor.
- **Pricing values.** Concrete numbers in §3a are placeholders. Final TTL / size /
  rate limits need a product call. *Recommendation:* 5 days / 10 MB / 30 refresh per
  day for Free; 365 days / 200 MB / 600 refresh for Pro. Will adjust on telemetry.
- **Stripe Tax / VAT collection.** Not enabled today. Required in EU + several US
  states. *Recommendation:* enable at PR2 (cheap to add via `automatic_tax: {enabled:
  true}` in the Checkout Session create). Compliance cost vs ignoring is asymmetric.
- **Org / team tier post-MVP.** D3 defers; capture the seed assumption here so future
  work doesn't conflict: tiers become `'pro' | 'team' | 'free'`, the capability map
  extends, but the `app_metadata` shape stays — `tier` field accepts the new value.
  No data-shape break.
- **Private-repo-via-Bldrs flow.** Today's `repo` scope grant happens at subscription;
  the actual Save-to-private-repo path goes through existing GitHub OAuth. Pro-MVP
  scope: stay with that flow. Pro Save UX polish (commit author footer, etc.) is
  blocked on T3 PR2 anyway — folds in there, not here.
- **Refund / chargeback handling.** Stripe webhook event `charge.refunded` and the
  dispute event family aren't in §5b. Not Pro-MVP blockers; capture once first paid
  customer has a dispute. *Recommendation:* defer to PR8 follow-up.
- **Free-tier sign-up wall.** Today free users can use Bldrs anonymously and connect
  Sources without Auth0 login. Per `identity-decoupling-decisions.md` §PR2, Sources
  connect should require Auth0 primary login before flipping flags on. That same gate
  becomes the natural quota-key for free-tier rate limiting on the Netlify Functions.
  Coordinate with T3 PR2 timing — both lock the Auth0 `sub` as canonical key.


## 12. Migration of existing test customers

A handful of test Stripe customers exist (per the "haven't had any subs yet besides our
tests" baseline). PR3 backfill script handles them:

1. Walk Auth0 users where `app_metadata.subscriptionStatus` is set.
2. Derive `tier` from current status (`sharePro*` → `pro`, `free*` → `free`).
3. Derive `githubScopes` from token-introspection or by querying the user's known scope
   set if available; default to `['repo']` if Pro, `['public_repo']` if Free.
4. Patch `app_metadata` with new claims while preserving `stripeCustomerId`,
   `userEmail`, and `subscriptionStatus` (during legacy-readers window).
5. Log per-user transition to Sentry breadcrumb for audit.

Script is one-shot, run during PR3 deploy. Idempotent (re-running on already-patched
users is a no-op).


## 13. What this doc deliberately doesn't cover

- **The Pricing page marketing copy.** That's a Marketing PR, not engineering.
- **Stripe tax registration.** Compliance/finance task.
- **Annual vs monthly billing.** Easy to add (extra `price` in Stripe), not architecturally
  interesting. Pick one for launch (recommendation: monthly only) and add annual via PR
  in week-2.
- **Promo codes / coupons.** Stripe supports natively via the Checkout Session — works
  out of the box once `create-checkout-session` lands.
- **The actual ad placement on text routes.** That's T7 Phase 2, which this doc gates
  but doesn't supersede.
