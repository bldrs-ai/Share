import type {ConnectionProvider, SourceBrowser, ProviderId} from './types'


const providerRegistry = new Map<ProviderId, ConnectionProvider>()
const browserRegistry = new Map<ProviderId, SourceBrowser>()


export function registerProvider(provider: ConnectionProvider): void {
  providerRegistry.set(provider.id, provider)
}

export function registerBrowser(browser: SourceBrowser): void {
  browserRegistry.set(browser.providerId, browser)
}

export function getProvider(id: ProviderId): ConnectionProvider | undefined {
  return providerRegistry.get(id)
}

export function getBrowser(id: ProviderId): SourceBrowser | undefined {
  return browserRegistry.get(id)
}

export function getAllProviders(): ConnectionProvider[] {
  return Array.from(providerRegistry.values())
}
