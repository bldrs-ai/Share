import {importModuleFromUrl} from '../../export/importModuleFromUrl'


/**
 * Load the GFM plugin for assistant replies (remarkGfmEntry.js) on first use.
 * The URL is built at run time, beside this bundle's `index.js`, for the
 * reason assistRuntime.js gives: the build doesn't split, so a literal
 * `import()` would be inlined into the main bundle.
 *
 * @return {Promise<Function>} the `remark-gfm` plugin; rejects if it can't be fetched
 */
export function loadMarkdownGfm() {
  if (!gfm) {
    gfm = importModuleFromUrl(new URL('./Components/Bot/remarkGfmEntry.js', import.meta.url).href)
      .then((module) => {
        loaded = module.default
        return loaded
      })
    // A failed fetch must not stick: the next reply retries.
    gfm.catch(() => {
      gfm = null
    })
  }
  return gfm
}


/**
 * The plugin if `loadMarkdownGfm` has already resolved, else null. Lets a
 * component seed its state synchronously: BotChat re-parents a reply's bubble
 * when it becomes ratable (#2313), which remounts AssistantMarkdown, and a
 * remount that had to wait on the promise again rendered one commit without
 * GFM (a table as raw pipes).
 *
 * @return {?Function} the `remark-gfm` plugin, once loaded
 */
export function loadedMarkdownGfm() {
  return loaded
}


let gfm = null
let loaded = null
