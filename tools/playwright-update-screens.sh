# WORK IN PROGRESS.  Gets everything installed and running, but network calls to
# running yarn test-flows-serve isn't working.

#!/bin/bash

MODULE_CACHE=.cache/linux_node_modules
COREPACK_CACHE=.cache/corepack
XDG_CACHE=.cache/xdg

mkdir -p "$MODULE_CACHE" "$COREPACK_CACHE" "$XDG_CACHE"

docker run --rm -it --init \
  -u "$(id -u)":"$(id -g)" \
  -v "$PWD:/work" -w /work \
  -v "$PWD/$MODULE_CACHE:/work/node_modules" \
  -e HOME=/work \
  -e COREPACK_HOME=/work/$COREPACK_CACHE \
  -e XDG_CACHE_HOME=/work/$XDG_CACHE \
  mcr.microsoft.com/playwright:v1.54.2-jammy \
  bash -lc '
    # Use Corepack without creating global shims
    corepack yarn --version >/dev/null 2>&1 || true

    # Install Linux deps into the mounted node_modules cache
    corepack yarn install --immutable || corepack yarn install

    # Point tests at your already-running host server on 8081
    BASE_URL=http://host.docker.internal:8081 \
    corepack yarn exec playwright test src/Components/About/About.spec.ts --config=tools/playwright.config.js --update-snapshots --base-url=http://host.docker.internal:8081
  '
