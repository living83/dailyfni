from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent
DATA_DIR = ROOT_DIR / "data"
LOGS_DIR = ROOT_DIR / "logs"
OUTPUT_DIR = ROOT_DIR / "output"

# Load .env (if present). Docker / compose env wins because load_dotenv
# does NOT override pre-existing process env by default.
load_dotenv(ROOT_DIR / ".env")


def _env(*keys: str, default: str | None = None) -> str | None:
    """Return the first non-empty value from a list of env keys.

    Supports gradual renames: pass new name first, legacy as fallback.
    """
    for k in keys:
        v = os.getenv(k)
        if v not in (None, ""):
            return v
    return default


def _int(*keys: str, default: int) -> int:
    raw = _env(*keys)
    return int(raw) if raw is not None else default


def _float(*keys: str, default: float) -> float:
    raw = _env(*keys)
    return float(raw) if raw is not None else default


def _bool(*keys: str, default: bool = False) -> bool:
    raw = _env(*keys)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on", "y", "t")


# ---------------------------------------------------------------------------
# Storage paths
# ---------------------------------------------------------------------------
DB_PATH = Path(_env("DB_PATH", default=str(DATA_DIR / "car_prices.db")))

# ---------------------------------------------------------------------------
# Cache + concurrency
# ---------------------------------------------------------------------------
CACHE_TTL_DAYS = _int("CACHE_TTL_DAYS", default=7)
SCRAPER_CONCURRENCY = _int("SCRAPER_CONCURRENCY", default=3)

# ---------------------------------------------------------------------------
# Scrape behavior (anti-detection)
# ---------------------------------------------------------------------------
SCRAPE_DELAY_MIN = _float("SCRAPE_DELAY_MIN", "SCRAPER_MIN_DELAY_SEC", default=3.0)
SCRAPE_DELAY_MAX = _float("SCRAPE_DELAY_MAX", "SCRAPER_MAX_DELAY_SEC", default=7.0)
SCRAPER_MAX_RETRIES = _int("SCRAPER_MAX_RETRIES", default=3)
SCRAPER_BLOCKED_WAIT_SEC = _int("SCRAPER_BLOCKED_WAIT_SEC", default=300)

# ---------------------------------------------------------------------------
# Matching
# ---------------------------------------------------------------------------
FUZZY_MATCH_THRESHOLD = _int("FUZZY_MATCH_THRESHOLD", default=80)

# ---------------------------------------------------------------------------
# Valuation weights (step 6)
# ---------------------------------------------------------------------------
WEIGHTS = {
    "encar":       _float("WEIGHT_ENCAR",       default=0.40),
    "kbchachacha": _float("WEIGHT_KBCHACHACHA", default=0.35),
    "heydealer":   _float("WEIGHT_HEYDEALER",   default=0.25),
}
AUCTION_DISCOUNT_RATIO = _float("AUCTION_DISCOUNT_RATIO", default=0.75)

# ---------------------------------------------------------------------------
# Proxy (Decodo KR ISP IPs, optional)
# ---------------------------------------------------------------------------
PROXY_ENABLED = _bool("PROXY_ENABLED", default=False)
PROXY_HOST = _env("PROXY_HOST", "DECODO_PROXY_HOST", default="") or ""
PROXY_PORT_START = _int("PROXY_PORT_START", "PROXY_PORT", "DECODO_PROXY_PORT_START", default=10001)
PROXY_PORT_END = _int("PROXY_PORT_END", "DECODO_PROXY_PORT_END", default=10010)
PROXY_USER = _env("PROXY_USER", "DECODO_PROXY_USER", default="") or ""
PROXY_PASS = _env("PROXY_PASS", "DECODO_PROXY_PASS", default="") or ""

# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------
FASTAPI_PORT = _int("FASTAPI_PORT", default=8000)
LOG_LEVEL = (_env("LOG_LEVEL", default="INFO") or "INFO").upper()
