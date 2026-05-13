"""Live valuation: K7 2014. Uses cached rows where available, scrapes misses."""
from __future__ import annotations

import asyncio
import json
import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from valuation_engine import valuate  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("test_valuate")


async def main() -> int:
    log.info("--- 1st call (cache + scrape mix) ---")
    result = await valuate("K7", 2014)
    print(json.dumps(result, ensure_ascii=False, indent=2))

    log.info("--- 2nd call (full cache hit expected) ---")
    cached = await valuate("K7", 2014)
    print(json.dumps(cached, ensure_ascii=False, indent=2))
    assert cached["cached"] is True or all(cached["cache_hits"].values()), \
        "second call should be fully cached"
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
