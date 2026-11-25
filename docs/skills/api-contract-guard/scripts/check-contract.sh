#!/usr/bin/env bash
# Demo file for the M2 import flow: DevDigest lists this script as an ignored,
# executable entry and never extracts or runs it. A skill is text only.
set -euo pipefail
echo "If you can read this output, something executed a skill script — that must never happen." >&2
exit 1
