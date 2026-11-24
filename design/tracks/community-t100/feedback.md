# Feedback to Bldrs

How a user tells Bldrs something about Share: a rating, a short note, an
opt-in screenshot of the 3D view, and what the app knows about where they
were. One module serves every place in the app that asks for feedback. The
assistant's thumbs under a reply (Share#2306, epic `assist-310` #1659) are
its first client. The app-wide feedback item (Share#2312) is the next.
It is the design doc of Track `community-t100` (#2330,
[snapshot](README.md)).

Written 2026-11-24 with #2306. The owner decided the split below on the
issue: GA gets structured counts, and the text goes to a Bldrs store.

## Why two sinks

Feedback is useful in two ways, and they need different stores.

- **Counts** (how many down-ratings this week, on which tier, with which
  model): GA, through `gtagEvent` (`src/privacy/analytics.js`), behind the
  analytics consent check like every event.
- **Content** (what the reply said, what the user asked, what they wrote,
  what the view looked like): a record in Bldrs' own Netlify Blobs store,
  posted to the same-origin `feedback` function. A quality task reads it.
  For the assistant, it groups the records and files actionable ones as QA
  issues under #1659, as owner testing on 2026-11-23 did by hand (#2268,
  #2305).

Content can't go to GA. CLAUDE.md "Reported Conditions" → Privacy keeps a
private model's file name, URL or path out of every sink, and
`ai-workspace.md` §10 keeps conversation text out of analytics. GA's terms
also bar PII, and nobody can check free text for it. The two sinks share
only `feedback_id`, a random UUID made for each record.

## Module

All of it is in `src/feedback/`. A source composes these pieces and adds
only what is its own.

| File | What it is |
|---|---|
| `feedbackRecord.js` | The record's shape and its validation, shared by the page and the function. No imports, runs in both. |
| `submitFeedback.js` | `submitFeedback({source, rating?, note?, screenshot?, context, isAuthenticated})` builds the record, sends GA `feedback_submitted`, posts it, and returns `{ok, record}`. `postFeedback(record)` retries a failed post without telling GA again. `reportFeedbackFailure` sends `feedback_failed`. |
| `feedbackView.js` | `feedbackView(state)`: the view snapshot (model ref, camera, selection) and the names to withhold from text. |
| `captureScreenshot.js` | `captureViewerScreenshot({source})`: an opt-in JPEG of the 3D view, or null with a counted failure. It sits on `viewer/frameCapture.js`. |
| `FeedbackNote.jsx` | The note area. It holds the note field, "Attach screenshot", the attached thumbnail with its × badge, the helper text that says what is shared, the quiet hint line, and Cancel and Send. |

`submitFeedback` returns the built record. If the post failed, the caller
keeps it and sends it again with `postFeedback`. GA has already counted the
rating once, and `feedback_failed` counts the lost post.

## Record

One JSON object per piece of feedback. Every field is required.

| Field | Type | Notes |
|---|---|---|
| `v` | `1` | The shape's version |
| `feedback_id` | UUID | The blob's key, and the only field GA also gets |
| `source` | `assist_reply` \| `general` | Which place sent it; it picks the `context` allowlist |
| `rating` | `up` \| `down` \| `none` \| `null` | `none` retracts an earlier rating and carries no note or screenshot. `null` is feedback with no rating. Each source says which values it takes. |
| `note` | string, ≤ 1000 | Trimmed, with model names withheld |
| `screenshot` | JPEG data URL, ≤ 450 000 chars, or `null` | Only when the user attached one |
| `view` | `{model: {route_kind, source, format, ref}, camera: {position, target} \| null, selection: {count, refs, types}}` | `ref` is set only for Share's hosted files. Selection refs are capped at 50 and types at 10. |
| `tier` | `anon` \| `free` \| `pro` | The sign-in tier (`modelActionTier`) |
| `context` | per source | Exactly the source's allowlisted keys (below) |

The function adds `at`, the time it stored the record. The page's clock is
not trusted for it.

A record must say something: a rating, a note or a screenshot. A key the
schema doesn't name is refused, in the record, in `view` and in `context`.

| Source | `context` keys | Ratings |
|---|---|---|
| `assist_reply` | `reply_id` (the bubble's id), `reply` (≤ 8000), `prompt` (≤ 4000), `model_choice` (`default` \| `free_models` \| `picked` \| `byok`), `steps`, `tool_calls` | `up`, `down`, `none`. An up or down rating carries the reply. |
| `general` | none for now (Share#2312 decides) | `up`, `down`, `null` |

## The function

`netlify/functions/feedback.js` (v2) takes `POST` JSON and answers as
follows:

- `204`: stored, or already stored under that id.
- `400 invalid_feedback`: the body isn't exactly a record of a known source.
- `403 feedback_forbidden_origin`: the request came from a browser on
  another site.
- `405`: anything but `POST`.
- `413 feedback_too_large`: the body is over 512 KiB, either as declared in `Content-Length` or as counted in bytes while it streams (`_lib/readCappedBody.js`). A chunked or multibyte body is stopped at the cap, never buffered whole.
- `500 feedback_not_configured`: the store wouldn't open.
- `502 feedback_store_failed`: the write failed. The page offers a retry.

Mechanics:

- **Order of checks.** The function checks the shape, then the Origin
  (`_lib/aiOrigin.js`, the relay's rule), then opens the store. So the
  deployed smoke probe's `{}` is answered `400` without touching storage.
- **Storage.** The Blobs store is `feedback`, with one blob per record,
  keyed by `feedback_id`.
- **Write.** The write is `set(id, JSON, {onlyIfNew: true})`. A retried
  post finds its blob and answers `204`. Someone who learnt an id from GA
  can't overwrite the record. It is `set`, not `setJSON`, for the
  @netlify/blobs 10.7.4 trap that `_lib/aiLedger.js` describes.
- **Logs.** The function logs the source and the rating, never the text.
- **Store client.** The store is opened inside the handler, never at
  module scope (netlify-functions-testing.md).

Tests:

- `_tests/feedback.test.js`: mocked unit tests through the real Blobs
  client and `fakeBlobs.js`, including each source's allowlist.
- Replay scenarios in `_tests/replay/feedback/`, against both the source
  and the bundle.
- The `feedback/invalid-feedback` smoke probe.

## Privacy

Free text (the note, and a source's text context such as the assistant's
reply and prompt) passes two layers for any model that isn't one of Share's
hosted files (route kind other than `project`), and for no model at all. A
hosted model's text is public and is kept as written.

1. **The precise layer** withholds the names and paths Share knows for the
   model on screen (`privacy/sentryRedaction.js#withholdModelNames`, below).
2. **The structural backstop** (`privacy/textScrub.js#scrubLocations`) then
   withholds whatever looks like a location, whatever it names. Three
   review rounds on #2313 each found a form the precise layer didn't list
   (a decoded URL, a query-free one, a standalone pathname), so the
   backstop answers the class rather than the next variant:
   - any URL (`scheme://…`: http, https, s3, file, …) and `www.` host, as
     `(link withheld)`;
   - Windows paths (`C:\…`, `\\server\…`) and any token with two or more
     `/` (`/a/b`, `/private/`, `a/b/c.ext`) or starting `~/`, `./`, `../`,
     as `(path withheld)`;
   - any token ending in a model or archive extension (`supportedTypes` in
     `Filetype.js`, plus `zip` and `gz`), with up to three capitalised words
     before it so a spaced name goes whole, and any quoted span ending in
     one, as `(file name withheld)`.

   It leaves prose alone: words, numbers, dates (`11/24/2026`), a single
   `and/or`, a bare `.ifc`, element refs (`e123`, `o1.2.3`) and the
   assistant's `ref:` links, scene-graph name paths included
   (`ref:nScene/Door`), since `ref:` is the element-link scheme, not a URL.
   It over-redacts rather than leaks: a capitalised word just before a file
   name can go with it.

The precise layer's names:

- **Model names.** For any model that isn't one of Share's hosted files,
  the page withholds the model's names and paths from every text field.
  These are:
  - the route's paths and the Share link, each as stored, percent-decoded,
    without its query and hash, both, and each of those without its scheme;
  - the file name (raw, decoded and encoded) and its stem when it has at
    least 4 characters;
  - for a URL model, the folder it sits in and its host (not for the other
    kinds, whose hosts are GitHub's, Google's or Share's);
  - for GitHub, `owner/repo`, the owner, the repo and a non-default branch;
    for Drive, the file id and resource key;
  - the tree root's name. A root label Loader
  composes as `<scene> (<file>)` is also withheld in parts, and for a local
  upload, whose route holds only a storage UUID, the original file name is
  looked up (`loader/uploadedFileName.js`, as Loader does for the label), so
  a bare `Secret.glb` or `Secret` in the text is caught. The helper is
  `privacy/sentryRedaction.js#withholdModelNames`, and the page keeps the
  real names. The page can't tell a private GitHub repo or a signed URL
  from a public one, so the model `ref` is withheld for everything but
  route kind `project`. Selected elements of such a model go as `e<id>`,
  never as scene-graph name paths. Free text can still name things the
  page doesn't know about, which is why the helper text says what is
  shared.
- **Screenshot.** The page takes one only when the user presses "Attach
  screenshot", and the user can remove it with the × before sending. It
  goes only into the record. GA hears `has_screenshot`, a boolean, and
  nothing else.
- **Disclosure.** The helper text under the note says what is shared with
  Bldrs, and why, at the moment the user decides to send. The assistant's
  reads: "This reply, your message before it, your note, the view and any
  screenshot are shared with Bldrs to improve the assistant."
- **Consent.** The record is sent whatever the analytics setting is. The
  user sending feedback is the consent, and the note area says what is
  shared. The GA events follow the analytics setting, as every event does.

### Screenshot capture

`viewer/frameCapture.js#captureViewerFrame` reads the main canvas, so the
image is what the user sees, look and outlines included.

`ShareViewer#takeScreenshot` was not used. It renders again through a
second WebGLRenderer, which uploads every geometry to a second GL context
and skips the composer.

The capture works like this:

1. The renderer has no `preserveDrawingBuffer`, so the canvas holds a frame
   only within the task that painted it.
2. The capture asks for a paint (`RenderDemand#invalidate`). See DESIGN.md
   §"Render loop & perf monitor".
3. It copies the canvas from `observePaints`' `afterPaint`, in that paint's
   own task. The copy is at most 1280 px on the long side, on white, since
   the canvas is transparent and JPEG has no alpha.
4. It encodes the copy as JPEG on a later task. It tries quality 0.8, then
   0.6, then 0.4, and keeps the first that fits under the record's cap.

A capture can fail where the GPU or browser won't give the frame up:

- `no_viewer`: no viewer or render demand.
- `timeout`: no paint within 3 s.
- `encode`: no 2D context or JPEG encoder.
- `too_large`: still over the cap at 0.4.

These failures are expected on some setups. The user gets a quiet hint,
"Couldn't capture the view.", and GA gets one `feedback_failed`. Nothing
goes to Sentry.

## GA events

| Event | Params | Fires |
|---|---|---|
| `feedback_submitted` | `feedback_id`, `feedback_source`, `rating` (left out when null), `has_note`, `has_screenshot` (`'true'` \| `'false'`), `tier`, `source` and `route_kind` of the model (when known); for `assist_reply` also `model_choice`, `steps`, `tool_calls` | `submitFeedback`, once per record: one per rating change |
| `feedback_failed` | `feedback_source`, `stage` (`send` \| `screenshot`), `reason` (`network` \| `http` for a send, a `CAPTURE_FAILURES` value for a screenshot), `status` (refused send), `feedback_id` (send) | `postFeedback` on a failed post (again on each failed retry); `captureViewerScreenshot` on a failed capture |

The feedback's own source is `feedback_source`, not `source`. GA keys a
custom dimension by parameter name, and `source` already means the model's
source (`local` \| `hosted`) on the normalized model events (quotas.md
§"Analytics: normalized tier events"). This event sends that too.

A source's GA extras are picked from its context in
`submitFeedback.js#SOURCE_SPECS`, and they hold only counts and closed sets.
The tests assert that no text, screenshot or model name reaches GA.

GA-side, register event-scoped custom dimensions for `feedback_source`,
`rating`, `has_note`, `has_screenshot`, `model_choice` and `stage`, and
numeric metrics for `steps` and `tool_calls`. `tier`, `source`,
`route_kind` and `reason` are already registered. quotas.md §"Funnel
analytics" keeps the list.

## Adding a source

1. **Record.** Add the source to `FEEDBACK_SOURCES` and its entry to
   `CONTEXT_CHECKS` in `feedbackRecord.js`: its context keys, the ratings
   it takes, and a check for each key. Keep the context structured. A
   free-text field needs a cap and an entry in step 2.
2. **Client.** Add its entry to `SOURCE_SPECS` in `submitFeedback.js`: its
   free-text context fields with their caps (they get the model-name
   withholding), and its GA extras.
3. **UI.** Compose `FeedbackNote` with the source's own entry point and its
   helper text (what is shared, with Bldrs, and why), and call
   `submitFeedback`.
4. **Tests.**
   - A row in `_tests/feedback.test.js` for its accepted and refused shapes.
   - A replay scenario for a stored record.
   - Module unit tests for its context and GA extras.
   - The UI's unit tests and a desktop and mobile E2E
     (`describeMobileAndDesktop`).

### Worked example: the assistant's thumbs

- **Entry point.** `Components/Bot/ReplyFeedback.jsx`, on each turn's last
  reply bubble once the turn has ended (`assistFeedback.js#ratableReplyIds`).
  The thumbs are hidden until the reply is hovered or focused, and always
  shown on touch screens and in the phone layout
  (`BotChat.jsx#REPLY_GROUP_SX`).
- **Choosing.** A thumb fills, and the note area opens. Send rates the
  reply. Choosing the other thumb rates again with a new record, and
  choosing the filled thumb with no note open sends a `none`.
- **Context.** `assistFeedback.js#replyContext` reads it from the chat: all
  of the turn's reply bubbles, the user message before the turn, and the
  steps and model class that `runTurn` stamps on the bubbles when the turn
  ends. The steps are the turn's distinct step ids, and the tool calls are
  its task chip's tasks.
- **One post at a time.** The thumbs are disabled while a rating, a clear
  or a clear's retry is posting, so the latest record in the store is the
  one the reply shows. A newer rating drops a failed post's retry. The
  posts in flight and a failed post's record (a rating or a clear) are held
  at module scope (`assistFeedback.js#replyFeedbackPosts`), not in the
  component, because closing the panel or switching phone tabs unmounts it
  while the post runs on or after it failed. A reopened reply still shows
  "Try again" for the same record. Choosing the filled thumb of a rating
  that never landed takes it back without posting a `none`.
- **Captures belong to their draft.** In the note area, Enter and Send
  share one condition, so neither sends while a screenshot the user asked
  for is still being captured. A capture that lands after its note area
  closed (Cancel), or after a newer capture started, is dropped, and the
  thumbs bind each screenshot to the draft that asked for it.
- **Remembering.** The rating is kept on the bubble in `assistChat`, so the
  filled thumb survives the panel unmounting. It does not survive a reload:
  the session log snapshots a turn's bubbles when the turn ends.

### Next client: the general feedback item (Share#2312)

The `general` source is in the schema and the function now, with an empty
context, so #2312 can build its UX on what's here. That work is:

- the entry point;
- its helper text;
- deciding whether it rates or only takes a note;
- any context fields it needs, added through §"Adding a source".

## Open work

What is left (a reader for the quality task, retention, a rate limit,
and a rating that survives a reload) is tracked in the track issue,
[#2330](https://github.com/bldrs-ai/Share/issues/2330), and its work item
[#2329](https://github.com/bldrs-ai/Share/issues/2329), not here.
