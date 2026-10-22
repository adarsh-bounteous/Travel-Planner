#!/usr/bin/env sh
# Run python from the component's virtualenv when present, else from PATH.
set -eu
cd "$(dirname "$0")"
if [ -x .venv/bin/python ]; then
  PY=.venv/bin/python
else
  PY=python
fi
exec "$PY" "$@"
