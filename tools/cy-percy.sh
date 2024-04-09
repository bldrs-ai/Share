#!/bin/bash

# Check if PERCY_TOKEN is set
if [ -z "$PERCY_TOKEN" ]; then
  echo "Error: PERCY_TOKEN is not set. See eng wiki for env vars."
  exit 1
fi

yarn cy-build && yarn percy exec -- yarn cy

