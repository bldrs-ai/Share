import type {ConnectionProvider, SourceBrowser, ProviderId} from './types'


const providerRegistry = new Map<ProviderId, ConnectionProvider>()
const browserRegistry = new Map<ProviderId, SourceBrowser>()


/** @param provider The provider to register */
export function registerProvider(provider: ConnectionProvider): void {
  providerRegistry.set(provider.id, provider)
}

/** @param browser The browser to register */
export function registerBrowser(browser: SourceBrowser): void {
  browserRegistry.set(browser.providerId, browser)
}

/**
 * @param id Provider ID
 * @return The registered provider, or undefined
 */
export function getProvider(id: ProviderId): ConnectionProvider | undefined {
  return providerRegistry.get(id)
}

/**
 * @param id Provider ID
 * @return The registered browser, or undefined
 */
export function getBrowser(id: ProviderId): SourceBrowser | undefined {
  return browserRegistry.get(id)
}

/** @return All registered providers */
export function getAllProviders(): ConnectionProvider[] {
  return Array.from(providerRegistry.values())
}
