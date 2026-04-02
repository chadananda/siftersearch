#!/bin/bash
# Start enhancement for Core Baha'i collections
cd "$(dirname "$0")/.."
exec node scripts/run-enhancement.js \
  "--collection=Core Publications,Pilgrim Notes,Core Tablets" \
  "$@"
