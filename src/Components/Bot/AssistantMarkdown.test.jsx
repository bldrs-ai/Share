import React from 'react'
import {act, render, screen, within} from '@testing-library/react'
import {ThemeCtx} from '../../theme/Theme.fixture'
import AssistantMarkdown, {allowedLinkUri} from './AssistantMarkdown'


// The plugin is a URL import in the app (markdownGfm.js); Jest has the module itself.
const mockGfm = {load: () => Promise.resolve(jest.requireActual('remark-gfm').default)}
jest.mock('./markdownGfm', () => ({loadMarkdownGfm: () => mockGfm.load()}))


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


describe('allowedLinkUri', () => {
  it('passes only http and https', () => {
    expect(allowedLinkUri('https://a.example')).toBe('https://a.example')
    expect(allowedLinkUri('http://a.example')).toBe('http://a.example')
    expect(allowedLinkUri('ftp://a.example')).toBe('')
    expect(allowedLinkUri('not a url')).toBe('')
  })
})
