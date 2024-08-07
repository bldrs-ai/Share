#!/bin/bash

# Check if PERCY_TOKEN is set
if [ -z "$PERCY_TOKEN" ]; then
  echo "Error: PERCY_TOKEN is not set. See eng wiki for env vars."
  exit 1
fi

if [ -z "$@" ]; then
    yarn cy-build && yarn percy exec -- yarn cy $@
else
    yarn cy-build && yarn percy exec -- yarn cy-spec $@
fi


echo "Add the above percy URL to your PR description, with any notes about differences."
