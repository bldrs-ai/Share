## Style Guidelines

## General Principles
- Follow Google Style Guide as the base standard
- Use `yarn lint` to check for style violations
- Use `yarn typecheck` for TypeScript validation
- All style rules are enforced automatically via ESLint

## File Layout and Organization

### Import Organization
Organize import into module groups using this hierarchy/ordering (far to near/nesting):
1. **System packages up front**: `'node:xx'` (e.g., `node:fs`, `bun:test`)
2. **Then code, then resources**: JS/TS above -> Fixtures -> JSON -> CSS -> Icons

Sort each module group (code, resources, fixtures, etc.) with 3 sub-sorts:
1. **Module sources before imported names**: (e.g. `import SecondSortByThis from 'first-sort-by-this'`)
2. **Order packages far-to-near**: 'pkg', then '@org/pkg'
3. **Paths last, far-to-near**: (../../, then ../) to most local: (./sub) and lastly (./)
4. **Within Alphabetical within SecondSortbyThis**: Capital letters before lowercase


**Example:**
```javascript
import fs from 'node:fs'
import React, {useState, useEffect} from 'react'
import Box from '@mui/material/Box'
import FarClass from '../../foo/FarClass'
import MidClass from '../bar/MidClass'
import {thing} from '../bar/utils'
import MyClass from './MyClass'
import '../../../styles/global.css'
import './ComponentName.css'
import '../icons/close.svg'
```

### Component Structure
For React components, organize code in this order:
1. **useStore** hooks (Zustand state management)
2. **useState** hooks
3. **Custom useHook** calls
4. **Local variables**
5. **useEffect** hooks
6. **Return statement**

**Example:**
```javascript
export default function MyComponent() {
  // 1. useStore
  const selectedApp = useStore((state) => state.selectedApp)
  
  // 2. useState
  const [isVisible, setIsVisible] = useState(false)
  
  // 3. Custom hooks
  const isMobile = useIsMobile()
  
  // 4. Local variables
  const computedValue = someCalculation()
  
  // 5. useEffect
  useEffect(() => {
    // side effects
  }, [dependency])
  
  // 6. Return
  return <div>Component content</div>
}
```

## Syntax and Formatting Rules

### Arrow Functions
- **Always use parentheses**: `(param) => result`
- **Proper spacing**: `() => {}`, not `()=>{}` or `() =>{}`
- **Empty functions in tests**: Allowed only in `*.test.js` files

### Semicolons and Punctuation  
- **No semicolons**: Use `'never'` style
- **Trailing commas**: Use consistently in objects/arrays
- **Quote properties**: Only when needed (`'consistent-as-needed'`)

### Spacing and Indentation
- **Block spacing**: `{ return value }`
- **No function call spacing**: `func()`, not `func ()`
- **Space around operators**: `a + b`, not `a+b`  
- **Two empty lines**: Between imports and default export
- **Unix line endings**: LF only, no CRLF
- **No trailing spaces**: End lines cleanly

### React/JSX Specific
- **JSX closing brackets**: Proper alignment
- **No spacing before self-closing**: `<Component/>`, not `<Component />`
- **No spaces around equals**: `prop={value}`, not `prop = {value}`
- **Self-closing components**: `<Component/>` when no children

### Variables and Logic
- **Use const/let**: Never `var`
- **Prefer const**: Use `let` only when reassigning
- **Strict equality**: Always `===`, never `==`
- **Template literals**: Prefer over string concatenation
- **No magic numbers**: Extract to named constants (except -10 to 10)
- **Destructuring**: Prefer over property access when appropriate

## Testing Conventions

### data-testid Format
Use dash-separated, converted from CamelCase:
- **Format**: `'<component-name>-<middle-name>-<detail-name>'`
- **Examples**: 
  - `data-testid='button-ok'`
  - `data-testid='control-button-open'`
  - `data-testid='tabbed-panels-box1'`
- **Uniqueness**: Each testid should be unique across the page

### Test File Rules
- **Empty arrow functions**: Allowed in `*.test.js` and `*.test.jsx` files
- **Mock implementations**: Use `() => {}` freely for Jest mocks
- **Test descriptions**: Clear, descriptive test names

### Assertions must be able to fail

An assertion that cannot fail is worse than a missing one, because it reads as
coverage. The #1776 work stream (#1777, #1782, #1783, #1788, #1789, #1790)
produced about a dozen of these — several inside code written to prevent exactly
that. They are **three different diseases** wearing one symptom, and they take
different remedies, so name which one you have before reaching for a fix.

**1. The assertion genuinely cannot fail.** No input makes it red.

- Iterating a collection that may be empty runs zero assertions and passes.
  `expectOnlyInducedLoaderErrors` matched each line of a captured buffer, so a
  buffer left empty *because the diagnostic had stopped emitting* sailed through
  (#1789). Assert the size too, or pair the guard with a positive one.
- A mock returning `undefined` where the return value is what the test
  discriminates on. `jest.mock` auto-mocks `nextRequestId` to `undefined`, which
  makes every worker reply match every listener — nine correlation tests would
  have passed with no correlation at all (#1790). Give it a real implementation.
- Alternatives nothing can reach: an expected-error regex carried five, only two
  of which any code path could produce (#1789).

**2. The assertion is sound but never runs.** This is the one most likely to be
misread as the first, and the remedy is unrelated. Un-skipping three specs in
#1783 surfaced a `role="treeitem"` selector the tree no longer emits, two
`glbVerbose`-gated log waits, and a `GlobalId` row rendered on neither path —
**each would have failed had it executed**, and none had executed for five
weeks. A `test.fixme` spec rots against the code around it. When you un-skip
one, expect its assertions to be stale and re-derive them from the current
behaviour rather than trusting that they still describe it.

**3. The assertion runs, can fail, and says something false.** #1782's
multi-entry test asserted the *wrong answer* outright, so it would have defended
the defect against whoever noticed it next. #1788's threshold comment called
`>= 5` a loose floor when five is the most either fixture can offer — the
assertion was right, the explanation was not, and the next reader would have
gone hunting for slack that does not exist. Check the claim, not just the pass;
a green test proves nothing about the sentence above it.

**For 1 and 3 the check is cheap: break the thing the assertion guards, watch it
go red, restore it.** Every repair above was confirmed that way, and the mutation
run is what caught two of them being vacuous a *second* time after a first fix,
which reading alone had missed both times. Put the result in the PR — "26 passed
before, 5 failed after" is evidence a reviewer can act on; "added a test" is not.
Note that this check cannot reach disease 2 at all: a skipped test is not made
honest by mutating the code it does not run against.

### Console hygiene
A test run should print **nothing unexpected** — noise buries the one new
warning that flags a real regression. Treat a stray warning as a defect, in
this priority order:
- **Fix it at the source.** An `act()` warning usually means an un-awaited
  state update — await it with `actAsyncFlush()` (`src/utils/tests.js`), don't
  mute it. Keep flush helpers timer-agnostic (a single microtask, never
  `setTimeout` — it hangs under fake timers).
- **Divert expected output and assert on it.** Code that logs *by design*
  (the `[glb]` and `[conwayDirect]` diagnostics) routes through a swappable
  sink — `createLogChannel` (`src/utils/logSink.js`) — and is checked via
  `getGlbLogs()` / `getConwayDirectLogs()`: a tested signal, not console spam.
  Assert the line's values, not just that some line was logged.
- **Suppress only what you can't reach** — narrowly (`suppressActWarnings()`
  swallows just the one line), scoped to one test, restored in `try/finally`.
- **Back any global mute with a static test** — e.g. three's muted "Multiple
  instances" warning is compensated by `singleThreeInstance.test.js`.

Full rationale and worked examples: [PLAYBOOK.md](PLAYBOOK.md) §"Keep the test
console clean".

## JSDoc Standards
- **Check types**: Type checking enabled
- **No required descriptions**: Focus on type safety over verbose docs
- **Use @return**: Instead of @returns
- **Tag lines**: Allow flexible tag line formatting

## Comments

We write comments. **Don't default to no comments** — a well-placed
paragraph saves a future reader (or AI assistant) twenty minutes of
git-blame archaeology. The bar for *what* to comment is:

- **Load-bearing context.** Why this code looks the way it does
  given a constraint that isn't visible at the call site — e.g. an
  upstream API quirk, an ordering requirement, a workaround for a
  library bug, a performance reason for an unusual approach.
- **Non-obvious assumptions.** What this code expects to be true
  about its callers, the data, or the environment. Document it
  where it matters — a deleted assumption check leaves no scar.
- **Important context.** Why a thing exists, what problem it
  solves, what the alternatives were and why they were rejected.
  Especially valuable for non-trivial design choices (e.g.
  "Option A: per-instance default; Shift expands to whole element"
  — the rationale lives in the comment, not just the commit).
- **Sequence / coordination.** When ordering between calls matters
  (e.g. "must run after BVH compute, before subset construction"),
  say so at the seam.
- **Cross-file references.** When understanding this code requires
  reading another file or design doc, name it
  (`design/new/viewer-replacement.md §3b.ii`).

What NOT to comment:

- **Restating what well-named code already says.** `// increment
  counter` next to `counter++` is noise.
- **Stale change-history.** "Used to do X, now does Y" belongs in
  git blame, not in the source.
- **TODOs without context.** A bare `// TODO: fix this` rots. If
  it's worth writing, say what "fix" means and what blocks it.

JSDoc on exported / public API stays mandatory (it's lint-enforced).
Inline comments are about *non-obvious reasoning*, not the code's
mechanical action.

## Accessibility (a11y)
- **Follow jsx-a11y**: All recommended accessibility rules
- **Semantic HTML**: Use proper HTML elements
- **ARIA attributes**: When semantic HTML isn't sufficient
- **Keyboard navigation**: Ensure all interactive elements are accessible

## Error Handling and Code Quality
- **No console statements**: Only `console.warn` and `console.error` allowed
- **No debugger**: Remove before committing
- **Handle promises**: Use async/await, avoid unhandled promises
- **Default cases**: Always include in switch statements
- **No unused variables**: Clean up unused imports and variables

## Examples of Correct Style

```javascript
import React, {useState, useEffect} from 'react'
import Box from '@mui/material/Box'
import useStore from '../store/useStore'
import {utility} from './utils'


/**
 * @return {ReactElement}
 */
export default function ExampleComponent({title, onClose}) {
  const isVisible = useStore((state) => state.isVisible)
  const [loading, setLoading] = useState(false)
  
  const handleClick = () => {
    setLoading(true)
    onClose()
  }
  
  useEffect(() => {
    if (isVisible) {
      setLoading(false)
    }
  }, [isVisible])
  
  return (
    <Box
      sx={{padding: 2}}
      data-testid='example-component-container'
    >
      <button 
        onClick={handleClick}
        data-testid='example-component-close-button'
      >
        {title}
      </button>
    </Box>
  )
}
```

## Enforcement
- **Pre-commit hooks**: Run `yarn precommit` (lint + test)  
- **CI/CD**: All PRs must pass linting
- **IDE integration**: Configure your editor to show ESLint warnings
- **Auto-fix**: Use `yarn lint --fix` for automatic corrections

### Misc
- Remember 2 spaces after imports and always have a newline at EOF
- For jest and playwright tests avoid specifying timeouts (use the default), or keep them short eg 5 seconds.
- Always follow style rules as you go, and run yarn lint on the files you modify to identify style fixes to make
