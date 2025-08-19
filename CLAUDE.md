# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Build Commands
- `yarn build` / `yarn build-conway` - Main production build using Conway engine
- `yarn build-webifc` - Build using web-ifc instead of Conway
- `yarn build-cosmos` - Build React Cosmos component library documentation
- `yarn build-share-analyze` - Build with bundle analysis enabled
- `yarn clean` - Remove build artifacts in `docs/` directory

### Development Server
- `yarn serve` - Start development server with hot reload (default: Conway, HTTP)
- `yarn serve-https` - Start development server with HTTPS
- `yarn serve-cosmos` - Start React Cosmos component development environment
- Environment variables: `SHARE_CONFIG=dev|prod`, `serveHttps=true|false`

### Testing
- `yarn test` - Run all tests (src and tools)
- `yarn test-src` - Run source code tests with Jest
- `yarn test-tools` - Run build tool tests
- `yarn lint` - Run ESLint and TypeScript type checking
- `yarn typecheck` - Run TypeScript type checking only
- `yarn precommit` - Run lint and test (pre-commit hook)

### Cypress E2E Testing
- `yarn cy` - Run Cypress tests headlessly in Chrome
- `yarn cy-headed` - Run Cypress tests with UI
- `yarn cy-spec` - Run specific test spec
- `yarn cy-build` - Build for Cypress testing with MSW enabled
- `yarn cy-parallel` - Run tests in parallel for faster execution
- `yarn cy-percy` - Run visual regression tests with Percy

## Architecture Overview

### Core Application Structure
This is a React-based CAD/BIM model viewer built with:
- **React 18** with React Router for navigation
- **Zustand** for state management (see `src/store/`)
- **Material-UI** for UI components and theming
- **ESBuild** for fast development and production builds
- **Conway/web-ifc-viewer** for IFC model rendering and processing

### Entry Points
- `src/index.jsx` - Main application entry with Auth0, Sentry, and MSW setup
- `src/subscribe/index.jsx` - Separate subscription page entry point
- `src/Share.jsx` - Main application component handling routing and model loading

### Key Directories

#### `/src/Components/`
Reusable UI components organized by feature:
- `About/`, `Apps/`, `Auth/` - Feature-specific components
- `Camera/`, `CutPlane/`, `Markers/` - 3D viewer controls
- `NavTree/`, `Notes/`, `Properties/` - Model interaction panels
- `Open/`, `Share/`, `Versions/` - File and collaboration features
- `SideDrawer/` - Collapsible panel system
- Each component directory contains the main component, tests, fixtures, and hash state management

#### `/src/Containers/`
High-level layout containers:
- `CadView.jsx` - Main viewer container with model loading logic
- `ViewerContainer.jsx` - 3D viewer wrapper
- `*Drawer.jsx` - Side panel containers for different feature groups
- `RootLandscape.jsx` - Top-level layout coordinator

#### `/src/store/`
Zustand state management slices:
- `useStore.js` - Main store combining all slices
- Individual slices for: Apps, Browser, CutPlanes, IFC, NavTree, Notes, Open, Properties, Repository, Search, Share, UI, Versions
- Each slice manages specific application state domain

#### `/src/Infrastructure/`
Core 3D viewer and model processing:
- `IfcViewerAPIExtended.js` - Extended IFC viewer with custom functionality
- `IfcHighlighter.js`, `IfcIsolator.js` - Element interaction features
- `CustomPostProcessor.js` - Custom rendering effects
- `PlaceMark.js` - 3D annotations system

#### `/src/loader/`
Model file loading and format support:
- `Loader.js` - Main loader orchestration
- `BLDLoader.js` - Core model loading logic
- Format-specific loaders: `glb.js`, `obj.js`, `stl.js`, `pdb.js`, `xyz.js`
- `urls.js` - URL processing and validation

#### `/src/net/github/`
GitHub API integration for model versioning and collaboration:
- Complete GitHub API wrapper with caching
- Support for repositories, commits, branches, issues, comments
- Authentication and proxy handling

### Build System
- **ESBuild** configuration in `tools/esbuild/`
- Dual build targets: Conway engine (default) and web-ifc
- Environment-specific configs: dev, prod, cypress
- Multi-threading support with Conway engine
- Bundle analysis and optimization tools

### Testing Strategy
- **Jest** for unit tests with jsdom environment
- **Cypress** for E2E testing with visual regression (Percy)
- **React Cosmos** for component development and testing
- **MSW** for API mocking in tests
- Separate test configs for source code and build tools

### State Management Architecture
- Zustand store with slice pattern for feature separation
- Hash-based state persistence for shareable URLs
- Real-time collaboration state synchronization
- Component-level state for UI interactions

### Model Processing Pipeline
1. URL parsing and model path resolution (`Share.jsx`, `src/utils/urlHelpers.js`)
2. File loading through format-specific loaders (`src/loader/`)
3. IFC processing with Conway or web-ifc engines
4. 3D scene setup and rendering (`Infrastructure/`)
5. UI state synchronization and user interactions

### Authentication & Collaboration
- Auth0 integration for user authentication
- GitHub integration for model versioning and storage
- Real-time notes and annotations system
- Public/private repository support

This application is a comprehensive CAD/BIM collaboration platform with advanced
3D rendering, real-time collaboration, and extensive model format support.

## Code Style Guidelines

### General Principles
- Follow Google Style Guide as the base standard
- All style rules are enforced automatically via ESLint
- Use `yarn lint` to check for style violations
- Use `yarn typecheck` for TypeScript validation

### File Layout and Organization

#### Import Organization
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

#### Component Structure
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

### Syntax and Formatting Rules

#### Arrow Functions
- **Always use parentheses**: `(param) => result`
- **Proper spacing**: `() => {}`, not `()=>{}` or `() =>{}`
- **Empty functions in tests**: Allowed only in `*.test.js` files

#### Semicolons and Punctuation  
- **No semicolons**: Use `'never'` style
- **Trailing commas**: Use consistently in objects/arrays
- **Quote properties**: Only when needed (`'consistent-as-needed'`)

#### Spacing and Indentation
- **Block spacing**: `{ return value }`
- **No function call spacing**: `func()`, not `func ()`
- **Space around operators**: `a + b`, not `a+b`  
- **Two empty lines**: Between imports and default export
- **Unix line endings**: LF only, no CRLF
- **No trailing spaces**: End lines cleanly

#### React/JSX Specific
- **JSX closing brackets**: Proper alignment
- **No spacing before self-closing**: `<Component/>`, not `<Component />`
- **No spaces around equals**: `prop={value}`, not `prop = {value}`
- **Self-closing components**: `<Component/>` when no children

#### Variables and Logic
- **Use const/let**: Never `var`
- **Prefer const**: Use `let` only when reassigning
- **Strict equality**: Always `===`, never `==`
- **Template literals**: Prefer over string concatenation
- **No magic numbers**: Extract to named constants (except -10 to 10)
- **Destructuring**: Prefer over property access when appropriate

### Testing Conventions

#### data-testid Format
Use dash-separated, converted from CamelCase:
- **Format**: `'<component-name>-<middle-name>-<detail-name>'`
- **Examples**: 
  - `data-testid='button-ok'`
  - `data-testid='control-button-open'`
  - `data-testid='tabbed-panels-box1'`
- **Uniqueness**: Each testid should be unique across the page

#### Test File Rules
- **Empty arrow functions**: Allowed in `*.test.js` and `*.test.jsx` files
- **Mock implementations**: Use `() => {}` freely for Jest mocks
- **Test descriptions**: Clear, descriptive test names

### JSDoc Standards
- **Check types**: Type checking enabled
- **No required descriptions**: Focus on type safety over verbose docs
- **Use @return**: Instead of @returns
- **Tag lines**: Allow flexible tag line formatting

### Accessibility (a11y)
- **Follow jsx-a11y**: All recommended accessibility rules
- **Semantic HTML**: Use proper HTML elements
- **ARIA attributes**: When semantic HTML isn't sufficient
- **Keyboard navigation**: Ensure all interactive elements are accessible

### Error Handling and Code Quality
- **No console statements**: Only `console.warn` and `console.error` allowed
- **No debugger**: Remove before committing
- **Handle promises**: Use async/await, avoid unhandled promises
- **Default cases**: Always include in switch statements
- **No unused variables**: Clean up unused imports and variables

### Examples of Correct Style

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

### Enforcement
- **Pre-commit hooks**: Run `yarn precommit` (lint + test)  
- **CI/CD**: All PRs must pass linting
- **IDE integration**: Configure your editor to show ESLint warnings
- **Auto-fix**: Use `yarn lint --fix` for automatic corrections
