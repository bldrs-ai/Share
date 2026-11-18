# Assist 310 triage

**Status:** issue normalization applied 2026-11-18; stories other than #1672, #2194 and #2195 keep their original technical bodies until they are next worked.
**Scope:** reconcile `assist-310` with the [UX rubric](ux-rubric.md), the [workspace requirements](workspace.md) and the existing issues.

For the epic's motivation and story list, see the [Assist 310 snapshot](assist-310.md). This record keeps the evidence for the decisions; delivery state and tasks live in the linked issues.

## Epic, tier and aliases

The epic is [#1659](https://github.com/bldrs-ai/Share/issues/1659), retitled `assist-310: Conversational agent panel (single-user)` (it was `epic: assist-310: …`; the `epic` label carries the type, as on #670). No duplicate epic exists.

| Code | Where | Meaning |
|---|---|---|
| `assist-110` | roadmap v0.3–v0.5 | This epic, before the AI band was renumbered |
| `assist-310` | roadmap v0.6 onward | This epic |
| `search-310` | roadmap §4.5 | Knowledge graph; absorbed, since natural-language questions are this epic's job and the graph becomes its retrieval layer (Track T10) |
| "Bot", `?feature=bot` | 2025 prototype (PRs #1391, #1447, #1452) | The chat prototype this epic replaces; `bot` stays an alias of `?feature=assist` (#1672) |

**Tier.** The 3xx band (Pro): a power capability with its own product case, outside the MVP bar (roadmap §6.0; Track T10 "MVP impact: none"). The roadmap's validation target is large-model users running the assistant on models they can't open anywhere else, and paying (§7.5). Nothing here moves it.

## Inventory

Searched on 2026-11-18, open and closed, with `repo:bldrs-ai/Share is:issue` and each of: `assist`, `bot`, `"feature=bot"`, `BotChat`, `chatbot`, `convo`, `conversation`, `conversational`, `tray`, `agent in:title`, `"assist-310"`, `"assist-110"`, `AI in:title`, `LLM`, `openrouter`, `BYOK`, `Jev`, `MCP`, `assistant`, `"knowledge graph"`, `session in:title`, `thread in:title`, `chat in:title`, `resume`, `"sessions apart"`, `credits`, `"tool registry"`, `"element chips"`, `W7`. No result set was incomplete. Explicit links were followed from #1659, its 19 children, #1919 and #1660.

Found, beyond #1659's 19 children: the legacy bot bugs [#1821](https://github.com/bldrs-ai/Share/issues/1821) and [#1822](https://github.com/bldrs-ai/Share/issues/1822); neighbouring epics `assist-300` (#1657, with #2193 created today), `assist-400` (#1660, children #1678–#1680), `create-310` (#1919, no children) and `open-210` (#2192). The rest of each result set is other features, unchanged.

## Milestone audit

None of #1659's children, #1821 or #1822 has a milestone. Of the repository's 49 milestones, two matched these terms: [Bldrs Bot · 69](https://github.com/bldrs-ai/Share/milestone/69) holds seven open image-generation issues (#653, #654, #678, #679, #725, #726, #880), the Stable Diffusion work behind `create-100` Imagine, not this assistant; [Search 100: Permalinks · 55](https://github.com/bldrs-ai/Share/milestone/55) is permalink search. Both are out of scope and unchanged. [Create 100: Imagine · 46](https://github.com/bldrs-ai/Share/milestone/46) and [Collab · 64](https://github.com/bldrs-ai/Share/milestone/64) were also checked; out of scope.

## Crosswalk

Sources, pinned to `b16672d`: [workspace.md](https://github.com/bldrs-ai/Share/blob/b16672d75172203544b20ca9273fe538d76845d8/design/reqs/workspace.md) (its three `assist-310` stories), [ai-workspace.md §14](https://github.com/bldrs-ai/Share/blob/b16672d75172203544b20ca9273fe538d76845d8/design/new/ai-workspace.md#14-testing-and-story-breakdown) (story table) and [conversational-cad.md §4](https://github.com/bldrs-ai/Share/blob/b16672d75172203544b20ca9273fe538d76845d8/design/new/conversational-cad.md#4-epic-3--conversational-cad-assist-310--t10t11).

| Source | Owning issue | Decision |
|---|---|---|
| workspace.md "Start a session on some of a project's models" | #1672 | Extend: rescoped, original kept collapsed |
| workspace.md "Resume a session" | #2194 (new) | Created after the duplicate search found none |
| workspace.md "Keep sessions apart" | #2195 (new) | Created after the duplicate search found none |
| §14 #1672 tray + threads; conversational-cad §4 "Convo tray + drawer threads" | #1672 (tray, threads); #2193 (listing in the drawer, `assist-300`) | Split by owner |
| §14 #1675 agent loop; §4 "Conversation drives the UI" | #1675 | Formal story |
| §14 #1673; §4 "Permalink anchors in messages" | #1673 | Formal story |
| §14 #1676; §4 "Reduced tool set" | #1676 | Formal story, droppable |
| §14 #1677; §4 "Demo bar" | #1677 under #1675 | Its large-model acceptance |
| §14 #1930, #1931 | #1930, with #1931 under it | One user goal: your own provider account |
| §14 #1932, #1933 | #1933, with #1932 under it | #1933 holds the meter, limit dialog and overflow notice the person sees; the relay serves it |
| §14 #1934, #1937, #1938 | same | Formal stories |
| §14 #1671, #1674, #1927–#1929, #1935, #1936 | same | Support, linked from #1659 |
| §14 "to file": View extraction, Assist repo extraction | none | Not filed; no story issue exists or is created here |
| §4 "Persistence: per-model conversation log" | #1672, #1662 | Superseded: kept per session ([workspace-sessions.md](../new/workspace-sessions.md) §9) |

**Why #1672 became "Start a session".** A session is the conversation thread (decided 2026-11-18), so #1672's "drawer threads" and a session are one object; a separate tray story would split one conversation across two issues. #1672 had no comments or work yet, and [workspace-sessions.md §7](https://github.com/bldrs-ai/Share/blob/b16672d75172203544b20ca9273fe538d76845d8/design/new/workspace-sessions.md#7-build-order) step 7 already gave it "the conversation in the session". The tray tasks stay in it; the drawer listing went to #2193.

**Why the rest are or aren't stories.** A story is a goal the person sees. #1675's agent loop, #1933's credits and #1937's instant commands were titled after their mechanism but each has a plain user goal, so they keep their numbers under user-facing titles. The tool surface (#1674) serves #1675, #1937, #1938 and #1936 and belongs to Track T11 with `assist-320` and `apps-300`; the spikes and CSP serve several stories; #1671 and #1936 are documents. These are linked references, not children.

## Applied changes

Titles (all retitled from `story: assist: …`): #1672, #1673, #1675, #1676, #1930, #1933, #1934, #1937, #1938 now carry the user-facing titles in the snapshot; support issues keep a descriptive title with the prefix: #1671 `assist-310: design doc ai-workspace.md (…)`, #1674 `assist-310: viewer tool surface v0 (read and view tools, Track T11)`, #1677 `assist-310: large-model demo fixture and E2E`, #1927–#1929 `assist-310: spike — …`, #1931 `assist-310: connect an OpenRouter account instead of pasting a key (OAuth PKCE)`, #1932 `assist-310: hosted relay ai-chat and anonymous identity`, #1935 and #1936 the old title under the new prefix. #1821 and #1822 keep their bug titles.

Hierarchy:
- Detached from #1659 to linked references: #1671, #1674, #1927, #1928, #1929, #1935, #1936.
- Moved from #1659 under a story: #1677 → #1675, #1931 → #1930, #1932 → #1933.
- Newly parented: #1821 → #1675 (the bot isolate bug goes with the bot port's actions); #2194 and #2195 created under #1659 with the `story` label.

Bodies: #1659 and #1672 rewritten, each original verbatim in a collapsed `Original description`. Labels: none changed. The detached and nested issues keep `story` from their creation, as #881 kept its labels in the Notes pilot; the hierarchy, not the label, now says what each is. States, milestones and checkboxes untouched.

Result, checked after the writes: #1659 has exactly the 11 stories in the snapshot; #1675 has #1677 and #1821; #1930 has #1931; #1933 has #1932.

## Ownership, decided

The owner settled all three on 2026-11-18:

| Issue | Decision and what was done |
|---|---|
| [#1822](https://github.com/bldrs-ai/Share/issues/1822) | Stays with `assist-310`, nested under #1675 beside #1821. Closed as completed by #2199, which removed the [`new Function`](https://github.com/bldrs-ai/Share/blob/b16672d75172203544b20ca9273fe538d76845d8/src/Components/Bot/BotChat.jsx#L189) path, replaced `client_code` with the tool registry and took the key out of `localStorage`. The [closing comment](https://github.com/bldrs-ai/Share/issues/1822#issuecomment-6992444818) maps each part. |
| [#1936](https://github.com/bldrs-ai/Share/issues/1936) | Moves to `create-320`. Now a sub-issue of #1920 and retitled `create-320: Create seam contract (remote tool provider)`; #1659 no longer links it as its support. |
| [#1674](https://github.com/bldrs-ai/Share/issues/1674) | Sits under a Track T11 issue. [#2225](https://github.com/bldrs-ai/Share/issues/2225) was created in the shape of the other track issues (#2201–#2204: `Tracking` label, Status, Remaining work, Related), with #1674 and #1386 as its sub-issues. |

Epic-level open decisions (budgets, generative UI timing, #1676, the ref separator) are listed in #1659.

## Source evidence

Source inspection at `b16672d` only; nothing was run. The tool contract and registry are in [`src/assist/`](https://github.com/bldrs-ai/Share/tree/b16672d75172203544b20ca9273fe538d76845d8/src/assist) and the view and share tools with their desktop and mobile spec in [`src/viewer/tools/`](https://github.com/bldrs-ai/Share/tree/b16672d75172203544b20ca9273fe538d76845d8/src/viewer/tools) (#1674 slice 1, PR #1946). The [`assist` flag](https://github.com/bldrs-ai/Share/blob/b16672d75172203544b20ca9273fe538d76845d8/src/FeatureFlags.js#L42-L49) gates only the dev hook. The prototype chat is still [`src/Components/Bot/`](https://github.com/bldrs-ai/Share/tree/b16672d75172203544b20ca9273fe538d76845d8/src/Components/Bot). No tray, agent loop, relay or session existed at that commit; the agent loop has since landed (above).

## Since the reconciliation

Later on 2026-11-18, from the implementation session and checked on GitHub and `main` @ `6c8bda5`:

- **PR #2199 merged** ([`c34ff58`](https://github.com/bldrs-ai/Share/commit/c34ff588)): the agent loop over the tool registry, run by the Bot panel. The owner closed #1675 and #1821; #1677 stays open under #1675. The loop also removed BotChat's `new Function` eval ([`BotChat.jsx`](https://github.com/bldrs-ai/Share/blob/6c8bda5c/src/Components/Bot/BotChat.jsx#L55-L66)), which is #1822's subject.
- **PR #2219 (draft):** `model.quantities`, `model.measure` and `model.spatial`, slice 2 of #1674. It partly addresses #1674, which stays open for the STEP ref-contract slice, and closes no story. The tools are read-only, reuse `refs.js` for refs, and add their rows to ai-workspace.md's v0 tool table.
- **PR #2220 (draft): the hosted relay and credits.** It implements #1932, the `ai-chat` relay with anonymous identity, and the server half of #1933: a reserve-then-settle credit ledger on Netlify Blobs, daily breakers per tier, and tier budgets defined once in `src/quota/aiCredits.js`. #1933's UI (the credits meter and the upsell dialog) is still open, so #1933 is partly addressed. It closes no story.
- **Conway bug found on the way:** Conway returns `IfcSIUnit`'s attributes shifted by one slot (for `IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)`, `UnitType` reads `MILLI` and `Prefix` reads `METRE`). #2219 works around it by classifying the enum values; the implementation session is filing it in conway.

## Milestone hypothesis

- **Hypothesis:** a session that can be resumed keeps an analysis going across visits, and that is what makes the assistant worth paying for on a large model (workspace.md; roadmap §7.5).
- **Metric:** sessions resumed at least once within 7 days; secondary, assistant turns per session on models over the large-model size bucket.
- **Test:** while the panel is behind `?feature=assist` there is no population to hold out from. Once it ships, a randomized holdout of the resume entry point; otherwise a regression on observed use controlling for tier, source, model size and prior engagement, labelled correlational.
- **Current estimate:** not instrumented yet. Measurement planning belongs in bizdev, per the rubric.

The epic is outside §6.0 and no 1xx story was added, so §6.0 is unchanged.
