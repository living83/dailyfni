"""FastAPI service entrypoint.

Endpoints:
  GET  /             — service marker
  GET  /health       — container healthcheck (used by docker-compose)
  POST /valuate      — single car valuation, cache-aware
  POST /valuate-batch — Excel batch (step 8 fills the body; shape is locked here)
"""
from __future__ import annotations

import logging

from pathlib import Path

from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field

from batch_processor import valuate_batch
from config import LOG_LEVEL
from valuation_engine import valuate

logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("car-valuation")

app = FastAPI(
    title="car-valuation",
    version="0.7.0",
    description="NPL auto-loan vehicle market-price pipeline.",
)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ValuateRequest(BaseModel):
    model: str = Field(min_length=1, description="Car model name (raw input; normalized server-side).")
    year: int = Field(ge=1990, le=2100, description="Manufacture year (YYYY).")
    use_cache: bool = Field(default=True, description="If false, force-refresh all sites.")


class SourceSummary(BaseModel):
    median: int
    count: int


class ValuateResponse(BaseModel):
    model: str
    canonical: str | None = None
    year: int
    market_price: int | None
    auction_price: int | None
    confidence: str
    sources: dict[str, SourceSummary | None]
    cached: bool
    cache_hits: dict[str, bool]
    elapsed_sec: float
    match_score: float | None = None


class BatchRequest(BaseModel):
    file_path: str = Field(min_length=1)
    output_path: str | None = Field(
        default=None,
        description="Where to write the enriched Excel. Defaults to <input>__valued.xlsx.",
    )
    use_cache: bool = True
    concurrency: int | None = Field(default=None, ge=1, le=10)


class BatchResponse(BaseModel):
    input_path: str
    output_path: str
    total_rows: int
    processed: int
    succeeded: int
    failed: int
    elapsed_sec: float
    warnings: list[str]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/")
def root() -> dict[str, str]:
    return {"service": "car-valuation", "version": "0.7.0"}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/valuate", response_model=ValuateResponse)
async def post_valuate(req: ValuateRequest) -> dict:
    logger.info("valuate model=%r year=%d use_cache=%s", req.model, req.year, req.use_cache)
    try:
        return await valuate(req.model, req.year, use_cache=req.use_cache)
    except Exception as e:  # noqa: BLE001
        logger.exception("valuate failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"valuation_engine error: {e}",
        ) from e


@app.post("/valuate-batch", response_model=BatchResponse)
async def post_valuate_batch(req: BatchRequest) -> dict:
    input_path = Path(req.file_path)
    if not input_path.exists():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"file_path does not exist: {input_path}",
        )
    logger.info(
        "valuate-batch input=%s output=%s use_cache=%s concurrency=%s",
        input_path, req.output_path, req.use_cache, req.concurrency,
    )
    try:
        summary = await valuate_batch(
            input_path,
            output_path=req.output_path,
            use_cache=req.use_cache,
            concurrency=req.concurrency,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    except ValueError as e:
        # Bad column mapping etc.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        ) from e
    except Exception as e:  # noqa: BLE001
        logger.exception("valuate-batch failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"batch processing error: {e}",
        ) from e

    return {
        "input_path": str(summary.input_path),
        "output_path": str(summary.output_path),
        "total_rows": summary.total_rows,
        "processed": summary.processed,
        "succeeded": summary.succeeded,
        "failed": summary.failed,
        "elapsed_sec": summary.elapsed_sec,
        "warnings": summary.warnings,
    }
