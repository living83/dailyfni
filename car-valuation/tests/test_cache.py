from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import aiosqlite
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from db import cache  # noqa: E402


@pytest.fixture
async def db_path(tmp_path: Path) -> Path:
    p = tmp_path / "test_prices.db"
    await cache.init_db(p)
    return p


@pytest.mark.asyncio
async def test_init_creates_tables(db_path: Path) -> None:
    async with aiosqlite.connect(db_path) as conn:
        cur = await conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        names = [r[0] for r in await cur.fetchall()]
    assert "car_price_cache" in names
    assert "unmatched_models" in names


@pytest.mark.asyncio
async def test_upsert_then_get_returns_row(db_path: Path) -> None:
    await cache.upsert_cache(
        "K7", 2014, "encar",
        median_price=12_500_000,
        sample_count=8,
        samples=[12000000, 12500000, 13000000],
        db_path=db_path,
    )
    row = await cache.get_cached("K7", 2014, "encar", db_path=db_path)
    assert row is not None
    assert row["median_price"] == 12_500_000
    assert row["sample_count"] == 8
    assert row["samples"] == [12000000, 12500000, 13000000]


@pytest.mark.asyncio
async def test_get_returns_none_for_missing(db_path: Path) -> None:
    row = await cache.get_cached("NoSuchModel", 1999, "encar", db_path=db_path)
    assert row is None


@pytest.mark.asyncio
async def test_upsert_replaces_on_conflict(db_path: Path) -> None:
    await cache.upsert_cache("K7", 2014, "encar", 10_000_000, 5, [], db_path=db_path)
    await cache.upsert_cache("K7", 2014, "encar", 11_000_000, 9, [11_000_000], db_path=db_path)
    row = await cache.get_cached("K7", 2014, "encar", db_path=db_path)
    assert row["median_price"] == 11_000_000
    assert row["sample_count"] == 9


@pytest.mark.asyncio
async def test_same_model_different_site_are_separate(db_path: Path) -> None:
    await cache.upsert_cache("K7", 2014, "encar", 12_000_000, 8, [], db_path=db_path)
    await cache.upsert_cache("K7", 2014, "kbchachacha", 12_500_000, 6, [], db_path=db_path)
    encar = await cache.get_cached("K7", 2014, "encar", db_path=db_path)
    kb = await cache.get_cached("K7", 2014, "kbchachacha", db_path=db_path)
    assert encar["median_price"] == 12_000_000
    assert kb["median_price"] == 12_500_000


@pytest.mark.asyncio
async def test_ttl_expiry(db_path: Path) -> None:
    await cache.upsert_cache("K7", 2014, "encar", 12_000_000, 8, [], db_path=db_path)
    # Backdate the row so it appears 10 days old
    stale = (datetime.now(timezone.utc) - timedelta(days=10)).strftime("%Y-%m-%d %H:%M:%S")
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            "UPDATE car_price_cache SET fetched_at = ? WHERE model = 'K7'",
            (stale,),
        )
        await conn.commit()

    fresh = await cache.get_cached("K7", 2014, "encar", ttl_days=7, db_path=db_path)
    assert fresh is None, "expired row must not be returned with default TTL"

    still_alive = await cache.get_cached("K7", 2014, "encar", ttl_days=30, db_path=db_path)
    assert still_alive is not None, "long TTL should still return the row"


@pytest.mark.asyncio
async def test_purge_expired_removes_old_rows(db_path: Path) -> None:
    await cache.upsert_cache("K7", 2014, "encar", 12_000_000, 8, [], db_path=db_path)
    await cache.upsert_cache("K5", 2015, "encar", 9_000_000, 5, [], db_path=db_path)
    stale = (datetime.now(timezone.utc) - timedelta(days=10)).strftime("%Y-%m-%d %H:%M:%S")
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            "UPDATE car_price_cache SET fetched_at = ? WHERE model = 'K7'",
            (stale,),
        )
        await conn.commit()

    deleted = await cache.purge_expired(ttl_days=7, db_path=db_path)
    assert deleted == 1

    assert await cache.get_cached("K7", 2014, "encar", db_path=db_path) is None
    assert await cache.get_cached("K5", 2015, "encar", db_path=db_path) is not None


@pytest.mark.asyncio
async def test_log_unmatched(db_path: Path) -> None:
    await cache.log_unmatched("포터Ⅱ (PORTERⅡ)", "encar", "포터2", 92.5, db_path=db_path)
    async with aiosqlite.connect(db_path) as conn:
        cur = await conn.execute(
            "SELECT raw_input, site, best_guess, score FROM unmatched_models"
        )
        rows = await cur.fetchall()
    assert len(rows) == 1
    assert rows[0][0] == "포터Ⅱ (PORTERⅡ)"
    assert rows[0][2] == "포터2"
    assert rows[0][3] == 92.5
