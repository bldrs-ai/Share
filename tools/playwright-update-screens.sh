# WORK IN PROGRESS.  Gets everything installed and running, but network calls to
# running bun run test-flows-serve isn't working.

#!/bin/bash

MODULE_CACHE=.cache/linux_node_modules
XDG_CACHE=.cache/xdg

mkdir -p "$MODULE_CACHE" "$XDG_CACHE"

docker run --rm -it --init \
  -u "$(id -u)":"$(id -g)" \
  -v "$PWD:/work" -w /work \
  -v "$PWD/$MODULE_CACHE:/work/node_modules" \
  -e HOME=/work \
  -e XDG_CACHE_HOME=/work/$XDG_CACHE \
  mcr.microsoft.com/playwright:v1.54.2-jammy \
  bash -lc '
    # Install Linux deps into the mounted node_modules cache. The image
    # has npm but not Bun; npx fetches the pinned Bun (package.json
    # packageManager) for the install only.
    npx --yes bun@1.4.4 install --frozen-lockfile

    # Point tests at your already-running host server on 8081
    BASE_URL=http://host.docker.internal:8081 \
    npx playwright test src/Components/About/About.spec.ts --config=tools/playwright.config.js --update-snapshots --base-url=http://host.docker.internal:8081
  '
