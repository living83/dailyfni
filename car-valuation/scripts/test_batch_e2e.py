"""End-to-end: synthetic ledger → batch processor → enriched Excel.

Uses live scraping when cache misses, real DB at data/car_prices.db.
"""
from __future__ import annotations

import asyncio
import json
import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from batch_processor import valuate_batch  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("e2e")


async def main() -> int:
    input_xlsx = ROOT / "data" / "test_loans.xlsx"
    if not input_xlsx.exists():
        log.error("missing input — run scripts/make_test_xlsx.py first")
        return 1

    output_xlsx = ROOT / "output" / "test_loans__valued.xlsx"

    summary = await valuate_batch(input_xlsx, output_xlsx, concurrency=3)

    print(json.dumps({
        "input_path": str(summary.input_path),
        "output_path": str(summary.output_path),
        "total_rows": summary.total_rows,
        "processed": summary.processed,
        "succeeded": summary.succeeded,
        "failed": summary.failed,
        "elapsed_sec": summary.elapsed_sec,
        "warnings": summary.warnings,
    }, ensure_ascii=False, indent=2))

    log.info("Output ready at: %s", summary.output_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
