# AI workspace — runtime, providers, credits, sovereignty (AI.0)

**Status:** v0.2 draft (2026-10-06; §12 rewritten after Jev research). Story
[#1671](https://github.com/bldrs-ai/Share/issues/1671) under epic `assist-310`
[#1659](https://github.com/bldrs-ai/Share/issues/1659). Roadmap §7.4 AI.0,
Tracks T10 and T11.
**Owner:** Pablo (with Claude).

This is the architecture doc that roadmap §7 and
[conversational-cad.md](conversational-cad.md) §4 gate the agent work on. It
decides where the agent runs, which LLM providers it talks to and how, who
pays, where conversations live, what data leaves the machine, and how the
generative-CAD system in [bldrs-ai/Create](https://github.com/bldrs-ai/Create)
plugs in later. conversational-cad.md owns the *product* plan (tray, drawer
threads, chips). This doc owns the *runtime* plan.

**Evidence.** External facts carry the URL they were read from. Facts
checked from this session's network carry **(live check 2026-10-06)**.
Anything not verified is marked **UNVERIFIED** and becomes a spike item (§14).
Share code is cited as `path:line` at `main` @ `9577fdd`.


## 1. Scope

**AI.0 / AI.2 (this doc, epic `assist-310`):**

- A single-user agent over the open model. It answers questions about the
  model and drives the viewer: search, properties, select, isolate/hide,
  camera, cut planes, display overrides, permalinks.
- Two ways to pay: Bldrs-hosted credits (anonymous, signed-in free, Pro), or
  the user's own key (BYOK).
- A local, per-model conversation log.
- Porting the `?feature=bot` prototype into this shape rather than building
  beside it.

**Later, and only seamed here:**

- **Analysis.** Clash, quantity takeoff, code checks. Same loop, more tools.
- **Generative CAD.** Routed to Create through a remote tool provider (§11).
- **Jev and generative UI.** Jev is a fast decision model (intent layer,
  router, tool-call gate), not a UI generator. Generative UI in the tray is
  a separate declarative-spec renderer (§12).
- **Write tools.** `create-310` agent edits through the `create-300` op log
  ([model-edit.md](model-edit.md)).
- **Toolbelt apps over postMessage MCP** (`assist-320`). Its sandbox and
  permission model will get its own section of this doc when that epic
  starts (§16).
- **Shared and durable conversations** (`assist-400`). The ChannelProvider
  and the Notes-vs-channels question stay there
  ([workspace-store.md](workspace-store.md) §1.3).


## 2. Decision summary

| # | Decision | One-line rationale |
|---|---|---|
| D1 | Agent loop runs **in the browser**. The LLM call is the only remote hop, over one of two transports: **BYOK** (browser → provider) or **Hosted** (browser → Bldrs relay → OpenRouter) | The tools are in-page (viewer, store). A server loop would need the model, which breaks sovereignty |
| D2 | Hosted transport = thin streaming relay `ai-chat`. It checks the tier, enforces the allowlist and `max_tokens`, forces `data_collection: "deny"` (except on the opt-in free-models path, D3), meters `usage.cost`, and never logs bodies. Vehicle (Edge vs v2 Function) is a spike. No per-user OpenRouter keys for now | Key custody and quota enforcement need a server. Minted browser keys are extractable, Bldrs is liable for them, and anonymous users can't get one |
| D3 | Budgets are **USD-cost credits** from `usage.cost`. The **default** for anonymous and free tiers is a curated allowlist of **cheap paid** tool models with `data_collection: "deny"`. Every tier also gets an opt-in **"Free models (experimental)"** choice (`:free`, zero credits, labelled honestly), which is also the anonymous overflow when the spend breaker trips. Pro gets a live, priced model picker | Premium models must burn faster. `:free` caps are per account (~200–300 agent turns a day for everyone), and free endpoints may log or train on prompts, so free models can't be the default but are worth offering |
| D4 | Metering ledger in **Netlify Blobs** (or similar), keyed by Auth0 `sub` or anonymous id, in day buckets. Auth0 `app_metadata` stays tier-only | Per-message writes don't fit a ~16 KB, last-write-wins, Management-API store |
| D5 | Anonymous identity = relay-issued **HMAC token**, plus an IP-hash rate limit and a global daily spend breaker | There is no server identity for anonymous users today. The free AI tier is the funnel top and needs a bounded cost |
| D6 | **BYOK** for Anthropic (native), OpenAI, Gemini (native), xAI, and OpenRouter via **OAuth PKCE**. Keys are session-only by default, with opt-in "remember", and never reach Bldrs | All five pass CORS preflight from bldrs.ai (live). BYOK users skip Bldrs credits entirely |
| D7 | **Vercel AI SDK**, lazy-loaded behind the flag. Fallback: thin hand-rolled adapters. Confirmed by a real-key spike, with TanStack AI as the alternative | It handles Anthropic native, Gemini thought signatures and OpenAI-compatible endpoints, and its ~300 KB gz cost is paid only when the tray opens |
| D8 | Typed in-page **tool registry in MCP shape**. v0 is read/annotate only, replaces the bot's `new Function` eval, and needs `selectItemsInScene` exposed | One contract, so `assist-320` can serve it over postMessage MCP later |
| D9 | **Model bytes never leave the machine.** Conversation and tool results do. Tools return summaries, never geometry. A per-transport "what the AI can see" disclosure. CSP `connect-src` is a hardening story | Sovereignty is the enterprise wedge (roadmap §7.2) |
| D10 | Conversations are local, per model, file-shaped (JSONL), behind the `workspace/persistence.ts` seam, alongside the Tier-1 project struct | Durable and shared storage is `assist-400`'s problem. File-shaped now means the repo store adopts it later |
| D11 | Share's agent is the orchestrator. Create plugs in as a **remote tool provider** in the same registry. Its LLM usage draws on the same provider abstraction and ledger | Create is a headless kernel with no LLM of its own. One loop and one bill |
| D12 | Flag `assist`, with `bot` aliased via `FEATURE_IMPLICATIONS` during the port, then removed | Matches #1659/#1672. Fixes the `convo` drift |
| D13 | Port `?feature=bot`: keep the tray, slice, bubbles, MSW mocks and network guard. Evolve the client and settings. Delete the eval and the plaintext key | The scope outgrew the prototype, but its UI and test scaffolding are sound |
| D14 | **DECIDED (product owner, 2026-10-06).** **Jev is the fast intent/command layer: natural language → viewer action, dispatched through the registry, promoted to the LLM agent loop when confidence is low.** Through the relay. Router and tool-call gate are follow-on uses. Generative UI is separate and later (declarative renderer) | Jev is a non-generative decision model: sub-second, near-free for simple commands, with a confidence value that says when to escalate. UI generation needs an LLM and a spec renderer, not Jev |


## 3. Architecture

```
 Browser (bldrs.ai, one origin)                                    Remote
 ┌─────────────────────────────────────────────────────────┐
 │ Assist tray (BotControl→AssistControl, chat bubbles)    │
 │        │ user turn                     ▲ streamed text   │
 │        ▼                               │ + element chips │
 │ ┌───────────── Agent loop (AI SDK, lazy) ─────────────┐ │
 │ │ messages + tool schemas ──► Provider interface ─────┼─┼──┐
 │ │ ◄── tool_calls                                      │ │  │
 │ │ dispatch ─► Tool registry (MCP-shaped, §9)          │ │  │
 │ │              ├─ viewer tools ─► ShareViewer, slices │ │  │
 │ │              ├─ (later) Create ─► remote provider ──┼─┼──┼──► Create (§11)
 │ │              └─ results: summaries, never geometry  │ │  │
 │ └─────────────────────────────────────────────────────┘ │  │
 │ Conversation log ─► persistence.ts (local JSONL, §10)   │  │
 │ Model bytes, OPFS cache, GLB ── never leave ──────────  │  │
 └─────────────────────────────────────────────────────────┘  │
                                                              │
   Transport A: BYOK (key in tab memory / opt-in storage)     │
     ├─► api.anthropic.com/v1/messages  (native)  ◄───────────┤
     ├─► api.openai.com/v1/chat/completions       ◄───────────┤
     ├─► generativelanguage.googleapis.com (native) ◄─────────┤
     ├─► api.x.ai/v1/chat/completions             ◄───────────┤
     └─► openrouter.ai/api/v1 (PKCE user key)     ◄───────────┤
                                                              │
   Transport B: Hosted (Auth0 Bearer or anon token)           │
     └─► /.netlify/…/ai-chat (relay, §5) ─► openrouter.ai ◄───┘
           tier · allowlist · max_tokens · data_collection:deny
           (opt-in free models: no deny, zero credits)
           · usage.cost → ledger (Blobs) · no body logs
```


## 4. D1 — Runtime placement: client-side loop, two transports

**Decision.** The agent loop (assemble messages, call the model, dispatch
tool calls, append results, repeat) runs in the page. Only the model call
leaves the browser. A single `Provider` interface hides two transports:

- **BYOK.** The browser calls the provider directly with the user's key. No
  Bldrs server sees the key or the conversation.
- **Hosted.** The browser calls Bldrs' `ai-chat` relay, which calls
  OpenRouter with Bldrs' key. The relay sees the conversation in transit and
  stores none of it (§5).

**Why client-side.**

- **The tools are in-page.** Every v0 tool reads or mutates live viewer
  state: `useStore.getState().viewer` (`ShareViewer`), the NavTree, isolator,
  cut-plane and display slices, and the search index (§9). A server-side
  loop would need a round-trip per tool call to the page that holds the
  model. Worse, it would pull model-derived data through Bldrs servers
  wholesale, the shape roadmap §7.2 warns "would forfeit the story".
- **Sovereignty stays simple to explain.** The only thing that crosses the
  wire is what the transcript shows (§10).
- **No new server for BYOK.** The AI.2 demo can ship on BYOK alone before
  the relay and credits exist (§14 sequencing).

**What the server is still for.** Key custody and quota enforcement for
hosted traffic (D2). That is all.

**Rejected:** a server-side broker that runs the loop. It is new stateful
server surface for a static product, it costs latency per tool step, and it
breaks the sovereignty boundary.


## 5. D2 — Hosted relay `ai-chat`

**What it does,** per request:

1. **Identifies the caller.** An Auth0 Bearer (via `verifyAuth0Bearer`,
   `netlify/functions/_lib/auth0.js:59`) gives `free` or `paid` through the
   same `getTier` mapping as `src/quota/quota.js`. An anonymous token (D5)
   gives `anonymous`.
2. **Checks the ledger** for that identity's window (D4). An exhausted
   budget returns `402 {error: 'ai_credits_exhausted', tier}`, which the
   client maps to `QuotaLimitDialog`.
3. **Normalizes the body.** It keeps an allowlist of fields (`model`,
   `messages`, `tools`, `tool_choice`, `stream`, `max_tokens`,
   `temperature`) and drops the rest, so callers can't set routing, plugins
   or `models` fallbacks. It then sets:
   - `model` must be in the tier's allowlist (anonymous and free), the Pro
     catalog, or the free-models list (§6).
   - `max_tokens = min(requested, tierCap)`, with request-size caps on
     `messages` and `tools`.
   - `provider: {data_collection: 'deny', require_parameters: true}`. The
     OpenRouter default for `data_collection` is `"allow"`, meaning providers
     that "store user data non-transiently and may train on it"
     ([provider selection](https://openrouter.ai/docs/guides/routing/provider-selection.md)).
     `require_parameters` makes `tools` a hard routing requirement, not a
     soft preference (same page). **The one exception** is the opt-in
     free-models choice (§6), which is sent without `deny`, because deny
     would empty most of the free pool. That is exactly what its label
     discloses.
   - Attribution headers `HTTP-Referer` and `X-OpenRouter-Title`
     ([app attribution](https://openrouter.ai/docs/app-attribution.md)).
4. **Streams** upstream SSE straight through to the client.
5. **Meters.** It reads `usage.cost` from the final SSE chunk and debits
   the ledger. No extra API call is needed: usage is always included, and
   `usage: {include: true}` is deprecated
   ([usage accounting](https://openrouter.ai/docs/guides/administration/usage-accounting.md)).
6. **Never logs bodies.** It logs only identity hash, tier, model, token
   counts, cost and the generation id (`X-Generation-Id`). Sentry scrubbing
   follows the same rule.

**Addition the research suggests (flagged, not in the planning
decisions).** The OpenRouter research recommends the relay also pin a
server-owned system preamble. A relay that forwards arbitrary `messages` is,
to anyone holding an anonymous token, a general-purpose LLM endpoint paid for
by Bldrs. ToS §7 bans "reselling API access to Models" and unapproved "Red
Teaming", and §3.2 makes Bldrs "responsible for all activity and charges
under its account" ([terms](https://openrouter.ai/terms), last updated
2026-08-31). The budget caps already bound the cost. A server preamble ("you
are the Bldrs Share model assistant…") prepended to every hosted request
narrows misuse at near-zero cost, so I recommend it. Requiring `tools` to
match the published registry (by schema hash) is a stronger option, but it
couples relay deploys to client releases. Left as an open question (§15).

**Vehicle: open, spike #1928.** Share has no streaming function today. Every
function is a buffered v1 Lambda `handler(event)` except `proxy-handler.js`,
a v2 `export default async (req) => Response` with an origin allowlist
(`netlify/functions/proxy-handler.js:11`). That one is the template. The
candidates are a Netlify **Edge Function** and a **v2 streaming Function**.
docs.netlify.com was unreachable from the research sandbox, so all of the
following are **UNVERIFIED**:

- the wall-clock and streaming-duration limits of each (an agent turn with a
  slow model can run tens of seconds);
- whether the "~10 s" sync figure that circulates applies to v2 streaming
  responses;
- whether Edge Functions can use the npm deps that `_lib/auth0.js` pulls in.

`verifyAuth0Bearer` reads v1 `event.headers`
(`_lib/auth0.js:82`), so either vehicle needs a small `Request` →
`{headers}` adapter. The relay must also decide what happens on client
abort: keep draining upstream to collect `usage.cost`, or reconcile later
through `GET /api/v1/generation?id=`, which is CORS-open and returns cost
after the fact. Part of the spike.

**Rejected for now: per-user OpenRouter keys** minted with the Management
API (`limit`, `limit_reset`, `expires_at`;
[management keys](https://openrouter.ai/docs/guides/overview/auth/management-api-keys.md))
and handed to the browser.

| | Minted key in browser | Relay |
|---|---|---|
| Liability | ToS §3.2: Bldrs pays for all activity under its credentials, "whether or not authorized" | Same, but the credential never leaves the server |
| Extraction | The key works as a general LLM key until `limit` runs out | Nothing to extract |
| Anonymous users | Need a mint endpoint, which is a key-farming target | Same anonymous gate, per-request checks |
| Policy | Can't force the model allowlist, `max_tokens` or `data_collection` | Enforced per request |
| Latency | One hop fewer | One hop more |

Reconsider for Pro if relay latency or limits bite. Pro users are
identified, paying, and bounded by a `monthly` key limit.


## 6. D3 — Tiers and credits

**Unit.** Budgets are in USD cost as reported by OpenRouter's `usage.cost`,
not in messages. One Opus 5.5 turn costs about 100× a gpt-oss-120b turn
(table below), so a message count would either starve Pro or bankrupt the
picker. The UI can show the budget as a percentage or as abstract "credits"
(naming is an open question, §15). The ledger stores integer micro-USD.

**Model choice for anonymous and free tiers.** There are three paths:

1. **Default: cheap paid models.** A curated allowlist of 3–5 cheap,
   tool-capable paid models, always sent with `data_collection: "deny"`.
   The free/cheap model eval (spike #1929) picks the actual list.
2. **Opt-in "Free models (experimental)".** A choice in the model selector
   on every tier, anonymous included. It routes to `openrouter/free` (the
   free-models router, [FAQ](https://openrouter.ai/docs/faq.md)) or to a
   curated `:free` list from #1929, and **costs zero credits**. The label says
   plainly that it may be rate-limited or unavailable, and that upstream
   providers may log or train on prompts. Choosing it shows the same
   disclosure as §10's free-models row. These requests are sent without
   `deny`, the one hosted exception (§5).
3. **Overflow.** When the global anonymous spend breaker trips (§7), the
   relay degrades anonymous traffic to the free-models path instead of
   refusing it. An in-tray notice says why ("free assistant busy, switched
   to free models, which may log prompts; sign in for the standard
   models"). If the free pool is also exhausted (a 429 from OpenRouter, or
   `free_model_daily_requests.remaining` at 0 on `GET /api/v1/key`), the
   relay refuses with a sign-in prompt.

**Why free models are not the default:**

- **Caps are per account.** OpenRouter's free-model limits are 20 req/min,
  plus 50 req/day under $10 of lifetime purchases or 1,000 req/day at or
  above it (granted from 9 credits). They are counted per account: "Making
  additional accounts or API keys will not affect your rate limits, as we
  govern capacity globally"
  ([limits](https://openrouter.ai/docs/api/reference/limits.md)). An agent
  turn is ~3–5 calls, so one Bldrs account gives about **200–300 turns a
  day, shared by every free-model user**. ToS §7 forbids multiple accounts
  "for purposes of bypassing or circumventing use limits"
  ([terms](https://openrouter.ai/terms)).
- **Logging and training.** "There are separate settings for paid and free
  models" for routing to providers that may train
  ([provider logging](https://openrouter.ai/docs/guides/privacy/provider-logging.md)).
  Opting out means OpenRouter "will not route to providers that train", and
  providers whose policy is unconfirmed are skipped unless the toggle is on
  ([FAQ](https://openrouter.ai/docs/faq.md)).
  - So the free path needs the Bldrs account's **free-model** training
    setting switched on, or the pool shrinks. Free requests may then go to
    providers that train.
  - Because the settings are separate, the paid default stays opt-out. It
    is also forced per request with `deny`.
  - That `deny` would also exclude most `:free` endpoints is the
    researcher's inference, not documented. #1929 confirms it.
- **Availability churns.** The free roster changes often (17 free
  tool-capable models in the 2026-10-06 live check), and free endpoints come
  and go. The FAQ calls free models "usually not suitable for production
  use".
- **Paid cheap models cost almost nothing.** See the table below.

**Spike #1929 picks the models.** It runs a tool-calling scorecard (tool-call
accuracy, multi-turn coherence, latency, cost) over the 17 free
tool-capable models plus 3–5 cheap paid ones. It uses the v0 tool schemas
(§9) against canned scene fixtures, and its result sets both the default
allowlist and the curated `:free` list. It needs an `OPENROUTER_API_KEY`.

**Live catalog (live check 2026-10-06):** `/api/v1/models` lists 464
models. 396 have `tools` in `supported_parameters`, so the filter works
literally. 17 are free and tool-capable.

**A gap the live check found (spike #1929).** `/api/v1/models/{id}/endpoints`
exposes no data-policy field, so the catalog can't say which endpoints
survive `data_collection: "deny"`. Two consequences:

- Prices differ per endpoint. gpt-oss-120b has 23 endpoints, from
  $0.03/$0.17 to $0.35/$0.75 per M. Deny may route to a pricier one.
- qwen3.7-flash has exactly one endpoint (Alibaba). If that endpoint isn't
  deny-compatible, the model can't be routed at all.

The allowlist must be validated with real deny-routed calls before it
ships. #1929 does that as part of its scorecard.

**Cost per agent turn.** Assumption, to be measured in spike #1927: one user
message drives about 3 LLM calls (2 tool round-trips + answer). Each call
carries ~6k input tokens (system + tool schemas + history + tool results)
and the turn produces ~1k output tokens in total, so ~18k in / 1k out per
turn, without caching. Prices are USD per M tokens, in/out (live check
2026-10-06, catalog price).

| Model | In / out | ≈ $ per turn | Tier |
|---|---|---|---|
| qwen/qwen3.7-flash | 0.03 / 0.13 | 0.0007 | allowlist candidate |
| openai/gpt-oss-120b | 0.037 / 0.17 | 0.0008 (to 0.007 on the priciest endpoint) | allowlist candidate |
| openai/gpt-5-nano | 0.05 / 0.40 | 0.0013 | allowlist candidate |
| google/gemini-2.5-flash-lite | 0.10 / 0.40 | 0.0022 | allowlist candidate |
| google/gemini-3.8-flash | 0.75 / 3.75 | 0.017 | Pro |
| anthropic/claude-haiku-4.5 | 1 / 5 | 0.023 | Pro |
| anthropic/claude-sonnet-5.5 | 2 / 10 | 0.046 | Pro |
| openai/gpt-5.5 | 5 / 30 | 0.12 | Pro |
| anthropic/claude-opus-5.5 | 4 / 20 | 0.092 | Pro |
| anthropic/claude-fable-5.1 | 10 / 50 | 0.23 | Pro |

Prompt caching on the stable system-plus-tools prefix would cut the input
side substantially for Anthropic models (explicit `cache_control`, or the
top-level form on Anthropic, Vertex, Azure and Bedrock;
[prompt caching](https://openrouter.ai/docs/prompt-caching.md)). GPT-5.6+
bills cache writes at 1.25× input, so caching isn't free everywhere. The
numbers above are the uncached worst case.

**Tiers, with strawman numbers.** These are **placeholders for Pablo to
set**. The windows mirror quotas.md: 30-day rolling for signed-in tiers.

| Tier | Models | Budget (placeholder) | ≈ turns | Window | Identity |
|---|---|---|---|---|---|
| Anonymous | allowlist (default), or free models | $0.02 | 15–30 | 24 h per anon id; also $0.10 / 24 h per IP hash | HMAC anon token (D5) |
| Free (signed in) | allowlist (default), or free models | $0.50 | 230–700 | 30-day rolling | Auth0 `sub` |
| Pro (`sharePro`) | allowlist + priced picker, or free models | $5.00 | ~100 Sonnet 5.5, ~50 Opus 5.5, ~20 Fable 5.1, thousands on allowlist | 30-day rolling | Auth0 `sub` |
| Free models (any tier, opt-in) | `openrouter/free` or curated `:free` | $0 (no credits) | ~200–300 a day **in total**, shared by every user | UTC day (OpenRouter's) | caller's tier identity |
| BYOK | anything the user's key allows | none from Bldrs | — | — | none needed |
| Global breaker | — | $1 / day for all anonymous paid-model traffic (≈ 3× today's expected spend, = today's ad budget; sizing below); past it, anonymous traffic overflows to free models | — | UTC day | relay-wide |

The dollar budgets can't limit free-model traffic, because it costs $0.
So the ledger also counts free-model requests per identity (anonymous
token, IP hash, `sub`) against a small daily cap (placeholder: 30 requests,
~8 turns). Without it, one client could drain the shared daily pool for
everyone.

**Sizing against today's traffic: AI spend as acquisition cost.** Share sees
about **100 users a day** today, against about **$1 a day of ad spend**.
Hosted AI for anonymous and free users is a marketing cost of the same kind
as that ad spend, so it is sized next to it. Placeholder assumptions:

| Input | Value | Note |
|---|---|---|
| Daily users | 100 | today's traffic |
| Share who try the assistant | 30% → 30 users | placeholder; `assist_open` (§7) measures it |
| Turns per trying user | 10 | placeholder; `assist_turn` measures it |
| Cost per turn, cheap default | ~$0.001 | gpt-oss-120b $0.0008, gpt-5-nano $0.0013 (table above) |
| **Expected anonymous + free spend** | **30 × 10 × $0.001 ≈ $0.30 / day** | ≈ $9 / month |
| Expected, if deny routes to the priciest gpt-oss endpoint | 300 × $0.007 ≈ $2.10 / day | upper bound until #1929 measures real routing |

What follows from that:

- **AI cost per engaged user ≈ ad cost per visitor.** $0.30 for 30
  assistant users is about $0.01 each. $1 of ads for ~100 visitors is about
  $0.01 each, if all traffic were paid, which it isn't, so ads are really
  cheaper per visitor than that. A user who has worked with the assistant
  on their own model is a stronger conversion signal than a visit, for the
  same cent.
- **Per-user budgets cover a trial with headroom.** The anonymous $0.02 is
  15–25 cheap turns against the assumed 10. A signed-in free user's $0.50 a
  month is ~400–600 turns. Ten fully active free users would cost ~$5 a
  month, about $0.17 a day.
- **The breaker is a multiple of expected spend, at the ad budget.**
  - The anonymous breaker sits at **$1 a day**: about 3× the expected
    $0.30 and equal to the daily ad budget. The worst anonymous day, viral
    or abusive, then costs no more than one day of ads. The overflow
    (free models, then a sign-in prompt) keeps the assistant answering past
    that point.
  - A 10× viral day (1,000 users, ~$3 of expected demand) trips the breaker
    at about a third of the day's traffic. That is the intended trade.
  - **Re-size the breaker as traffic grows.** Rule of thumb: about 3× the
    trailing 7-day median anonymous spend, never above a hard ceiling set
    by hand next to the ad budget. Both numbers are placeholders.
- **A signed-in free-tier breaker too** (added here, not in the planning
  decisions). Per-user budgets bound one account, but free Auth0 accounts
  are cheap to create, so the free tier gets the same daily breaker
  mechanism. Placeholder: $2 a day (≈ 10× today's expected free spend). Past
  it, free users overflow to free models with the same notice.
- **The free-model pool can't carry even today's traffic as the default.**
  ~300 expected turns a day against ~200–300 free turns a day for the whole
  account (above). That is the D3 rationale in numbers.

At the $25/mo Pro price mocked in #1421 (roadmap §4.9), a $5 AI budget is
20% of revenue, plus OpenRouter's 5.5% credit-purchase fee
([FAQ](https://openrouter.ai/docs/faq.md)). Whether Pro gets **top-ups**
(buy more credits), **pay-as-you-go** past the budget, or a hard stop is an
open question (§15).

**Pro picker.** Built from `GET /api/v1/models` (unauthenticated and
CORS-open, live check 2026-10-06), filtered to `supported_parameters ∋
tools` and not `expiration_date` past. It shows per-M prices, an "≈ $ per
turn" estimate from the table's assumption, and `context_length`. Fetch it
through the relay (cached), so the picker list and the relay's Pro
allowlist are the same list. A model can sit in the catalog with no
deny-compatible endpoint (above), so the relay surfaces OpenRouter's "no
endpoints match" as a picker-level "unavailable under Bldrs privacy
settings".

**OpenRouter-side guards** (from the research, recommended): keep prompt
logging off on the Bldrs account. Opting in grants OpenRouter a licence to
"license or sell your User Content in anonymized form" (ToS §6). Keep a
modest prepaid balance and alarm on it. Map upstream 402s by
`error.metadata.limit_source` (`openrouter_credits`, `openrouter_key_limit`,
`openrouter_in_flight_budget`;
[limits](https://openrouter.ai/docs/api/reference/limits.md)) to a 503
"assistant unavailable", never to the user's credits dialog.


## 7. D4 + D5 — Ledger and anonymous identity

**D4: Ledger in Netlify Blobs (or similar), not Auth0.** Auth0
`app_metadata` keeps the tier (`subscriptionStatus`) and nothing else new.
The reasons are in this repo already:

- `app_metadata` is capped at ~16 KB.
- Every write is a Management API read plus `PATCH`
  (`_lib/auth0.js:272`, `:306`), shallow-merged and last-write-wins.
- quotas.md already flags the migration off `app_metadata` "when Management
  API limits bite", and netlify-functions-testing.md §"Known gaps" names
  "a Netlify Blobs entry with a conditional write" as the fix for the same
  race in `stripe-webhook`.

Per-message metering would multiply that write rate by roughly 100.

- **Key:** `ai/<tier-scope>/<sub | anonId>`. **Value:** `{days:
  {'2026-10-06': microUsd, …}}`. The window sum is the last 30 day buckets,
  or 1 for anonymous. Pruning works like `pruneLoads` in quotas.md.
- **Check then debit.** The relay checks remaining budget > 0 before
  calling upstream, and debits the actual `usage.cost` after. Concurrent
  requests can overshoot by at most (in-flight requests × one capped
  request). `max_tokens` bounds that, so a lock isn't needed for v0.
  Whether Blobs offers conditional writes or atomic increments is
  **UNVERIFIED** (spike #1928). Lost-update races under-count, the same
  "free extra, never wrongful block" direction quotas.md accepts.
- **Reuse.** Add `QUOTA_FEATURES.AI_CREDITS = 'ai_credits'`
  (`src/quota/quota.js:21`, whose comment already invites a new value per
  metered feature). Reuse `getTier`, `QuotaBadge`-style usage display and
  `QuotaLimitDialog`, which already emits `quota_limit_reached {tier,
  feature}` (`QuotaLimitDialog.jsx:52`). The relay returns `{used, limit,
  tier}` headers on every response, so the client needs no second call.
- **Funnel events** (proposed; names go in `FUNNEL_EVENTS`,
  `src/privacy/analytics.js:340`, and the bizdev dashboard must be updated
  together, per quotas.md):
  - `assist_open {transport}`
  - `assist_turn {transport, tier}`, sampled or first-per-session only, so
    it doesn't flood GA
  - `byok_connected {provider}`
  - the existing `quota_limit_reached {feature: 'ai_credits'}`
  - `begin_checkout {from: 'assist'}`
  - No content, model ids from BYOK, or keys ever go to GA.

**D5: Anonymous identity.** Today an anonymous user has no server identity:
`useQuota` is OPFS-only for them. The relay adds a minimal one:

- **Token.** On the first hosted call without a token, the relay issues
  `anonId.issuedAt.HMAC(secret, anonId|issuedAt)`. The client keeps it in
  localStorage and sends it as a Bearer. The relay verifies it statelessly
  and keys the ledger by `anonId`.
- **IP-hash limit.** `HMAC(dailySalt, clientIp)` gets its own ledger bucket
  (placeholder $0.10 / 24 h). This catches token churn: clearing storage
  mints a new anonId, but not a new IP. No raw IP is stored. The salt
  rotates daily, so the hashes don't link across days.
- **Global breaker.** A relay-wide daily spend counter for the anonymous
  tier's paid models, sized at about 3× expected spend and capped near the
  daily ad budget (placeholder $1 a day, §6 sizing). Past the threshold, anonymous traffic **degrades to
  the free-models path** (§6) with an in-tray notice, rather than being
  refused. Only when that pool is also exhausted do anonymous requests get
  "free assistant busy, sign in to continue", which is itself a conversion
  prompt.

**Abuse risk, honestly.** This is a free LLM endpoint on the open web.

- A determined abuser can rotate IPs (residential proxies) and tokens.
  The only hard bound is the global breaker, which also takes the free tier
  down for genuine users while it is tripped.
- The server preamble (§5) and the cheap allowlist make it a poor general
  LLM, but not a useless one.
- Mitigations in reserve, in order of cost: a proof-of-work or captcha
  challenge on token mint (e.g. Cloudflare Turnstile, not evaluated), a
  lower anonymous `max_tokens`, requiring a loaded model (the client sends a
  model fingerprint; weak), and finally sign-in-only AI. How much exposure
  is acceptable is Pablo's call (§15).


## 8. D6 — BYOK

**Providers and transport (preflight live check 2026-10-06, Origin
`https://bldrs.ai`):**

| Provider | Endpoint and shape | CORS | Adapter | Main risk |
|---|---|---|---|---|
| Anthropic | `api.anthropic.com/v1/messages`, native Messages API | 200, `*`, but only with `anthropic-dangerous-direct-browser-access: true`. Without it, no ACAO (research-byok) | `@ai-sdk/anthropic` plus that header passed explicitly. It does **not** add it itself (grepped `dist/index.js`) | The header is undocumented except as the SDK's `dangerouslyAllowBrowser` ([TS SDK](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript)). Pin and smoke-test it |
| OpenAI | `api.openai.com/v1/chat/completions` | 200, echoes origin | `@ai-sdk/openai` (chat) | Responses API CORS broke in Jan 2026 per a forum thread ([2nd-hand](https://community.openai.com/t/has-the-cors-policy-changed-responses-api/1372791)). Use Chat Completions; Responses is UNVERIFIED |
| Gemini | `generativelanguage.googleapis.com/v1beta/models/*:streamGenerateContent`, native | 200, echoes origin. 403 if unknown headers are requested, so request only those sent | `@ai-sdk/google` (native) | Gemini 3 needs `thought_signature` echoed back on function-call parts, or multi-turn tool use 400s ([2nd-hand](https://discuss.ai.google.dev/t/gemini-3-thought-signature-is-not-valid-cant-do-multi-turn-tool-calling/119360)), so not the `/openai/` compat path. `AQ.` auth-key behaviour from browsers is UNVERIFIED |
| xAI | `api.x.ai/v1/chat/completions`, OpenAI-shaped | 200, `*` / `*` | `@ai-sdk/xai` | Docs mirrors call Chat Completions "legacy" in favour of Responses ([2nd-hand](https://docs.x.ai/api)). The adapter may need to move. Responses CORS not probed |
| OpenRouter (user's account) | `openrouter.ai/api/v1/chat/completions` | 204, `*` | `@ai-sdk/openai-compatible` or `@openrouter/ai-sdk-provider` | OpenRouter sees the conversation. Disclose it |

Preflight is not proof: no authenticated POST, streamed body or tool delta
was exercised. That is spike #1927, with the per-provider checks research-byok
§5 lists.

**OpenRouter "connect your account" (PKCE).** Redirect to
`https://openrouter.ai/auth?callback_url=…&code_challenge=…&code_challenge_method=S256&state=…`,
then exchange `POST /api/v1/auth/keys {code, code_verifier,
code_challenge_method}` → `{key}`
([OAuth PKCE](https://openrouter.ai/docs/use-cases/oauth-pkce.md)).

- No client registration or secret, so no backend is needed.
- The exchange endpoint is CORS-open: preflight 204 `*`, and a bogus-code
  POST returns a readable 400.
- Codes are single-use and expire in 10 minutes.
- The browser flow can't set a spend `limit`; that needs a server-side
  `POST /api/v1/auth/keys/code` with a Bldrs key. So the UI tells the user
  to cap the key in their OpenRouter dashboard.
- This is the one BYOK path with no pasted secret. It also gives users with
  their own OpenRouter credits the whole catalog.

**Key custody.**

- **Default: session-only.** The key lives in tab memory, mirrored to
  `sessionStorage` so it survives a reload.
- **Opt-in "Remember on this device"**, per provider, in IndexedDB or
  localStorage, with a visible **Forget** button. Wrapping it with AES-GCM
  under a non-extractable WebCrypto key is optional at-rest obfuscation,
  labelled honestly: it doesn't stop XSS, because the page must hold the
  plaintext to send it.
- **Never:** URL or permalink, cookies, GA, Sentry (scrub `authorization`,
  `x-api-key`, `x-goog-api-key`), `postMessage` to widgets, or any Bldrs
  endpoint. Keys are masked in the UI (`sk-ant-…abcd`).
- A **"Test connection"** button per provider: list models, then a 1-token
  streamed call. It turns CORS and key-type failures into a clear message.
- Per-provider "limit your key" help: an Anthropic workspace with a spend
  cap and a 7-day key; an OpenAI project key with Restricted permissions; a
  Gemini key referrer-restricted to the Share origin; an xAI key ACL plus a
  monthly cap.

**Credits.** BYOK traffic never touches the relay or the ledger. The tray
shows the transport ("Your Anthropic key") instead of a credit meter.

**ToS notes** (not legal advice; from research-byok §2):

- **Anthropic.** Commercial Terms let customers power products for "its own
  customers and end users", with nothing BYOK-specific
  ([commercial terms](https://www.anthropic.com/legal/commercial-terms)).
- **OpenAI.** The Services Agreement forbids transferring keys to third
  parties ([2nd-hand](https://openai.com/policies/services-agreement/)). A
  key that never reaches Bldrs isn't transferred to Bldrs, but that reading
  is UNVERIFIED.
- **Gemini.** The terms carry "not for consumer use" language, and the
  BYOK forum questions are unanswered
  ([2nd-hand](https://ai.google.dev/gemini-api/terms)). It is the weakest of
  the five. Share's professional-CAD audience fits "professional or
  business purposes".
- **xAI.** Customers may expose "Bundled Services" to end users. No BYOK
  clause was found ([2nd-hand](https://x.ai/legal/terms-of-service-enterprise)).
- **OpenRouter PKCE.** This is OpenRouter's documented, intended flow for
  third-party apps.


## 9. D7 + D8 — Client library and tool surface

**D7: Vercel AI SDK, lazy.** `ai` plus `@ai-sdk/{anthropic,openai,google,xai}`
measured ~299 KB min+gz for four providers, and ~205 KB for core +
anthropic + openai-compatible (esbuild + gzip -9, research-byok §3; `ai`
7.0.128).

- **Why it.** `streamText` and the tool loop need only `fetch`. It handles
  Anthropic natively and round-trips Gemini thought signatures, and one
  OpenAI-compatible provider covers both OpenRouter-with-user-key and our
  relay (`baseURL` = relay, auth = Bearer).
- **Bundle cost.** The assist bundle is a dynamic `import()` behind the
  flag, and each provider package loads only when chosen. The viewer's
  cold load is unchanged; the cost lands when the tray first opens.
- **Fallback: thin adapters.** `@anthropic-ai/sdk` (~53 KB,
  `dangerouslyAllowBrowser`), a fetch-based OpenAI-shape client (xAI,
  OpenAI, OpenRouter, relay) and a Gemini-native adapter. That is under
  ~60 KB plus Gemini, but we would own the loop and every provider quirk.
- **Alternative evaluated in the spike: TanStack AI.** `@tanstack/ai` 0.64.1
  with four adapters measured ~296 KB, with a `node:*` external needed.
  Its `byok` module looks server-oriented.

**Spike #1927 decides.** Real keys, run from a real browser tab on a deploy
preview. The matrix is {Anthropic, OpenAI, Gemini, xAI, OpenRouter-PKCE} ×
{stream, one tool round-trip, multi-turn with two tool calls}, for AI SDK vs
TanStack AI. The spike also settles: success-path ACAO on SSE, Gemini `AQ.`
keys, OpenAI Responses vs Chat, xAI Responses, and real token counts per
turn for §6.

**D8: Tool registry, MCP-shaped.** One registry, in-page, typed:

```ts
interface AssistTool {
  name: string                    // snake_case, MCP tool name rules
  description: string             // what the model reads
  inputSchema: JSONSchema         // MCP `inputSchema`
  run(args, ctx): Promise<ToolResult>   // ctx: viewer, store, model
  sends?: 'text' | 'pixels'       // pixels => opt-in (screenshot)
}
// ToolResult mirrors MCP CallToolResult: {content: [{type:'text', text}], isError?}
```

Each provider adapter converts the registry to its native tool format, and
`assist-320` can later serve the same registry over postMessage MCP to
sandboxed apps. The registry replaces the bot's two unsafe mechanisms:
`safeJsonFromCodeBlock` JSON parsing (`eval.ts`) and
`new Function('viewer', 'store', 'setSelectedElements', …)` over
model-supplied `client_code` (`BotChat.jsx:162`).

**Prerequisite: expose the selection funnel.** `selectItemsInScene` is a
closure inside `CadView.jsx:1217`. The bot and `WidgetApi` bypass it with
raw `useStore.setState`, so they skip what it does for selection anchors and
instance ids. The tool layer needs it lifted to a module or store action
first. It is a task inside #1674.

**Element refs.** Tools take and return the permalink ref vocabulary
(`src/viewer/visibilityRefs.js`, [model-edit.md](model-edit.md) §5):

- `e<expressID>` for IFC and STEP products;
- `o1.2.3` for STEP occurrences;
- `n<seg>/…` for scene-graph names;
- `g<GlobalId>` for created elements;
- IFC GlobalIds are accepted on input (`SearchSlice` maps GlobalId ↔
  expressId).

Results render as element chips through #1673, so "the AI pointed at it"
and "the user clicked it" are the same navigation.

**v0 tools (read/annotate; #1674):**

| Tool | Does | Backing seam |
|---|---|---|
| `model_summary` | Format, units, element counts by type, top N levels of spatial structure | `IFCSlice.elementTypesMap`, `ShareIfcManager.getSpatialStructure:118`, `idsByType:176`, `ShareModel.modelHasCapability:357` |
| `search_elements` | Text/type query to refs + names, capped | `SearchIndex.search:138` |
| `get_properties` | Attributes and psets for ≤ N refs | `getItemProperties:129`, `getPropertySets:140`, `ShareViewer.getProperties:836` |
| `get_selection` | Current selection as refs | `NavTreeSlice` |
| `select_elements` | Select refs (replace or add) | exposed `selectItemsInScene` |
| `isolate` / `hide` / `show` / `reset_visibility` | Visibility by refs, IFC ids or STEP occurrences | `IfcIsolator.isolateElementsById:1591`, `hideElementsById:1295`, `unHideElementsById:1331`, `unHideAllElements:1379`, `hideOccurrences:848`, `isolateOccurrences:1551` |
| `focus` / `fit_view` | Frame refs, or the whole model | `Selector.pickByIds(…, focus)`, `fitToFrame` (`context/context.js:215`), `setCameraFromParams` (`CameraControl.jsx:123`) |
| `cut_plane` | Add or clear an axis cut at an offset | `CutPlanesSlice.addCutPlaneDirection:11` |
| `set_display` | Auto-colour or wireframe, scoped | `DisplaySlice.setDisplayOverride:34` ([model-display-controls.md](model-display-controls.md)) |
| `make_permalink` | URL for the current camera + selection + visibility | `CameraControl.addCameraUrlParams:198`, `selectionHash.js`, `visibilityHash.js` |
| `list_notes` | Notes on this model (titles, anchors) | `NotesSlice` |
| `screenshot` *(opt-in)* | Canvas image for vision models | `ShareViewer.takeScreenshot:1861`, `sends: 'pixels'` |

**Rules for every tool:**

- **Hard result caps.** At most N items or K characters, with an explicit
  "truncated, narrow the query" marker. Caps protect the context window and
  the sovereignty boundary (§10).
- **No geometry buffers ever.** Geometry enters a result only as derived
  scalars (bbox, counts), and only where the tool's description says so.
- **No network egress in any v0 tool.** Prompt injection is real here:
  element names and psets come from untrusted files. Without an egress tool,
  injected text can at worst move the camera or change visibility; it can't
  exfiltrate anything.
- **Notes writes (`create_note`) wait for v0.1,** behind a confirm, because
  they post to GitHub as the user.
- **Model-edit tools are `create-310`**, through the op log with
  preview-before-apply.


## 10. D9 + D10 — Sovereignty boundary and conversation store

**D9: The boundary.** Model bytes, the OPFS cache, GLB artifacts and
geometry buffers never leave the machine through the assistant. The
conversation and tool results do. Results can carry model-derived data
(element names, types, property values, GlobalIds, counts, bounding boxes)
and, only if the user opts in, screenshots.

**"What the AI can see"** is disclosed in the tray (a one-line transport
badge that expands) and in settings, per transport:

| Transport | Who sees the conversation and tool results | Stored? |
|---|---|---|
| Hosted (default and Pro models) | The Bldrs relay (in transit only, no body logs); OpenRouter (metadata logged; prompt logging off on the Bldrs account, [FAQ](https://openrouter.ai/docs/faq.md)); the upstream provider, restricted to endpoints that don't collect data (`data_collection: "deny"`) | Not by Bldrs. Upstream per its policy, with deny |
| Hosted, free models (opt-in, or anonymous overflow) | As above, **but without deny**: the upstream free provider may log the conversation and train on it | Not by Bldrs. Upstream may retain and train |
| BYOK (direct) | The chosen provider only, under the user's own account and terms | Per the user's provider account |
| BYOK (OpenRouter PKCE) | OpenRouter + upstream, under the user's OpenRouter privacy settings (Bldrs can't force deny on the user's key) | Per the user's settings |

**Same-origin scripts.** A remembered key in localStorage is readable by any
script on `bldrs.ai`. AdSense, which the planning notes named, is **not**
loaded on any route today: Phase 1b removed the tag from `index.html`
([ads.md](ads.md) status). But two exposures remain:

- The gtag loader is injected on production hosts (`src/index/ga.js`).
- ads.md Phase 2 plans to re-add AdSense on the text routes (`/about`,
  `/blog/*`). The marketing build shares the origin, and so shares
  localStorage.

So: remembered keys stay opt-in, and the "remember" copy names the risk.
When Phase 2 lands, its PR must decide between scoping key storage away
from ad routes and accepting the risk explicitly. This doc flags it, and
the CSP story is the real fix.

**CSP.** The repo has no `Content-Security-Policy` anywhere; `netlify.toml`
sets only COOP (ads.md §"Privacy / CSP"). A `connect-src` allowlist (the
five provider hosts, the relay, GitHub, Drive, Auth0, GA) is the strongest
mitigation after not persisting keys. It stops injected script from sending
a key to an arbitrary host. It is a site-wide project (fonts, workers, wasm,
GA), so it is its own story, #1935: start in `Report-Only` mode, then enforce.

**D10: Conversation store.**

- **Local, per model**, linked from the Tier-1 project struct
  (conversational-cad.md §4 "Persistence, initially").
- **File-shaped from day one:** one JSONL document per conversation
  (header + one message or tool event per line), behind the
  `src/workspace/persistence.ts` seam, as workspace-store.md §4 asks, so
  the repo-as-workspace store can adopt it wholesale.
- **Bodies in OPFS, not localStorage.** Tool results make transcripts
  large, and localStorage is a few MB per origin. The project struct holds
  only `{conversationId, title, updatedAt}`. This refines the "stored with
  the Tier-1 project struct" wording in conversational-cad.md rather than
  contradicting it.
- **Keys never go into transcripts.** Screenshots are stored as a
  placeholder, not pixels, unless the user keeps them.
- **Shared and durable conversations, channels, and the Notes-vs-channels
  question are `assist-400`.**


## 11. D11 — The Create seam

**What Create is today** (bldrs-ai/Create, E0, 2026-08-09; research-create):

- A headless, Node ≥22 TypeScript kernel. It authors parametric parts in
  replicad/OCCT wasm, exports STEP, re-ingests through conway, measures
  (bbox, volume, closure, winding) and renders 4-view sheets.
- **No LLM calls of its own**, and no HTTP or MCP interface.
- Its E1 plan is an "MCP tool surface v0 (stdio + in-process) over conway
  read/verify + kernel author/compile/export" (Create `README.md` §Next).

**Decision.** Share's agent is the orchestrator. Generative-CAD requests go
to Create through a **remote tool provider**: a registry entry that
advertises Create's MCP tools (`author_part`, `verify`, …) alongside the
viewer tools. The loop doesn't care where a tool runs. There is one
conversation, one transcript and one bill.

**Contract sketch** (interface only; nothing built in AI.2):

- **Share → Create:** `{intent, context}`. The context carries the selected
  element refs (§9), model units and up axis, a placement frame (an origin
  and axes from the selection or a pick), relevant dimensions from
  `get_properties`, and constraints ("fits the opening `e123`").
- **Create → Share:** `{artifact: STEP bytes or a ref, params, provenance:
  {kernelVersion, paramsHash, checks: {bbox, volume, closed}}, preview?}`.
- **Landing.** The artifact enters as `create-320` `create` ops in the
  `create-300` op log ([model-edit.md](model-edit.md) §8,
  [create-engine.md](create-engine.md)). It gets a minted `g<GlobalId>`,
  and it is undoable and reviewable like a human edit.

**Credits.** Any LLM usage on Create's side (for example a self-review loop
like CADAM's, create-engine.md §A4) should use the same `Provider`
abstraction and the same ledger, so a hosted user's budget covers it and a
BYOK user's key pays for it. That is the reason to keep the loop in Share.

**Open questions (seam, not build):**

- Where does Create run? replicad/OCCT is wasm, so an in-browser worker is
  plausible, and model context would then stay local. A server would make
  Create a second data recipient.
- Is Create's MCP served over HTTP or postMessage, and how does it
  authenticate a Share user?
- STEP vs Tier-1 extrusion payloads: create-engine.md picks IFC-shaped
  extrusions and OpenSCAD WASM, while Create E0 is replicad → STEP. Which
  generator does a given intent go to?
- How are Create's LLM calls attributed to a user's ledger if it runs
  server-side?
- Do Create's verification checks surface in the transcript?


## 12. Jev (System One decisions) and generative UI

**What Jev is.** TypeSafe's first "System One" model: a structured decision
model, **not an LLM and not a UI generator**. You send application `state`
plus typed questions (Choice: which option? Score: where on an ordered scale?
Noul: does it hold?) and get a typed answer with per-option probabilities and
a confidence. OpenRouter's FAQ: "Is Jev an LLM? No. ... Jev doesn't return
text, reasoning, or explanations"
([OpenRouter Jev docs](https://openrouter.ai/docs/guides/community/jev),
**live check 2026-10-06**). No streaming, no tools, nothing executes. An
earlier draft of this section read it as text → UI; that was wrong.

- **Access.** `typesafe/jev-1.13` (`~typesafe/jev-latest`) via the OpenRouter
  Decisions API `POST /api/alpha/decisions` (or System One,
  `/api/v1/systemone`), same OpenRouter key. Not chat-completions compatible.
  `@typesafe-ai/sdk` is MIT (0.6.0).
- **Cost and maturity.** $0.042 per M input tokens, output free, 32k context.
  Early access began 2026-09-15 and the route is `/alpha/`. The vendor's
  70–500 ms latency is **UNVERIFIED**. Probabilities vary slightly between
  calls, so thresholds go on bands.
- **Not `typesafe/jev-router`**, an OpenRouter router model that uses Jev to
  pick the LLM and reasoning effort per request.

"Text → UI" meant two things. The product owner confirmed the first (natural
language → UI action, Jev as intent layer with LLM promotion); the second
does not use Jev and is a later story.

### 12.1 Jev as intent layer (D14, decided), then router and gate

1. **Intent/command layer (decided, first use).** Typed text → viewer
   action. "Hide the walls" is a Choice over registry tool names, plus
   Choice/Score over arguments (IFC type, level): sub-second and near-free,
   which matters most on the anonymous tier (§6). It dispatches through the
   same MCP-shaped registry (§9), never `ShareViewer` directly.
2. **Follow-on: router at the top of the turn.** Quick command, analysis
   question → LLM agent, generative CAD → Create (§11). `typesafe/jev-router`
   is the off-the-shelf model-picker variant, possibly an "auto" entry in
   the Pro picker (§6).
3. **Follow-on: tool-call gate** for future write tools (`create-310`), per
   OpenRouter's cookbook "Gate Agent Tool Calls with Jev"; fits
   model-edit.md §9.

**Escalation design.** Jev answers with an action plus a confidence.

- **Above the threshold:** dispatch directly through the registry and show
  the action in the tray as a compact "did X" message (for example "Hid 14
  walls") with two affordances: **Undo**, and **Ask the assistant instead**.
- **Below the threshold, or no option fits:** hand the original utterance and
  Jev's candidate options to the LLM loop as context. The user sees the
  normal assistant turn, not an error.
- **Threshold.** Calibrated by the #1937 eval (Jev-vs-LLM accuracy and latency
  on simple commands), per tool family: a wrong "hide" is cheap to undo, a
  wrong write is not. Set it on probability bands, not exact values.

**Placement.**

- **Hosted:** through the relay, which needs a **new route** (the Decisions
  API isn't chat-completions). Credits come from the same ledger (§7).
- **BYOK:** no Bldrs relay, so skip Jev and go straight to the LLM, or use it
  with the user's OpenRouter-PKCE key (D6).
- **Browser CORS** is **UNVERIFIED** (OpenRouter says keep the key
  server-side). It is a spike item.
- **Fail open.** Alpha and nondeterministic, so every miss falls back to the
  LLM loop (the write gate fails closed, to a human confirm).

**Sovereignty (§10).** The `state` sent to Jev counts as "what the AI can
see", like tool results: user text, names, types and counts, never geometry.
The disclosure table gains a Jev row when this ships.

### 12.2 Generative UI proper (separate, not Jev)

The assistant rendering a quantities table, filter panel or form in the tray
needs a generative model, so it rides the LLM layer (§5–§8).

- **Declarative spec, in the tray (recommended).** The LLM emits a spec
  against a **Share-owned catalog of MUI components**. Actions bind to
  **registry tool names** (§9). It renders inline with no iframe because
  nothing executes; unknown types are rejected and props are allow-listed.
- **Lead candidate: json-render** (`@json-render/core`, Apache-2.0, 0.21.0,
  pre-1.0; npm registry, 2026-10-06). Zod catalog validation maps onto MUI.
- **Alternatives:** Google A2UI (declarative protocol; npm package not
  checked), Thesys C1 (hosted vendor in the LLM path, bypasses the relay and
  BYOK), AI SDK generative UI (RSC `streamUI` doesn't fit a Vite SPA),
  CopilotKit/AG-UI (large, overlaps our loop). Partial-spec streaming in
  json-render or A2UI is **UNVERIFIED**.
- **Executable generated code** stays in the `assist-320` iframe sandbox
  (§16), gated on #1386.

This stays a separate, later story (#1938). The code path waits for
`assist-320`.


## 13. D12 + D13 — Flag and bot port

**D12: Flag.**

- Add `{name: 'assist', isActive: false}` to `src/FeatureFlags.js`.
- During the port, alias the old name with `FEATURE_IMPLICATIONS.assist =
  ['bot']`, so `?feature=bot` links keep working. The map's key is the
  *implied* flag.
- **Mirror the alias into `src/hooks/useExistInFeature.js:10`.** Its copy
  has already drifted: it lacks `glbbatched` and `glbcollapse`.
- Remove the alias when the port lands.
- conversational-cad.md and roadmap §4.11 said `?feature=convo`; both are
  corrected to `assist` in this PR, matching #1659 and #1672.

**D13: Port plan from `?feature=bot`** (`src/Components/Bot/`,
`src/store/BotSlice.js`):

| Piece | Fate |
|---|---|
| `BotControl.jsx`, mounts (`BottomBar.jsx:49`, `TabbedPanels.jsx:164`, `NotesAndPropertiesDrawer.jsx:57`) | **Keep → rename** to Assist. The tray position is decided by #1672/#1676 |
| `BotSlice.js`, `hashState.ts` | **Keep**, extended with the conversation id and transport. Hash prefix moves to `assist` (accept `bot`) |
| `ChatMessage.jsx`, `chat-bubbles.css` | **Keep**. Add streaming render and element chips (#1673) |
| `openRouterClient.ts` (`askLLM`, non-streaming, `provider.order: ['anthropic']`, no tools) | **Evolve** into the hosted transport: base URL → relay, streaming, tools; drop the hard-coded `order` |
| `BotSettings.tsx` (one OpenRouter key field) | **Evolve** into provider/key settings: transport choice, per-provider key with Test, Forget, Connect OpenRouter, and the disclosure (§10) |
| `src/__mocks__/api-handlers-openrouter.ts`, `OPENROUTER_BASE_URL` (`tools/esbuild/vars.prod.js:43`, `vars.cypress.js:27`) | **Keep**. Add SSE + tool-call fixtures, relay handlers, and one handler per BYOK host |
| `src/tests/e2e/networkGuard.ts` denylist (`openrouter.ai`) | **Keep**. Add `api.anthropic.com`, `api.openai.com`, `generativelanguage.googleapis.com`, `api.x.ai` |
| `BotChat.jsx` `new Function(client_code)` + `eval.ts` JSON-in-codeblock + `BASE_SYSTEM_MSG` | **Delete**, replaced by the tool registry (§9). `eval.test.ts` goes with it |
| `localStorage['openrouter_api_key']` (plaintext, persistent by default) | **Delete**. Migrate once into the session store (prompt "remember?"), then remove the key |
| `BotChat.test.tsx`, `BotSettings.test.tsx`, `BotChat.spec.ts` | **Rewrite** against the new tray. Keep the MSW pattern |


## 14. Testing and story breakdown

**Testing strategy.**

- **No real network in unit or E2E tests.** MSW handlers for the relay and
  for every provider host, with SSE bodies and tool-call deltas, and
  `networkGuard` denying the real hosts. A broken mock must fail, not fall
  through.
- **Unit (Jest).**
  - Each tool's `run` against a fixture model: caps, refs, no geometry
    in results.
  - Registry → provider schema conversion.
  - Key store (session default, remember, Forget, no leakage into
    GA/permalinks).
  - Ledger window math.
  - HMAC token verify.
  - Every assertion must be able to fail (STYLE.md §"Assertions must be
    able to fail"). For "no geometry leaves", assert on a result that
    *would* contain a buffer if a tool regressed.
- **E2E (Playwright).** Every story's happy path runs under
  `describeMobileAndDesktop` (`src/tests/e2e/formFactor.ts`, CLAUDE.md).
  For example: open the tray, send a prompt, the mocked model calls
  `select_elements`, the selection appears in the NavTree, and the chip
  navigates. #1677 adds a large-model fixture.
- **Relay.** Per [netlify-functions-testing.md](netlify-functions-testing.md):
  - mocked unit tests;
  - replay scenarios recorded against OpenRouter, run on source and bundle
    (including the unauthenticated request);
  - a `PROBES` entry for live smoke.
  - The streaming vehicle may need harness work, because the replay runner
    targets v1 handlers. Part of #1928.
- **Manual real-key smoke checklist** (each deploy preview that touches
  assist; also the core of #1927):
  1. For each provider: Test connection, then a streamed reply, then a
     prompt that needs two tool calls ("isolate all doors on level 2 and
     frame them"). The viewer state must match.
  2. A Gemini 3 multi-turn tool conversation (thought signatures).
  3. OpenRouter PKCE connect → reply → Forget.
  4. Hosted as anonymous until the credits dialog; as free, the same
     with the sign-in path; as Pro, pick a priced model and watch the
     meter move by roughly the table's estimate. Opt into "Free models"
     and check that the disclosure shows and the meter doesn't move.
     Force the breaker (low threshold on a preview) and check that
     anonymous traffic overflows to free models with the notice.
  5. Reload: a session key is gone after the tab closes, a remembered
     key survives, Forget clears it.
  6. DevTools network: no request carries model bytes, and no key goes to
     any non-provider host.

**Stories.** The existing sub-issues of #1659, and the following additional ones also filed as sub-issues of #1659:
Dependencies are in brackets.

| # | Story | Scope | Depends on |
|---|---|---|---|
| #1671 | this doc | AI.0 decisions | — |
| #1672 | tray UI + drawer threads | Tray, threads, local JSONL log (D10). Introduces the `assist` flag + `bot` alias (D12) and renames the Bot components (D13 keep rows) | — |
| #1673 | message anchors + element chips | Chips over permalink refs | #1672 |
| #1674 | viewer tool surface v0 | Registry + v0 tools (§9). First task: expose `selectItemsInScene` | — |
| #1675 | agent loop v0 + streaming | AI SDK loop over the registry. Deletes the eval path. Ships first on BYOK | #1674, #1927, #1930 |
| #1676 | W7 reduced tool set | unchanged, droppable | #1672 |
| #1677 | large-model fixture + E2E | unchanged | #1675 |
| [#1927](https://github.com/bldrs-ai/Share/issues/1927) | spike: providers + client library | Real-key matrix (§9), AI SDK vs TanStack AI, token-per-turn measurement | — |
| [#1928](https://github.com/bldrs-ai/Share/issues/1928) | spike: relay vehicle + OpenRouter routing | Edge vs v2 Function limits, streaming, `verifyAuth0Bearer` adapter, Blobs atomicity, abort metering | — |
| [#1929](https://github.com/bldrs-ai/Share/issues/1929) | spike: free/cheap model eval | Tool-calling scorecard (accuracy, multi-turn coherence, latency, cost) over the 17 free tool-capable models + 3–5 cheap paid ones, v0 tool schemas on canned scene fixtures, deny-routing check. Picks the default allowlist and the curated `:free` list. Needs `OPENROUTER_API_KEY` | #1674 schemas (drafts are enough) |
| [#1930](https://github.com/bldrs-ai/Share/issues/1930) | provider abstraction + BYOK key store + settings UI | `Provider` interface, four direct providers, key custody, Test/Forget, disclosure panel (§10). Evolves `BotSettings` | #1927 |
| [#1931](https://github.com/bldrs-ai/Share/issues/1931) | OpenRouter PKCE connect | Connect/disconnect, callback route, key into #1930's store | #1930 |
| [#1932](https://github.com/bldrs-ai/Share/issues/1932) | hosted relay `ai-chat` + anonymous identity | Relay (§5), HMAC token, IP-hash, global breaker with free-models overflow, the no-deny free-models path, replay + smoke | #1928, #1929 |
| [#1933](https://github.com/bldrs-ai/Share/issues/1933) | credits ledger + tiers + quota UI + funnel events | Blobs ledger (USD + per-identity free-model request caps), `AI_CREDITS`, meter, `QuotaLimitDialog` upsell, overflow notice, GA events | #1932 |
| [#1934](https://github.com/bldrs-ai/Share/issues/1934) | model selector: free-models opt-in (all tiers) + Pro picker | "Free models (experimental)" choice with its disclosure on every tier; Pro catalog via relay, priced list, unavailable-under-deny handling | #1933, #1930 |
| [#1935](https://github.com/bldrs-ai/Share/issues/1935) | CSP `connect-src` hardening | Site-wide CSP, Report-Only first | — (before "remember key" leaves the flag) |
| [#1936](https://github.com/bldrs-ai/Share/issues/1936) | Create seam contract | Interface + doc only (§11), agreed with Create's E1 MCP surface | #1674 |
| [#1937](https://github.com/bldrs-ai/Share/issues/1937) | assist: Jev intent layer + router (System One decisions) | §12.1. Relay route for the Decisions API, `decide()` client, intent Choice over registry tool names with a confidence threshold, "did X" tray message with undo, and LLM escalation (§12.1). Includes a **Jev-vs-LLM accuracy/latency eval on simple commands** (reuses #1929's harness) calibrates the threshold, and carries the CORS and measured-latency spikes | #1674 (tool registry), #1932 (relay) |
| [#1938](https://github.com/bldrs-ai/Share/issues/1938) | assist: generative UI — declarative spec renderer (json-render + MUI catalog) | §12.2. Share-owned MUI catalog, spec validation, in-tray render, actions bound to registry tool names. Executable code stays with `assist-320` | #1674 (tool registry) |

**Why these cuts.**

- The planning list had one provider/library spike. I split it into #1927
  (client) and #1928 (relay): they need different credentials (five provider
  keys vs an OpenRouter key and a Netlify preview), and #1928 also absorbs the
  Blobs unknowns that gate #1932 and #1933.
- #1929, the model eval, is separate from both: it is a quality measurement,
  not a plumbing check. It can start as soon as #1674's tool schemas are
  drafted, and it also owns the deny-routing check, because that is what
  decides which candidates are routable at all.
- The flag and the bot rename fold into #1672, and eval deletion into
  #1675, rather than a separate "port" story. Those PRs touch the same
  files.
- The disclosure UI rides on #1930, where the transports are chosen.

**Sequencing.** #1674 + #1927 → #1930 → #1675 gives a working BYOK agent with no
server. That is enough for the AI.2 demo on a large model (#1677). #1928 + #1929
→ #1932 → #1933 → #1934 then add the funnel ("drop a model, get free help") and the Pro
anchor. Per conversational-cad.md §6, the hosted half lands after Phase D,
because it rides the quota and billing rails.


## 15. Open questions for Pablo

1. **Budget numbers.** The anonymous, free and Pro budgets and windows in
   §6 are placeholders. They are also the anonymous IP-hash cap and the
   global breaker.
2. **Pro beyond the budget.** Top-ups (buy credit packs), pay-as-you-go
   metered to Stripe, or a hard stop until the window rolls?
3. **Anonymous exposure appetite.** The sizing in §6 puts the anonymous
   breaker at $1 a day (one day of ads) and the free-tier breaker at $2 a
   day. Are those the right multiples of expected spend, and what is the
   hard ceiling as traffic grows? Captcha on token mint from day one, or
   only when the breaker trips?
4. **Naming.** The user-facing name for the assistant (roadmap §10 still
   says "unpicked"), and whether budgets show as dollars, credits or a
   percentage.
5. **Relay vehicle.** Edge Function vs v2 streaming Function. Defaults to
   whichever #1928 shows has the longer stream limit with working Auth0
   verification.
6. **Server preamble / tool pinning** (§5). Accept the preamble? Pin the
   tool schema hash too?
7. **Screenshots on the hosted tier.** Vision tokens are costly. Allow them
   for Pro only?
8. **Create.** In-browser worker vs service (§11), and who owns the E1 MCP
   contract.
9. **Free models.** The free path requires switching on the Bldrs
   account's free-model training setting (§6). Is that acceptable, given
   that it applies only to requests the user opted into, or that overflowed?
   And the per-identity free-model request cap (placeholder: 30 a day).
10. **Generative UI (§12.2).** When does it ship: with `assist-310` or
    later?


## 16. Deferred (named so they are not lost)

- **Sandbox and MCP security for toolbelt apps** (`assist-320`, T11).
  Iframe origin isolation, per-app tool grants and approval, and versioned-app
  provenance (roadmap §10). A section of this doc when `assist-320` starts.
  #1386 is its precondition.
- **Notes vs channels; shared conversation store** (`assist-400`, T10).
  ChannelProvider, and workspace-store.md's record/stream split.
- **Write tools** (`create-310`). Permissioning and preview-before-apply
  (model-edit.md §9).
- **Local models** (Ollama, LM Studio at `http://localhost`). Fit the BYOK
  shape, but need CSP and mixed-content thought. Not requested.
