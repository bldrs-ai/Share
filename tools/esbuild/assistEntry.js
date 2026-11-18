import * as path from 'node:path'
import {fileURLToPath} from 'node:url'


// The Assist runtime entry (design/new/ai-workspace.md §9, Amendment 1; D15).
//
// The AI SDK costs ~190 KB gz, and the viewer's cold load must not pay it:
// it is paid when the assistant first sends. The shared config has
// `splitting: false` (common.js; esbuild.test.js pins it), and under that a
// literal `import('…')` is inlined into its importer, so a lazy import from
// the app would still land in `docs/index.js` (+196 KB gz measured by spike
// #1927). Rather than turn splitting on for every build — it requires
// `outdir`, which the worker builds replace with `outfile`, and it would
// change the main bundle's whole shape — `src/assist/runtime.ts` is one more
// entry of the main build. It lands at `docs/assist/runtime.js` (outbase is
// `src/`), beside `index.js`, and the app imports it by a URL built at run
// time (`src/viewer/tools/assistRuntime.js`), which esbuild leaves alone.
//
// Each entry is bundled whole, so the runtime carries its own copy of the
// small Assist modules it uses; it shares no module instances with the main
// bundle, which is why loop.ts recognises the registry's ToolError by shape.
//
// Lives in its own module, like proModules.js, so the tools jest suite can
// test the guard below without standing up a build.

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../../../')

export const ASSIST_RUNTIME_ENTRY = path.resolve(repoRoot, 'src', 'assist', 'runtime.ts')

// What marks the AI SDK in a bundle's inputs, under both node_modules
// layouts: Bun's isolated store (`node_modules/.bun/<pkg>@<v>/node_modules/
// <pkg>/…`, bunfig.toml) and a hoisted one. Plus Assist's own modules that
// import it, so a host importing `src/assist/loop.ts` directly is caught even
// before it drags the package in.
const AI_SDK_INPUT = new RegExp(
  '(^|/)node_modules/(\\.bun/[^/]+/node_modules/)?(ai|@ai-sdk/[^/]+|@openrouter/ai-sdk-provider)/' +
  '|(^|/)src/assist/(loop|transport|runtime)\\.ts$')


/**
 * The inputs of each non-Assist JS output that belong to the AI SDK.
 *
 * @param {object} metafile esbuild's metafile for a build that includes the
 *   main entries (and, normally, the Assist entry, which is exempt)
 * @param {string} [assistEntry] the exempt entry, as an absolute path
 * @return {Array<{output: string, input: string}>} each offending input, by
 *   the output that bundled it; empty when the main bundle is clean
 */
export function aiSdkInputsInMain(metafile, assistEntry = ASSIST_RUNTIME_ENTRY) {
  const exempt = path.relative(process.cwd(), assistEntry).split(path.sep).join('/')
  const offenders = []
  for (const [output, meta] of Object.entries(metafile?.outputs ?? {})) {
    if (!output.endsWith('.js') || !meta.entryPoint || meta.entryPoint === exempt) {
      continue
    }
    for (const input of Object.keys(meta.inputs ?? {})) {
      if (AI_SDK_INPUT.test(input)) {
        offenders.push({output, input})
      }
    }
  }
  return offenders
}


/**
 * Fail the build when the AI SDK reaches a main entry's bundle.
 *
 * @param {object} metafile
 * @throws {Error} naming the first few offending inputs
 */
export function assertAiSdkNotInMain(metafile) {
  const offenders = aiSdkInputsInMain(metafile)
  if (offenders.length > 0) {
    const shown = offenders.slice(0, 5).map(({output, input}) => `  ${output} <- ${input}`).join('\n')
    throw new Error(
      `The AI SDK is in a main bundle (${offenders.length} inputs). It must load lazily, from ` +
      `docs/assist/runtime.js only: import src/assist/runtime.ts through ` +
      `src/viewer/tools/assistRuntime.js, never directly (tools/esbuild/assistEntry.js).\n${shown}`)
  }
}
