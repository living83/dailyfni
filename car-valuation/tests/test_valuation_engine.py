"""Pure-function tests for the weighting/grading math.

Live-scrape orchestration is exercised by scripts/test_valuate_k7.py.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import pytest_asyncio  # noqa: E402,F401

import valuation_engine as ve_module  # noqa: E402
from valuation_engine import (  # noqa: E402
    auction_price,
    confidence_grade,
    valuate,
    weighted_market_price,
)

# Default spec weights — keep tests independent of config tweaks.
SPEC_WEIGHTS = {"encar": 0.40, "kbchachacha": 0.35, "heydealer": 0.25}


def _site(median: int, count: int) -> dict[str, int]:
    return {"median": median, "count": count}


# ---------------------------------------------------------------------------
# weighted_market_price
# ---------------------------------------------------------------------------

def test_all_three_sites_apply_full_weights():
    per_site = {
        "encar":       _site(12_800_000, 8),
        "kbchachacha": _site(12_300_000, 12),
        "heydealer":   _site(11_500_000, 5),
    }
    # 0.40 * 12,800,000 + 0.35 * 12,300,000 + 0.25 * 11,500,000
    # = 5,120,000 + 4,305,000 + 2,875,000 = 12,300,000
    result = weighted_market_price(per_site, weights=SPEC_WEIGHTS)
    assert result == 12_300_000


def test_one_site_missing_renormalizes():
    # heydealer empty → weights become 0.40 / 0.35; renormalize to 0.40/0.75 vs 0.35/0.75
    per_site = {
        "encar":       _site(12_800_000, 8),
        "kbchachacha": _site(12_300_000, 12),
        "heydealer":   None,
    }
    # (0.40*12.8M + 0.35*12.3M) / 0.75 = (5,120,000 + 4,305,000) / 0.75 = 9,425,000 / 0.75
    expected = round((0.40 * 12_800_000 + 0.35 * 12_300_000) / 0.75)
    assert weighted_market_price(per_site, weights=SPEC_WEIGHTS) == expected


def test_count_below_threshold_excluded_and_renormalized():
    # heydealer has only 2 listings (< 3) → must be excluded
    per_site = {
        "encar":       _site(12_000_000, 10),
        "kbchachacha": _site(13_000_000, 10),
        "heydealer":   _site(8_000_000, 2),   # excluded
    }
    # (0.40*12.0M + 0.35*13.0M) / 0.75
    expected = round((0.40 * 12_000_000 + 0.35 * 13_000_000) / 0.75)
    got = weighted_market_price(per_site, weights=SPEC_WEIGHTS)
    assert got == expected


def test_only_one_qualifying_site_returns_its_median():
    per_site = {
        "encar":       _site(10_000_000, 20),
        "kbchachacha": _site(9_500_000, 1),    # excluded
        "heydealer":   None,
    }
    # Only encar qualifies → weight normalizes to 1.0
    assert weighted_market_price(per_site, weights=SPEC_WEIGHTS) == 10_000_000


def test_all_sites_empty_returns_none():
    per_site = {"encar": None, "kbchachacha": None, "heydealer": None}
    assert weighted_market_price(per_site, weights=SPEC_WEIGHTS) is None


def test_all_sites_below_threshold_returns_none():
    per_site = {
        "encar":       _site(12_000_000, 1),
        "kbchachacha": _site(13_000_000, 2),
        "heydealer":   _site(11_000_000, 0),
    }
    assert weighted_market_price(per_site, weights=SPEC_WEIGHTS) is None


def test_unknown_site_ignored():
    per_site = {
        "encar":       _site(12_000_000, 10),
        "kbchachacha": _site(13_000_000, 10),
        "imaginary":   _site(99_000_000, 99),  # not in weights → must be ignored
    }
    # Only encar+kb count; renormalize 0.40/0.75 + 0.35/0.75
    expected = round((0.40 * 12_000_000 + 0.35 * 13_000_000) / 0.75)
    assert weighted_market_price(per_site, weights=SPEC_WEIGHTS) == expected


# ---------------------------------------------------------------------------
# auction_price
# ---------------------------------------------------------------------------

def test_auction_default_ratio_075():
    assert auction_price(12_500_000) == 9_375_000


def test_auction_none_passthrough():
    assert auction_price(None) is None


def test_auction_custom_ratio():
    assert auction_price(10_000_000, ratio=0.65) == 6_500_000


# ---------------------------------------------------------------------------
# confidence_grade
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("counts,expected", [
    ((8, 12, 5), "상"),
    ((8, 12, 2), "중"),   # heydealer below threshold
    ((8, 1, 0), "하"),    # only encar
    ((1, 0, 0), "실패"),  # none qualify
])
def test_confidence_grades(counts: tuple[int, int, int], expected: str):
    sites = ["encar", "kbchachacha", "heydealer"]
    per_site = {s: _site(10_000_000, c) for s, c in zip(sites, counts)}
    assert confidence_grade(per_site) == expected


def test_confidence_none_value_treated_as_miss():
    per_site = {
        "encar":       _site(10_000_000, 10),
        "kbchachacha": None,
        "heydealer":   None,
    }
    assert confidence_grade(per_site) == "하"


# ---------------------------------------------------------------------------
# valuate() — canonical cache-key regression
# ---------------------------------------------------------------------------

import asyncio  # noqa: E402

import pytest  # noqa: E402


class _FakeScraper:
    """Records every fetch_price call so we can assert no duplicate scrapes."""
    calls: list[tuple[str, int]] = []
    site_name = "fake"

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def fetch_price(self, model: str, year: int):
        type(self).calls.append((model, year))
        return {
            "site": self.site_name,
            "median": 6_000_000,
            "count": 10,
            "samples": [6_000_000] * 10,
        }


@pytest.mark.asyncio
async def test_canonical_key_shares_cache_across_aliases(tmp_path, monkeypatch):
    """'K7' and '기아 K7' must hit the same cache row after first scrape."""
    # Isolate DB to tmp; init runs schema.
    db_file = tmp_path / "vtest.db"
    monkeypatch.setattr("valuation_engine.init_db",
                       lambda: __import__("db.cache", fromlist=["init_db"]).init_db(db_file))
    monkeypatch.setattr("valuation_engine.get_cached",
                       lambda model, year, site: __import__("db.cache", fromlist=["get_cached"]).get_cached(model, year, site, db_path=db_file))
    monkeypatch.setattr("valuation_engine.upsert_cache",
                       lambda *a, **kw: __import__("db.cache", fromlist=["upsert_cache"]).upsert_cache(*a, **kw, db_path=db_file))

    # Single fake scraper class for all sites — counts calls.
    class _E(_FakeScraper): site_name = "encar"
    class _K(_FakeScraper): site_name = "kbchachacha"
    class _H(_FakeScraper): site_name = "heydealer"
    _E.calls = _K.calls = _H.calls = []
    shared_calls: list = []
    for cls in (_E, _K, _H):
        cls.calls = shared_calls

    monkeypatch.setattr(ve_module, "SCRAPER_CLASSES",
                        {"encar": _E, "kbchachacha": _K, "heydealer": _H})

    r1 = await valuate("K7", 2014)
    assert r1["canonical"] == "K7"
    n_first = len(shared_calls)
    assert n_first == 3, f"expected 3 scrapes on first call, got {n_first}"

    # Alias call — should be full cache hit, NO new scrapes.
    r2 = await valuate("기아 K7", 2014)
    assert r2["canonical"] == "K7"
    assert len(shared_calls) == n_first, "alias caused redundant scrapes — cache key not canonical"
    assert r2["cached"] is True


@pytest.mark.asyncio
async def test_unknown_model_short_circuits_to_failure():
    r = await valuate("완전허구차종ABC", 2014, use_cache=False)
    assert r["canonical"] is None
    assert r["market_price"] is None
    assert r["confidence"] == "실패"
    assert all(v is None for v in r["sources"].values())
