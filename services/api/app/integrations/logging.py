import json
import logging


def log_call(
    logger: logging.Logger,
    level: int,
    *,
    provider: str,
    path: str,
    status: int | None,
    latency_ms: float,
    cache_hit: bool,
    retries: int,
) -> None:
    """Write one structured entry. Only these safe fields are ever logged."""
    entry = {
        "provider": provider,
        "endpoint": path.split("?", 1)[0],
        "status": status,
        "latency_ms": round(latency_ms, 1),
        "cache_hit": cache_hit,
        "retries": retries,
    }
    logger.log(level, json.dumps(entry), extra={"integration": entry})


class _DropRecords(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return False


def silence_httpx_request_logs() -> None:
    """httpx logs every request URL at INFO, query string included — which carries API keys."""
    for name in ("httpx", "httpcore"):
        if not any(isinstance(f, _DropRecords) for f in logging.getLogger(name).filters):
            logging.getLogger(name).addFilter(_DropRecords())
