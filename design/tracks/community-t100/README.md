# `community-t100`: Feedback pipeline

> **Snapshot, 2026-11-24.** Status, progress and open decisions are kept in the track issue, [#2330](https://github.com/bldrs-ai/Share/issues/2330). This page changes only when the track's work items do ([tracks rubric](../tracks-rubric.md) §"Docs in the repo").

**Primary:** `community` (`community-110` Analytics and feedback, #2294). **Also serves:**
- `assist-310`, the in-page agent (#1659), whose reply rating (#2306) was the pipeline's first client;
- `community-200`, bug reports with a screenshot and session state (#2295).

**Related track:** `assist-t300` (#2303), which holds the agent session log that a reply's rating is written into.

## Why

Share asks for feedback in several places: under an assistant reply, from an app-wide "Send feedback" item, from an exit thumbs widget, and in a bug report. Each place needs the same things:
- a rating and a note;
- a screenshot the user opts into;
- the view the user was looking at;
- private model names kept out of the text;
- a count in GA and the content in a Bldrs store.

One pipeline does all of this. A new place adds only its UI and the list of context fields it may send.

## End state

- **The client module.** Every feedback surface records through one module, `src/feedback/`.
- **The store.** One same-origin function writes each record once (`onlyIfNew`) into a Netlify Blobs store, and refuses any context field the source doesn't allow.
- **Privacy.** Free text loses the model names Share knows and anything shaped like a location before it leaves the page.
- **Analytics.** GA gets only structured fields; the screenshot goes only to the store.
- **Reading.** A quality task reads the store through a secret-gated reader, and files actionable reports as QA issues.
- **Retention and limits.** Records are kept for a bounded window, and a flood from one IP is refused.

## Work items

These are the sub-issues of #2330.

| Work item | What becomes possible | Evidence |
|---|---|---|
| [#2329](https://github.com/bldrs-ai/Share/issues/2329) `community-t100`: read, retain and rate-limit stored feedback; keep ratings across a reload | The quality task reads records, old ones are deleted, a flood is refused, and a reply's rating is still shown after a reload. | Mocked and replay tests for the reader, retention and the `429`; an E2E on desktop and mobile that rates, reloads and still sees the rating. |

Planned, with no issue yet (they stay lines on #2330 until someone picks them up):
- the `general` source's context allowlist and ratings, once #2312 settles rating versus category;
- bug reports as a source (`community-200`, #62): what goes to a public issue and what stays in the store.

**Landed:** the module, the function, the screenshot capture, the privacy layers and the `assist_reply` source (#2313, for #2306).

## Stories that use it

These stories stay under their own epics:
- #2306 (`assist-310`, closed): rate an assistant reply.
- #2312 (`community-110`): send feedback from anywhere in Share.
- #61 (`community-110`): the thumbs exit widget and survey link.
- #62 (`community-200`): report a bug.

## Design and code

- [feedback.md](feedback.md): why two sinks, the module, the record and each source's allowlist, the function's answers, the privacy layers, screenshot capture, the GA events and the Reported Conditions.
- [quotas.md](../../new/quotas.md) §"Feedback events": the GA events next to the other funnel events.
- [ai-workspace.md](../../new/ai-workspace.md) §10: why conversation text stays out of analytics.
- Code at [`d1faec36`](https://github.com/bldrs-ai/Share/tree/d1faec36fded4757ad4a7814b5379ac4cfbbe756):
  - [`src/feedback/`](https://github.com/bldrs-ai/Share/tree/d1faec36fded4757ad4a7814b5379ac4cfbbe756/src/feedback): the client module;
  - [`netlify/functions/feedback.js`](https://github.com/bldrs-ai/Share/blob/d1faec36fded4757ad4a7814b5379ac4cfbbe756/netlify/functions/feedback.js): the store;
  - [`src/privacy/textScrub.js`](https://github.com/bldrs-ai/Share/blob/d1faec36fded4757ad4a7814b5379ac4cfbbe756/src/privacy/textScrub.js): the location scrub;
  - [`src/viewer/frameCapture.js`](https://github.com/bldrs-ai/Share/blob/d1faec36fded4757ad4a7814b5379ac4cfbbe756/src/viewer/frameCapture.js): the screenshot.
