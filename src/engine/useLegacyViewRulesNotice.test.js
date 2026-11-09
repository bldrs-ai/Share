import {renderHook} from '@testing-library/react'
import {LEGACY_VIEW_RULES_MESSAGE} from './engineModelLoad'
import useLegacyViewRulesNotice from './useLegacyViewRulesNotice'


// Review on #2058: `?view=` on a worker-engine model shows a clear message,
// and only for a rule set ShareViewer knows. Since the flip (§7 step 9) a
// load with `?view=` runs on the main-thread engine, so a worker model meets
// view rules only when they were added to the URL after the load.

const WORKER_MODEL = {ifcManager: {ifcAPI: {engineSession: {}}}}
const MAIN_MODEL = {ifcManager: {ifcAPI: {}}}
const RULES = '?view=ch.sia380-1.heatmap&feature=engineWorker'


describe('engine/useLegacyViewRulesNotice', () => {
  it('shows the message once a worker-engine model with known view rules is up', () => {
    const setSnackMessage = jest.fn()
    const {rerender} = renderHook(({model}) => useLegacyViewRulesNotice(model, setSnackMessage, RULES),
      {initialProps: {model: null}})
    expect(setSnackMessage).not.toHaveBeenCalled()
    rerender({model: WORKER_MODEL})
    expect(setSnackMessage).toHaveBeenCalledWith(LEGACY_VIEW_RULES_MESSAGE)
  })

  it('says nothing for a main-thread model, an unknown rule name, or no rules', () => {
    const setSnackMessage = jest.fn()
    renderHook(() => useLegacyViewRulesNotice(MAIN_MODEL, setSnackMessage, RULES))
    renderHook(() => useLegacyViewRulesNotice(WORKER_MODEL, setSnackMessage, '?view=made-up'))
    renderHook(() => useLegacyViewRulesNotice(WORKER_MODEL, setSnackMessage, '?feature=engineWorker'))
    expect(setSnackMessage).not.toHaveBeenCalled()
  })
})
