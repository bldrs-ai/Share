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

This application is a comprehensive CAD/BIM collaboration platform with advanced 3D rendering, real-time collaboration, and extensive model format support.