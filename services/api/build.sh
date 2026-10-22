#!/usr/bin/env sh
set -eu
exec sh "$(dirname "$0")/run-py.sh" -m compileall -q app
