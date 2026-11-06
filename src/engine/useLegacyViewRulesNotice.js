import {useEffect} from 'react'
import {LEGACY_VIEW_RULES_MESSAGE, hasLegacyViewRules, isWorkerEngineModel} from './engineModelLoad'


/**
 * The legacy `?view=` rules (IfcViewsManager) style elements through the
 * main-thread engine, which holds no model when the model's engine is in a
 * worker: they would silently do nothing. Once such a model is up, say so
 * (engine-worker.md §8 item 7; the stack is deleted before the flag
 * defaults on).
 *
 * @param {object|null} model the store's loaded model
 * @param {function(string): void} setSnackMessage
 * @param {string} [search] `location.search`, for tests
 */
export default function useLegacyViewRulesNotice(model, setSnackMessage, search = undefined) {
  useEffect(() => {
    if (isWorkerEngineModel(model) && hasLegacyViewRules(search)) {
      setSnackMessage(LEGACY_VIEW_RULES_MESSAGE)
    }
  }, [model, setSnackMessage, search])
}
