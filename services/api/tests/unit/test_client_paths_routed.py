"""Production routing check: every path the web app's API clients call is served by the API.

The repo holds no gateway/CDN config; production is one API Gateway in front of this
FastAPI app (ADR-0002), so the routes the app mounts are the routing the repo defines.
"""

import re
from pathlib import Path

from app.main import app

WEB_SRC = Path(__file__).resolve().parents[4] / "apps" / "web" / "src"
CALL = re.compile(r"""\b(?:call(?:<[^(]*?>)?|fetch|post|assign)\(\s*[`'"](/[^/?`'"$]*)""")


def client_paths() -> set[str]:
    found: set[str] = set()
    for file in WEB_SRC.rglob("*.ts*"):
        if file.suffix not in {".ts", ".tsx"} or ".test." in file.name or "node_modules" in file.parts:
            continue
        found.update(p for p in CALL.findall(file.read_text(encoding="utf-8")) if len(p) > 1)
    return found


def routed_paths() -> set[str]:
    # Included routers are not flat `path` routes in this FastAPI, so read the schema's paths.
    return {"/" + path.lstrip("/").split("/")[0] for path in app.openapi()["paths"]}


def format_missing(missing: list[str]) -> str:
    return f"web client paths not routed in production: {missing}"


def test_every_web_client_path_is_routed():
    paths = client_paths()
    assert "/starter-destinations" in paths, "client path scan found nothing; check WEB_SRC"
    missing = sorted(p for p in paths if p not in routed_paths())
    assert not missing, format_missing(missing)


def test_missing_path_is_named_in_the_failure_message():
    assert "/nope" in format_missing(["/nope"])
