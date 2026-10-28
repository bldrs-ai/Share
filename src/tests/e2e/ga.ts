import {Page} from '@playwright/test'


/** One GA event as gtag queued it. */
export type GaEvent = {name: string, params: Record<string, unknown>}


/**
 * GA events as gtag queued them. index.html's inline
 * `gtag(){dataLayer.push(arguments)}` runs even with the GA loader skipped in
 * tests, so every gtagEvent lands in window.dataLayer (as
 * realModelOpen.spec.ts reads real_model_open).
 *
 * @param page Playwright page
 * @param name GA event name
 * @return Matching events, params made serializable (a URL param is its href)
 */
export async function gaEvents(page: Page, name: string): Promise<GaEvent[]> {
  return await page.evaluate((eventName) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dataLayer: any[] = (window as any).dataLayer || []
    return dataLayer
      .filter((entry) => entry?.[0] === 'event' && entry?.[1] === eventName)
      .map((entry) => ({name: String(entry[1]), params: JSON.parse(JSON.stringify(entry[2] ?? {}))}))
  }, name)
}
