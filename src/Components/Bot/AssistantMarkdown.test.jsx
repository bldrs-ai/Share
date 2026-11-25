import React from 'react'
import {act, cleanup, render, screen, within} from '@testing-library/react'
import {ThemeCtx} from '../../theme/Theme.fixture'
import {describeRef, jumpToRef} from '../../tools/refLinks'
import AssistantMarkdown, {allowedLinkUri} from './AssistantMarkdown'


// The plugin is a URL import in the app (markdownGfm.js); Jest has the module itself.
const mockGfm = {
  load: () => Promise.resolve(jest.requireActual('remark-gfm').default),
  // Mirrors markdownGfm.js: the resolved plugin is kept so a remount can seed from it.
  loaded: null,
}
// The chip's model lookup and jump have their own suite (refLinks.test.js); here only the wiring.
jest.mock('../../tools/refLinks', () => ({
  ...jest.requireActual('../../tools/refLinks'),
  describeRef: jest.fn(),
  jumpToRef: jest.fn(),
}))
jest.mock('./markdownGfm', () => ({
  loadMarkdownGfm: () => mockGfm.load().then((plugin) => {
    mockGfm.loaded = plugin
    return plugin
  }),
  loadedMarkdownGfm: () => mockGfm.loaded,
}))


/**
 * @param {string} text
 * @return {Promise<object>} testing-library's render result, in the theme, once the plugin has loaded
 */
async function renderMarkdown(text) {
  let result
  // The plugin's load resolves into state; let it land inside act.
  await act(async () => { // eslint-disable-line require-await
    result = render(<AssistantMarkdown text={text}/>, {wrapper: ThemeCtx})
  })
  return result
}


describe('AssistantMarkdown', () => {
  it('renders emphasis, lists and code, and the raw markers are gone', async () => {
    const {container} = await renderMarkdown('**Project**: Bldrs\n\n- one\n- two\n\nuse `view.select`')
    expect(screen.getByText('Project').tagName).toBe('STRONG')
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['one', 'two'])
    expect(screen.getByText('view.select').tagName).toBe('CODE')
    expect(container.textContent).not.toContain('**')
    expect(container.textContent).not.toContain('`')
  })

  it('renders a GFM table, inside a scrolling wrapper, once the plugin has loaded', async () => {
    let load = () => undefined
    // An earlier test has loaded the plugin; this one is the first load.
    mockGfm.loaded = null
    mockGfm.load = () => new Promise((resolve) => {
      load = () => resolve(jest.requireActual('remark-gfm').default)
    })
    await renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |')
    // Until it loads, the reply is plain Markdown: the table is its pipes.
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByText(/\| a \| b \|/)).toBeInTheDocument()
    await act(() => Promise.resolve(load()))
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['a', 'b'])
    expect(getComputedStyle(table.parentElement).overflowX).toBe('auto')
    mockGfm.load = () => Promise.resolve(jest.requireActual('remark-gfm').default)
  })

  it('renders a table on the first commit of a remount after the plugin has loaded (#2313)', async () => {
    const table = '| a | b |\n|---|---|\n| 1 | 2 |'
    await renderMarkdown(table)
    cleanup()
    // No act, no await: only the first commit is checked. BotChat remounts a
    // reply's bubble when it becomes ratable, and that commit must not be raw pipes.
    render(<AssistantMarkdown text={table}/>, {wrapper: ThemeCtx})
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.queryByText(/\| a \| b \|/)).toBeNull()
  })

  it('renders a fenced block as pre > code that scrolls', async () => {
    const {container} = await renderMarkdown('```\nconst a = 1\n```')
    const pre = container.querySelector('pre')
    expect(pre.querySelector('code').textContent).toBe('const a = 1\n')
    expect(getComputedStyle(pre).overflowX).toBe('auto')
  })

  it('does not break on a half-streamed reply', async () => {
    const {container} = await renderMarkdown('Selected **all the pro')
    expect(container.textContent).toBe('Selected **all the pro')
    await renderMarkdown('```js\nlet x')
    await renderMarkdown('| a | b |\n|---|')
  })

  it('shows raw HTML as nothing, not as elements or text', async () => {
    const {container} = await renderMarkdown('before <script>window.pwned = 1</script><b>bold?</b> after')
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    expect(window.pwned).toBeUndefined()
  })

  it('drops images', async () => {
    const {container} = await renderMarkdown('![pixel](https://tracker.example/p.gif)\n\ntext')
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('text')).toBeInTheDocument()
  })

  it('opens http(s) links in a new tab without opener', async () => {
    await renderMarkdown('[docs](https://example.com/a)')
    const link = screen.getByRole('link', {name: 'docs'})
    expect(link).toHaveAttribute('href', 'https://example.com/a')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it.each([
    ['javascript:alert(1)'],
    ['mailto:a@example.com'],
    ['/share/v/p/other.ifc'],
    ['data:text/html,x'],
  ])('renders a link to %s as plain text', async (href) => {
    const {container} = await renderMarkdown(`[click](${href})`)
    expect(screen.queryByRole('link')).toBeNull()
    expect(container.textContent).toBe('click')
  })
})


describe('AssistantMarkdown element chips', () => {
  const PERMALINK = 'https://share.example/share/v/p/index.ifc#sel:e102'

  beforeEach(() => {
    jest.clearAllMocks()
    describeRef.mockImplementation((ref) => (ref === 'e102' ?
      {ok: true, permalink: PERMALINK} : {ok: false, reason: 'This element isn\'t in the model that is open.'}))
  })

  it('renders a ref: link as a chip that is a real link to the permalink', async () => {
    await renderMarkdown('Look at [Window 1](ref:e102) first.')
    const chip = screen.getByTestId('BotChat-RefChip')
    expect(chip).toHaveTextContent('Window 1')
    expect(chip.tagName).toBe('A')
    expect(chip).toHaveAttribute('href', PERMALINK)
    expect(chip).toHaveAttribute('data-ref', 'e102')
  })

  it('jumps in place on a plain click, and leaves a modified click to the browser', async () => {
    await renderMarkdown('[Window 1](ref:e102)')
    const chip = screen.getByTestId('BotChat-RefChip')
    const plain = new MouseEvent('click', {bubbles: true, cancelable: true, button: 0})
    act(() => {
      chip.dispatchEvent(plain)
    })
    expect(jumpToRef).toHaveBeenCalledWith('e102')
    expect(plain.defaultPrevented).toBe(true)

    jumpToRef.mockClear()
    const newTab = new MouseEvent('click', {bubbles: true, cancelable: true, button: 0, ctrlKey: true})
    act(() => {
      chip.dispatchEvent(newTab)
    })
    expect(jumpToRef).not.toHaveBeenCalled()
    expect(newTab.defaultPrevented).toBe(false)
  })

  // Owner testing on SEESTRASSE: the model wrote two refs in one link, which
  // Markdown can't parse, so the raw refs showed as text.
  it('renders several refs in one link as one chip each, with no raw refs left', async () => {
    const {container} = await renderMarkdown('The [Window 1](ref:e102, ref:e102) units.')
    expect(screen.getAllByTestId('BotChat-RefChip')).toHaveLength(2)
    expect(container.textContent).not.toMatch(/ref:/)
  })

  it('renders a mention the open model cannot resolve as a disabled chip, never a link', async () => {
    await renderMarkdown('[Ghost](ref:e999)')
    expect(screen.queryByRole('link')).toBeNull()
    const chip = screen.getByTestId('BotChat-RefChip-Disabled')
    expect(chip).toHaveTextContent('Ghost')
    expect(chip).not.toHaveAttribute('href')
    act(() => {
      chip.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}))
    })
    expect(jumpToRef).not.toHaveBeenCalled()
  })

  it.each([
    ['ref:'], ['ref:nonsense'], ['ref:javascript:alert(1)'], ['REF:e102x'],
  ])('renders a malformed mention %s as plain text', async (href) => {
    const {container} = await renderMarkdown(`[odd](${href})`)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByTestId('BotChat-RefChip')).toBeNull()
    expect(container.textContent).toBe('odd')
  })

  it('keeps an https link to another site an ordinary external link, not a chip', async () => {
    await renderMarkdown('[docs](https://example.com/share/v/p/index.ifc#sel:e102)')
    expect(screen.queryByTestId('BotChat-RefChip')).toBeNull()
    expect(screen.getByRole('link', {name: 'docs'})).toHaveAttribute('target', '_blank')
  })
})


describe('allowedLinkUri', () => {
  it('passes only http and https', () => {
    expect(allowedLinkUri('https://a.example')).toBe('https://a.example')
    expect(allowedLinkUri('http://a.example')).toBe('http://a.example')
    expect(allowedLinkUri('ftp://a.example')).toBe('')
    expect(allowedLinkUri('not a url')).toBe('')
  })

  it('passes a ref: link only when its ref is well formed', () => {
    expect(allowedLinkUri('ref:e12')).toBe('ref:e12')
    expect(allowedLinkUri('ref:o1.2.3')).toBe('ref:o1.2.3')
    expect(allowedLinkUri('ref:e12; x')).toBe('')
    expect(allowedLinkUri('ref:')).toBe('')
  })
})
