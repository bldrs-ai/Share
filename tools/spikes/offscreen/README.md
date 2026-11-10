# Render-worker spike on a real GPU (open-205 §9.1)

The container spike (`design/new/offscreen-rendering.md` §5) ran on
SwiftShader with a synthetic pump. This one runs on your machine. It answers
two questions with Share's real numbers.

1. **Busy main thread.** With the engine already in a worker (#2083), does
   Share's remaining main-thread work still cost visible frames and drag
   latency? Would a render worker win those back?
2. **Many views, one active.** The multi-session UI has sessions × model
   layers, each a canvas, with one active at a time. How many WebGL contexts
   can the page keep alive? How fast does an idle view come back? Is one
   worker drawing many scenes into a single context a better shape than one
   worker per canvas?

Neither part is product code. The page is built only so that a deploy preview
serves it.

## Pieces

- **`?feature=mainThreadTrace` in Share** (`src/utils/mainThreadTrace.js`).
  It records from page start:
  - long animation frames, split into the work before rendering and the
    rendering itself;
  - long tasks;
  - its own rAF cadence (the frames a main-thread renderer could get);
  - input delay;
  - load milestones.

  An overlay at the bottom left has **Mark**, **Summary** (written to the
  console) and **Download trace**. The trace has no model name, URL or path.
  Long animation frames are Chromium-only (123+). In Firefox and Safari the
  trace has frames, input and milestones, but nothing to replay.
- **The replay page**, `/spike/offscreen/` on the deploy preview (this
  directory, plus `public/spike/offscreen/index.html`).
  - It replays a trace's non-render main-thread blocks at their original
    times, as fixed calibrated work, or runs the §5 synthetic pump.
  - Meanwhile it draws one `BatchedMesh` scene, on main or in a worker.

## Protocol

Use Chrome or Edge, on a laptop on power, with nothing else heavy running.
Brave works, but it masks the GPU's name (it reports "Brave") and its core
count.

### A. Capture what Share's main thread still does

1. Open a large model on the deploy preview with the trace on, e.g.
   `https://deploy-preview-NNNN--bldrs-share-prod.netlify.app/share/v/…?feature=mainThreadTrace`.
   Do a cold load first. Repeat it as a GLB cache hit after the cache write
   finishes.
2. While it loads, drag the camera continuously. That gives the trace real
   drag delays.
3. Optionally, do a workspace or model switch. Press **Mark** before it and
   after it.
4. Press **Summary** to get the in-Share numbers in the console:
   - frame interval p50/p95/max;
   - the count of frames over 50 ms;
   - main-thread work, split into non-render and render;
   - drag delay;
   - the top scripts.

   Press **Download trace** to save the trace.

### A2. Measure what one repaint costs on your GPU

This step decides the hover-highlight overlay: drawing only the highlight
over a cached frame instead of redrawing the model.

1. Load the model, as in A, and wait for it to settle.
2. Stop the camera, then press **Repaint probe** in the overlay.

The probe forces 60 repaints of the still view. For each one it records:
- the CPU time spent in three's `render` calls;
- the GPU time: from the draw's return until a WebGL2 fence placed after it
  signals;
- the triangles and draw calls, summed over the frame's render calls.

The result appears in an alert, the console and the trace (`repaintProbe`
event).

Do this for PSB, a mid-size model and a small one:
- if PSB's GPU p50 is far above a display frame while its CPU p50 is small,
  the repaint is what a hover change waits for, and the overlay is worth
  building;
- if the GPU time is small too, it isn't.

### B. Replay it against a render worker

1. Open `/spike/offscreen/` on the same preview. Load the trace and pick the
   window: **load** (start to end), **between Marks** (the first to the last
   Mark), **whole**, or **custom**.
2. Use the scene preset **CPU-bound**, as in §5. Leave pacing at **fence,
   two frames in flight**. One frame in flight capped every run at half the
   display rate on an M2: the fence hadn't signalled by the next frame.
   Leave the size at the default (960×600 CSS, at your DPR).
3. Click **Run**, and drag across the picture for the whole of each run.
   The runs are:

   | Run | Render | Main thread |
   |---|---|---|
   | R0 | none | busy (baseline for the busy work's wall time) |
   | R1 | main | busy (today) |
   | R2 | worker | busy |
   | I1 | main | idle |
   | I2 | worker | idle |

4. Repeat B.3 with the **synthetic** source, so the result can be compared
   with §5.
5. Optionally, repeat with pacing **none**. Without a fence, a worker can
   over-queue frames (§5 saw 2–8 s stalls).

### C. Many views

1. Set Views to 20, then to 40, and click **Run views** for each. Both modes
   run.
2. Read these columns:
   - **lost contexts**: the browser's cap on live contexts;
   - **first show**: the upload plus the first frame;
   - **re-show**: an idle view coming back.

### D. Post the results

Click **Copy JSON** and paste the result into the PR. Add the Summary output
from A.4 for each capture. Both include the GPU name and the browser.

## Reading the result

- **R1 against R2:**
  - **Frame intervals:** p95, and the count of frames over 50 ms. This is
    the render worker's direct benefit: frames keep coming while main works.
  - **Input → frame:** expect the gap to be smaller. A drag still waits on
    main to dispatch it, which shows in the "dispatch" column (§1 item 3).
- **Busy wall against R0:** how much rendering on main stretches Share's own
  work.
- **I1 against I2:** what the worker hop costs when main is idle (postMessage
  plus the fence).
- **Many views:**
  - If per-view contexts are lost well before the number of views a
    multi-session UI wants, the design needs either one shared context
    (re-show cost) or eviction of contexts alongside eviction of models.
  - If re-show is fast in both modes, isolation (one worker per active view)
    is affordable.

## Notes

- Input latency is measured from the pointer event's `timeStamp`, which for
  real hardware events is when the OS delivered them. The "dispatch" column
  is a check on that: it should grow with main-thread blocks. The container
  spike could not use this because CDP-injected events are stamped at
  dispatch.
- With fence pacing, a frame's "done" time is the first rAF tick that sees
  its fence signalled. That is up to a frame late, on both threads alike.
- The trace records the tab going hidden and visible. Summaries leave out
  frame gaps the tab spent hidden, and count them separately. A hidden tab
  gets no rAF at all, so an unmarked gap reads as a multi-second stall.
- GPU memory per context is not measurable from a page. Watch Chrome's task
  manager (GPU process) during C if it matters.
