import React from 'react'
import {render, screen, within} from '@testing-library/react'
import {ThemeCtx} from '../../theme/Theme.fixture'
import AssistantMarkdown, {allowedLinkUri} from './AssistantMarkdown'


/**
 * @param {string} text
 * @return {object} testing-library's render result, in the theme
 */
function renderMarkdown(text) {
  return render(<AssistantMarkdown text={text}/>, {wrapper: ThemeCtx})
}


describe('AssistantMarkdown', () => {
  it('renders emphasis, lists and code, and the raw markers are gone', () => {
    const {container} = renderMarkdown('**Project**: Bldrs\n\n- one\n- two\n\nuse `view.select`')
    expect(screen.getByText('Project').tagName).toBe('STRONG')
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['one', 'two'])
    expect(screen.getByText('view.select').tagName).toBe('CODE')
    expect(container.textContent).not.toContain('**')
    expect(container.textContent).not.toContain('`')
  })

  it('renders a GFM table, inside a scrolling wrapper', () => {
    renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |')
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['a', 'b'])
    expect(getComputedStyle(table.parentElement).overflowX).toBe('auto')
  })

  it('renders a fenced block as pre > code that scrolls', () => {
    const {container} = renderMarkdown('```\nconst a = 1\n```')
    const pre = container.querySelector('pre')
    expect(pre.querySelector('code').textContent).toBe('const a = 1\n')
    expect(getComputedStyle(pre).overflowX).toBe('auto')
  })

  it('does not break on a half-streamed reply', () => {
    const {container} = renderMarkdown('Selected **all the pro')
    expect(container.textContent).toBe('Selected **all the pro')
    renderMarkdown('```js\nlet x')
    renderMarkdown('| a | b |\n|---|')
  })

  it('shows raw HTML as nothing, not as elements or text', () => {
    const {container} = renderMarkdown('before <script>window.pwned = 1</script><b>bold?</b> after')
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    expect(window.pwned).toBeUndefined()
  })

  it('drops images', () => {
    const {container} = renderMarkdown('![pixel](https://tracker.example/p.gif)\n\ntext')
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('text')).toBeInTheDocument()
  })

  it('opens http(s) links in a new tab without opener', () => {
    renderMarkdown('[docs](https://example.com/a)')
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
  ])('renders a link to %s as plain text', (href) => {
    const {container} = renderMarkdown(`[click](${href})`)
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
