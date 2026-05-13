from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable

import aiosqlite

from config import CACHE_TTL_DAYS, DB_PATH

SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _parse_ts(value: str) -> datetime:
    # SQLite stores TIMESTAMP as ISO string; CURRENT_TIMESTAMP is naive UTC
    # ("YYYY-MM-DD HH:MM:SS"). Treat all stored values as UTC.
    dt = datetime.fromisoformat(value.replace(" ", "T"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


async def init_db(db_path: Path | str = DB_PATH) -> None:
    db_path = Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    schema_sql = SCHEMA_PATH.read_text(encoding="utf-8")
    async with aiosqlite.connect(db_path) as conn:
        await conn.executescript(schema_sql)
        await conn.commit()


async def get_cached(
    model: str,
    year: int,
    site: str,
    *,
    ttl_days: int = CACHE_TTL_DAYS,
    db_path: Path | str = DB_PATH,
) -> dict[str, Any] | None:
    """Return cached row dict if present and fresh; otherwise None."""
    cutoff = _utcnow() - timedelta(days=ttl_days)
    async with aiosqlite.connect(db_path) as conn:
        conn.row_factory = aiosqlite.Row
        cur = await conn.execute(
            """
            SELECT model, year, site, median_price, sample_count,
                   samples_json, fetched_at
            FROM car_price_cache
            WHERE model = ? AND year = ? AND site = ?
            """,
            (model, year, site),
        )
        row = await cur.fetchone()
    if row is None:
        return None
    fetched_at = _parse_ts(row["fetched_at"])
    if fetched_at < cutoff:
        return None
    return {
        "model": row["model"],
        "year": row["year"],
        "site": row["site"],
        "median_price": row["median_price"],
        "sample_count": row["sample_count"],
        "samples": json.loads(row["samples_json"]) if row["samples_json"] else [],
        "fetched_at": fetched_at,
    }


async def upsert_cache(
    model: str,
    year: int,
    site: str,
    median_price: int | None,
    sample_count: int,
    samples: Iterable[Any] | None = None,
    *,
    db_path: Path | str = DB_PATH,
) -> None:
    samples_json = json.dumps(list(samples) if samples is not None else [], ensure_ascii=False)
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            """
            INSERT INTO car_price_cache
                (model, year, site, median_price, sample_count, samples_json, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(model, year, site) DO UPDATE SET
                median_price = excluded.median_price,
                sample_count = excluded.sample_count,
                samples_json = excluded.samples_json,
                fetched_at   = CURRENT_TIMESTAMP
            """,
            (model, year, site, median_price, sample_count, samples_json),
        )
        await conn.commit()


async def purge_expired(
    *, ttl_days: int = CACHE_TTL_DAYS, db_path: Path | str = DB_PATH
) -> int:
    """Delete rows older than TTL. Returns count deleted."""
    cutoff = _utcnow() - timedelta(days=ttl_days)
    cutoff_iso = cutoff.strftime("%Y-%m-%d %H:%M:%S")
    async with aiosqlite.connect(db_path) as conn:
        cur = await conn.execute(
            "DELETE FROM car_price_cache WHERE fetched_at < ?",
            (cutoff_iso,),
        )
        await conn.commit()
        return cur.rowcount or 0


async def log_unmatched(
    raw_input: str,
    site: str,
    best_guess: str | None = None,
    score: float | None = None,
    *,
    db_path: Path | str = DB_PATH,
) -> None:
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            """
            INSERT INTO unmatched_models (raw_input, site, best_guess, score)
            VALUES (?, ?, ?, ?)
            """,
            (raw_input, site, best_guess, score),
        )
        await conn.commit()
