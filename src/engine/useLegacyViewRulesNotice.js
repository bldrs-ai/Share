import {useEffect} from 'react'
import {LEGACY_VIEW_RULES_MESSAGE, isWorkerEngineModel} from './engineModelLoad'
import {hasLegacyViewRules} from './engineRoute'


/**
 * The legacy `?view=` rules (IfcViewsManager) style elements through the
 * main-thread engine, which holds no model when the model's engine is in a
 * worker: they would silently do nothing. A load whose URL already asks for
 * them runs on the main-thread engine (engineRoute.js), so this fires only
 * when `?view=` arrives after a worker load, and says that a reload applies
 * it (engine-worker.md §8 item 7).
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
