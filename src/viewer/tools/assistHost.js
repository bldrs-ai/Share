import {ToolError, createRegistry} from '../../assist'
import useStore from '../../store/useStore'
import {createShareToolProvider} from './shareTools'
import {createViewContextSource} from './viewContext'
import {createViewToolProvider} from './viewTools'


/**
 * Share as an Assist host (ai-workspace.md §2.1, D15): Share imports Assist
 * and injects its tool providers and context sources. This is the one place
 * they are assembled, so the dev hook below, and later the agent loop
 * (#1675), see the same registry.
 *
 * @return {object} the Assist registry over Share's providers
 */
export function createShareAssistRegistry() {
  return createRegistry(
    [createViewToolProvider(), createShareToolProvider()],
    {contextSources: [createViewContextSource()]})
}


/**
 * Install `window.__bldrsAssistTools`, for Playwright and the console to
 * drive the tools before there's a tray to drive them from. CadView installs
 * it only under `?feature=assist`.
 *
 *   list()             tool descriptors (name, description, schema, policy)
 *   call(name, input)  → {ok: true, content, echo, refs, undoable}
 *                      | {ok: false, error: {code, message, details}}
 *   undo()             reverses the most recent undoable call; → true, or
 *                      false with nothing to undo; rejects if the undo failed
 *   context()          context blocks
 *
 * Results cross `page.evaluate` as plain data, which is why `undo` is a
 * stack here instead of the function each result carries. The stack is
 * emptied whenever the store's viewer or model changes: CadView (and so
 * this hook) stays mounted while the route loads another model or a theme
 * change rebuilds the viewer, and an entry for the old one has nothing left
 * to restore (Codex review on #1946; each undo also
 * refuses on its own — viewTools.js `undoWhileLoaded`). Tools whose policy
 * is 'confirm' are refused: this hook has no approval card, and none of the
 * v0 tools needs one.
 *
 * @param {object} [target] where to install (the window)
 * @return {Function} uninstall
 */
export function installAssistDevHook(target = window) {
  const registry = createShareAssistRegistry()
  const undos = []
  const unsubscribe = useStore.subscribe((state, previous) => {
    // A new viewer is stored before its model loads (viewTools.js
    // `undoWhileLoaded` has the sequence), so either change ends the stack.
    if (state.model !== previous.model || state.viewer !== previous.viewer) {
      undos.length = 0
    }
  })
  const failure = (e) => ({
    ok: false,
    error: e instanceof ToolError ? e.toJSON() : {code: 'error', message: String(e?.message ?? e), details: {}},
  })
  target.__bldrsAssistTools = {
    list: () => registry.list(),
    call: async (name, input) => {
      try {
        if (registry.has(name) && registry.policyOf(name) === 'confirm') {
          throw new ToolError('rejected', `'${name}' needs approval, which the dev hook can't give.`)
        }
        const result = await registry.call(name, input)
        if (result.undo) {
          undos.push(result.undo)
        }
        return {ok: true, content: result.content, echo: result.echo ?? null, refs: result.refs ?? [],
          undoable: Boolean(result.undo)}
      } catch (e) {
        return failure(e)
      }
    },
    undo: async () => {
      const undo = undos.pop()
      if (!undo) {
        return false
      }
      await undo()
      return true
    },
    context: () => registry.context(),
  }
  return () => {
    delete target.__bldrsAssistTools
    unsubscribe()
    registry.dispose()
  }
}
