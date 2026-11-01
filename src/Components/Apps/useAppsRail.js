import useExistInFeature from '../../hooks/useExistInFeature'
import useStore from '../../store/useStore'
import {useIsMobile} from '../Hooks'
import AppsRegistry from './AppsRegistry.json'


/**
 * What the workspace Apps bar (#1993) docks, and whether it is showing.
 * One predicate for the bar itself and for the overlays that must sit
 * clear of it (the ViewCube's right inset), so the two can't disagree
 * about when the bar takes width from the canvas.
 *
 * The bar shows on desktop under `?feature=workspace`, while Apps is
 * enabled (isAppsEnabled is the Apps kill switch: TopBar and
 * OperationsGroup hide their Apps controls behind it, and a pin left in
 * localStorage from a deploy that had Apps on must not reopen the drawer
 * through the bar), the drawer is closed (the drawer is the bar's
 * expanded form), and something is docked.
 *
 * @return {{isVisible: boolean, docked: Array<{app: object, isPinned: boolean}>}}
 */
export default function useAppsRail() {
  const isAppsEnabled = useStore((state) => state.isAppsEnabled)
  const isAppsVisible = useStore((state) => state.isAppsVisible)
  const runningApps = useStore((state) => state.runningApps)
  const pinnedAppNames = useStore((state) => state.pinnedAppNames)
  const isWorkspaceEnabled = useExistInFeature('workspace')
  const isMobile = useIsMobile()

  // Pinned first, in pin order, from the registry (they may not have been
  // opened this session); then running apps that aren't pinned.
  const pinned = pinnedAppNames
    .map((name) => AppsRegistry.find((app) => app.appName === name))
    .filter(Boolean)
  const running = runningApps.filter((app) => !pinnedAppNames.includes(app.appName))
  const docked = [
    ...pinned.map((app) => ({app, isPinned: true})),
    ...running.map((app) => ({app, isPinned: false})),
  ]

  const isVisible = Boolean(isWorkspaceEnabled && !isMobile && isAppsEnabled && !isAppsVisible && docked.length > 0)
  return {isVisible, docked}
}
