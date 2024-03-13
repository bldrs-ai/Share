#!/bin/bash
echo "1: $1"
echo "2: $2"
echo "3: $3"
echo "4: $4"
echo "5: $5"
compare "$2" "$5" /tmp/diff.png
echo "Diff image saved to /tmp/diff.png"
