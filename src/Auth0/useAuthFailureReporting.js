import {useEffect} from 'react'
import {useAuth0} from './Auth0Proxy'
import {AUTH_STEPS} from './authFailureCodes'
import {reportAuthFailure, setAuthFailureSub} from './reportAuthFailure'


// auth0-react's hasAuthParams (src/utils.tsx): the provider ran
// handleRedirectCallback on this load iff the URL has these.
const CODE_OR_ERROR_RE = /[?&](?:code|error)=[^&]+/
const STATE_RE = /[?&]state=[^&]+/


/**
 * Report the Auth0 provider's own failures, and keep reportAuthFailure's
 * idea of the signed-in user current.
 *
 * The provider catches what its boot-time work throws and only parks it in
 * `useAuth0().error`, so nothing reached Sentry from it before. On mount it
 * either completes a redirect sign-in (when the URL carries code/error and
 * state) or restores the session with checkSession, which already swallows
 * the expected login_required for a signed-out visitor.
 *
 * Not reported on /popup-callback. There both the provider and PopupCallback
 * call handleRedirectCallback on the same URL; only one can consume the
 * stored transaction, and the other always fails with "Invalid state".
 * PopupCallback is the one that reports, since it knows which flow (sign-in,
 * account link, GitHub scope) the popup was for.
 *
 * Mounted once, from BaseRoutes, which sits under the provider on every route.
 */
export default function useAuthFailureReporting() {
  const {error, user} = useAuth0()
  const sub = user?.sub

  useEffect(() => {
    setAuthFailureSub(sub)
  }, [sub])

  useEffect(() => {
    if (!error) {
      return
    }
    const {pathname, search} = window.location
    if (pathname.endsWith('/popup-callback')) {
      return
    }
    const isRedirect = CODE_OR_ERROR_RE.test(search) && STATE_RE.test(search)
    reportAuthFailure(isRedirect ? AUTH_STEPS.REDIRECT_CALLBACK : AUTH_STEPS.SESSION_RESTORE, error)
  }, [error])
}
