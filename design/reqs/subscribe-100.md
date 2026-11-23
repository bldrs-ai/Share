# Subscribe 100

**Epics:** [subscribe-100: Pricing tiers · #2296](https://github.com/bldrs-ai/Share/issues/2296), [subscribe-110: Upgrade with Stripe checkout and a billing portal · #2297](https://github.com/bldrs-ai/Share/issues/2297), [subscribe-120: Quota tracking · #2298](https://github.com/bldrs-ai/Share/issues/2298), [subscribe-400: Enterprise tier · #2299](https://github.com/bldrs-ai/Share/issues/2299); `subscribe-130` (ads) is [#1524](https://github.com/bldrs-ai/Share/issues/1524) · **Scope snapshot: 2026-11-23**

## Motivation

Share is free to view and paid for private work. The decided paywall (bizdev#331): free viewing with no login for local and public models; a free account with 2 private models per rolling 7 days (open, share and export on those); Pro with unlimited private models and exports. The size and complexity axis proposed in v0.4 was not adopted. Pricing copy is generated from the enforced constants, so the page can't say something the meter doesn't do.

The journey is **hit the free limit → Pricing → upgrade through Stripe → Pro unlocks → manage it in the portal**. Signed-out users are never metered.

## UX stories

The three baseline epics are done and have no formal story. The closed issues that built them are the record:

| Epic | Baseline |
|---|---|
| `subscribe-100` | [#1970](https://github.com/bldrs-ai/Share/issues/1970): the pricing page tells the truth (three tiers, local files unmetered, free tier 2 private models). |
| `subscribe-110` | [#1321](https://github.com/bldrs-ai/Share/issues/1321): Stripe frontend integration. |
| `subscribe-120` | [#1966](https://github.com/bldrs-ai/Share/issues/1966): local-file viewing made unmetered, deliberately. |
| `subscribe-400` | none; a placeholder until a design partner. |

## Not owned here

- **Ads (`subscribe-130`)** are parked (owner, 2026-11-10) under [#1524](https://github.com/bldrs-ai/Share/issues/1524), track `subscribe-t101`.
- **The billing track** is `subscribe-t100` ([#2302](https://github.com/bldrs-ai/Share/issues/2302)); the rules are in [quotas.md](../new/quotas.md).
- **Funnel events and GA4 verification** are `grow-120` in bizdev. **Free exports** use the same slots (`share-140`, [#1831](https://github.com/bldrs-ai/Share/issues/1831)). **Folder boundaries** are `share-400` ([#2208](https://github.com/bldrs-ai/Share/issues/2208)).

**Milestone:** all three baseline epics are **required for MVP and done**; `subscribe-400` is post-MVP. The hypotheses are in the [triage record](subscribe-100-triage.md). Revise and re-date this snapshot when a story list changes.
