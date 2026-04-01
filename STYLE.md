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

## JSDoc Standards
- **Check types**: Type checking enabled
- **No required descriptions**: Focus on type safety over verbose docs
- **Use @return**: Instead of @returns
- **Tag lines**: Allow flexible tag line formatting

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
