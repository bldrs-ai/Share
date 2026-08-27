# Bldrs Share
Bldrs Share is a high-performance browser-based application for CAD & BIM model
viewing, sharing and collaboration.  Share is built on open-source standards for
speed, accuracy, and flexibility.  Designed for real-time teamwork, Bldrs Share
empowers teams to effortlessly share detailed models and collaborate seamlessly
from any device.

![image](https://github.com/user-attachments/assets/89c98fba-0057-45f2-a02a-161ced37f88c)

[![build](https://github.com/bldrs-ai/Share/actions/workflows/main.yml/badge.svg?event=push)](https://github.com/bldrs-ai/Share/actions/workflows/main.yml)
[![](https://img.shields.io/discord/853953158560743424.svg?logo=discord&logoColor=white&label=Discord&color=5865F2)](https://discord.gg/9SxguBkFfQ "Join the Discord chat at https://discord.gg/9SxguBkFfQ")

## Features
### Fast and easy access to your models for free
Open your models on any device in our browser-based viewer.
- Drag-n-drop models to view, no data upload, offline capable
- Navigate and search elements, crop with section planes
- Property editing, save changes locally (early access)
- Powerful data slice-n-dice, csv export (early access)
- Open standards: IFC 2x3&4, STL, OBJ;  STEP (early access https://github.com/bldrs-ai/conway-viewer-demo)

### Frictionless workflows for cross-functional teams
Share models at the office and on the go.  Powered by GitHub.
- Realtime link sharing of live model view
- Multi-user, timeline-based model versioning in git
- Powerful issue tracking with in-model placemarks
- Public and private repositories (early access)

### Ready for Industry 4.0 Enterprises
Develop your Digital Twin lifecycle systems on our extensible platform and high-performance, engineering-grade, open CAD engine.
- Advanced CSG, BREP, NURBS and extensible Apps framework
- Model validation, workflow automation (early access)
- On-prem/data sovereignty with GitLab (early access)

## 🛠️ Build Every Thing Together
Start using Bldrs Share today to transform your CAD workflows. Join our community, explore the documentation, and contribute to the development of next-generation open standard CAD tooling.

### Getting Started
- Visit our [wiki](https://github.com/bldrs-ai/Share/wiki) for Share's Design, Developer Guide and instructions for hosting your models.
  - See our [Conway engine](https://github.com/bldrs-ai/conway) repository
- Repo docs for contributors: [DESIGN.md](DESIGN.md) (architecture), [PLAYBOOK.md](PLAYBOOK.md) (build, dev server, CI, Playwright), [STYLE.md](STYLE.md) (code style). [AGENTS.md](AGENTS.md) is the full topic router (`CLAUDE.md` is a symlink to it).
- Join us on [Bldrs Discord](https://discord.gg/9SxguBkFfQ)
- Follow us on [X @bldrs_ai](https://x.com/bldrs_ai)
- Connect with us on [LinkedIn](https://www.linkedin.com/company/bldrs-ai/)

### Measuring a model load
Share ships a Playwright harness that measures a real browser load of a real
model end to end — time to first mesh, time to first pixel, and the per-stage
breakdown the viewer's own load report shows — and writes it out as a JSON
record you can diff across branches. Use it before optimizing anything in the
loader or the [Conway](https://github.com/bldrs-ai/conway) engine, so a change
is judged against a measurement rather than an intuition.

```bash
yarn test-flows-build-and-serve          # build + serve the app under test
yarn test-flows src/viewer/loadTiming.spec.ts
```

How to point it at another model, what each field of the JSON record means, and
how it cross-checks against Conway's Node-side harness are documented in
[design/new/browser-load-measurement.md](design/new/browser-load-measurement.md).
The harness helpers live in `src/tests/e2e/` (`loadMeasure.ts`, `loadProbe.ts`,
`loadReport.ts`, `loadRun.ts`) — see
[src/tests/e2e/README.md](src/tests/e2e/README.md).
