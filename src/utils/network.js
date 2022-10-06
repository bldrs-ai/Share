import debug from './debug'


let disabledForUnitTests = false

/**
 * For unit testing we are mocking out github anyway so this code should not intercept those calls
 */
export function restoreRegularNetworkingForUnitTests() {
  disabledForUnitTests = true
}


/**
 * @return {boolean} True if running locally
 */
export function isRunningLocally() {
  if (disabledForUnitTests) {
    return false
  }
  const local =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '[::1]' ||
      window.location.hostname.startsWith('10.') ||
      window.location.hostname.startsWith('127.') ||
      window.location.hostname.startsWith('169.254.') ||
      window.location.hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])/) ||
      window.location.hostname.startsWith('192.168.') ||
      window.location.hostname.endsWith('.local')

  if (local) {
    debug().warn('Network: site is being served locally')
    return true
  }

  return false
}
